# Query Service

A Cloudflare Worker built with Hono for querying documents in a RAG (Retrieval-Augmented Generation) pipeline.

## Features

- **Semantic Search**: Uses vector similarity search to find relevant documents
- **ACL Filtering**: Respects access control lists for secure document retrieval
- **AI Generation**: Generates responses using Cloudflare Workers AI
- **Source Citations**: Provides source attribution for generated responses
- **Type Safety**: Full TypeScript support with Hono framework
- **Validation**: Request validation using Zod schemas

## Architecture

This worker is part of a larger RAG system that includes:

1. **Query Processing**: Receives user queries and generates embeddings
2. **Vector Search**: Searches for relevant document chunks using Vectorize
3. **Content Retrieval**: Retrieves full content from R2 storage
4. **Response Generation**: Uses AI to generate contextual responses
5. **Source Attribution**: Provides citations and source information

## API Endpoints

### `GET /`

Returns worker information and available endpoints.

### `GET /health`

Health check endpoint.

### `POST /query`

Processes queries and returns AI-generated responses with source citations.

**Request Body:**

```json
{
  "query": "What is the main topic of this document?",
  "userContext": {
    "permissions": ["public", "internal"],
    "userId": "user-123"
  }
}
```

**Response:**

```json
{
  "answer": "The main topic of this document is...",
  "sources": [
    {
      "id": "doc-1#0",
      "url": "https://example.com",
      "score": 0.95,
      "content": "Document content preview..."
    }
  ]
}
```

## Security

- **ACL Enforcement**: Only returns documents the user has permission to access
- **User Context**: Validates user permissions before processing queries
- **Source Filtering**: Filters results based on user's access level

## Environment Variables

No additional environment variables required - uses bindings only.

## Bindings

- `DOCS_BUCKET`: R2 bucket containing document chunks
- `VECTORIZE_INDEX`: Vectorize index with document embeddings
- `AI`: Workers AI binding for query processing

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Deploy
pnpm deploy
```

## Testing

The worker includes comprehensive tests using Vitest:

```bash
# Run all tests
pnpm test

# Run tests in CI mode
pnpm test:ci
```

## Configuration

Configure the worker using `wrangler.jsonc`:

```jsonc
{
  "name": "query-service",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "r2_buckets": [
    {
      "binding": "DOCS_BUCKET",
      "bucket_name": "rag-documents",
    },
  ],
  "ai": {
    "binding": "AI",
  },
  "vectorize": [
    {
      "binding": "VECTORIZE_INDEX",
      "index_name": "rag-embeddings",
    },
  ],
}
```

## Usage Example

```typescript
// Query the RAG system
const response = await fetch('https://your-worker.your-subdomain.workers.dev/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'What are the key features of this product?',
    userContext: {
      permissions: ['public'],
      userId: 'user-123',
    },
  }),
})

const result = await response.json()
console.log(result.answer) // AI-generated response
console.log(result.sources) // Source citations
```
