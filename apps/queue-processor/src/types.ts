import type { Document } from 'rag-types'

// Queue Message Types
export interface QueueMessage {
	type:
		| 'document_ingestion'
		| 'webhook_sync'
		| 'batch_reprocess'
		| 'document_update'
		| 'document_delete'
	payload: QueueMessagePayload
	metadata: {
		priority: 'low' | 'medium' | 'high' | 'critical'
		retryCount: number
		maxRetries: number
		scheduledTime?: number
		correlationId: string
		source: string
	}
}

export type QueueMessagePayload =
	| DocumentIngestionPayload
	| WebhookSyncPayload
	| BatchReprocessPayload
	| DocumentUpdatePayload
	| DocumentDeletePayload

export interface DocumentIngestionPayload {
	type: 'document_ingestion'
	document: Document
	options?: {
		chunkSize?: number
		overlap?: number
		dlpEnabled?: boolean
		forceReprocess?: boolean
	}
}

export interface WebhookSyncPayload {
	type: 'webhook_sync'
	sourceType: 'sharepoint' | 'confluence' | 'jira' | 'website'
	eventType: 'created' | 'updated' | 'deleted' | 'moved'
	resourceId: string
	resourceUrl: string
	changeToken?: string
	metadata: Record<string, any>
}

export interface BatchReprocessPayload {
	type: 'batch_reprocess'
	documentIds: string[]
	reason: 'schema_change' | 'model_update' | 'policy_change' | 'manual_reindex'
	options?: {
		forceFullReprocess?: boolean
		preserveVersions?: boolean
	}
}

export interface DocumentUpdatePayload {
	type: 'document_update'
	documentId: string
	changes: {
		text?: string
		metadata?: Record<string, any>
		acl?: string[]
	}
	incrementalUpdate: boolean
}

export interface DocumentDeletePayload {
	type: 'document_delete'
	documentId: string
	hardDelete: boolean
	reason?: string
}

// Processing Results
export interface ProcessingResult {
	success: boolean
	messageId: string
	processingTime: number
	chunksProcessed?: number
	embeddingsGenerated?: number
	error?: {
		code: string
		message: string
		retryable: boolean
	}
	metadata?: Record<string, any>
}

export interface BatchProcessingResult {
	totalMessages: number
	successCount: number
	failureCount: number
	results: ProcessingResult[]
	totalProcessingTime: number
	errors: Array<{
		messageId: string
		error: string
		retryable: boolean
	}>
}

// Coordination Types
export interface DocumentLock {
	documentId: string
	lockId: string
	lockType: 'processing' | 'updating' | 'deleting'
	acquiredAt: number
	expiresAt: number
	workerId: string
	metadata?: Record<string, any>
}

export interface ProcessingState {
	documentId: string
	status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
	progress: {
		currentStep: string
		stepsCompleted: number
		totalSteps: number
		percentage: number
	}
	startedAt: number
	lastUpdatedAt: number
	completedAt?: number
	error?: string
	metadata?: Record<string, any>
}

export interface DeduplicationResult {
	isDuplicate: boolean
	existingDocumentId?: string
	contentHash: string
	similarity?: number
	action: 'skip' | 'update' | 'create_new'
	reason?: string
}

// Dead Letter Queue Types
export interface DeadLetterMessage {
	originalMessage: QueueMessage
	failureCount: number
	lastFailureAt: number
	failures: Array<{
		timestamp: number
		error: string
		stackTrace?: string
	}>
	status: 'failed' | 'manual_retry_pending' | 'abandoned'
}
