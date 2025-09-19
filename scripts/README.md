# RAG System Testing Scripts

This directory contains comprehensive end-to-end testing scripts for the RAG (Retrieval-Augmented Generation) system, covering all services and their interactions.

## 📁 Test Scripts Overview

### Core Testing Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `test-environment.sh` | Environment validation and service connectivity | `./test-environment.sh` |
| `test-ingest-service.sh` | Complete ingest service testing | `./test-ingest-service.sh` |
| `test-query-service.sh` | Complete query service testing | `./test-query-service.sh` |
| `test-queue-processor.sh` | Queue processor and coordination testing | `./test-queue-processor.sh` |
| `test-end-to-end.sh` | Full system workflow testing | `./test-end-to-end.sh` |
| `run-all-tests.sh` | Master test runner with multiple modes | `./run-all-tests.sh [mode] [parallel]` |

## 🚀 Quick Start

### 1. Environment Setup

First, configure your service URLs:

```bash
# Set environment variables
export INGEST_SERVICE_URL="https://ingest-service.edgeprocure.workers.dev"
export QUERY_SERVICE_URL="https://query-service.edgeprocure.workers.dev"
export QUEUE_PROCESSOR_URL="https://queue-processor.edgeprocure.workers.dev"

# Validate environment
./scripts/test-environment.sh
```

### 2. Run All Tests

```bash
# Run complete test suite
./scripts/run-all-tests.sh

# Run tests in parallel for faster execution
./scripts/run-all-tests.sh all true

# Run only service tests
./scripts/run-all-tests.sh services

# Run only end-to-end tests
./scripts/run-all-tests.sh e2e
```

### 3. Individual Service Testing

```bash
# Test individual services
./scripts/test-ingest-service.sh
./scripts/test-query-service.sh
./scripts/test-queue-processor.sh
```

## 📋 Test Coverage

### Ingest Service Tests (`test-ingest-service.sh`)

- ✅ **Health Check** - Service availability
- ✅ **Direct Processing** - Synchronous document processing
- ✅ **Workflow Processing** - Cloudflare Workflows integration
- ✅ **Queue Processing** - Asynchronous document queuing
- ✅ **Webhook Processing** - External system integration
- ✅ **Batch Reprocessing** - Bulk operations
- ✅ **Document Status** - Processing status tracking

**Sample Test Data:**
- Technical documents with microservices content
- Business documents with enterprise topics
- Security documents with compliance information

### Query Service Tests (`test-query-service.sh`)

- ✅ **Health Check** - Service availability
- ✅ **Basic Queries** - Simple question-answering
- ✅ **Complex Queries** - Multi-faceted questions with ACL
- ✅ **Empty Results** - Handling unrelated queries
- ✅ **Access Control** - ACL filtering validation
- ✅ **Error Handling** - Malformed request handling
- ✅ **Metrics** - Performance tracking
- ✅ **Cache Management** - Cache stats and invalidation
- ✅ **Performance** - Response time measurement

**Test Queries:**
- Machine learning and AI concepts
- Distributed systems architecture
- Security and compliance topics
- Performance optimization strategies

### Queue Processor Tests (`test-queue-processor.sh`)

- ✅ **Health Check** - Service availability
- ✅ **Service Info** - Endpoint documentation
- ✅ **Metrics** - Processing statistics
- ✅ **Admin Operations** - Cleanup and maintenance
- ✅ **Document Locking** - Coordination via Durable Objects
- ✅ **Processing State** - Real-time status tracking
- ✅ **Content Deduplication** - Hash-based duplicate detection
- ✅ **Coordinator Cleanup** - Expired data removal
- ✅ **Error Handling** - Invalid request handling

**Coordination Features:**
- Document-level locking mechanisms
- Processing state persistence
- Content deduplication
- Automatic cleanup of expired locks

### End-to-End Tests (`test-end-to-end.sh`)

- ✅ **Phase 1: Setup** - Service validation
- ✅ **Phase 2: Ingestion** - Multi-method document processing
- ✅ **Phase 3: Monitoring** - Processing completion tracking
- ✅ **Phase 4: Query Processing** - Knowledge retrieval testing
- ✅ **Phase 5: Advanced Features** - ACL, caching, metrics
- ✅ **Phase 6: Performance** - Response time analysis
- ✅ **Phase 7: Cleanup** - System cleanup and maintenance

