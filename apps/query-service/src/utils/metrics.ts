import type { PerformanceMetrics } from '../types'

/**
 * Log performance metrics with detailed breakdown
 */
export function logPerformanceMetrics(metrics: PerformanceMetrics) {
	console.log('Performance Metrics:', {
		queryId: metrics.queryId,
		totalTime: `${metrics.totalTime}ms`,
		breakdown: {
			embedding: `${metrics.embeddingTime}ms`,
			vectorSearch: `${metrics.vectorSearchTime}ms`,
			r2Retrieval: `${metrics.r2RetrievalTime}ms`,
			aclFiltering: `${metrics.aclFilteringTime}ms`,
			aiGeneration: `${metrics.aiGenerationTime}ms`,
		},
		efficiency: {
			chunksRetrieved: metrics.chunksRetrieved,
			chunksAfterACL: metrics.chunksAfterACL,
			aclFilterRatio:
				metrics.chunksRetrieved > 0
					? ((metrics.chunksAfterACL / metrics.chunksRetrieved) * 100).toFixed(1) + '%'
					: '0%',
		},
		data: {
			queryLength: metrics.queryLength,
			responseLength: metrics.responseLength,
			userPermissions: metrics.userPermissions,
		},
	})
}
