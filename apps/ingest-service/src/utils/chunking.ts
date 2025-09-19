export interface ChunkingOptions {
	chunkSize?: number
	overlap?: number
}

/**
 * Token-aware chunking with overlap support
 * In production, use proper tokenization libraries like tiktoken
 */
export function chunkText(text: string, options?: ChunkingOptions | number): string[] {
	// Handle backward compatibility - if number is passed, treat as maxTokens
	let chunkSize: number
	let overlap: number

	if (typeof options === 'number') {
		chunkSize = options
		overlap = 0
	} else {
		chunkSize = options?.chunkSize || 500
		overlap = options?.overlap || 0
	}

	// In production, use proper tokenization
	const words = text.split(/\s+/)
	const chunks: string[] = []

	if (words.length === 0) {
		return chunks
	}

	// Ensure overlap is not larger than chunk size
	const actualOverlap = Math.min(overlap, Math.floor(chunkSize / 2))

	for (let i = 0; i < words.length; i += chunkSize - actualOverlap) {
		const end = Math.min(i + chunkSize, words.length)
		const chunk = words.slice(i, end).join(' ')

		if (chunk.trim().length > 0) {
			chunks.push(chunk.trim())
		}

		// If we've reached the end, break
		if (end >= words.length) {
			break
		}
	}

	return chunks
}

/**
 * Clean and preprocess text content
 */
export function cleanText(text: string): string {
	return text.replace(/\s+/g, ' ').trim()
}
