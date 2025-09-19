import type { Env } from '../context'
import type { Chunk, VectorizeMatch } from '../types'

/**
 * Retrieve chunk content from R2 storage
 */
export async function retrieveChunksFromR2(matches: VectorizeMatch[], env: Env): Promise<Chunk[]> {
	const chunks: Chunk[] = []

	// Retrieve content from R2 in parallel for better performance
	const contentPromises = matches.map(async (match) => {
		try {
			// Mock R2 content for local development
			if (!env.DOCS_BUCKET || typeof env.DOCS_BUCKET.get !== 'function') {
				console.warn('R2 not available - using mock content for development')
				return {
					id: match.id,
					content: `This is mock content for chunk ${match.id}. In a real implementation, this would be retrieved from R2 storage.`,
					score: match.score,
					metadata: match.metadata || {},
				}
			}

			const object = await env.DOCS_BUCKET.get(`chunks/${match.id}.txt`)
			if (!object) {
				console.warn(`Chunk content not found in R2: chunks/${match.id}.txt`)
				return null
			}

			const content = await object.text()
			return {
				id: match.id,
				content,
				score: match.score,
				metadata: match.metadata || {},
			}
		} catch (error) {
			console.error(`Error retrieving chunk ${match.id}:`, error)
			return null
		}
	})

	const results = await Promise.all(contentPromises)

	// Filter out failed retrievals
	for (const result of results) {
		if (result) {
			chunks.push(result)
		}
	}

	return chunks
}

/**
 * Prepare context for AI generation from chunks
 */
export function prepareContextFromChunks(chunks: Chunk[]): string {
	return chunks
		.map((chunk, index) => {
			const source = chunk.metadata?.source || 'Unknown source'
			const url = chunk.metadata?.url || ''
			return `[${index + 1}] Source: ${source}${url ? ` (${url})` : ''}\nContent: ${chunk.content}\n`
		})
		.join('\n')
}
