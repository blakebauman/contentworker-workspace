# Queue Processing & Durable Objects Coordination Implementation

## 🎯 Implementation Summary

This implementation completes the **Immediate Priority** phase of the Enterprise RAG architecture by adding:

1. **Queue-Based Processing Service** - Cloudflare Queues integration for async document processing
2. **Durable Objects Coordination** - Document locking, deduplication, and state management

## 📁 New Services Created

### 1. Queue Processor Service (`apps/queue-processor/`)

A new Cloudflare Worker that handles asynchronous document processing through queues.

**Key Files:**

- `src/index.ts` - Main worker with HTTP endpoints and queue handlers
- `src/coordination.ts` - DocumentCoordinator Durable Object implementation
- `src/processors/` - Specialized processors for different queue types
- `src/types.ts` - Type definitions for queue messages and coordination
- `src/context.ts` - Environment and context management

**Features Implemented:**

- ✅ Document ingestion queue processing with concurrent handling
- ✅ Webhook event processing for real-time updates
- ✅ Batch reprocessing for maintenance operations
- ✅ Document locking and coordination via Durable Objects
- ✅ Content deduplication using hash-based detection
- ✅ Processing state tracking with real-time updates
- ✅ Comprehensive error handling and retry logic
- ✅ Structured logging and metrics collection

### 2. Enhanced Ingest Service

**Updated Files:**

- `src/context.ts` - Added queue bindings and coordination service
- `src/utils/queue.ts` - New queue management utilities
- `src/schemas.ts` - Added schemas for queue-based endpoints
- `src/routes.ts` - Added route configurations for queue endpoints
- `src/index.ts` - Added new queue-based API endpoints
- `wrangler.jsonc` - Added queue producers and DO bindings

**New API Endpoints:**

- `POST /queue/process` - Queue documents for async processing
- `POST /webhook` - Handle webhook events from external systems
- `POST /queue/batch-reprocess` - Queue batch reprocessing operations
- `GET /queue/status/:docId` - Get processing status for documents

### 3. Enhanced Query Service

**Updated Files:**

- `src/context.ts` - Added coordination service binding
- `wrangler.jsonc` - Added Durable Object binding

## 🏗️ Architecture Components

### Queue Types Implemented

#### 1. Document Ingestion Queue (`document-ingestion`)

- **Purpose**: Process individual documents for embedding and storage
- **Batch Size**: 10 messages
- **Max Retries**: 3
- **Features**: Chunking, embedding generation, DLP scanning, vector storage

#### 2. Webhook Processing Queue (`webhook-processing`)

- **Purpose**: Handle real-time updates from external systems
- **Batch Size**: 5 messages
- **Max Retries**: 5
- **Supported Sources**: SharePoint, Confluence, Jira, Websites

#### 3. Batch Reprocessing Queue (`batch-reprocessing`)

- **Purpose**: Handle bulk operations and maintenance tasks
- **Batch Size**: 20 messages
- **Max Retries**: 2
- **Operations**: Schema changes, model updates, policy changes, manual reindexing

### Durable Objects Coordination

#### DocumentCoordinator Features

- **Document Locking**: Prevents concurrent processing with TTL-based locks
- **Processing State**: Real-time tracking of document processing progress
- **Deduplication**: Content-hash based duplicate detection
- **Cleanup**: Automatic cleanup of expired locks and old state
- **WebSocket Support**: Real-time status updates (framework ready)

#### Coordination Endpoints

- `POST /acquire-lock` - Acquire processing lock for a document
- `POST /release-lock` - Release processing lock
- `GET /check-lock` - Check lock status
- `POST /update-state` - Update processing state
- `GET /get-state` - Get current processing state
- `POST /deduplicate` - Check for content duplication
- `POST /cleanup` - Cleanup expired data

## 🔧 Configuration

### Queue Configuration

