# Enterprise RAG Architecture for Cloudflare Platform

A comprehensive, deployable architecture for multiple RAG pipelines using Cloudflare's ecosystem: Workers AI, Vectorize, R2, Durable Objects, Queues, and AI Gateway.

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Multiple RAG Pipelines](#2-multiple-rag-pipelines)
3. [Sync Strategies & Freshness](#3-sync-strategies--freshness)
4. [Security & Compliance](#4-security--compliance)
5. [Scaling & Cost Control](#5-scaling--cost-control)
6. [Implementation Example](#6-implementation-example)
7. [Query-Time RAG](#7-query-time-rag)
8. [Operational Checklist](#8-operational-checklist)
9. [Tradeoffs & Recommendations](#9-tradeoffs--recommendations)
10. [Ready-to-Run Deliverables](#10-ready-to-run-deliverables)

## 1. High-Level Architecture

### Core Components

**Source Connectors (Workers)**

- **Websites**: Site crawlers, sitemaps, RSS feeds
- **SharePoint/Microsoft 365**: Microsoft Graph incremental sync & webhooks
- **Confluence & Jira**: Atlassian REST APIs + webhooks
- **File Shares**: SFTP, Box, Google Drive connectors

**Processing Pipeline**

1. **Ingestion Queue** (Cloudflare Queues) - Raw document processing
2. **Preprocessor** (Worker Job) - Content cleaning, chunking, DLP filtering
3. **Embedding & Indexing** (Workers AI → Vectorize) - Vector generation and storage
4. **Storage** (R2) - Original documents and chunks
5. **Coordination** (Durable Objects) - Version tracking, locks, deduplication

**Query Runtime**

- Chat API receives user queries
- Vectorize search for relevant chunks
- R2 retrieval for full context
- Workers AI generation via AI Gateway
- Grounding and source citation

### Data Flow

```
Sources → Connectors → Queue → Preprocessor → Embedding → Vectorize/R2 → Query API
```

## 2. Multiple RAG Pipelines

### Pipeline A: Public Websites

- **Strategy**: Periodic crawling with robots.txt compliance
- **Storage**: Public Vectorize index
- **Freshness**: Daily/weekly recrawl
- **Security**: Basic access controls

### Pipeline B: Internal Documents (SharePoint/Confluence/Jira)

- **Strategy**: OAuth with incremental sync + webhooks
- **Storage**: Private Vectorize namespace with ACL metadata
- **Freshness**: Near real-time via webhooks
- **Security**: Strict ACL enforcement, DLP redaction

### Pipeline C: High-Sensitivity (Legal/HR/Financial)

- **Strategy A**: Agent-based retrieval (no central embedding)
- **Strategy B**: Encrypted embeddings with key separation
- **Storage**: Enterprise-only namespace with audit logging
- **Security**: Maximum compliance controls

### Pipeline D: Ephemeral Content (Slack/Tickets)

- **Strategy**: Streaming ingestion with short TTL
- **Storage**: Temporary Vectorize with frequent re-embedding
- **Freshness**: Real-time updates
- **Security**: Time-based access controls

## 3. Sync Strategies & Freshness

### Recommended Approach

- **Primary**: Webhooks + incremental sync
  - Microsoft Graph webhooks for SharePoint
  - Atlassian webhooks for Confluence/Jira
- **Fallback**: Periodic full sync
- **Versioning**: Content-hash and last-modified tracking
- **Deduplication**: Durable Object coordination

### TTL Strategies

- **Stable Documents**: Weekly re-embedding
- **Ephemeral Content**: Short TTL with frequent updates
- **Sensitive Data**: On-demand re-embedding

## 4. Security & Compliance

### Access Control

- **ACL Enforcement**: Store ACL metadata with vectors
- **Query-Time Filtering**: Verify user identity and restrict results
- **Source ACL Respect**: Maintain original document permissions

### Data Protection

- **DLP & Redaction**: PII detection and redaction during preprocessing
- **Encryption**: Key separation for sensitive embeddings
- **Audit Logging**: Complete model call and retrieval logging

### Compliance Considerations

- **Centralized Storage**: Only when authorized
- **Agent-Based Retrieval**: For restricted data sources
- **Audit Trails**: Complete access and modification logging

## 5. Scaling & Cost Control

### AI Gateway Benefits

- **Model Routing**: Cheaper embeddings, higher-quality generation
- **Rate Limiting**: Prevent API abuse
- **Caching**: Reduce redundant calls
- **Fallback**: Automatic model switching

### Storage Optimization

- **Vectorize**: Embeddings + small metadata
- **R2**: Bulk content with zero egress fees
- **Regional Routing**: Minimize latency with global distribution

## 6. Implementation Example

### TypeScript Cloudflare Worker with Hono

```typescript
// worker-ingest.ts - Cloudflare Worker for document ingestion using Hono
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { z } from 'zod'

// Environment interface
interface Env {
  VECTORIZE_API_KEY: string
  AI_API_KEY: string
  DOCS_BUCKET: R2Bucket
  VECTORIZE_INDEX_ID: string
  AI_ACCOUNT_ID: string
}

// Configuration
const VECTORIZE_API = 'https://api.vectorize.cloudflare.com/v1/indexes'
const WORKERS_AI_API = 'https://api.cloudflare.com/client/v4/accounts'

interface Document {
  id: string
  text: string
  source: string
  url?: string
  metadata?: Record<string, any>
}

interface ChunkMetadata {
  source: string
  url?: string
  chunk_index: number
  doc_id: string
  timestamp: number
  acl?: string[]
}

// Create Hono app with environment typing
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors())
app.use('*', prettyJSON())

/**
 * Generate embeddings using Workers AI
 */
async function getEmbedding(text: string, env: Env): Promise<number[]> {
  const response = await fetch(`${WORKERS_AI_API}/${env.AI_ACCOUNT_ID}/workers-ai/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Embedding failed: ${await response.text()}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

/**
 * Upsert vector to Vectorize
 */
async function upsertVector(id: string, embedding: number[], metadata: ChunkMetadata, env: Env) {
  const body = {
    vectors: [
      {
        id,
        values: embedding,
        metadata,
      },
    ],
  }

  const response = await fetch(`${VECTORIZE_API}/${env.VECTORIZE_INDEX_ID}/points`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VECTORIZE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Vector upsert failed: ${await response.text()}`)
  }

  return response.json()
}

/**
 * Store chunk content in R2
 */
async function storeChunkInR2(key: string, content: string, metadata: ChunkMetadata, env: Env) {
  await env.DOCS_BUCKET.put(key, content, {
    httpMetadata: {
      contentType: 'text/plain',
    },
    customMetadata: metadata,
  })
}

/**
 * Token-aware chunking (simplified example)
 */
function chunkText(text: string, maxTokens: number = 500): string[] {
  // In production, use proper tokenization
  const words = text.split(/\s+/)
  const chunks: string[] = []

  for (let i = 0; i < words.length; i += maxTokens) {
    const chunk = words.slice(i, i + maxTokens).join(' ')
    chunks.push(chunk)
  }

  return chunks
}

/**
 * Process document through the RAG pipeline
 */
async function processDocument(doc: Document, env: Env) {
  try {
    // Content cleaning and preprocessing
    const cleanedText = doc.text.replace(/\s+/g, ' ').trim()

    // Chunk the document
    const chunks = chunkText(cleanedText)

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      // DLP/PII checks would go here
      // const redactedChunk = await performDLPChecks(chunk);

      // Generate embedding
      const embedding = await getEmbedding(chunk, env)

      // Create chunk metadata
      const chunkId = `${doc.id}#${i}`
      const metadata: ChunkMetadata = {
        source: doc.source,
        url: doc.url,
        chunk_index: i,
        doc_id: doc.id,
        timestamp: Date.now(),
        acl: doc.metadata?.acl || [],
      }

      // Store chunk in R2
      await storeChunkInR2(`chunks/${chunkId}.txt`, chunk, metadata, env)

      // Upsert to Vectorize
      await upsertVector(chunkId, embedding, metadata, env)
    }

    console.log(`Processed document ${doc.id} with ${chunks.length} chunks`)
  } catch (error) {
    console.error(`Failed to process document ${doc.id}:`, error)
    throw error
  }
}

// Validation schemas
const DocumentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.string().min(1),
  url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
})

const ProcessDocumentSchema = z.object({
  documents: z.array(DocumentSchema),
})

// Routes
app.get('/', (c) => {
  return c.json({
    message: 'Ingest Service is running',
    version: '1.0.0',
    endpoints: ['/process', '/health', '/status'],
  })
})

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

app.post('/process', zValidator('json', ProcessDocumentSchema), async (c) => {
  try {
    const { documents } = c.req.valid('json')
    const results = []

    for (const doc of documents) {
      await processDocument(doc, c.env)
      results.push({
        id: doc.id,
        status: 'processed',
        timestamp: new Date().toISOString(),
      })
    }

    return c.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error('Processing error:', error)
    return c.json(
      {
        success: false,
        error: 'Failed to process documents',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

app.get('/status/:docId', async (c) => {
  const docId = c.req.param('docId')

  try {
    // Check if document exists in R2
    const object = await c.env.DOCS_BUCKET.head(`chunks/${docId}#0.txt`)

    if (!object) {
      return c.json(
        {
          exists: false,
          message: 'Document not found',
        },
        404
      )
    }

    return c.json({
      exists: true,
      lastModified: object.uploaded,
      size: object.size,
      metadata: object.customMetadata,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to check document status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

// Error handling middleware
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json(
    {
      error: 'Internal server error',
      message: err.message,
    },
    500
  )
})

// Export the Hono app as the default export
export default app
```

### Wrangler Configuration

```jsonc
{
  "name": "ingest-service",
  "main": "src/worker-ingest.ts",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
  },
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
  "vars": {
    "VECTORIZE_INDEX_ID": "your-vectorize-index-id",
    "AI_ACCOUNT_ID": "your-ai-account-id",
  },
}
```

### Key Implementation Notes

- **R2 Storage**: Use R2 for storing original documents and chunks with zero egress fees
- **Vectorize**: Store embeddings and metadata for semantic search
- **Environment Variables**: Configure API keys and account IDs in wrangler.jsonc
- **Token-Aware Chunking**: Implement proper tokenization for production use
- **Error Handling**: Hono provides built-in error handling with `app.onError()`
- **Validation**: Use Zod schemas for request validation with `zValidator`
- **Rate Limiting**: Implement concurrency control to avoid API rate limits
- **AI Gateway**: Route all AI calls through AI Gateway for policy enforcement
- **Middleware**: Leverage Hono's middleware for CORS, logging, and JSON formatting

## 7. Query-Time RAG

### Query Processing Flow

```typescript
// Query worker with Hono and R2 integration
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'

interface Env {
  DOCS_BUCKET: R2Bucket
  VECTORIZE_INDEX: VectorizeIndex
  AI: Ai
  VECTORIZE_API_KEY: string
  AI_ACCOUNT_ID: string
}

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors())

const QuerySchema = z.object({
  query: z.string().min(1),
  userContext: z
    .object({
      permissions: z.array(z.string()),
      userId: z.string(),
    })
    .optional(),
})

app.post('/query', zValidator('json', QuerySchema), async (c) => {
  try {
    const { query, userContext } = c.req.valid('json')

    // 1. Generate query embedding using Workers AI
    const queryEmbedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    })

    // 2. Search Vectorize with ACL filtering
    const results = await c.env.VECTORIZE_INDEX.query(queryEmbedding.data[0], {
      topK: 10,
      filter: userContext?.permissions ? { acl: { $in: userContext.permissions } } : undefined,
    })

    // 3. Retrieve full chunks from R2
    const chunks = await Promise.all(
      results.matches.map(async (result) => {
        const chunkObject = await c.env.DOCS_BUCKET.get(`chunks/${result.id}.txt`)
        return {
          id: result.id,
          content: (await chunkObject?.text()) || '',
          metadata: result.metadata,
          score: result.score,
        }
      })
    )

    // 4. Compose context with source citations
    const context = chunks.map((chunk, i) => `[${i + 1}] ${chunk.content}`).join('\n\n')

    // 5. Generate response via Workers AI
    const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instant', {
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant. Use only the provided context to answer questions. If the answer is not in the context, say "I don\'t know." Always cite your sources.',
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${query}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })

    // 6. Return with source citations
    return c.json({
      answer: response.response,
      sources: chunks.map((chunk) => ({
        id: chunk.id,
        url: chunk.metadata.url,
        score: chunk.score,
        content: chunk.content.substring(0, 200) + '...', // Preview
      })),
    })
  } catch (error) {
    console.error('Query error:', error)
    return c.json(
      {
        error: 'Failed to process query',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

export default app
```

## 8. Operational Checklist

### Infrastructure Setup

- [ ] Create Vectorize indexes per sensitivity tier
- [ ] Set up R2 buckets for content storage
- [ ] Configure AI Gateway for model routing
- [ ] Deploy Durable Objects for coordination

### Connector Implementation

- [ ] Website crawler with robots.txt compliance
- [ ] SharePoint connector (MS Graph + OAuth)
- [ ] Confluence connector (Atlassian REST API)
- [ ] Jira connector with webhook support

### Security & Compliance

- [ ] Implement DLP and PII detection
- [ ] Set up ACL enforcement at query time
- [ ] Configure audit logging
- [ ] Test access control scenarios

### Monitoring & Observability

- [ ] Embedding throughput metrics
- [ ] Indexing lag monitoring
- [ ] Model cost per query tracking
- [ ] Error rate and retry monitoring

## 9. Tradeoffs & Recommendations

### Centralized Vector DB (Vectorize)

**Pros:**

- High throughput semantic search
- Low latency queries
- Global distribution
- Cost-effective for most use cases

**Cons:**

- Centralized data storage
- Potential compliance concerns
- Single point of failure

**Recommendation:** Use for most RAG workflows with strict metadata ACLs

### Agent-Based Live Retrieval

**Pros:**

- No data centralization
- Better auditability
- Real-time data access
- Compliance-friendly

**Cons:**

- Higher latency
- More complex implementation
- API rate limiting concerns

**Recommendation:** Use for extremely sensitive data sources

### Hybrid Approach

**Best Practice:** Combine both approaches

- Use Vectorize for search and discovery
- Use live retrieval for sensitive content
- Implement smart routing based on query context

## 10. Ready-to-Run Deliverables

Choose any of the following for immediate implementation:

### 1. SharePoint Connector

- Full OAuth implementation
- Incremental sync with webhooks
- TypeScript code ready to deploy
- Error handling and retry logic

### 2. Production Ingestion Worker

- Token-aware chunking
- Embedding generation
- Vectorize upsert with R2 storage
- DLP and redaction capabilities

### 3. Query Worker (Chat API)

- Vectorize search with ACL filtering
- AI Gateway integration
- Source citation generation
- Response grounding and validation

### 4. Durable Object Coordination

- Document locking and deduplication
- WebSocket subscriptions for live updates
- Version tracking and conflict resolution
- Background job coordination

### 5. End-to-End Deployment

- Complete CI/CD pipeline
- Terraform/Wrangler configuration
- Environment-specific deployments
- Monitoring and alerting setup

## References

- [Cloudflare Workers AI](https://www.cloudflare.com/developer-platform/products/workers-ai/)
- [Cloudflare Vectorize](https://www.cloudflare.com/developer-platform/products/vectorize/)
- [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Atlassian Confluence API](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/)

---

_This architecture provides a comprehensive, enterprise-grade RAG solution using Cloudflare's platform. Choose the deliverables that best fit your immediate needs, and we can implement them right away._
