interface Env {
	// Queue consumer bindings (automatically available)

	// Durable Object bindings
	DOCUMENT_COORDINATOR: DurableObjectNamespace

	// Storage bindings
	DOCS_BUCKET: R2Bucket
	VECTORIZE_INDEX: VectorizeIndex

	// AI bindings
	AI: Ai

	// Environment variables
	VECTORIZE_INDEX_ID: string
	AI_ACCOUNT_ID: string
}
