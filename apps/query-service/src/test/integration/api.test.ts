import { beforeEach, describe, expect, it } from 'vitest'

import app from '../../test-app'

describe('Query Service API', () => {
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
		expect(data.message).toBe('Query Service is running')
		expect(data.endpoints).toContain('/query')
		expect(data.endpoints).toContain('/health')
	})

	it('should process query successfully', async () => {
		const testQuery = {
			query: 'What is this document about?',
			userContext: {
				permissions: ['public'],
				userId: 'test-user',
			},
		}

		const res = await app.request('/query', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testQuery),
		})

		expect(res.status).toBe(200)

		const data = (await res.json()) as any
		expect(data.success).toBe(true)
		expect(data.answer).toBeDefined()
		expect(data.sources).toHaveLength(1)
		expect(data.confidence).toBeGreaterThan(0)
	})

	it('should validate query schema', async () => {
		const invalidQuery = {
			query: '', // Invalid: empty string
			userContext: {
				permissions: ['public'],
				userId: 'test-user',
			},
		}

		const res = await app.request('/query', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalidQuery),
		})

		expect(res.status).toBe(400)
	})

	it('should handle query without user context', async () => {
		const testQuery = {
			query: 'What is this document about?',
		}

		const res = await app.request('/query', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testQuery),
		})

		expect(res.status).toBe(200)

		const data = (await res.json()) as any
		expect(data.success).toBe(true)
		expect(data.answer).toBeDefined()
	})
})
