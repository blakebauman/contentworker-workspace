import { beforeEach, describe, expect, it } from 'vitest'

import app from '../../test-app'

describe('Ingest Service API', () => {
	beforeEach(() => {
		// Reset any mocks or state
	})

	it('should return health status', async () => {
		const res = await app.request('/health')
		expect(res.status).toBe(200)

		const data = (await res.json()) as any
		expect(data.status).toBe('healthy')
		expect(data.timestamp).toBeDefined()
	})

	it('should return worker info on root', async () => {
		const res = await app.request('/')
		expect(res.status).toBe(200)

		const data = (await res.json()) as any
		expect(data.message).toBe('Ingest Service is running')
		expect(data.endpoints).toContain('/process')
		expect(data.endpoints).toContain('/health')
	})

	it('should process documents successfully', async () => {
		const testDocument = {
			id: 'test-doc-1',
			text: 'This is a test document for RAG processing.',
			source: 'test',
			url: 'https://example.com/test',
			metadata: { acl: ['public'] },
		}

		const res = await app.request('/process', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ documents: [testDocument] }),
		})

		expect(res.status).toBe(200)

		const data = (await res.json()) as any
		expect(data.success).toBe(true)
		expect(data.totalChunks).toBe(1)
		expect(data.results).toHaveLength(1)
		expect(data.results[0].documentId).toBe('test-doc-1')
		expect(data.results[0].status).toBe('success')
	})

	it('should validate document schema', async () => {
		const invalidDocument = {
			// Missing required fields: id, text, source
			url: 'https://example.com/test',
		}

		const res = await app.request('/process', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ documents: [invalidDocument] }),
		})

		expect(res.status).toBe(400)
	})

	it('should check document status', async () => {
		const res = await app.request('/status/non-existent-doc')
		expect(res.status).toBe(404)

		const data = (await res.json()) as any
		expect(data.error).toBe('Not found')
		expect(data.message).toBe('Document not found')
	})
})
