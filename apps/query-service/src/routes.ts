import { describeRoute, resolver } from 'hono-openapi'

import {
	CacheInvalidateRequestSchema,
	CacheInvalidateResponseSchema,
	CacheStatsResponseSchema,
	ErrorResponseSchema,
	HealthResponseSchema,
	MetricsResponseSchema,
	QueryRequestSchema,
	QueryResponseSchema,
} from './schemas'

// Health check route configuration
export const healthRouteConfig = describeRoute({
	tags: ['Health'],
	summary: 'Health check',
	description: 'Check if the service is healthy',
	responses: {
		200: {
			description: 'Service is healthy',
			content: {
				'application/json': {
					schema: resolver(HealthResponseSchema),
				},
			},
		},
	},
})

// Query route configuration
export const queryRouteConfig = describeRoute({
	tags: ['Query'],
	summary: 'Query the RAG system',
	description: 'Ask a question and get an AI-generated answer with sources',
	responses: {
		200: {
			description: 'Query processed successfully',
			content: {
				'application/json': {
					schema: resolver(QueryResponseSchema),
				},
			},
		},
		500: {
			description: 'Query processing failed',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Metrics route configuration
export const metricsRouteConfig = describeRoute({
	tags: ['Monitoring'],
	summary: 'Get performance metrics info',
	description: 'Get information about performance metrics tracking',
	responses: {
		200: {
			description: 'Metrics information retrieved',
			content: {
				'application/json': {
					schema: resolver(MetricsResponseSchema),
				},
			},
		},
	},
})

// Cache invalidate route configuration
export const cacheInvalidateRouteConfig = describeRoute({
	tags: ['Cache'],
	summary: 'Invalidate cache',
	description: 'Invalidate cache entries for specific patterns',
	responses: {
		200: {
			description: 'Cache invalidation requested',
			content: {
				'application/json': {
					schema: resolver(CacheInvalidateResponseSchema),
				},
			},
		},
		500: {
			description: 'Cache invalidation failed',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Cache stats route configuration
export const cacheStatsRouteConfig = describeRoute({
	tags: ['Cache'],
	summary: 'Get cache statistics',
	description: 'Get information about cache configuration and statistics',
	responses: {
		200: {
			description: 'Cache statistics retrieved',
			content: {
				'application/json': {
					schema: resolver(CacheStatsResponseSchema),
				},
			},
		},
	},
})

// Export validation schemas for reuse
export { QueryRequestSchema, CacheInvalidateRequestSchema }