**Test Workflow:**
1. Ingest documents using different methods (direct, workflow, queue)
2. Monitor processing completion
3. Execute various query types
4. Validate ACL filtering and security
5. Test advanced features (caching, metrics)
6. Measure system performance
7. Clean up test data

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `INGEST_SERVICE_URL` | Ingest service endpoint | `https://ingest-service.edgeprocure.workers.dev` |
| `QUERY_SERVICE_URL` | Query service endpoint | `https://query-service.edgeprocure.workers.dev` |
| `QUEUE_PROCESSOR_URL` | Queue processor endpoint | `https://queue-processor.edgeprocure.workers.dev` |

### Test Configuration

Scripts support various configuration options:

```bash
# Timeout settings
TEST_TIMEOUT=30           # HTTP request timeout
RETRY_ATTEMPTS=3          # Retry attempts for failed requests
WAIT_BETWEEN_RETRIES=2    # Wait time between retries

# Processing monitoring
PROCESSING_TIMEOUT=300    # Max wait for document processing
WORKFLOW_TIMEOUT=180      # Max wait for workflow completion
```

## 📊 Test Output

### Success Indicators

- ✅ **Green messages** indicate successful operations
- 📊 **Blue messages** provide informational details
- ⚠️ **Yellow messages** indicate warnings but non-critical issues

### Failure Indicators

- ❌ **Red messages** indicate test failures
- Exit codes: `0` = success, `1` = failure, `130` = interrupted

### Sample Output

```bash
[INFO] === RAG System Complete End-to-End Test ===
Test ID: e2e-1634567890
Services:
  Ingest:    https://ingest-service.edgeprocure.workers.dev
  Query:     https://query-service.edgeprocure.workers.dev
  Queue:     https://queue-processor.edgeprocure.workers.dev

[SUCCESS] === Phase 1: Setup and Service Validation ===
[SUCCESS] All services are accessible and ready

[SUCCESS] === Phase 2: Document Ingestion ===
[SUCCESS] All documents submitted for ingestion

[SUCCESS] === Phase 4: Query Processing ===
[SUCCESS] Query processing phase passed (5/5 success rate)

[SUCCESS] === ALL END-TO-END TESTS PASSED! ===
The RAG system is functioning correctly across all services.
```

## 🛠 Troubleshooting

### Common Issues

1. **Service Not Accessible**
   ```bash
   [ERROR] Ingest Service is not accessible at https://...
   ```
   - Check if services are deployed and running
   - Verify URL configuration
   - Check network connectivity

2. **Test Timeouts**
   ```bash
   [WARNING] Document not ready after 300s
   ```
   - Increase timeout values
   - Check service performance
   - Monitor service logs

3. **Authentication Errors**
   ```bash
   [ERROR] Query failed with status 401
   ```
   - Check API keys and authentication
   - Verify user context in requests
   - Review ACL configurations

### Debug Mode

For detailed debugging, run individual test scripts:

```bash
# Detailed output for specific service
./scripts/test-ingest-service.sh

# Monitor processing in real-time
./scripts/test-end-to-end.sh | tee test-output.log
```

### Service Logs

Check Cloudflare Workers logs for additional debugging:

```bash
# View logs for each service
wrangler tail --name ingest-service
wrangler tail --name query-service
wrangler tail --name queue-processor
```

## 🔄 Continuous Integration

### GitHub Actions Integration

```yaml
name: RAG System Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run RAG Tests
        env:
          INGEST_SERVICE_URL: ${{ secrets.INGEST_SERVICE_URL }}
          QUERY_SERVICE_URL: ${{ secrets.QUERY_SERVICE_URL }}
          QUEUE_PROCESSOR_URL: ${{ secrets.QUEUE_PROCESSOR_URL }}
        run: ./scripts/run-all-tests.sh
```

### Local Development

```bash
# Run tests before deployment
./scripts/run-all-tests.sh services

# Run quick validation
./scripts/test-environment.sh

# Run comprehensive tests
./scripts/run-all-tests.sh all true
```

## 📈 Performance Benchmarks

The test scripts include performance monitoring:

- **Query Response Time**: < 30 seconds (typical: 2-5 seconds)
- **Document Processing**: < 5 minutes for typical documents
- **Workflow Completion**: < 3 minutes for standard workflows
- **Service Health Check**: < 10 seconds

## 🎯 Test Data

Test scripts use realistic data:

- **Technical Documents**: Microservices, distributed systems, APIs
- **Business Documents**: Digital transformation, strategy, ROI
- **Security Documents**: Zero-trust, compliance, cybersecurity

All test data includes:
- Proper ACL configurations
- Realistic metadata
- Varied content types and lengths
- Edge cases and error conditions

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Framework Documentation](https://hono.dev/)
- [RAG System Architecture](../docs/enterprise-rag-architecture.md)
- [Implementation Summary](../IMPLEMENTATION-SUMMARY.md)
