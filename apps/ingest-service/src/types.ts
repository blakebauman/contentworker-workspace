// Document and chunk interfaces
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

// Processing interfaces
export interface ProcessResult {
	documentId: string
	chunksCreated: number
	processingTime: number
	status: 'success' | 'error'
	error?: string
}

export interface ProcessResponse {
	success: boolean
	message: string
	results: ProcessResult[]
	totalChunks: number
	processingTime: number
}

// Status and health interfaces
export interface HealthResponse {
	status: string
	timestamp: string
	services: {
		vectorize: boolean
		r2: boolean
		ai: boolean
	}
}

export interface StatusResponse {
	status: string
	timestamp: string
	message: string
	details: {
		worker: string
		version: string
		environment: string
	}
}

// Error response interface
export interface ErrorResponse {
	error: string
	message: string
	details?: Record<string, any>
}

// Vectorize operation interfaces
export interface VectorizeInsertResult {
	id: string
	success: boolean
	error?: string
}

export interface ChunkProcessingResult {
	chunkId: string
	embedding: number[]
	metadata: ChunkMetadata
	success: boolean
	error?: string
}
