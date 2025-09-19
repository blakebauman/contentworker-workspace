import type { Env } from '../context'
import type { Chunk, VectorizeMatch } from '../types'

/**
 * Search Vectorize for similar vectors
 */
export async function searchVectorize(
	queryEmbedding: number[],
	env: Env,
	topK: number = 10
): Promise<VectorizeMatch[]> {
	const searchOptions: any = {
		topK,
		returnMetadata: 'all',
	}

	// Note: ACL filtering is handled at application level after retrieval
	// This is more performant and reliable than Vectorize metadata filtering

	// Mock Vectorize results for local development
	let results
	if (!env.VECTORIZE_INDEX || typeof env.VECTORIZE_INDEX.query !== 'function') {
		console.warn('Vectorize not available - using mock results for development')
		results = {
			matches: [
				{
					id: 'mock-chunk-1',
					score: 0.85,
					metadata: {
						source: 'mock-document',
						url: 'https://example.com/doc1',
						acl: 'public',
						chunkIndex: '0',
					},
				},
				{
					id: 'mock-chunk-2',
					score: 0.78,
					metadata: {
						source: 'mock-document-2',
						url: 'https://example.com/doc2',
						acl: 'public',
						chunkIndex: '1',
					},
				},
			],
		}
	} else {
		results = await env.VECTORIZE_INDEX.query(queryEmbedding, searchOptions)
	}

	return results.matches || []
}

/**
 * Filter chunks based on user ACL permissions
 */
export function filterChunksByACL(chunks: Chunk[], userPermissions: string[]): Chunk[] {
	if (!userPermissions || userPermissions.length === 0) {
		return chunks.filter((chunk) => {
			const acl = chunk.metadata?.acl
			return !acl || acl === 'public' || (typeof acl === 'string' && acl.includes('public'))
		})
	}

	return chunks.filter((chunk) => {
		const acl = chunk.metadata?.acl
		if (!acl || acl === 'public') return true

		if (typeof acl === 'string') {
			const aclArray = acl.split(',').map((p) => p.trim())
			return aclArray.some(
				(permission) => permission === 'public' || userPermissions.includes(permission)
			)
		}

		return false
	})
}
