import type { HonoApp, SharedHonoEnv, SharedHonoVariables } from '@repo/hono-helpers'

export type Env = SharedHonoEnv & {
	DOCS_BUCKET: R2Bucket
	VECTORIZE_INDEX: VectorizeIndex
	AI: Ai

	// Coordination service binding for query-time operations
	DOCUMENT_COORDINATOR: DurableObjectNamespace
}

/** Variables can be extended */
export type Variables = SharedHonoVariables

export interface App extends HonoApp {
	Bindings: Env
	Variables: Variables
}
