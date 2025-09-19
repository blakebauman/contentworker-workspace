import type { Env } from '../context'
import type { AIEmbeddingResponse } from '../types'

/**
 * Generate query embedding using Workers AI
 */
export async function getQueryEmbedding(query: string, env: Env): Promise<number[]> {
	const queryResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
		text: query,
	})

	// Extract embedding from the response object
	let queryEmbedding: number[]
	if (queryResponse && typeof queryResponse === 'object' && 'data' in queryResponse) {
		const data = (queryResponse as AIEmbeddingResponse).data
		if (Array.isArray(data) && data.length > 0) {
			queryEmbedding = data[0] // The embedding is in data[0]
		} else {
			throw new Error(`Query embedding failed: Invalid data format in response`)
		}
	} else {
		throw new Error(
			`Query embedding failed: Expected object with data property, got ${typeof queryResponse}`
		)
	}

	if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
		throw new Error(`Query embedding failed: No data returned`)
	}

	return queryEmbedding
}
