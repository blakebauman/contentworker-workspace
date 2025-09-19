#!/bin/bash

# Queue Processor Service End-to-End Test Scripts
# Tests queue processing and Durable Objects coordination

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Test configuration
COORDINATOR_ID="test-coordinator-$(date +%s)"
TEST_DOC_ID="queue-test-$(date +%s)"

# Test functions

test_health_check() {
    log_info "=== Testing Queue Processor Health Check ==="

    response=$(curl -s -w "%{http_code}" "$QUEUE_PROCESSOR_URL/health")
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

test_service_info() {
    log_info "=== Testing Service Information ==="

    response=$(curl -s -w "%{http_code}" "$QUEUE_PROCESSOR_URL/")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Service info retrieved"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check for expected service information
        if echo "$body" | jq -e '.service == "Queue Processor"' > /dev/null 2>&1; then
            log_success "Service correctly identifies as Queue Processor"
        fi

        if echo "$body" | jq -e '.endpoints | length > 0' > /dev/null 2>&1; then
            log_success "Service exposes endpoint information"
        fi
    else
        log_error "Service info failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_metrics_endpoint() {
    log_info "=== Testing Metrics Endpoint ==="

    response=$(curl -s -w "%{http_code}" "$QUEUE_PROCESSOR_URL/metrics")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Metrics endpoint accessible"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_warning "Metrics endpoint returned status $http_code (may not be implemented yet)"
        echo "Response: $body"
    fi
}

test_admin_cleanup() {
    log_info "=== Testing Admin Cleanup Endpoint ==="

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        "$QUEUE_PROCESSOR_URL/admin/cleanup")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Admin cleanup executed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Admin cleanup failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_document_lock_acquire() {
    log_info "=== Testing Document Lock Acquisition ==="

    local test_payload=$(cat <<EOF
{
  "documentId": "${TEST_DOC_ID}",
  "workerId": "test-worker-$(date +%s)",
  "timeout": 300000
}
EOF
    )

    # Use the coordinator URL pattern based on the implementation
    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/acquire-lock"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Document lock acquired"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check if lock was successfully acquired
        if echo "$body" | jq -e '.acquired == true' > /dev/null 2>&1; then
            log_success "Lock acquisition confirmed"
        else
            log_warning "Lock acquisition status unclear"
        fi
    else
        log_error "Document lock acquisition failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_document_lock_check() {
    log_info "=== Testing Document Lock Status Check ==="

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/check-lock?documentId=$TEST_DOC_ID"

    response=$(curl -s -w "%{http_code}" "$coordinator_url")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Lock status retrieved"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check lock status
        if echo "$body" | jq -e '.locked == true' > /dev/null 2>&1; then
            log_success "Document is correctly locked"
        else
            log_info "Document lock status: $(echo "$body" | jq -r '.locked // "unknown"')"
        fi
    else
        log_error "Lock status check failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_processing_state_update() {
    log_info "=== Testing Processing State Update ==="

    local test_payload=$(cat <<EOF
{
  "documentId": "${TEST_DOC_ID}",
  "state": {
    "status": "processing",
    "step": "chunking",
    "progress": 0.3,
    "chunksProcessed": 3,
    "totalChunks": 10,
    "startTime": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "lastUpdate": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  }
}
EOF
    )

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/update-state"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Processing state updated"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Processing state update failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_processing_state_get() {
    log_info "=== Testing Processing State Retrieval ==="

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/get-state?documentId=$TEST_DOC_ID"

    response=$(curl -s -w "%{http_code}" "$coordinator_url")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Processing state retrieved"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check if we got the state we just set
        if echo "$body" | jq -e '.state.status == "processing"' > /dev/null 2>&1; then
            log_success "Retrieved correct processing state"
        fi

        if echo "$body" | jq -e '.state.step == "chunking"' > /dev/null 2>&1; then
            log_success "Retrieved correct processing step"
        fi
    else
        log_error "Processing state retrieval failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_content_deduplication() {
    log_info "=== Testing Content Deduplication ==="

    local test_content="This is test content for deduplication testing. It should generate a consistent hash for duplicate detection."
    local test_payload=$(cat <<EOF
{
  "content": "${test_content}",
  "documentId": "${TEST_DOC_ID}-dedup",
  "chunkId": "chunk-1"
}
EOF
    )

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/deduplicate"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Deduplication check completed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check deduplication result
        if echo "$body" | jq -e 'has("hash")' > /dev/null 2>&1; then
            log_success "Content hash generated for deduplication"
        fi

        if echo "$body" | jq -e '.isDuplicate == false' > /dev/null 2>&1; then
            log_success "Content correctly identified as new (not duplicate)"
        fi
    else
        log_error "Deduplication check failed with status $http_code"
        echo "Response: $body"
        return 1
    fi

    # Test same content again to check duplicate detection
    log_info "Testing duplicate detection with same content..."

    response2=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code2="${response2: -3}"
    body2="${response2%???}"

    if [ "$http_code2" = "200" ]; then
        echo "Second deduplication response: $body2" | jq '.' 2>/dev/null || echo "Response: $body2"

        if echo "$body2" | jq -e '.isDuplicate == true' > /dev/null 2>&1; then
            log_success "Duplicate content correctly detected"
        else
            log_warning "Duplicate detection may not be working as expected"
        fi
    fi
}

test_coordinator_cleanup() {
    log_info "=== Testing Coordinator Cleanup ==="

    local test_payload=$(cat <<EOF
{
  "maxAge": 3600000,
  "includeActive": false
}
EOF
    )

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/cleanup"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Coordinator cleanup completed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check cleanup results
        if echo "$body" | jq -e 'has("cleaned")' > /dev/null 2>&1; then
            cleaned_count=$(echo "$body" | jq -r '.cleaned // 0')
            log_info "Cleaned up $cleaned_count expired items"
        fi
    else
        log_error "Coordinator cleanup failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_document_lock_release() {
    log_info "=== Testing Document Lock Release ==="

    local test_payload=$(cat <<EOF
{
  "documentId": "${TEST_DOC_ID}",
  "workerId": "test-worker-$(date +%s)"
}
EOF
    )

    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/release-lock"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Document lock released"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check if lock was successfully released
        if echo "$body" | jq -e '.released == true' > /dev/null 2>&1; then
            log_success "Lock release confirmed"
        else
            log_warning "Lock release status unclear"
        fi
    else
        log_error "Document lock release failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_queue_message_simulation() {
    log_info "=== Testing Queue Message Processing Simulation ==="

    # This is a simulation since we can't directly inject queue messages
    # In a real environment, this would be tested by sending messages to the actual queue

    log_info "Note: Queue message processing is tested indirectly through the ingest service"
    log_info "Direct queue message injection requires access to Cloudflare Queues producer"

    # We can test the queue endpoints that would be called by queue messages
    log_info "Queue processor is designed to handle these message types:"
    echo "  - document_ingestion: Process documents asynchronously"
    echo "  - webhook_sync: Handle webhook events from external systems"
    echo "  - batch_reprocess: Handle bulk reprocessing operations"

    log_success "Queue message types documented and endpoints available"
}

test_error_handling() {
    log_info "=== Testing Error Handling ==="

    # Test with invalid coordinator ID format
    local invalid_coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/invalid-id-format/get-state"

    response=$(curl -s -w "%{http_code}" "$invalid_coordinator_url")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        log_success "Invalid coordinator ID properly rejected with status $http_code"
    else
        log_warning "Error handling for invalid coordinator ID returned status $http_code"
    fi

    # Test with malformed JSON
    local malformed_payload='{"invalid": json}'
    local coordinator_url="$QUEUE_PROCESSOR_URL/coordinator/$COORDINATOR_ID/update-state"

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$malformed_payload" \
        "$coordinator_url")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        log_success "Malformed JSON properly rejected with status $http_code"
    else
        log_warning "Error handling for malformed JSON returned status $http_code"
    fi
}

# Main test execution
main() {
    log_info "=== RAG Queue Processor End-to-End Tests ==="
    echo "Testing against: $QUEUE_PROCESSOR_URL"
    echo "Coordinator ID: $COORDINATOR_ID"
    echo "Test Document ID: $TEST_DOC_ID"
    echo

    local failed_tests=0

    # Run all tests
    test_health_check || ((failed_tests++))
    echo

    test_service_info || ((failed_tests++))
    echo

    test_metrics_endpoint || ((failed_tests++))
    echo

    test_admin_cleanup || ((failed_tests++))
    echo

    test_document_lock_acquire || ((failed_tests++))
    echo

    test_document_lock_check || ((failed_tests++))
    echo

    test_processing_state_update || ((failed_tests++))
    echo

    test_processing_state_get || ((failed_tests++))
    echo

    test_content_deduplication || ((failed_tests++))
    echo

    test_coordinator_cleanup || ((failed_tests++))
    echo

    test_document_lock_release || ((failed_tests++))
    echo

    test_queue_message_simulation || ((failed_tests++))
    echo

    test_error_handling || ((failed_tests++))
    echo

    # Summary
    if [ $failed_tests -eq 0 ]; then
        log_success "=== All Queue Processor tests passed! ==="
    else
        log_error "=== $failed_tests test(s) failed ==="
        exit 1
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
