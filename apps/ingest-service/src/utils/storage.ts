import type { Env } from '../context'
import type { ChunkMetadata } from '../types'

/**
 * Upsert vector to Vectorize
 */
export async function upsertVector(
	id: string,
	embedding: number[],
	metadata: ChunkMetadata,
	env: Env
) {
	console.log('Upserting vector:', {
		id,
		embeddingLength: embedding.length,
		embeddingSample: embedding.slice(0, 5),
		metadata,
	})

	// Store comprehensive metadata for Vectorize
	// Note: ACL should be stored as individual string values for proper filtering
	const vectorizeMetadata: Record<string, string> = {
		source: metadata.source || 'unknown',
		url: metadata.url || '',
		acl: Array.isArray(metadata.acl) ? metadata.acl.join(',') : String(metadata.acl || 'public'),
		chunkIndex: String(metadata.chunk_index || 0),
	}

	const result = await env.VECTORIZE_INDEX.upsert([
		{
			id,
			values: embedding,
			metadata: vectorizeMetadata,
		},
	])

	return result
}

/**
 * Store chunk content in R2
 */
export async function storeChunkInR2(
	key: string,
	content: string,
	metadata: ChunkMetadata,
	env: Env
) {
	// Convert metadata to string values for R2
	const stringMetadata: Record<string, string> = {}
	for (const [key, value] of Object.entries(metadata)) {
		if (typeof value === 'string') {
			stringMetadata[key] = value
		} else if (typeof value === 'number') {
			stringMetadata[key] = value.toString()
		} else if (Array.isArray(value)) {
			stringMetadata[key] = JSON.stringify(value)
		} else if (value !== undefined && value !== null) {
			stringMetadata[key] = JSON.stringify(value)
		}
	}

	await env.DOCS_BUCKET.put(key, content, {
		httpMetadata: {
			contentType: 'text/plain',
		},
		customMetadata: stringMetadata,
	})
}
