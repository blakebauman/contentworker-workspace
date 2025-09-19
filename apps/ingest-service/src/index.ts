import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import { openAPIRouteHandler, validator as zValidator } from 'hono-openapi'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { showRoutes } from 'hono/dev'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'

import {
	batchReprocessRouteConfig,
	healthRouteConfig,
	ProcessDocumentSchema,
	processRouteConfig,
	processWorkflowRouteConfig,
	queueProcessRouteConfig,
	StatusParamsSchema,
	statusRouteConfig,
	webhookRouteConfig,
	WorkflowParamsSchema,
	workflowStatusRouteConfig,
} from './routes'
import {
	BatchReprocessRequestSchema,
	QueueProcessRequestSchema,
	WebhookRequestSchema,
} from './schemas'
import { processDocument } from './utils'
import { QueueManager } from './utils/queue'

import type { App } from './context'
import type { DocumentProcessingParams } from './workflow-processor'

// Create Hono app with environment typing
const app = new Hono<App>()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('*', secureHeaders())
app.use('*', requestId())
app.use('*', timing())
app.use('*', prettyJSON())

// Simple rate limiting middleware for ingest operations
app.use('/process', async (c, next) => {
	const _clientIP = c.req.header('CF-Connecting-IP') || 'unknown'
	const limit = 50
	const windowMs = 15 * 60 * 1000 // 15 minutes

	// Add rate limit headers
	c.header('X-RateLimit-Limit', limit.toString())
	c.header('X-RateLimit-Window', windowMs.toString())

	await next()
})

// Cache middleware for status endpoint
app.use(
	'/status/*',
	cache({
		cacheName: 'ingest-service-status-cache',
		cacheControl: 'public, max-age=60, s-maxage=60', // 1 minute cache for status
		vary: ['Authorization'],
		cacheableStatusCodes: [200, 404],
	})
)

// Security headers are now handled by Hono's secureHeaders() middleware

// Routes
app.get('/', (c) => {
	return c.json({
		message: 'Ingest Service is running',
		version: '1.0.0',
		endpoints: [
			'/process',
			'/process-workflow',
			'/workflow/{instanceId}',
			'/health',
			'/status',
			'/docs',
			'/openapi.json',
		],
	})
})

// Error handling middleware
app.onError((err, c) => {
	console.error('Unhandled error:', err)
	return c.json(
		{
			error: 'Internal server error',
			message: err.message,
		},
		500
	)
})

// Health route
app.get('/health', healthRouteConfig, (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		services: {
			vectorize: !!c.env.VECTORIZE_INDEX,
			r2: !!c.env.DOCS_BUCKET,
			ai: !!c.env.AI,
		},
	})
})

// Process documents route (synchronous, legacy)
app.post('/process', processRouteConfig, zValidator('json', ProcessDocumentSchema), async (c) => {
	try {
		const { documents } = c.req.valid('json')
		const results = []

		for (const doc of documents) {
			await processDocument(doc, c.env)
			results.push({
				documentId: doc.id,
				chunksCreated: 1,
				processingTime: 0,
				status: 'success' as const,
			})
		}

		return c.json(
			{
				success: true,
				message: 'Documents processed successfully',
				results,
				totalChunks: results.length,
				processingTime: 0,
			},
			200
		)
	} catch (error) {
		console.error('Processing error:', error)
		return c.json(
			{
				success: false,
				message: 'Failed to process documents',
				results: [],
				totalChunks: 0,
				processingTime: 0,
			},
			500
		)
	}
})

// Process documents via Workflow (recommended)
app.post(
	'/process-workflow',
	processWorkflowRouteConfig,
	zValidator('json', ProcessDocumentSchema),
	async (c) => {
		try {
			const { documents, options } = c.req.valid('json')
			const workflowInstances = []

			for (const doc of documents) {
				const params: DocumentProcessingParams = {
					document: doc,
					options: options || {},
				}

				// Create a workflow instance for each document
				const instance = await c.env.DOCUMENT_PROCESSING_WORKFLOW.create({
					params,
				})

				workflowInstances.push({
					documentId: doc.id,
					workflowInstanceId: instance.id,
					status: 'queued' as const,
				})

				console.log(`Created workflow instance ${instance.id} for document ${doc.id}`)
			}

			return c.json(
				{
					success: true,
					message: `${documents.length} workflow(s) queued for processing`,
					results: workflowInstances,
					totalWorkflows: workflowInstances.length,
				},
				202
			) // 202 Accepted - processing will happen asynchronously
		} catch (error) {
			console.error('Workflow creation error:', error)
			return c.json(
				{
					success: false,
					message: 'Failed to create workflows',
					results: [],
					totalWorkflows: 0,
				},
				500
			)
		}
	}
)

