import { Hono } from 'hono'
import { validator as zValidator } from 'hono-openapi'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'

import {
	CacheInvalidateRequestSchema,
	cacheInvalidateRouteConfig,
	cacheStatsRouteConfig,
	healthRouteConfig,
	metricsRouteConfig,
	QueryRequestSchema,
	queryRouteConfig,
} from './routes'

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
		message: 'Query Service is running',
		version: '1.0.0',
		endpoints: ['/query', '/health', '/metrics', '/cache/invalidate', '/cache/stats'],
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

// Health route - mocked for testing
app.get('/health', healthRouteConfig, (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		services: {
			vectorize: true,
			ai: true,
		},
	})
})

// Metrics route
app.get('/metrics', metricsRouteConfig, (c) => {
	return c.json({
		queries: {
			total: 0,
			successful: 0,
			failed: 0,
			averageResponseTime: 0,
		},
		cache: {
			hits: 0,
			misses: 0,
			hitRate: 0,
		},
		performance: {
			avgEmbeddingTime: 0,
			avgSearchTime: 0,
			avgAiResponseTime: 0,
		},
	})
})

// Cache invalidation route
app.post(
	'/cache/invalidate',
	cacheInvalidateRouteConfig,
	zValidator('json', CacheInvalidateRequestSchema),
	async (c) => {
		try {
			const { pattern } = c.req.valid('json')
			return c.json({
				success: true,
				message: 'Cache invalidated successfully',
				itemsInvalidated: 0,
			})
		} catch (error) {
			return c.json(
				{
					success: false,
					message: 'Failed to invalidate cache',
					itemsInvalidated: 0,
				},
				500
			)
		}
	}
)

// Cache stats route
app.get('/cache/stats', cacheStatsRouteConfig, (c) => {
	return c.json({
		totalItems: 0,
		hitRate: 0,
		memoryUsage: 0,
	})
})

// Query route - mocked for testing
app.post('/query', queryRouteConfig, zValidator('json', QueryRequestSchema), async (c) => {
	const requestId = c.get('requestId')

	try {
		const request = c.req.valid('json')

		// Mock response for testing
		const result = {
			success: true,
			answer: 'This is a test response from the RAG system.',
			sources: [
				{
					id: 'test-doc-1',
					text: 'This is a sample document chunk that was retrieved.',
					score: 0.95,
					metadata: { source: 'test', url: 'https://example.com/test' },
				},
			],
			confidence: 0.85,
			processingTime: 150,
			requestId: requestId,
		}

		// Add cache headers for better performance
		c.header('Cache-Control', 'public, max-age=300, s-maxage=300')
		c.header('ETag', `"${requestId}"`)
		c.header('Last-Modified', new Date().toUTCString())
		c.header('X-Request-ID', requestId)

		return c.json(result)
	} catch (error) {
		console.error('Query error:', error)
		return c.json(
			{
				error: 'Failed to process query',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

export default app
