import type { Document } from '@repo/rag-types'
import type { Env } from '../context'

// Queue message types - importing from our queue processor types
export interface QueueMessage {
	type:
		| 'document_ingestion'
		| 'webhook_sync'
		| 'batch_reprocess'
		| 'document_update'
		| 'document_delete'
	payload: QueueMessagePayload
	metadata: {
		priority: 'low' | 'medium' | 'high' | 'critical'
		retryCount: number
		maxRetries: number
		scheduledTime?: number
		correlationId: string
		source: string
	}
}

export type QueueMessagePayload =
	| DocumentIngestionPayload
	| WebhookSyncPayload
	| BatchReprocessPayload
	| DocumentUpdatePayload
	| DocumentDeletePayload

export interface DocumentIngestionPayload {
	type: 'document_ingestion'
	document: Document
	options?: {
		chunkSize?: number
		overlap?: number
		dlpEnabled?: boolean
		forceReprocess?: boolean
	}
}

export interface WebhookSyncPayload {
	type: 'webhook_sync'
	sourceType: 'sharepoint' | 'confluence' | 'jira' | 'website'
	eventType: 'created' | 'updated' | 'deleted' | 'moved'
	resourceId: string
	resourceUrl: string
	changeToken?: string
	metadata: Record<string, any>
}

export interface BatchReprocessPayload {
	type: 'batch_reprocess'
	documentIds: string[]
	reason: 'schema_change' | 'model_update' | 'policy_change' | 'manual_reindex'
	options?: {
		forceFullReprocess?: boolean
		preserveVersions?: boolean
	}
}

export interface DocumentUpdatePayload {
	type: 'document_update'
	documentId: string
	changes: {
		text?: string
		metadata?: Record<string, any>
		acl?: string[]
	}
	incrementalUpdate: boolean
}

export interface DocumentDeletePayload {
	type: 'document_delete'
	documentId: string
	hardDelete: boolean
	reason?: string
}

export class QueueManager {
	constructor(private env: Env) {}

	/**
	 * Queue a document for asynchronous processing
	 */
	async queueDocumentForProcessing(
		document: Document,
		options?: {
			chunkSize?: number
			overlap?: number
			dlpEnabled?: boolean
			forceReprocess?: boolean
			priority?: 'low' | 'medium' | 'high' | 'critical'
			source?: string
		}
	): Promise<{ success: boolean; messageId: string; error?: string }> {
		try {
			const messageId = crypto.randomUUID()

			const message: QueueMessage = {
				type: 'document_ingestion',
				payload: {
					type: 'document_ingestion',
					document,
					options: {
						chunkSize: options?.chunkSize || 1000,
						overlap: options?.overlap || 200,
						dlpEnabled: options?.dlpEnabled || false,
						forceReprocess: options?.forceReprocess || false,
					},
				},
				metadata: {
					priority: options?.priority || 'medium',
					retryCount: 0,
					maxRetries: 3,
					correlationId: messageId,
					source: options?.source || 'api',
				},
			}

			await this.env.DOCUMENT_INGESTION_QUEUE.send(message.payload)

			console.log(
				JSON.stringify({
					type: 'document_queued',
					documentId: document.id,
					messageId,
					priority: message.metadata.priority,
					source: document.source,
				})
			)

			return { success: true, messageId }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			console.error('Failed to queue document for processing:', error)

			return {
				success: false,
				messageId: '',
				error: errorMessage,
			}
		}
	}

