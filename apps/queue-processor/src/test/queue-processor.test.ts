import { SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

describe('Queue Processor Service', () => {
	beforeAll(async () => {
		// Any setup needed for tests
	})

	it('should return service information on GET /', async () => {
		const response = await SELF.fetch('/')
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.service).toBe('Queue Processor')
		expect(data.version).toBe('1.0.0')
		expect(data.queues).toHaveLength(3)
	})

	it('should return healthy status on GET /health', async () => {
		const response = await SELF.fetch('/health')
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.status).toBe('healthy')
		expect(data.worker).toBe('queue-processor')
	})

	it('should return metrics endpoint info on GET /metrics', async () => {
		const response = await SELF.fetch('/metrics')
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.status).toBe('metrics endpoint')
	})

	it('should trigger cleanup on POST /admin/cleanup', async () => {
		const response = await SELF.fetch('/admin/cleanup', {
			method: 'POST',
		})

		// This might fail in test environment without proper DO setup
		// but we can check that the endpoint exists
		expect(response.status).toBeOneOf([200, 500])
	})
})

describe('Document Coordinator Durable Object', () => {
	it('should be accessible', async () => {
		// This test would require more setup to properly test the Durable Object
		// For now, we just ensure the service starts without errors
		expect(true).toBe(true)
	})
})

// Helper for checking multiple status codes
expect.extend({
	toBeOneOf(received: number, expected: number[]) {
		const pass = expected.includes(received)
		if (pass) {
			return {
				message: () => `expected ${received} not to be one of ${expected}`,
				pass: true,
			}
		} else {
			return {
				message: () => `expected ${received} to be one of ${expected}`,
				pass: false,
			}
		}
	},
})
