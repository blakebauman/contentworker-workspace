import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { endTime, setMetric, startTime, timing } from 'hono/timing'
import { z } from 'zod/v4'

import type { Context } from 'hono'

// Re-export common Hono utilities
export {
	Hono,
	cors,
	logger,
	prettyJSON,
	secureHeaders,
	requestId,
	cache,
	timing,
	setMetric,
	startTime,
	endTime,
	zValidator,
	z,
}

// Performance monitoring utilities using Hono's timing middleware
export const addPerformanceMetrics = (c: Context, metrics: Record<string, number | string>) => {
	Object.entries(metrics).forEach(([name, value]) => {
		if (typeof value === 'number') {
			setMetric(c, name, value, `${name} time`)
		} else {
			setMetric(c, name, value)
		}
	})
}

// Security headers are now handled by Hono's secureHeaders() middleware
// Use secureHeaders() directly instead of custom middleware

// RAG-specific middleware
export function createRAGMiddleware() {
	return [
		timing(), // Use Hono's built-in timing middleware
		logger(),
		cors({
			origin: ['*'], // Configure based on your needs
			allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
			allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			exposeHeaders: ['X-Response-Time', 'X-Rate-Limit-Remaining', 'X-Request-ID', 'Server-Timing'],
		}),
		secureHeaders(), // Use Hono's built-in security headers
		requestId(), // Generate unique request IDs
		prettyJSON(),
	]
}

// Cache configurations for different endpoints
export const cacheConfigs = {
	query: {
		cacheName: 'rag-query-cache',
		cacheControl: 'public, max-age=300, s-maxage=300',
		vary: ['Authorization', 'Content-Type'],
		cacheableStatusCodes: [200, 201],
	},
	status: {
		cacheName: 'rag-status-cache',
		cacheControl: 'public, max-age=60, s-maxage=60',
		vary: ['Authorization'],
		cacheableStatusCodes: [200, 404],
	},
	static: {
		cacheName: 'rag-static-cache',
		cacheControl: 'public, max-age=3600, s-maxage=3600',
		vary: ['Accept-Encoding'],
		cacheableStatusCodes: [200],
	},
}

// Common validation schemas
export const DocumentSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	source: z.string().min(1),
	url: z.string().url().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
})

export const ProcessDocumentSchema = z.object({
	documents: z.array(DocumentSchema),
})

export const QuerySchema = z.object({
	query: z.string().min(1),
	userContext: z
		.object({
			permissions: z.array(z.string()),
			userId: z.string(),
		})
		.optional(),
})

// Common error handler
export function createErrorHandler() {
	return (err: Error, c: any) => {
		console.error('Unhandled error:', err)
		return c.json(
			{
				error: 'Internal server error',
				message: err.message,
			},
			500
		)
	}
}

// Health check route
export function createHealthRoute() {
	return (c: any) => {
		return c.json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
		})
	}
}

// Common response helpers
export function createSuccessResponse(data: any, message?: string) {
	return {
		success: true,
		message,
		data,
		timestamp: new Date().toISOString(),
	}
}

export function createErrorResponse(error: string, message: string, _statusCode: number = 500) {
	return {
		success: false,
		error,
		message,
		timestamp: new Date().toISOString(),
	}
}

// Rate limiting configurations
export const rateLimitConfigs = {
	query: {
		windowMs: 15 * 60 * 1000, // 15 minutes
		limit: 100, // 100 requests per window
		message: {
			error: 'Too many requests',
			message: 'Rate limit exceeded. Please try again later.',
		},
	},
	ingest: {
		windowMs: 15 * 60 * 1000, // 15 minutes
		limit: 50, // 50 requests per window
		message: {
			error: 'Too many ingest requests',
			message: 'Rate limit exceeded. Please try again later.',
		},
	},
}

// Cache header helpers
export function addCacheHeaders(c: Context, maxAge: number = 300, etag?: string) {
	c.header('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}`)
	if (etag) {
		c.header('ETag', `"${etag}"`)
	}
	c.header('Last-Modified', new Date().toUTCString())
}

// Request validation utilities
export async function validateRequest(c: Context, schema: any) {
	try {
		const data = await c.req.json()
		return schema.parse(data)
	} catch (error: any) {
		throw new Error(`Validation error: ${error.message}`)
	}
}