```jsonc
// Ingest Service (Producer)
"queues": {
  "producers": [
    { "binding": "DOCUMENT_INGESTION_QUEUE", "queue": "document-ingestion" },
    { "binding": "WEBHOOK_PROCESSING_QUEUE", "queue": "webhook-processing" },
    { "binding": "BATCH_REPROCESSING_QUEUE", "queue": "batch-reprocessing" }
  ]
}

// Queue Processor (Consumer)
"queues": {
  "consumers": [
    { "queue": "document-ingestion", "max_batch_size": 10, "max_retries": 3 },
    { "queue": "webhook-processing", "max_batch_size": 5, "max_retries": 5 },
    { "queue": "batch-reprocessing", "max_batch_size": 20, "max_retries": 2 }
  ]
}
```

### Durable Objects Configuration

```jsonc
"durable_objects": {
  "bindings": [
    {
      "binding": "DOCUMENT_COORDINATOR",
      "class_name": "DocumentCoordinator",
      "script_name": "queue-processor"
    }
  ]
}
```

## 📝 Usage Examples

### Queue Document for Processing

```bash
POST /queue/process
Content-Type: application/json

{
  "documents": [
    {
      "id": "doc-123",
      "text": "Document content...",
      "source": "sharepoint",
      "url": "https://example.com",
      "metadata": { "acl": ["internal"] }
    }
  ],
  "options": {
    "priority": "medium",
    "chunkSize": 1000,
    "overlap": 200,
    "dlpEnabled": true
  }
}
```

### Handle Webhook Event

```bash
POST /webhook
Content-Type: application/json

{
  "sourceType": "sharepoint",
  "eventType": "updated",
  "resourceId": "site-123/doc-456",
  "resourceUrl": "https://tenant.sharepoint.com/...",
  "metadata": { "permissions": ["user:123"] },
  "options": { "priority": "high" }
}
```

### Queue Batch Reprocessing

```bash
POST /queue/batch-reprocess
Content-Type: application/json

{
  "documentIds": ["doc-1", "doc-2", "doc-3"],
  "reason": "model_update",
  "options": {
    "forceFullReprocess": true,
    "priority": "low"
  }
}
```

### Check Processing Status

```bash
GET /queue/status/doc-123
```

Response:

```json
{
  "documentId": "doc-123",
  "status": "processing",
  "progress": {
    "currentStep": "embedding",
    "stepsCompleted": 2,
    "totalSteps": 4,
    "percentage": 50
  },
  "startedAt": 1640995200000,
  "lastUpdatedAt": 1640995260000
}
```

## 🔄 Processing Flow

### Async Document Processing Flow

1. **Document Submitted** → Ingest Service `/queue/process`
2. **Queued for Processing** → `document-ingestion` queue
3. **Lock Acquisition** → DocumentCoordinator prevents concurrent processing
4. **Deduplication Check** → Avoid processing duplicate content
5. **Processing Steps**:
   - Content preprocessing and cleaning
   - Text chunking with configurable size/overlap
   - Optional DLP scanning and redaction
   - Embedding generation using Workers AI
   - Storage in R2 (chunks) and Vectorize (embeddings)
6. **State Updates** → Real-time progress tracking via Durable Object
7. **Lock Release** → Free up document for other operations
8. **Completion** → Final status update and metrics logging

### Webhook Processing Flow

1. **Webhook Received** → External system calls `/webhook`
2. **Event Queued** → `webhook-processing` queue with high priority
3. **Content Fetching** → Retrieve updated content from source system
4. **Document Queuing** → Queue fetched content for processing
5. **Change Propagation** → Updates flow through normal processing pipeline

## ⚡ Performance Optimizations

### Concurrency Management

- **Document Processing**: Max 5 concurrent documents per batch
- **Webhook Processing**: Max 10 concurrent events per batch
- **Batch Operations**: Sequential processing to avoid system overload

### Error Handling

- **Exponential Backoff**: Automatic retry with increasing delays
- **Dead Letter Queues**: Failed messages preserved for manual review
- **Circuit Breakers**: Rate limiting and backpressure management
- **Graceful Degradation**: Non-retryable errors marked and skipped

