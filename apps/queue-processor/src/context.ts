import type { HonoRequest } from 'hono'

// Environment interface matching wrangler.jsonc
export interface Env {
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

// Hono app type with environment bindings
export type App = {
	Bindings: Env
}

// Enhanced context with queue processing capabilities
export interface QueueProcessorContext {
	env: Env
	request?: HonoRequest
	workerId: string
	startTime: number

	// Coordination helpers
	getCoordinator(documentId: string): DurableObjectStub

	// Metrics and logging
	logMetric(name: string, value: number, tags?: Record<string, string>): void
	logEvent(event: string, data?: Record<string, any>): void
}

export function createQueueProcessorContext(
	env: Env,
	request?: HonoRequest
): QueueProcessorContext {
	const workerId = crypto.randomUUID()
	const startTime = Date.now()

	return {
		env,
		request,
		workerId,
		startTime,

		getCoordinator(documentId: string): DurableObjectStub {
			// Use consistent hashing for document coordination
			const id = env.DOCUMENT_COORDINATOR.idFromName(documentId)
			return env.DOCUMENT_COORDINATOR.get(id)
		},

		logMetric(name: string, value: number, tags: Record<string, string> = {}) {
			console.log(
				JSON.stringify({
					type: 'metric',
					name,
					value,
					tags: {
						...tags,
						workerId,
					},
					timestamp: Date.now(),
				})
			)
		},

		logEvent(event: string, data: Record<string, any> = {}) {
			console.log(
				JSON.stringify({
					type: 'event',
					event,
					data: {
						...data,
						workerId,
					},
					timestamp: Date.now(),
				})
			)
		},
	}
}
