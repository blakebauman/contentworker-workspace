import z from 'zod'

// User context schema
export const UserContextSchema = z
	.object({
		permissions: z.array(z.string()),
		userId: z.string(),
	})
	.describe('User context')
	.meta({
		ref: 'UserContext',
	})

// Query request schema
export const QueryRequestSchema = z
	.object({
		query: z.string().min(1),
		userContext: UserContextSchema.optional(),
		limit: z.number().min(1).max(50).default(10),
		threshold: z.number().min(0).max(1).default(0.7),
	})
	.describe('Query request')
	.meta({
		ref: 'QueryRequest',
	})

// Query response schema
export const QueryResponseSchema = z
	.object({
		answer: z.string(),
		sources: z.array(
			z.object({
				id: z.string(),
				text: z.string(),
				score: z.number(),
				metadata: z.record(z.string(), z.any()).optional(),
			})
		),
		userContext: UserContextSchema.optional(),
		processingTime: z.number(),
		totalResults: z.number(),
	})
	.describe('Query response')
	.meta({
		ref: 'QueryResponse',
	})

// Error response schema
export const ErrorResponseSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		details: z.record(z.string(), z.any()).optional(),
	})
	.describe('Error response')
	.meta({
		ref: 'ErrorResponse',
	})

// Health response schema
export const HealthResponseSchema = z
	.object({
		status: z.string(),
		timestamp: z.string(),
		services: z.object({
			vectorize: z.boolean(),
			ai: z.boolean(),
		}),
	})
	.describe('Health response')
	.meta({
		ref: 'HealthResponse',
	})

// Metrics response schema
export const MetricsResponseSchema = z
	.object({
		queries: z.object({
			total: z.number(),
			successful: z.number(),
			failed: z.number(),
			averageResponseTime: z.number(),
		}),
		cache: z.object({
			hits: z.number(),
			misses: z.number(),
			hitRate: z.number(),
		}),
		performance: z.object({
			avgEmbeddingTime: z.number(),
			avgSearchTime: z.number(),
			avgAiResponseTime: z.number(),
		}),
	})
	.describe('Metrics response')
	.meta({
		ref: 'MetricsResponse',
	})

// Cache invalidate request schema
export const CacheInvalidateRequestSchema = z
	.object({
		pattern: z.string().optional(),
	})
	.describe('Cache invalidate request')
	.meta({
		ref: 'CacheInvalidateRequest',
	})

// Cache invalidate response schema
export const CacheInvalidateResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		itemsInvalidated: z.number(),
	})
	.describe('Cache invalidate response')
	.meta({
		ref: 'CacheInvalidateResponse',
	})

// Cache stats response schema
export const CacheStatsResponseSchema = z
	.object({
		totalItems: z.number(),
		hitRate: z.number(),
		memoryUsage: z.number(),
		oldestItem: z.string().optional(),
		newestItem: z.string().optional(),
	})
	.describe('Cache stats response')
	.meta({
		ref: 'CacheStatsResponse',
	})
