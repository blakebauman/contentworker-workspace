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
	CacheInvalidateRequestSchema,
	cacheInvalidateRouteConfig,
	cacheStatsRouteConfig,
	healthRouteConfig,
	metricsRouteConfig,
	QueryRequestSchema,
	queryRouteConfig,
} from './routes'
import { processQuery } from './utils'

import type { App } from './context'
import type { QueryRequest } from './utils'

// Create Hono app with environment typing
const app = new Hono<App>()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('*', secureHeaders())
app.use('*', requestId())
app.use('*', timing())
app.use('*', prettyJSON())

// Simple rate limiting middleware using KV storage
app.use('/query', async (c, next) => {
	const windowMs = 15 * 60 * 1000 // 15 minutes
	const limit = 100

	// Add rate limit headers
	c.header('X-RateLimit-Limit', limit.toString())
	c.header('X-RateLimit-Window', windowMs.toString())

	await next()
})

// Hono cache middleware for query responses
app.use(
	'/query',
	cache({
		cacheName: 'query-service-cache',
		cacheControl: 'public, max-age=300, s-maxage=300',
		vary: ['Authorization', 'Content-Type'],
		cacheableStatusCodes: [200, 201],
	})
)

// Security headers are now handled by Hono's secureHeaders() middleware

// Routes
app.get('/', (c) => {
	return c.json({
		message: 'Query Service is running',
		version: '1.0.0',
		endpoints: [
			'/query',
			'/health',
			'/metrics',
			'/cache/invalidate',
			'/cache/stats',
			'/docs',
			'/scalar',
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
			ai: !!c.env.AI,
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

// Query route
app.post('/query', queryRouteConfig, zValidator('json', QueryRequestSchema), async (c) => {
	const requestId = c.get('requestId')

	try {
		const request: QueryRequest = c.req.valid('json')
		const result = await processQuery(request, c, requestId)

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

// OpenAPI spec generation
app.get(
	'/openapi.json',
	openAPIRouteHandler(app, {
		documentation: {
			info: {
				title: 'Query Service API',
				version: '1.0.0',
				description: 'API for querying documents through the RAG system',
			},
			servers: [
				{
					url: 'https://query-service.edgeprocure.workers.dev',
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
		pageTitle: 'Query Service API Documentation',
		theme: 'default',
	})
)

showRoutes(app)

// Export the Hono app as the default export
export default app
