import { Hono } from 'hono'
import { validator as zValidator } from 'hono-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'

import {
	healthRouteConfig,
	ProcessDocumentSchema,
	processRouteConfig,
	StatusParamsSchema,
	statusRouteConfig,
} from './routes'
import { processDocument } from './utils'

import type { App } from './context'

// Create Hono app with environment typing for testing
const app = new Hono<App>()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('*', secureHeaders())
app.use('*', requestId())
app.use('*', timing())
app.use('*', prettyJSON())

// Routes
app.get('/', (c) => {
	return c.json({
		message: 'Ingest Service is running',
		version: '1.0.0',
		endpoints: ['/process', '/health', '/status'],
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
			vectorize: true,
			r2: true,
			ai: true,
		},
	})
})

// Process documents route (synchronous, legacy) - mocked for testing
app.post('/process', processRouteConfig, zValidator('json', ProcessDocumentSchema), async (c) => {
	try {
		const { documents } = c.req.valid('json')
		const results = []

		for (const doc of documents) {
			// Mock processing for testing
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

// Document status route - mocked for testing
app.get('/status/:docId', statusRouteConfig, zValidator('param', StatusParamsSchema), async (c) => {
	const { docId } = c.req.valid('param')

	// Mock: always return not found for testing
	return c.json(
		{
			error: 'Not found',
			message: 'Document not found',
		},
		404
	)
})

export default app
