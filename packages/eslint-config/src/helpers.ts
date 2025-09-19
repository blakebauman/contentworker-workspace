import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { includeIgnoreFile } from '@eslint/compat'

import type { Linter } from 'eslint'

export function getDirname(importMetaUrl: string): string {
	const __filename = fileURLToPath(importMetaUrl)
	return path.dirname(__filename)
}

function findWorkspaceRoot(startDir: string): string {
	let currentDir = startDir
	while (currentDir !== path.dirname(currentDir)) {
		const packageJsonPath = path.join(currentDir, 'pnpm-workspace.yaml')
		if (existsSync(packageJsonPath)) {
			return currentDir
		}
		currentDir = path.dirname(currentDir)
	}
	// Fallback to the directory itself if no workspace root is found
	return startDir
}

export function getGitIgnoreFiles(importMetaUrl: string): Linter.Config[] {
	const packageDir = getDirname(importMetaUrl)
	const workspaceRoot = findWorkspaceRoot(packageDir)
	const rootGitignorePath = path.join(workspaceRoot, '.gitignore')

	const ignoreFiles: Linter.Config[] = []

	// Include the root gitignore file if it exists
	if (existsSync(rootGitignorePath)) {
		ignoreFiles.push(includeIgnoreFile(rootGitignorePath))
	}

	// Include package-specific gitignore if it exists
	const packageGitignorePath = path.join(packageDir, '.gitignore')
	if (existsSync(packageGitignorePath)) {
		ignoreFiles.push(includeIgnoreFile(packageGitignorePath))
	}

	return ignoreFiles
}

export function getTsconfigRootDir(importMetaUrl: string): string | undefined {
	const tsconfigRootDir = getDirname(importMetaUrl)

	// First check if there's a tsconfig.json in the current directory
	if (existsSync(path.join(tsconfigRootDir, 'tsconfig.json'))) {
		return tsconfigRootDir
	}

	// If not, look for the workspace root tsconfig.json
	const workspaceRoot = path.resolve(tsconfigRootDir, '../../../')
	const workspaceTsconfig = path.join(workspaceRoot, 'tsconfig.json')
	if (existsSync(workspaceTsconfig)) {
		return workspaceRoot
	}

	// Fallback to the current directory
	return tsconfigRootDir
}
