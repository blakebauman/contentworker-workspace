import { defineConfig, getConfig } from './default.config'

export { defineConfig, getConfig } from './default.config'
export { getDirname, getGitIgnoreFiles, getTsconfigRootDir } from './helpers'

// Convenience function for creating configs
export function createConfig(_options: { packageName: string; packageType?: string }) {
	return getConfig(import.meta.url)
}
