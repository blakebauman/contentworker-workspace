import { WorkflowEntrypoint } from 'cloudflare:workers'

import { chunkText, cleanText } from './utils/chunking'
import { getEmbedding } from './utils/embedding'
import { storeChunkInR2, upsertVector } from './utils/storage'

import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from './context'
import type { ChunkMetadata, ChunkProcessingResult, Document } from './types'

// Workflow parameters passed when triggering the workflow
export interface DocumentProcessingParams {
	document: Document
	options?: {
		chunkSize?: number
		overlap?: number
		retryLimit?: number
		dlpEnabled?: boolean
	}
}

// State structure that persists between workflow steps
export interface ProcessingState {
	documentId: string
	cleanedText?: string
	chunks?: string[]
	processedChunks: ChunkProcessingResult[]
	totalChunks: number
	startTime: number
	errors: string[]
}

/**
 * Workflow for processing documents through the RAG pipeline
 * Each step is independently retriable and state is persisted
 */
export class DocumentProcessingWorkflow extends WorkflowEntrypoint<Env, DocumentProcessingParams> {
	async run(event: WorkflowEvent<DocumentProcessingParams>, step: WorkflowStep) {
		const { document, options = {} } = event.payload
		const { retryLimit = 3, dlpEnabled = false } = options

		console.log(`Starting workflow processing for document: ${document.id}`)

		// Step 1: Content preprocessing and cleaning
		const preprocessResult = await step.do(
			'preprocess-content',
			{
				retries: {
					limit: 2,
					delay: '5 seconds',
					backoff: 'exponential',
				},
				timeout: '2 minutes',
			},
			async (): Promise<{ cleanedText: string; documentId: string }> => {
				console.log(`Preprocessing content for document ${document.id}`)

				if (!document.text || document.text.trim().length === 0) {
					throw new Error('Document text is empty or invalid')
				}

				const cleanedText = cleanText(document.text)

				if (cleanedText.length === 0) {
					throw new Error('Document text became empty after cleaning')
				}

				return {
					cleanedText,
					documentId: document.id,
				}
			}
		)

		// Step 2: Text chunking
		const chunkingResult = await step.do(
			'chunk-text',
			{
				retries: {
					limit: 2,
					delay: '3 seconds',
					backoff: 'linear',
				},
				timeout: '5 minutes',
			},
			async (): Promise<{ chunks: string[]; totalChunks: number }> => {
				console.log(`Chunking text for document ${document.id}`)

				const chunks = chunkText(preprocessResult.cleanedText, {
					chunkSize: options.chunkSize,
					overlap: options.overlap,
				})

				if (chunks.length === 0) {
					throw new Error('No chunks were created from the document text')
				}

				console.log(`Created ${chunks.length} chunks for document ${document.id}`)
				return {
					chunks,
					totalChunks: chunks.length,
				}
			}
		)

		// Step 3: DLP/PII scanning (if enabled)
		let dlpResults: { chunks: string[]; redactionCount: number } | null = null
		if (dlpEnabled) {
			dlpResults = await step.do(
				'dlp-scanning',
				{
					retries: {
						limit: 2,
						delay: '10 seconds',
						backoff: 'exponential',
					},
					timeout: '10 minutes',
				},
				async (): Promise<{ chunks: string[]; redactionCount: number }> => {
					console.log(`Performing DLP scanning for document ${document.id}`)

					// TODO: Implement actual DLP/PII detection
					// For now, just return the chunks unchanged
					// const scannedChunks = await performDLPChecks(chunkingResult.chunks, this.env);

					return {
						chunks: chunkingResult.chunks,
						redactionCount: 0,
					}
				}
			)
		}

		const finalChunks = dlpResults?.chunks || chunkingResult.chunks

		// Step 4: Process chunks in batches for better error handling and observability
		const batchSize = 5 // Process 5 chunks at a time
		const allResults: ChunkProcessingResult[] = []

		for (let batchStart = 0; batchStart < finalChunks.length; batchStart += batchSize) {
			const batchEnd = Math.min(batchStart + batchSize, finalChunks.length)
			const batch = finalChunks.slice(batchStart, batchEnd)

			const batchResults = await step.do(
				`process-chunks-batch-${Math.floor(batchStart / batchSize)}`,
				{
					retries: {
						limit: retryLimit,
						delay: '10 seconds',
						backoff: 'exponential',
					},
					timeout: '15 minutes',
				},
				async (): Promise<ChunkProcessingResult[]> => {
					console.log(
						`Processing batch ${Math.floor(batchStart / batchSize) + 1} (chunks ${batchStart + 1}-${batchEnd})`
					)

					const batchResults: ChunkProcessingResult[] = []

					for (let i = 0; i < batch.length; i++) {
						const chunk = batch[i]
						const chunkIndex = batchStart + i
						const chunkId = `${document.id}#${chunkIndex}`

						try {
							// Generate embedding
							const embedding = await getEmbedding(chunk, this.env)

							// Create chunk metadata
							const metadata: ChunkMetadata = {
								source: document.source,
								url: document.url,
								chunk_index: chunkIndex,
								doc_id: document.id,
								timestamp: Date.now(),
								acl: document.metadata?.acl || [],
							}

							// Store chunk in R2 (parallel to embedding generation)
							const [r2Result, vectorResult] = await Promise.allSettled([
								storeChunkInR2(`chunks/${chunkId}.txt`, chunk, metadata, this.env),
								upsertVector(chunkId, embedding, metadata, this.env),
							])

							// Check results
							if (r2Result.status === 'rejected') {
								throw new Error(`R2 storage failed: ${r2Result.reason}`)
							}
							if (vectorResult.status === 'rejected') {
								throw new Error(`Vectorize upsert failed: ${vectorResult.reason}`)
							}

							batchResults.push({
								chunkId,
								embedding,
								metadata,
								success: true,
							})

							console.log(`Successfully processed chunk ${chunkId}`)
						} catch (error) {
							console.error(`Failed to process chunk ${chunkId}:`, error)
							batchResults.push({
								chunkId,
								embedding: [],
								metadata: {} as ChunkMetadata,
								success: false,
								error: error instanceof Error ? error.message : 'Unknown error',
							})
						}
					}

					const successCount = batchResults.filter((r) => r.success).length
					const failureCount = batchResults.length - successCount

					console.log(`Batch completed: ${successCount} success, ${failureCount} failures`)

					// If more than half the batch failed, consider the batch failed
					if (failureCount > batchResults.length / 2) {
						throw new Error(`Too many failures in batch: ${failureCount}/${batchResults.length}`)
					}

					return batchResults
				}
			)

			allResults.push(...batchResults)

			// Add a small delay between batches to avoid overwhelming services
			if (batchEnd < finalChunks.length) {
				await step.sleep('batch-delay', '2 seconds')
			}
		}

		// Step 5: Final validation and cleanup
		const finalResult = await step.do(
			'finalize-processing',
			{
				retries: {
					limit: 1,
					delay: '5 seconds',
				},
				timeout: '2 minutes',
			},
			async () => {
				const successfulChunks = allResults.filter((r) => r.success)
				const failedChunks = allResults.filter((r) => !r.success)

				console.log(`Document ${document.id} processing completed:`)
				console.log(`- Total chunks: ${allResults.length}`)
				console.log(`- Successful: ${successfulChunks.length}`)
				console.log(`- Failed: ${failedChunks.length}`)

				// Log failed chunks for debugging
				if (failedChunks.length > 0) {
					console.warn(
						'Failed chunks:',
						failedChunks.map((c) => ({ id: c.chunkId, error: c.error }))
					)
				}

				return {
					documentId: document.id,
					totalChunks: allResults.length,
					successfulChunks: successfulChunks.length,
					failedChunks: failedChunks.length,
					processingTime: Date.now() - event.timestamp.getTime(),
					results: allResults,
				}
			}
		)

		console.log(`Workflow completed for document ${document.id}`)
		return finalResult
	}
}
