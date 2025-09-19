import { endTime, setMetric, startTime } from 'hono/timing'

import { generateAIResponse } from './ai'
import { getQueryEmbedding } from './embedding'
import { logPerformanceMetrics } from './metrics'
import { prepareContextFromChunks, retrieveChunksFromR2 } from './retrieval'
import { filterChunksByACL, searchVectorize } from './search'

import type { Context } from 'hono'
import type { App, Env } from '../context'
import type { Chunk, PerformanceMetrics, QueryResult } from '../types'

export interface QueryRequest {
	query: string
	userContext?: {
		permissions?: string[]
		userId?: string
	}
}

/**
 * Process a query through the complete RAG pipeline
 */
export async function processQuery(
	request: QueryRequest,
	c: Context<App>,
	requestId: string
): Promise<QueryResult> {
	const queryStartTime = Date.now()
	const metrics: PerformanceMetrics = {
		queryId: requestId,
		timestamp: queryStartTime,
		totalTime: 0,
		embeddingTime: 0,
		vectorSearchTime: 0,
		r2RetrievalTime: 0,
		aclFilteringTime: 0,
		aiGenerationTime: 0,
		chunksRetrieved: 0,
		chunksAfterACL: 0,
		userPermissions: [],
		queryLength: 0,
		responseLength: 0,
	}

	const { query, userContext } = request

	metrics.queryLength = query.length
	metrics.userPermissions = userContext?.permissions || []

	// 1. Generate query embedding using Workers AI
	const embeddingStart = Date.now()
	startTime(c, 'embedding')
	const queryEmbedding = await getQueryEmbedding(query, c.env)
	endTime(c, 'embedding')
	metrics.embeddingTime = Date.now() - embeddingStart

	// 2. Search Vectorize (no ACL filtering for better performance)
	const vectorSearchStart = Date.now()
	startTime(c, 'vector-search')
	const matches = await searchVectorize(queryEmbedding, c.env, 10)
	endTime(c, 'vector-search')
	metrics.vectorSearchTime = Date.now() - vectorSearchStart

	// 3. Retrieve full chunks from R2
	const r2Start = Date.now()
	startTime(c, 'r2-retrieval')
	const allChunks = await retrieveChunksFromR2(matches, c.env)
	endTime(c, 'r2-retrieval')
	metrics.r2RetrievalTime = Date.now() - r2Start
	metrics.chunksRetrieved = allChunks.length

	// 4. Apply application-level ACL filtering
	const aclStart = Date.now()
	startTime(c, 'acl-filtering')
	const chunks = filterChunksByACL(allChunks, userContext?.permissions || [])
	endTime(c, 'acl-filtering')
	metrics.aclFilteringTime = Date.now() - aclStart
	metrics.chunksAfterACL = chunks.length

	console.log(`Application-level ACL filtering: ${allChunks.length} -> ${chunks.length} chunks`)

	// 5. Prepare context for AI generation
	const context = prepareContextFromChunks(chunks)

	// 6. Generate response via Workers AI
	const aiStart = Date.now()
	startTime(c, 'ai-generation')
	const response = await generateAIResponse(query, context, c.env)
	endTime(c, 'ai-generation')
	metrics.aiGenerationTime = Date.now() - aiStart

	// 7. Calculate final metrics and log performance
	metrics.totalTime = Date.now() - queryStartTime
	metrics.responseLength = response.length

	// Add custom metrics to Server-Timing header
	setMetric(c, 'chunks-retrieved', metrics.chunksRetrieved, 'Chunks Retrieved')
	setMetric(c, 'chunks-after-acl', metrics.chunksAfterACL, 'Chunks After ACL')
	setMetric(
		c,
		'acl-efficiency',
		Math.round((metrics.chunksAfterACL / metrics.chunksRetrieved) * 100),
		'ACL Efficiency %'
	)
	setMetric(c, 'query-length', metrics.queryLength, 'Query Length')
	setMetric(c, 'response-length', metrics.responseLength, 'Response Length')

	logPerformanceMetrics(metrics)

	// 8. Return with source citations
	const result: QueryResult = {
		answer: response,
		sources: chunks.map((chunk) => ({
			id: chunk.id,
			url: typeof chunk.metadata?.url === 'string' ? chunk.metadata.url : undefined,
			score: chunk.score,
			content: chunk.content.substring(0, 200) + '...', // Preview
		})),
	}

	return result
}
