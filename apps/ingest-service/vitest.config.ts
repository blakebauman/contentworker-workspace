import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/workflow-processor.ts', // Exclude workflow processor as it uses Cloudflare Workers imports
		],
	},
})
