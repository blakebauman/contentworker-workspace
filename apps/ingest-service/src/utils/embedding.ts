import type { Env } from '../context'

/**
 * Generate embeddings using Workers AI
 */
export async function getEmbedding(text: string, env: Env): Promise<number[]> {
	try {
		const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
			text: text,
		})

		console.log('AI Response type:', typeof response)
		console.log('AI Response length:', Array.isArray(response) ? response.length : 'Not an array')
		console.log('AI Response sample:', Array.isArray(response) ? response.slice(0, 5) : response)

		// The response is an object with a data property containing the embedding array
		let embedding: number[]
		if (response && typeof response === 'object' && 'data' in response) {
			const data = (response as any).data
			if (Array.isArray(data) && data.length > 0) {
				embedding = data[0] // The embedding is in data[0]
			} else {
				throw new Error(`Embedding failed: Invalid data format in response`)
			}
		} else {
			throw new Error(
				`Embedding failed: Expected object with data property, got ${typeof response}`
			)
		}

		if (!Array.isArray(embedding)) {
			throw new Error(`Embedding failed: Expected array, got ${typeof embedding}`)
		}

		if (embedding.length === 0) {
			throw new Error(`Embedding failed: Empty array returned`)
		}

		return embedding
	} catch (error) {
		console.error('Embedding error:', error)
		throw new Error(`Embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}