// Get workflow status
app.get(
	'/workflow/:instanceId',
	workflowStatusRouteConfig,
	zValidator('param', WorkflowParamsSchema),
	async (c) => {
		try {
			const instanceId = c.req.param('instanceId')
			const instance = await c.env.DOCUMENT_PROCESSING_WORKFLOW.get(instanceId)

			if (!instance) {
				return c.json(
					{
						error: 'Not found',
						message: 'Workflow instance not found',
					},
					404
				)
			}

			const status = await instance.status()

			return c.json({
				instanceId: instance.id,
				status: status.status,
				output: status.output,
				error: status.error,
				timestamp: new Date().toISOString(),
			})
		} catch (error) {
			console.error('Workflow status error:', error)
			return c.json(
				{
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			)
		}
	}
)

// Document status route
app.get('/status/:docId', statusRouteConfig, zValidator('param', StatusParamsSchema), async (c) => {
	const { docId } = c.req.valid('param')

	try {
		// Check if document exists in R2
		const object = await c.env.DOCS_BUCKET.head(`chunks/${docId}#0.txt`)

		if (!object) {
			return c.json(
				{
					error: 'Not found',
					message: 'Document not found',
				},
				404
			)
		}

		return c.json(
			{
				status: 'found',
				timestamp: new Date().toISOString(),
				message: 'Document found',
				details: {
					worker: 'ingest-service',
					version: '1.0.0',
					environment: 'production',
				},
			},
			200
		)
	} catch (error) {
		return c.json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

// Queue-based processing endpoints

// Queue documents for processing
app.post(
	'/queue/process',
	queueProcessRouteConfig,
	zValidator('json', QueueProcessRequestSchema),
	async (c) => {
		try {
			const requestData = c.req.valid('json')
			const { documents, options = {} } = requestData

			const queueManager = new QueueManager(c.env)

			// Queue documents for processing
			const result = await queueManager.queueDocumentBatch(documents, {
				priority: options?.priority || 'medium',
				source: options?.source || 'api',
			})

			const messageIds: string[] = [] // TODO: Collect actual message IDs from queue results

			return c.json(
				{
					success: result.success,
					message: `${result.queuedCount} of ${documents.length} documents queued successfully`,
					queuedCount: result.queuedCount,
					totalDocuments: documents.length,
					messageIds,
					errors: result.errors.length > 0 ? result.errors : undefined,
				},
				result.success ? 202 : 207
			) // 207 Multi-Status if partial success
		} catch (error) {
			console.error('Queue processing error:', error)
			return c.json(
				{
					error: 'Failed to queue documents',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			)
		}
	}
)

// Handle webhook events
app.post('/webhook', webhookRouteConfig, zValidator('json', WebhookRequestSchema), async (c) => {
	try {
		const requestData = c.req.valid('json')
		const {
			sourceType,
			eventType,
			resourceId,
			resourceUrl,
			changeToken,
			metadata = {},
			options = {},
		} = requestData

		const queueManager = new QueueManager(c.env)

		// Queue webhook event for processing
		const result = await queueManager.queueWebhookEvent(
			sourceType,
			eventType,
			resourceId,
			resourceUrl,
			metadata,
			{
				priority: options?.priority || 'high',
				changeToken,
			}
		)

		if (result.success) {
			return c.json(
				{
					success: true,
					message: 'Webhook event queued successfully',
					messageId: result.messageId,
					eventType,
					resourceId,
				},
				202
			)
		} else {
			return c.json(
				{
					success: false,
					message: 'Failed to queue webhook event',
					error: result.error,
				},
				500
			)
		}
	} catch (error) {
		console.error('Webhook processing error:', error)
		return c.json(
			{
				error: 'Failed to process webhook',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

// Queue batch reprocessing
app.post(
	'/queue/batch-reprocess',
	batchReprocessRouteConfig,
	zValidator('json', BatchReprocessRequestSchema),
	async (c) => {
		try {
			const requestData = c.req.valid('json')
			const { documentIds, reason, options = {} } = requestData

			const queueManager = new QueueManager(c.env)

			// Queue batch reprocessing
			const result = await queueManager.queueBatchReprocess(documentIds, reason, {
				forceFullReprocess: options?.forceFullReprocess || false,
				preserveVersions: options?.preserveVersions || true,
				priority: options?.priority || 'low',
			})

			if (result.success) {
				return c.json(
					{
						success: true,
						message: 'Batch reprocessing queued successfully',
						messageId: result.messageId,
						documentCount: documentIds.length,
						reason,
					},
					202
				)
			} else {
				return c.json(
					{
						success: false,
						message: 'Failed to queue batch reprocessing',
						error: result.error,
					},
					500
				)
			}
		} catch (error) {
			console.error('Batch reprocessing error:', error)
			return c.json(
				{
					error: 'Failed to queue batch reprocessing',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				500
			)
		}
	}
)

// Get processing status for a document
app.get('/queue/status/:docId', async (c) => {
	try {
		const docId = c.req.param('docId')
		const queueManager = new QueueManager(c.env)

		const status = await queueManager.getProcessingStatus(docId)

		return c.json({
			documentId: docId,
			...status,
			timestamp: new Date().toISOString(),
		})
	} catch (error) {
		console.error('Status check error:', error)
		return c.json(
			{
				error: 'Failed to get processing status',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

// OpenAPI spec generation
app.get(
	'/openapi.json',
	openAPIRouteHandler(app, {
		documentation: {
			info: {
				title: 'Ingest Service API',
				version: '1.0.0',
				description: 'API for processing documents through the RAG pipeline',
			},
			servers: [
				{
					url: 'https://ingest-service.edgeprocure.workers.dev',
					description: 'Production server',
				},
				{
					url: 'http://localhost:3000',
					description: 'Development server',
				},
			],
		},
	})
)

// Scalar API Documentation UI
app.get(
	'/docs',
	Scalar({
		url: '/openapi.json',
		pageTitle: 'Ingest Service API Documentation',
		theme: 'purple',
		showSidebar: true,
		hideDownloadButton: false,
		hideSearch: false,
		sources: [
			{ url: '/openapi.json', title: 'Ingest Service' },
			{ url: 'http://localhost:3001/openapi.json', title: 'Query Service' },
		],
	})
)

showRoutes(app)

// Export the Hono app as the default export
export default app

// Export the workflow class
export { DocumentProcessingWorkflow } from './workflow-processor'
