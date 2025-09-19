import { DurableObject } from 'cloudflare:workers'

import type { DeduplicationResult, DocumentLock, ProcessingState } from './types'

export class DocumentCoordinator extends DurableObject {
	constructor(state: DurableObjectState, env: Env) {
		super(state, env)
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const action = url.pathname.split('/').pop()

		try {
			switch (action) {
				case 'acquire-lock':
					return this.handleAcquireLock(request)
				case 'release-lock':
					return this.handleReleaseLock(request)
				case 'check-lock':
					return this.handleCheckLock(request)
				case 'update-state':
					return this.handleUpdateState(request)
				case 'get-state':
					return this.handleGetState(request)
				case 'deduplicate':
					return this.handleDeduplication(request)
				case 'cleanup':
					return this.handleCleanup(request)
				default:
					return new Response('Not Found', { status: 404 })
			}
		} catch (error) {
			console.error('DocumentCoordinator error:', error)
			return new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			)
		}
	}

	// Direct method for cleanup that can be called internally
	async performCleanup() {
		return this.handleCleanup(new Request('http://localhost/cleanup', { method: 'POST' }))
	}

	// Document Locking
	private async handleAcquireLock(request: Request): Promise<Response> {
		const { documentId, lockType, ttlSeconds = 300, workerId } = await request.json()

		const lockKey = `lock:${documentId}`
		const existingLock = await this.state.storage.get<DocumentLock>(lockKey)

		// Check if lock is already held and not expired
		if (existingLock && existingLock.expiresAt > Date.now()) {
			if (existingLock.workerId === workerId) {
				// Extend existing lock
				const updatedLock: DocumentLock = {
					...existingLock,
					expiresAt: Date.now() + ttlSeconds * 1000,
				}
				await this.state.storage.put(lockKey, updatedLock)

				return new Response(
					JSON.stringify({
						success: true,
						lock: updatedLock,
						action: 'extended',
					})
				)
			} else {
				return new Response(
					JSON.stringify({
						success: false,
						error: 'Document is locked by another worker',
						existingLock: {
							workerId: existingLock.workerId,
							lockType: existingLock.lockType,
							expiresAt: existingLock.expiresAt,
						},
					}),
					{ status: 409 }
				)
			}
		}

		// Acquire new lock
		const newLock: DocumentLock = {
			documentId,
			lockId: crypto.randomUUID(),
			lockType,
			acquiredAt: Date.now(),
			expiresAt: Date.now() + ttlSeconds * 1000,
			workerId,
		}

		await this.state.storage.put(lockKey, newLock)

		// Log lock acquisition
		console.log(
			JSON.stringify({
				type: 'lock_acquired',
				documentId,
				lockId: newLock.lockId,
				workerId,
				lockType,
				ttlSeconds,
			})
		)

		return new Response(
			JSON.stringify({
				success: true,
				lock: newLock,
				action: 'acquired',
			})
		)
	}

	private async handleReleaseLock(request: Request): Promise<Response> {
		const { documentId, lockId, workerId } = await request.json()

		const lockKey = `lock:${documentId}`
		const existingLock = await this.state.storage.get<DocumentLock>(lockKey)

		if (!existingLock) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Lock not found',
				}),
				{ status: 404 }
			)
		}

		if (existingLock.lockId !== lockId || existingLock.workerId !== workerId) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Lock ID or worker ID mismatch',
				}),
				{ status: 403 }
			)
		}

		await this.state.storage.delete(lockKey)

		// Log lock release
		console.log(
			JSON.stringify({
				type: 'lock_released',
				documentId,
				lockId,
				workerId,
				heldFor: Date.now() - existingLock.acquiredAt,
			})
		)

		return new Response(JSON.stringify({ success: true }))
	}

	private async handleCheckLock(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const documentId = url.searchParams.get('documentId')

		if (!documentId) {
			return new Response(
				JSON.stringify({
					error: 'Missing documentId parameter',
				}),
				{ status: 400 }
			)
		}

		const lockKey = `lock:${documentId}`
		const existingLock = await this.state.storage.get<DocumentLock>(lockKey)

		if (!existingLock || existingLock.expiresAt <= Date.now()) {
			return new Response(
				JSON.stringify({
					locked: false,
				})
			)
		}

		return new Response(
			JSON.stringify({
				locked: true,
				lock: existingLock,
			})
		)
	}

	// Processing State Management
	private async handleUpdateState(request: Request): Promise<Response> {
		const stateUpdate: ProcessingState = await request.json()

		const stateKey = `state:${stateUpdate.documentId}`
		const existingState = await this.state.storage.get<ProcessingState>(stateKey)

		const updatedState: ProcessingState = {
			...existingState,
			...stateUpdate,
			lastUpdatedAt: Date.now(),
		}

		await this.state.storage.put(stateKey, updatedState)

		// Emit state change event for subscribers
		this.emitStateChange(updatedState)

		return new Response(
			JSON.stringify({
				success: true,
				state: updatedState,
			})
		)
	}

	private async handleGetState(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const documentId = url.searchParams.get('documentId')

		if (!documentId) {
			return new Response(
				JSON.stringify({
					error: 'Missing documentId parameter',
				}),
				{ status: 400 }
			)
		}

		const stateKey = `state:${documentId}`
		const state = await this.state.storage.get<ProcessingState>(stateKey)

		return new Response(JSON.stringify({ state }))
	}

	// Content Deduplication
	private async handleDeduplication(request: Request): Promise<Response> {
		const { content, contentHash, documentId } = await request.json()

		// Check for existing documents with same content hash
		const hashKey = `hash:${contentHash}`
		const existingDocId = await this.state.storage.get<string>(hashKey)

		if (existingDocId && existingDocId !== documentId) {
			const result: DeduplicationResult = {
				isDuplicate: true,
				existingDocumentId: existingDocId,
				contentHash,
				action: 'skip',
				reason: 'Identical content hash found',
			}

			return new Response(JSON.stringify(result))
		}

		// Store content hash mapping
		await this.state.storage.put(hashKey, documentId)

		// For more sophisticated deduplication, we could implement:
		// - Fuzzy similarity matching
		// - Semantic similarity using embeddings
		// - Structure-based similarity

		const result: DeduplicationResult = {
			isDuplicate: false,
			contentHash,
			action: 'create_new',
		}

		return new Response(JSON.stringify(result))
	}

	// Cleanup expired locks and old state
	private async handleCleanup(request: Request): Promise<Response> {
		const now = Date.now()
		const cleanupResults = {
			expiredLocks: 0,
			oldStates: 0,
			oldHashes: 0,
		}

		// Clean up expired locks
		const allKeys = await this.state.storage.list()
		for (const [key, value] of allKeys.entries()) {
			if (key.startsWith('lock:')) {
				const lock = value as DocumentLock
				if (lock.expiresAt <= now) {
					await this.state.storage.delete(key)
					cleanupResults.expiredLocks++
				}
			} else if (key.startsWith('state:')) {
				const state = value as ProcessingState
				// Clean up states older than 7 days
				if (state.lastUpdatedAt < now - 7 * 24 * 60 * 60 * 1000) {
					await this.state.storage.delete(key)
					cleanupResults.oldStates++
				}
			} else if (key.startsWith('hash:')) {
				// Clean up hash mappings older than 30 days
				// Note: In production, you'd want more sophisticated cleanup logic
				// This is a simplified example
				cleanupResults.oldHashes++
			}
		}

		console.log(
			JSON.stringify({
				type: 'cleanup_completed',
				results: cleanupResults,
				timestamp: now,
			})
		)

		return new Response(
			JSON.stringify({
				success: true,
				cleanupResults,
			})
		)
	}

	// WebSocket state change notifications
	private emitStateChange(state: ProcessingState) {
		// In a real implementation, you would maintain WebSocket connections
		// and notify subscribers of state changes
		console.log(
			JSON.stringify({
				type: 'state_change',
				documentId: state.documentId,
				status: state.status,
				progress: state.progress,
				timestamp: state.lastUpdatedAt,
			})
		)
	}

	// Alarm handler for periodic cleanup
	async alarm() {
		await this.handleCleanup(new Request('http://localhost/cleanup'))
	}
}
