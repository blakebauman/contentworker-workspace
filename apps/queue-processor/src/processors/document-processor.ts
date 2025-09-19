import type { ChunkMetadata, Document } from '@repo/rag-types'
import type {
	DocumentIngestionPayload,
	DocumentLock,
	ProcessingResult,
	QueueMessage,
	QueueProcessorContext,
} from '../types'

export class DocumentProcessor {
	constructor(private ctx: QueueProcessorContext) {}

	async processDocumentIngestion(
		message: QueueMessage & { payload: DocumentIngestionPayload }
	): Promise<ProcessingResult> {
		const startTime = Date.now()
		const { document, options = {} } = message.payload
		const messageId = message.metadata.correlationId

		this.ctx.logEvent('document_processing_started', {
			documentId: document.id,
			messageId,
			source: document.source,
		})

		try {
			// Step 1: Acquire processing lock
			const lockResult = await this.acquireProcessingLock(document.id)
			if (!lockResult.success) {
				return {
					success: false,
					messageId,
					processingTime: Date.now() - startTime,
					error: {
						code: 'LOCK_ACQUISITION_FAILED',
						message: lockResult.error || 'Could not acquire processing lock',
						retryable: true,
					},
				}
			}

			const lock = lockResult.lock!

			try {
				// Step 2: Check for deduplication
				const contentHash = await this.generateContentHash(document.text)
				const deduplicationResult = await this.checkDeduplication(document.id, contentHash)

				if (deduplicationResult.isDuplicate && !options.forceReprocess) {
					await this.releaseLock(lock)
					return {
						success: true,
						messageId,
						processingTime: Date.now() - startTime,
						metadata: {
							action: 'skipped_duplicate',
							existingDocumentId: deduplicationResult.existingDocumentId,
						},
					}
				}

				// Step 3: Update processing state
				await this.updateProcessingState(document.id, {
					documentId: document.id,
					status: 'processing',
					progress: {
						currentStep: 'preprocessing',
						stepsCompleted: 0,
						totalSteps: 4,
						percentage: 0,
					},
					startedAt: startTime,
					lastUpdatedAt: Date.now(),
				})

				// Step 4: Process document content
				const cleanedText = this.cleanText(document.text)

				await this.updateProcessingState(document.id, {
					documentId: document.id,
					status: 'processing',
					progress: {
						currentStep: 'chunking',
						stepsCompleted: 1,
						totalSteps: 4,
						percentage: 25,
					},
					startedAt: startTime,
					lastUpdatedAt: Date.now(),
				})

				// Step 5: Chunk the document
				const chunks = this.chunkText(cleanedText, options.chunkSize, options.overlap)

				await this.updateProcessingState(document.id, {
					documentId: document.id,
					status: 'processing',
					progress: {
						currentStep: 'embedding',
						stepsCompleted: 2,
						totalSteps: 4,
						percentage: 50,
					},
					startedAt: startTime,
					lastUpdatedAt: Date.now(),
				})

				// Step 6: Generate embeddings and store chunks
				let embeddingsGenerated = 0
				for (let i = 0; i < chunks.length; i++) {
					const chunk = chunks[i]

					// DLP scanning if enabled
					let processedChunk = chunk
					if (options.dlpEnabled) {
						processedChunk = await this.performDLPScanning(chunk)
					}

					// Generate embedding
					const embedding = await this.generateEmbedding(processedChunk)

					// Create chunk metadata
					const chunkId = `${document.id}#${i}`
					const metadata: ChunkMetadata = {
						source: document.source,
						url: document.url,
						chunk_index: i,
						doc_id: document.id,
						timestamp: Date.now(),
						acl: document.metadata?.acl || [],
					}

					// Store chunk in R2
					await this.storeChunkInR2(`chunks/${chunkId}.txt`, processedChunk, metadata)

					// Store embedding in Vectorize
					await this.upsertVector(chunkId, embedding, metadata)

					embeddingsGenerated++

					// Update progress
					const progressPercentage = 50 + ((i + 1) / chunks.length) * 40
					await this.updateProcessingState(document.id, {
						documentId: document.id,
						status: 'processing',
						progress: {
							currentStep: 'embedding',
							stepsCompleted: 2,
							totalSteps: 4,
							percentage: Math.round(progressPercentage),
						},
						startedAt: startTime,
						lastUpdatedAt: Date.now(),
					})
				}

				// Step 7: Finalize processing
				await this.updateProcessingState(document.id, {
					documentId: document.id,
					status: 'completed',
					progress: {
						currentStep: 'completed',
						stepsCompleted: 4,
						totalSteps: 4,
						percentage: 100,
					},
					startedAt: startTime,
					lastUpdatedAt: Date.now(),
					completedAt: Date.now(),
				})

				// Release lock
				await this.releaseLock(lock)

				const processingTime = Date.now() - startTime

				this.ctx.logEvent('document_processing_completed', {
					documentId: document.id,
					messageId,
					chunksProcessed: chunks.length,
					embeddingsGenerated,
					processingTime,
				})

				this.ctx.logMetric('document_processing_time', processingTime, {
					source: document.source,
					chunks: chunks.length.toString(),
				})

				return {
					success: true,
					messageId,
					processingTime,
					chunksProcessed: chunks.length,
					embeddingsGenerated,
				}
			} catch (error) {
				// Release lock on error
				await this.releaseLock(lock)
				throw error
			}
		} catch (error) {
			const processingTime = Date.now() - startTime
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'

			// Update processing state with error
			await this.updateProcessingState(document.id, {
				documentId: document.id,
				status: 'failed',
				progress: {
					currentStep: 'failed',
					stepsCompleted: 0,
					totalSteps: 4,
					percentage: 0,
				},
				startedAt: startTime,
				lastUpdatedAt: Date.now(),
				error: errorMessage,
			})

			this.ctx.logEvent('document_processing_failed', {
				documentId: document.id,
				messageId,
				error: errorMessage,
				processingTime,
			})

			return {
				success: false,
				messageId,
				processingTime,
				error: {
					code: 'PROCESSING_FAILED',
					message: errorMessage,
					retryable: this.isRetryableError(error),
				},
			}
		}
	}

