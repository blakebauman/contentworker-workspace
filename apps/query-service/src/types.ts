// Query interfaces
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

// Performance monitoring interface
export interface PerformanceMetrics {
	queryId: string
	timestamp: number
	totalTime: number
	embeddingTime: number
	vectorSearchTime: number
	r2RetrievalTime: number
	aclFilteringTime: number
	aiGenerationTime: number
	chunksRetrieved: number
	chunksAfterACL: number
	userPermissions: string[]
	queryLength: number
	responseLength: number
}

// Chunk interface for internal processing
export interface Chunk {
	id: string
	content: string
	metadata: {
		source?: string
		acl?: string | string[]
		url?: string
		[key: string]: any
	}
	score: number
}

// Vectorize search result interface
export interface VectorizeMatch {
	id: string
	score: number
	metadata?: Record<string, any>
}

export interface VectorizeResults {
	count: number
	matches: VectorizeMatch[]
}

// AI response interfaces
export interface AIEmbeddingResponse {
	data: number[][]
}

export interface AIMessageResponse {
	response: string
}

export interface AIChoicesResponse {
	choices: Array<{
		message: {
			content: string
		}
	}>
}

// Cache and rate limiting interfaces
export interface RateLimitInfo {
	windowMs: string
	limit: string
}

export interface CacheInfo {
	cacheControl: string
	varyHeaders: string[]
	rateLimit: RateLimitInfo
}

// Error response interface
export interface ErrorResponse {
	error: string
	message: string
}
