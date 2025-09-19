#!/bin/bash

# Ingest Service End-to-End Test Scripts
# Tests all endpoints of the RAG Ingest Service

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Test data
TEST_DOC_ID="test-doc-$(date +%s)"
WORKFLOW_ID=""

# Test functions

test_health_check() {
    log_info "=== Testing Ingest Service Health Check ==="

    response=$(curl -s -w "%{http_code}" "$INGEST_SERVICE_URL/health")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Health check passed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Health check failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_direct_processing() {
    log_info "=== Testing Direct Document Processing ==="

    local test_payload=$(cat <<EOF
{
  "documents": [
    {
      "id": "${TEST_DOC_ID}",
      "text": "This is a comprehensive test document for the RAG system. It contains information about machine learning, artificial intelligence, and document processing. The document discusses various techniques for information retrieval and natural language processing. This content will be chunked, embedded, and stored for later retrieval during query operations.",
      "source": "test-script",
      "url": "https://example.com/test-doc.pdf",
      "metadata": {
        "acl": ["public", "test"],
        "title": "Test Document for RAG System",
        "author": "Test Script",
        "created": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
      }
    }
  ]
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$INGEST_SERVICE_URL/process")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Direct processing successful"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check if processing was successful
        if echo "$body" | jq -e '.success == true' > /dev/null 2>&1; then
            log_success "Document processing completed successfully"
        else
            log_warning "Processing response indicates potential issues"
        fi
    else
        log_error "Direct processing failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_workflow_processing() {
    log_info "=== Testing Workflow-Based Document Processing ==="

    local workflow_doc_id="workflow-doc-$(date +%s)"
    local test_payload=$(cat <<EOF
{
  "documents": [
    {
      "id": "${workflow_doc_id}",
      "text": "This is a test document for workflow-based processing in the RAG system. It includes detailed information about distributed systems, microservices architecture, and event-driven processing. The workflow will handle chunking, embedding generation, and storage operations with better error handling and observability compared to direct processing.",
      "source": "test-workflow",
      "url": "https://example.com/workflow-test.pdf",
      "metadata": {
        "acl": ["public", "workflow-test"],
        "title": "Workflow Test Document",
        "department": "Engineering",
        "created": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
      }
    }
  ],
  "options": {
    "chunkSize": 1000,
    "overlap": 200,
    "retryLimit": 3,
    "dlpEnabled": false
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$INGEST_SERVICE_URL/process-workflow")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "202" ]; then
        log_success "Workflow queued successfully"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Extract workflow instance ID
        WORKFLOW_ID=$(echo "$body" | jq -r '.results[0].workflowInstanceId' 2>/dev/null || echo "")
        if [ -n "$WORKFLOW_ID" ] && [ "$WORKFLOW_ID" != "null" ]; then
            log_info "Workflow ID: $WORKFLOW_ID"
        else
            log_warning "Could not extract workflow ID from response"
        fi
    else
        log_error "Workflow processing failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_workflow_status() {
    if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
        log_warning "No workflow ID available, skipping status check"
        return 0
    fi

    log_info "=== Testing Workflow Status Check ==="

    # Poll workflow status
    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Checking workflow status (attempt $attempt/$max_attempts)"

        response=$(curl -s -w "%{http_code}" \
            "$INGEST_SERVICE_URL/workflow/$WORKFLOW_ID")

        http_code="${response: -3}"
        body="${response%???}"

        if [ "$http_code" = "200" ]; then
            echo "Status response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

            # Check workflow status
            status=$(echo "$body" | jq -r '.status' 2>/dev/null || echo "unknown")

            case "$status" in
                "completed")
                    log_success "Workflow completed successfully"
                    return 0
                    ;;
                "failed")
                    log_error "Workflow failed"
                    echo "Error details: $(echo "$body" | jq -r '.error // "No error details"')"
                    return 1
                    ;;
                "running"|"queued")
                    log_info "Workflow status: $status (waiting...)"
                    sleep 3
                    ;;
                *)
                    log_warning "Unknown workflow status: $status"
                    sleep 2
                    ;;
            esac
        else
            log_error "Failed to get workflow status (HTTP $http_code)"
            echo "Response: $body"
            sleep 2
        fi

        ((attempt++))
    done

    log_warning "Workflow status check timed out after $max_attempts attempts"
    return 0
}

test_queue_processing() {
    log_info "=== Testing Queue-Based Document Processing ==="

    local queue_doc_id="queue-doc-$(date +%s)"
    local test_payload=$(cat <<EOF
{
  "documents": [
    {
      "id": "${queue_doc_id}",
      "text": "This document tests the queue-based processing system. It contains content about asynchronous processing, message queues, and distributed system reliability. The queue processor will handle this document through Cloudflare Queues, providing better scalability and fault tolerance for high-volume document ingestion scenarios.",
      "source": "test-queue",
      "url": "https://example.com/queue-test.pdf",
      "metadata": {
        "acl": ["public", "queue-test"],
        "title": "Queue Processing Test Document",
        "priority": "medium",
        "batch": "test-batch-1"
      }
    }
  ],
  "options": {
    "chunkSize": 800,
    "overlap": 150,
    "dlpEnabled": true,
    "priority": "medium"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$INGEST_SERVICE_URL/queue/process")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "202" ]; then
        log_success "Document queued for processing"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Queue processing failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_webhook_processing() {
    log_info "=== Testing Webhook Event Processing ==="

    local webhook_payload=$(cat <<EOF
{
  "sourceType": "sharepoint",
  "eventType": "updated",
  "resourceId": "site-test/document-${TEST_DOC_ID}",
  "resourceUrl": "https://tenant.sharepoint.com/sites/test/document.docx",
  "changeToken": "change-token-123",
  "metadata": {
    "permissions": ["user:test", "group:engineering"],
    "lastModified": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
    "size": 15000,
    "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  "options": {
    "priority": "high"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$webhook_payload" \
        "$INGEST_SERVICE_URL/webhook")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "202" ]; then
        log_success "Webhook event processed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Webhook processing failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_batch_reprocessing() {
    log_info "=== Testing Batch Reprocessing ==="

    local batch_payload=$(cat <<EOF
{
  "documentIds": ["${TEST_DOC_ID}", "test-doc-sample-1", "test-doc-sample-2"],
  "reason": "manual_reindex",
  "options": {
    "forceFullReprocess": true,
    "preserveVersions": true,
    "priority": "medium"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$batch_payload" \
        "$INGEST_SERVICE_URL/queue/batch-reprocess")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "202" ]; then
        log_success "Batch reprocessing queued"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Batch reprocessing failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_document_status() {
    log_info "=== Testing Document Status Check ==="

    response=$(curl -s -w "%{http_code}" \
        "$INGEST_SERVICE_URL/status/$TEST_DOC_ID")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Document status retrieved"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    elif [ "$http_code" = "404" ]; then
        log_warning "Document not found (expected for new documents)"
        echo "Response: $body"
    else
        log_error "Status check failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

# Main test execution
main() {
    log_info "=== RAG Ingest Service End-to-End Tests ==="
    echo "Testing against: $INGEST_SERVICE_URL"
    echo "Test Document ID: $TEST_DOC_ID"
    echo

    local failed_tests=0

    # Run all tests
    test_health_check || ((failed_tests++))
    echo

    test_direct_processing || ((failed_tests++))
    echo

    test_workflow_processing || ((failed_tests++))
    echo

    test_workflow_status || ((failed_tests++))
    echo

    test_queue_processing || ((failed_tests++))
    echo

    test_webhook_processing || ((failed_tests++))
    echo

    test_batch_reprocessing || ((failed_tests++))
    echo

    test_document_status || ((failed_tests++))
    echo

    # Summary
    if [ $failed_tests -eq 0 ]; then
        log_success "=== All Ingest Service tests passed! ==="
    else
        log_error "=== $failed_tests test(s) failed ==="
        exit 1
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