	/**
	 * Queue multiple documents for batch processing
	 */
	async queueDocumentBatch(
		documents: Document[],
		options?: {
			batchSize?: number
			priority?: 'low' | 'medium' | 'high' | 'critical'
			source?: string
		}
	): Promise<{
		success: boolean
		queuedCount: number
		errors: Array<{ documentId: string; error: string }>
	}> {
		const batchSize = options?.batchSize || 10
		const results = {
			success: true,
			queuedCount: 0,
			errors: [] as Array<{ documentId: string; error: string }>,
		}

		// Process documents in batches to avoid overwhelming the queue
		for (let i = 0; i < documents.length; i += batchSize) {
			const batch = documents.slice(i, i + batchSize)

			const batchPromises = batch.map(async (document) => {
				const result = await this.queueDocumentForProcessing(document, {
					priority: options?.priority || 'medium',
					source: options?.source || 'batch_api',
				})

				if (result.success) {
					results.queuedCount++
				} else {
					results.success = false
					results.errors.push({
						documentId: document.id,
						error: result.error || 'Unknown error',
					})
				}
			})

			await Promise.all(batchPromises)

			// Add small delay between batches
			if (i + batchSize < documents.length) {
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}

		console.log(
			JSON.stringify({
				type: 'batch_queued',
				totalDocuments: documents.length,
				queuedCount: results.queuedCount,
				errorCount: results.errors.length,
			})
		)

		return results
	}

	/**
	 * Queue a webhook event for processing
	 */
	async queueWebhookEvent(
		sourceType: 'sharepoint' | 'confluence' | 'jira' | 'website',
		eventType: 'created' | 'updated' | 'deleted' | 'moved',
		resourceId: string,
		resourceUrl: string,
		metadata: Record<string, any> = {},
		options?: {
			priority?: 'low' | 'medium' | 'high' | 'critical'
			changeToken?: string
		}
	): Promise<{ success: boolean; messageId: string; error?: string }> {
		try {
			const messageId = crypto.randomUUID()

			const message: QueueMessage = {
				type: 'webhook_sync',
				payload: {
					type: 'webhook_sync',
					sourceType,
					eventType,
					resourceId,
					resourceUrl,
					changeToken: options?.changeToken,
					metadata,
				},
				metadata: {
					priority: options?.priority || 'high', // Webhooks are typically high priority
					retryCount: 0,
					maxRetries: 5, // Higher retry count for webhooks
					correlationId: messageId,
					source: 'webhook',
				},
			}

			await this.env.WEBHOOK_PROCESSING_QUEUE.send(message.payload)

			console.log(
				JSON.stringify({
					type: 'webhook_queued',
					sourceType,
					eventType,
					resourceId,
					messageId,
				})
			)

			return { success: true, messageId }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			console.error('Failed to queue webhook event:', error)

			return {
				success: false,
				messageId: '',
				error: errorMessage,
			}
		}
	}

	/**
	 * Queue documents for batch reprocessing
	 */
	async queueBatchReprocess(
		documentIds: string[],
		reason: 'schema_change' | 'model_update' | 'policy_change' | 'manual_reindex',
		options?: {
			forceFullReprocess?: boolean
			preserveVersions?: boolean
			priority?: 'low' | 'medium' | 'high' | 'critical'
		}
	): Promise<{ success: boolean; messageId: string; error?: string }> {
		try {
			const messageId = crypto.randomUUID()

			const message: QueueMessage = {
				type: 'batch_reprocess',
				payload: {
					type: 'batch_reprocess',
					documentIds,
					reason,
					options: {
						forceFullReprocess: options?.forceFullReprocess || false,
						preserveVersions: options?.preserveVersions || true,
					},
				},
				metadata: {
					priority: options?.priority || 'low', // Batch operations are typically low priority
					retryCount: 0,
					maxRetries: 2,
					correlationId: messageId,
					source: 'admin',
				},
			}

			await this.env.BATCH_REPROCESSING_QUEUE.send(message.payload)

			console.log(
				JSON.stringify({
					type: 'batch_reprocess_queued',
					documentCount: documentIds.length,
					reason,
					messageId,
				})
			)

			return { success: true, messageId }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			console.error('Failed to queue batch reprocess:', error)

			return {
				success: false,
				messageId: '',
				error: errorMessage,
			}
		}
	}

	/**
	 * Queue a document for deletion
	 */
	async queueDocumentDeletion(
		documentId: string,
		options?: {
			hardDelete?: boolean
			reason?: string
			priority?: 'low' | 'medium' | 'high' | 'critical'
		}
	): Promise<{ success: boolean; messageId: string; error?: string }> {
		try {
			const messageId = crypto.randomUUID()

			const message: QueueMessage = {
				type: 'document_delete',
				payload: {
					type: 'document_delete',
					documentId,
					hardDelete: options?.hardDelete || false,
					reason: options?.reason,
				},
				metadata: {
					priority: options?.priority || 'medium',
					retryCount: 0,
					maxRetries: 3,
					correlationId: messageId,
					source: 'api',
				},
			}

			await this.env.DOCUMENT_INGESTION_QUEUE.send(message.payload)

			console.log(
				JSON.stringify({
					type: 'document_deletion_queued',
					documentId,
					hardDelete: options?.hardDelete || false,
					messageId,
				})
			)

			return { success: true, messageId }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			console.error('Failed to queue document deletion:', error)

			return {
				success: false,
				messageId: '',
				error: errorMessage,
			}
		}
	}

	/**
	 * Get coordinator for a specific document
	 */
	getDocumentCoordinator(documentId: string): DurableObjectStub {
		const id = this.env.DOCUMENT_COORDINATOR.idFromName(documentId)
		return this.env.DOCUMENT_COORDINATOR.get(id)
	}

	/**
	 * Check processing status for a document
	 */
	async getProcessingStatus(documentId: string): Promise<{
		status?: string
		progress?: any
		error?: string
	}> {
		try {
			const coordinator = this.getDocumentCoordinator(documentId)

			const response = await coordinator.fetch(
				`http://coordinator/get-state?documentId=${encodeURIComponent(documentId)}`
			)

			const result = await response.json()
			return result.state || {}
		} catch (error) {
			console.error('Failed to get processing status:', error)
			return {
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		}
	}
}
