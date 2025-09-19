import baseConfig from '@repo/eslint-config/default.config'

export default [
	...baseConfig,
	{
		ignores: ['dist/**/*', 'node_modules/**/*'],
	},
]
