import { chunkText, cleanText } from './chunking'
import { getEmbedding } from './embedding'
import { storeChunkInR2, upsertVector } from './storage'

import type { Env } from '../context'
import type { ChunkMetadata, Document } from '../types'

/**
 * Process document through the RAG pipeline
 */
export async function processDocument(doc: Document, env: Env) {
	try {
		// Content cleaning and preprocessing
		const cleanedText = cleanText(doc.text)

		// Chunk the document
		const chunks = chunkText(cleanedText)

		// Process each chunk
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i]

			// DLP/PII checks would go here
			// const redactedChunk = await performDLPChecks(chunk);

			// Generate embedding
			const embedding = await getEmbedding(chunk, env)

			// Create chunk metadata
			const chunkId = `${doc.id}#${i}`
			const metadata: ChunkMetadata = {
				source: doc.source,
				url: doc.url,
				chunk_index: i,
				doc_id: doc.id,
				timestamp: Date.now(),
				acl: doc.metadata?.acl || [],
			}

			// Store chunk in R2
			await storeChunkInR2(`chunks/${chunkId}.txt`, chunk, metadata, env)

			// Upsert to Vectorize
			await upsertVector(chunkId, embedding, metadata, env)
		}

		console.log(`Processed document ${doc.id} with ${chunks.length} chunks`)
	} catch (error) {
		console.error(`Failed to process document ${doc.id}:`, error)
		throw error
	}
}