### Resource Optimization

- **Memory Management**: Streaming processing for large documents
- **Lock Management**: TTL-based locks prevent deadlocks
- **Storage Efficiency**: Separate storage for content (R2) and vectors (Vectorize)
- **Cleanup Automation**: Periodic cleanup of expired state and locks

## 📊 Monitoring & Observability

### Structured Logging

All operations emit structured JSON logs with:

- Event type and correlation IDs
- Processing times and performance metrics
- Error details with retry strategies
- Document and user context

### Metrics Collection

- Document processing throughput and latency
- Queue depth and processing rates
- Error rates and retry patterns
- Lock acquisition and hold times
- Deduplication hit rates

### Real-time Status

- Processing state via Durable Objects
- WebSocket-ready for live updates
- REST API for status polling
- Admin endpoints for monitoring

## 🔐 Security Features

### Access Control

- Document ACL preservation throughout processing
- User context validation in webhook processing
- Permission-based queue access

### Data Protection

- DLP scanning framework (extensible)
- Content-based deduplication (privacy-safe)
- Audit logging for compliance
- Secure lock management

## 🚀 Deployment

### Services to Deploy

1. **Queue Processor Service** (`apps/queue-processor/`)

   ```bash
   cd apps/queue-processor
   pnpm deploy
   ```

2. **Updated Ingest Service** (`apps/ingest-service/`)

   ```bash
   cd apps/ingest-service
   pnpm deploy
   ```

3. **Updated Query Service** (`apps/query-service/`)
   ```bash
   cd apps/query-service
   pnpm deploy
   ```

### Infrastructure Dependencies

#### Cloudflare Services Required

- **Queues**: 3 queues (`document-ingestion`, `webhook-processing`, `batch-reprocessing`)
- **Durable Objects**: DocumentCoordinator class
- **R2**: Document chunks storage
- **Vectorize**: Embeddings storage
- **Workers AI**: Embedding generation

#### Service Dependencies

- Queue Processor must be deployed before Ingest/Query services (DO dependency)
- All services share the same R2 bucket and Vectorize index
- Coordination service is bound to multiple workers

## ✅ Testing

### Test Coverage

- ✅ Queue Processor service endpoints
- ✅ Health checks and service information
- ✅ Admin functionality (cleanup triggers)
- ✅ Basic Durable Object accessibility

### Integration Tests

Tests validate:

- Service startup and configuration
- Endpoint availability and response formats
- Error handling for missing dependencies
- Basic coordinator accessibility

## 📈 Next Steps

With Queue Processing and Durable Objects Coordination complete, the next implementation priorities are:

### Phase 2: Source Connectors (Week 5-9)

1. **Website Crawler Service** - Robots.txt compliant web scraping
2. **SharePoint Connector** - Microsoft Graph OAuth and incremental sync
3. **Confluence & Jira Connectors** - Atlassian REST API integration

### Phase 3: Advanced Features (Week 10-14)

1. **AI Gateway Integration** - Model routing and cost optimization
2. **Multiple Pipeline Architecture** - Security tier management
3. **Enhanced Monitoring** - Dashboards and alerting

### Phase 4: Production Hardening (Week 15-18)

1. **Advanced Security** - DLP implementation and encryption
2. **Sync Strategies** - Incremental sync and freshness management
3. **Performance Optimization** - Scaling and cost optimization

## 🎉 Implementation Success

This implementation successfully delivers:

✅ **Scalable Queue Architecture** - Handle high-volume document processing
✅ **Robust Coordination** - Prevent conflicts and ensure consistency
✅ **Real-time Status Tracking** - Monitor processing progress
✅ **Comprehensive Error Handling** - Resilient processing pipeline
✅ **Production-Ready Infrastructure** - Observability and monitoring
✅ **Extensible Framework** - Ready for source connectors and advanced features

The foundation is now in place for building a full enterprise RAG system with the reliability, scalability, and observability required for production workloads.
