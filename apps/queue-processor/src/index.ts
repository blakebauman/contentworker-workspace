import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'

import { createQueueProcessorContext } from './context'
import { DocumentCoordinator } from './coordination'
import { BatchProcessor } from './processors/batch-processor'
import { DocumentProcessor } from './processors/document-processor'
import { WebhookProcessor } from './processors/webhook-processor'

import type { Env } from './context'
import type {
	BatchProcessingResult,
	BatchReprocessPayload,
	DocumentDeletePayload,
	DocumentIngestionPayload,
	DocumentUpdatePayload,
	QueueMessage,
	WebhookSyncPayload,
} from './types'

// Create Hono app with environment typing
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use(
	'*',
	cors({
		origin: ['*'],
		allowHeaders: ['Content-Type', 'Authorization'],
		allowMethods: ['GET', 'POST', 'OPTIONS'],
	})
)
app.use('*', prettyJSON())

// Health check and info endpoints
app.get('/', (c) => {
	return c.json({
		service: 'Queue Processor',
		version: '1.0.0',
		description: 'Cloudflare Worker for processing RAG documents via queues',
		endpoints: [
			'GET / - Service information',
			'GET /health - Health check',
			'GET /metrics - Processing metrics',
			'POST /admin/cleanup - Trigger cleanup',
		],
		queues: [
			'document-ingestion - Document processing queue',
			'webhook-processing - Webhook event processing',
			'batch-reprocessing - Batch reprocessing operations',
		],
	})
})

app.get('/health', (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		worker: 'queue-processor',
		version: '1.0.0',
	})
})

app.get('/metrics', async (c) => {
	// TODO: Implement metrics collection from Durable Objects
	return c.json({
		status: 'metrics endpoint',
		note: 'Metrics collection not yet implemented',
		timestamp: new Date().toISOString(),
	})
})

