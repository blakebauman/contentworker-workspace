# Queue Processor Service

A Cloudflare Worker for processing RAG documents through queues with Durable Objects coordination.

## Features

- **Queue-Based Processing**: Handles document ingestion, webhook events, and batch operations via Cloudflare Queues
- **Durable Objects Coordination**: Provides document locking, deduplication, and state management
- **Concurrent Processing**: Optimized for high-throughput document processing
- **Error Handling**: Comprehensive retry logic and dead letter queue support
- **Observability**: Detailed logging, metrics, and real-time status tracking

## Architecture

This service provides the foundation for enterprise RAG processing with:

1. **Document Ingestion Queue**: Processes documents from various sources
2. **Webhook Processing Queue**: Handles real-time updates from external systems
3. **Batch Reprocessing Queue**: Manages bulk operations and schema migrations
4. **Document Coordinator**: Durable Object for coordination and state management

## Queue Types

### Document Ingestion (`document-ingestion`)

- Processes individual documents for embedding and storage
- Handles chunking, embedding generation, and vector storage
- Includes DLP scanning and content validation
- Supports priority-based processing

### Webhook Processing (`webhook-processing`)

- Processes webhook events from SharePoint, Confluence, Jira, and websites
- Handles document creation, updates, deletions, and moves
- Fetches updated content from source systems
- Queues documents for reprocessing as needed

### Batch Reprocessing (`batch-reprocessing`)

- Handles bulk operations like schema changes and model updates
- Processes multiple documents with optimized batching
- Supports various reprocessing reasons and strategies
- Includes progress tracking and error aggregation

## Durable Objects

### DocumentCoordinator

- **Document Locking**: Prevents concurrent processing of the same document
- **Processing State**: Tracks real-time processing progress and status
- **Deduplication**: Identifies and handles duplicate content
- **Cleanup**: Automatic cleanup of expired locks and old state

## API Endpoints

### Worker Endpoints

#### `GET /`

Returns service information and available endpoints.

#### `GET /health`

Health check endpoint for monitoring.

#### `GET /metrics`

Processing metrics and statistics (planned).

#### `POST /admin/cleanup`

Triggers cleanup of expired locks and old state.

### Coordinator Endpoints

The DocumentCoordinator Durable Object provides several endpoints:

- `POST /acquire-lock` - Acquire processing lock for a document
- `POST /release-lock` - Release processing lock
- `GET /check-lock` - Check lock status
- `POST /update-state` - Update processing state
- `GET /get-state` - Get current processing state
- `POST /deduplicate` - Check for content duplication
- `POST /cleanup` - Cleanup expired data

## Queue Message Types

### Document Ingestion

```json
{
  "type": "document_ingestion",
  "payload": {
    "document": {
      "id": "doc-123",
      "text": "Document content...",
      "source": "sharepoint",
      "url": "https://example.com",
      "metadata": { "acl": ["internal"] }
    },
    "options": {
      "chunkSize": 1000,
      "overlap": 200,
      "dlpEnabled": true
    }
  },
  "metadata": {
    "priority": "medium",
    "retryCount": 0,
    "maxRetries": 3,
    "correlationId": "req-abc123",
    "source": "api"
  }
}
```

### Webhook Sync

```json
{
  "type": "webhook_sync",
  "payload": {
    "sourceType": "sharepoint",
    "eventType": "updated",
    "resourceId": "site-123/doc-456",
    "resourceUrl": "https://tenant.sharepoint.com/...",
    "metadata": { "permissions": ["user:123"] }
  },
  "metadata": {
    "priority": "high",
    "correlationId": "webhook-xyz789"
  }
}
```

### Batch Reprocess

```json
{
  "type": "batch_reprocess",
  "payload": {
    "documentIds": ["doc-1", "doc-2", "doc-3"],
    "reason": "model_update",
    "options": { "forceFullReprocess": true }
  },
  "metadata": {
    "priority": "low",
    "correlationId": "batch-def456"
  }
}
```

## Configuration

### Environment Variables

- `VECTORIZE_INDEX_ID`: Vectorize index ID for storing embeddings
- `AI_ACCOUNT_ID`: Cloudflare AI account ID

### Bindings

- `DOCUMENT_COORDINATOR`: Durable Object namespace for coordination
- `DOCS_BUCKET`: R2 bucket for storing document chunks
- `VECTORIZE_INDEX`: Vectorize index for embeddings
- `AI`: Workers AI binding

### Queue Configuration

The service consumes from three queues with different batch sizes and retry policies:

- `document-ingestion`: Batch size 10, max retries 3
- `webhook-processing`: Batch size 5, max retries 5
- `batch-reprocessing`: Batch size 20, max retries 2

## Integration

### With Ingest Service

The existing ingest service can be updated to send messages to the document ingestion queue instead of processing directly.

### With External Systems

Webhook endpoints can send messages to the webhook processing queue for real-time updates.

### With Admin Tools

Administrative tools can send batch reprocessing messages for maintenance operations.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Deploy
pnpm deploy

# Generate types
pnpm types
```

## Monitoring

The service provides comprehensive logging and metrics:

- **Event Logging**: Structured JSON logs for all operations
- **Metrics**: Processing times, success rates, and error counts
- **State Tracking**: Real-time processing state via Durable Objects
- **Error Tracking**: Detailed error information with retry strategies

## Security

- **Access Control**: Respects document ACLs throughout processing
- **DLP Integration**: Optional PII scanning and redaction
- **Audit Logging**: Complete processing trail for compliance
- **Lock Management**: Prevents concurrent access to sensitive operations

## Scaling

The service is designed for high-scale processing:

- **Concurrent Processing**: Configurable concurrency per queue type
- **Batch Optimization**: Efficient batching strategies for different workloads
- **Resource Management**: Memory and CPU optimization for large documents
- **Rate Limiting**: Respectful API usage with external systems