	private async acquireProcessingLock(documentId: string): Promise<{
		success: boolean
		lock?: DocumentLock
		error?: string
	}> {
		const coordinator = this.ctx.getCoordinator(documentId)

		const response = await coordinator.fetch('http://coordinator/acquire-lock', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				documentId,
				lockType: 'processing',
				ttlSeconds: 1800, // 30 minutes
				workerId: this.ctx.workerId,
			}),
		})

		const result = await response.json()
		return result
	}

	private async releaseLock(lock: DocumentLock): Promise<void> {
		const coordinator = this.ctx.getCoordinator(lock.documentId)

		await coordinator.fetch('http://coordinator/release-lock', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				documentId: lock.documentId,
				lockId: lock.lockId,
				workerId: this.ctx.workerId,
			}),
		})
	}

	private async checkDeduplication(documentId: string, contentHash: string) {
		const coordinator = this.ctx.getCoordinator(documentId)

		const response = await coordinator.fetch('http://coordinator/deduplicate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				documentId,
				contentHash,
			}),
		})

		return await response.json()
	}

	private async updateProcessingState(documentId: string, state: any): Promise<void> {
		const coordinator = this.ctx.getCoordinator(documentId)

		await coordinator.fetch('http://coordinator/update-state', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(state),
		})
	}

	private async generateContentHash(content: string): Promise<string> {
		const encoder = new TextEncoder()
		const data = encoder.encode(content)
		const hashBuffer = await crypto.subtle.digest('SHA-256', data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
	}

	private cleanText(text: string): string {
		return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim()
	}

	private chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
		const words = text.split(/\s+/)
		const chunks: string[] = []

		for (let i = 0; i < words.length; i += chunkSize - overlap) {
			const chunk = words.slice(i, i + chunkSize).join(' ')
			chunks.push(chunk)

			if (i + chunkSize >= words.length) break
		}

		return chunks
	}

	private async performDLPScanning(chunk: string): Promise<string> {
		// TODO: Implement actual DLP scanning
		// For now, return chunk unchanged
		return chunk
	}

	private async generateEmbedding(text: string): Promise<number[]> {
		const response = await this.ctx.env.AI.run('@cf/baai/bge-base-en-v1.5', {
			text: [text],
		})

		return response.data[0]
	}

	private async storeChunkInR2(
		key: string,
		content: string,
		metadata: ChunkMetadata
	): Promise<void> {
		await this.ctx.env.DOCS_BUCKET.put(key, content, {
			httpMetadata: {
				contentType: 'text/plain',
			},
			customMetadata: metadata,
		})
	}

	private async upsertVector(
		id: string,
		embedding: number[],
		metadata: ChunkMetadata
	): Promise<void> {
		await this.ctx.env.VECTORIZE_INDEX.upsert([
			{
				id,
				values: embedding,
				metadata: metadata as Record<string, any>,
			},
		])
	}

	private isRetryableError(error: unknown): boolean {
		if (error instanceof Error) {
			// Network errors, timeouts, rate limits are retryable
			return (
				error.message.includes('timeout') ||
				error.message.includes('rate limit') ||
				error.message.includes('network') ||
				error.message.includes('503') ||
				error.message.includes('502')
			)
		}
		return false
	}
}