// Administrative endpoints
app.post('/admin/cleanup', async (c) => {
	try {
		// Trigger cleanup across all coordinator instances
		// In practice, you'd want to implement a broadcast mechanism
		const coordinatorId = c.env.DOCUMENT_COORDINATOR.idFromName('cleanup-trigger')
		const coordinator = c.env.DOCUMENT_COORDINATOR.get(coordinatorId)

		const response = await coordinator.fetch('http://coordinator/cleanup', {
			method: 'POST',
		})

		const result = await response.json()

		return c.json({
			success: true,
			message: 'Cleanup triggered',
			result,
		})
	} catch (error) {
		console.error('Cleanup trigger failed:', error)
		return c.json(
			{
				success: false,
				error: 'Failed to trigger cleanup',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

// Queue Message Handlers

/**
 * Handle document ingestion queue messages
 */
export async function handleDocumentIngestion(
	batch: MessageBatch<DocumentIngestionPayload>,
	env: Env
): Promise<void> {
	const ctx = createQueueProcessorContext(env)
	const processor = new DocumentProcessor(ctx)

	const results: BatchProcessingResult = {
		totalMessages: batch.messages.length,
		successCount: 0,
		failureCount: 0,
		results: [],
		totalProcessingTime: 0,
		errors: [],
	}

	const startTime = Date.now()

	ctx.logEvent('batch_started', {
		queueType: 'document-ingestion',
		messageCount: batch.messages.length,
		batchId: crypto.randomUUID(),
	})

	// Process messages concurrently with limited concurrency
	const concurrency = Math.min(batch.messages.length, 5)
	const chunks = []

	for (let i = 0; i < batch.messages.length; i += concurrency) {
		chunks.push(batch.messages.slice(i, i + concurrency))
	}

	for (const chunk of chunks) {
		const chunkPromises = chunk.map(async (message) => {
			try {
				// Convert Cloudflare Workers Message to our QueueMessage format
				const queueMessage: QueueMessage & { payload: DocumentIngestionPayload } = {
					type: 'document_ingestion',
					payload: message.body,
					metadata: {
						priority: 'medium',
						retryCount: message.attempts,
						maxRetries: 3,
						correlationId: message.id,
						source: 'queue-processor',
					},
				}
				const result = await processor.processDocumentIngestion(queueMessage)
				results.results.push(result)

				if (result.success) {
					results.successCount++
					message.ack()
				} else {
					results.failureCount++
					results.errors.push({
						messageId: result.messageId,
						error: result.error?.message || 'Unknown error',
						retryable: result.error?.retryable || false,
					})

					if (result.error?.retryable) {
						message.retry()
					} else {
						message.ack() // Don't retry non-retryable errors
					}
				}
			} catch (error) {
				results.failureCount++
				const errorMessage = error instanceof Error ? error.message : 'Unknown error'
				results.errors.push({
					messageId: message.id || 'unknown',
					error: errorMessage,
					retryable: true,
				})

				console.error('Message processing failed:', error)
				message.retry()
			}
		})

		await Promise.all(chunkPromises)
	}

	results.totalProcessingTime = Date.now() - startTime

	ctx.logEvent('batch_completed', {
		queueType: 'document-ingestion',
		...results,
	})

	ctx.logMetric('batch_processing_time', results.totalProcessingTime, {
		queue_type: 'document-ingestion',
		message_count: batch.messages.length.toString(),
		success_rate: (results.successCount / results.totalMessages).toString(),
	})
}

/**
 * Handle webhook processing queue messages
 */
export async function handleWebhookProcessing(
	batch: MessageBatch<WebhookSyncPayload>,
	env: Env
): Promise<void> {
	const ctx = createQueueProcessorContext(env)
	const processor = new WebhookProcessor(ctx)

	const startTime = Date.now()

	ctx.logEvent('webhook_batch_started', {
		messageCount: batch.messages.length,
		batchId: crypto.randomUUID(),
	})

	// Process webhook messages with higher concurrency since they're typically lighter
	const concurrency = Math.min(batch.messages.length, 10)
	const chunks = []

	for (let i = 0; i < batch.messages.length; i += concurrency) {
		chunks.push(batch.messages.slice(i, i + concurrency))
	}

	let successCount = 0
	let failureCount = 0

	for (const chunk of chunks) {
		const chunkPromises = chunk.map(async (message) => {
			try {
				// Convert Cloudflare Workers Message to our QueueMessage format
				const queueMessage: QueueMessage & { payload: WebhookSyncPayload } = {
					type: 'webhook_sync',
					payload: message.body,
					metadata: {
						priority: 'medium',
						retryCount: message.attempts,
						maxRetries: 5,
						correlationId: message.id,
						source: 'queue-processor',
					},
				}
				const result = await processor.processWebhookSync(queueMessage)

				if (result.success) {
					successCount++
					message.ack()
				} else {
					failureCount++

					if (result.error?.retryable) {
						message.retry()
					} else {
						message.ack()
					}
				}
			} catch (error) {
				failureCount++
				console.error('Webhook message processing failed:', error)
				message.retry()
			}
		})

		await Promise.all(chunkPromises)
	}

	const totalProcessingTime = Date.now() - startTime

	ctx.logEvent('webhook_batch_completed', {
		messageCount: batch.messages.length,
		successCount,
		failureCount,
		totalProcessingTime,
	})

	ctx.logMetric('webhook_batch_processing_time', totalProcessingTime, {
		message_count: batch.messages.length.toString(),
		success_rate: (successCount / batch.messages.length).toString(),
	})
}

/**
 * Handle batch reprocessing queue messages
 */
export async function handleBatchReprocessing(
	batch: MessageBatch<BatchReprocessPayload>,
	env: Env
): Promise<void> {
	const ctx = createQueueProcessorContext(env)
	const processor = new BatchProcessor(ctx)

	const startTime = Date.now()

	ctx.logEvent('batch_reprocessing_started', {
		messageCount: batch.messages.length,
		batchId: crypto.randomUUID(),
	})

	// Process batch reprocessing messages sequentially to avoid overwhelming the system
	for (const message of batch.messages) {
		try {
			// Convert Cloudflare Workers Message to our QueueMessage format
			const queueMessage: QueueMessage & { payload: BatchReprocessPayload } = {
				type: 'batch_reprocess',
				payload: message.body,
				metadata: {
					priority: 'medium',
					retryCount: message.attempts,
					maxRetries: 2,
					correlationId: message.id,
					source: 'queue-processor',
				},
			}
			const result = await processor.processBatchReprocess(queueMessage)

			if (result.success) {
				message.ack()
			} else {
				if (result.error?.retryable) {
					message.retry()
				} else {
					message.ack()
				}
			}
		} catch (error) {
			console.error('Batch reprocessing failed:', error)
			message.retry()
		}
	}

	const totalProcessingTime = Date.now() - startTime

	ctx.logEvent('batch_reprocessing_completed', {
		messageCount: batch.messages.length,
		totalProcessingTime,
	})
}

// Error handling middleware
app.onError((err, c) => {
	console.error('Unhandled error:', err)
	return c.json(
		{
			error: 'Internal server error',
			message: err.message,
			timestamp: new Date().toISOString(),
		},
		500
	)
})

// Universal queue handler that routes to specific processors
async function queueHandler(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
	// Get the queue name from the batch
	const queueName = batch.queue

	console.log(`Processing queue: ${queueName} with ${batch.messages.length} messages`)

	switch (queueName) {
		case 'document-ingestion':
			return handleDocumentIngestion(batch, env)
		case 'webhook-processing':
			return handleWebhookProcessing(batch, env)
		case 'batch-reprocessing':
			return handleBatchReprocessing(batch, env)
		default:
			console.error(`Unknown queue: ${queueName}`)
			// Acknowledge all messages to prevent infinite retries
			batch.ackAll()
			throw new Error(`Unsupported queue: ${queueName}`)
	}
}

// Export the Hono app and Durable Object as default export with queue handler
export default {
	fetch: app.fetch,
	queue: queueHandler,
}

export { DocumentCoordinator }
