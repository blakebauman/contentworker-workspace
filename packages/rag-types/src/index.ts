// RAG Document Types
export interface Document {
	id: string
	text: string
	source: string
	url?: string
	metadata?: Record<string, any>
}

export interface ChunkMetadata {
	source: string
	url?: string
	chunk_index: number
	doc_id: string
	timestamp: number
	acl?: string[]
}

// Query Types
export interface UserContext {
	permissions: string[]
	userId: string
}

export interface QueryResult {
	answer: string
	sources: Array<{
		id: string
		url?: string
		score: number
		content: string
	}>
}

// Environment Types
export interface RAGIngestEnv {
	DOCS_BUCKET: R2Bucket
	VECTORIZE_INDEX: VectorizeIndex
	AI: Ai
	VECTORIZE_INDEX_ID: string
	AI_ACCOUNT_ID: string
}

export interface RAGQueryEnv {
	DOCS_BUCKET: R2Bucket
	VECTORIZE_INDEX: VectorizeIndex
	AI: Ai
}

// API Response Types
export interface ProcessDocumentResponse {
	success: boolean
	processed: number
	results: Array<{
		id: string
		status: string
		timestamp: string
	}>
}

export interface DocumentStatusResponse {
	exists: boolean
	lastModified?: Date
	size?: number
	metadata?: ChunkMetadata
	message?: string
}

// Error Types
export interface APIError {
	error: string
	message: string
}

// Validation Schemas (re-export for convenience)
export { z } from 'zod/v4'
