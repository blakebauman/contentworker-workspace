import type { HonoApp, SharedHonoEnv, SharedHonoVariables } from '@repo/hono-helpers'

export type Env = SharedHonoEnv & {
	DOCS_BUCKET: R2Bucket
	VECTORIZE_INDEX: VectorizeIndex
	AI: Ai
	VECTORIZE_INDEX_ID: string
	AI_ACCOUNT_ID: string
	DOCUMENT_PROCESSING_WORKFLOW: Workflow

	// Queue bindings for async processing
	DOCUMENT_INGESTION_QUEUE: Queue
	WEBHOOK_PROCESSING_QUEUE: Queue
	BATCH_REPROCESSING_QUEUE: Queue

	// Coordination service binding
	DOCUMENT_COORDINATOR: DurableObjectNamespace
}

/** Variables can be extended */
export type Variables = SharedHonoVariables

export interface App extends HonoApp {
	Bindings: Env
	Variables: Variables
}
