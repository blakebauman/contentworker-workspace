# Ingest Service

A Cloudflare Worker built with Hono for processing documents into a RAG (Retrieval-Augmented Generation) pipeline.

## Features

- **Document Processing**: Ingests documents and chunks them for vector storage
- **Embedding Generation**: Uses Cloudflare Workers AI to generate embeddings
- **Vector Storage**: Stores embeddings in Cloudflare Vectorize
- **Content Storage**: Stores original chunks in Cloudflare R2
- **Type Safety**: Full TypeScript support with Hono framework
- **Validation**: Request validation using Zod schemas

## Architecture

This worker is part of a larger RAG system that includes:

1. **Document Ingestion**: Processes documents from various sources
2. **Chunking**: Splits documents into manageable chunks
3. **Embedding**: Generates vector embeddings using Workers AI
4. **Storage**: Stores both vectors and content in Cloudflare services

## API Endpoints

### `GET /`

Returns worker information and available endpoints.

### `GET /health`

Health check endpoint.

### `POST /process`

Processes documents for RAG ingestion.

**Request Body:**

```json
{
  "documents": [
    {
      "id": "doc-1",
      "text": "Document content...",
      "source": "website",
      "url": "https://example.com",
      "metadata": {
        "acl": ["public"]
      }
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "processed": 1,
  "results": [
    {
      "id": "doc-1",
      "status": "processed",
      "timestamp": "2025-01-27T10:00:00.000Z"
    }
  ]
}
```

### `GET /status/:docId`

Checks the processing status of a document.

## Environment Variables

- `VECTORIZE_INDEX_ID`: Vectorize index ID for storing embeddings
- `AI_ACCOUNT_ID`: Cloudflare AI account ID

## Bindings

- `DOCS_BUCKET`: R2 bucket for storing document chunks
- `VECTORIZE_INDEX`: Vectorize index for embeddings
- `AI`: Workers AI binding

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
  "name": "ingest-service",
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
