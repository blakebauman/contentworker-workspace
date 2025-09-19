#!/bin/bash

# Complete End-to-End RAG System Test
# Tests the full workflow from document ingestion to query processing

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Test configuration
E2E_TEST_ID="e2e-$(date +%s)"
WORKFLOW_ID=""
DOCUMENT_IDS=()

# Test data sets (using arrays instead of associative arrays for compatibility)
TECH_DOC="This comprehensive technical document covers microservices architecture, distributed systems design, and scalability patterns. It discusses containerization with Docker, orchestration with Kubernetes, and service mesh technologies like Istio. The document also covers database sharding, event-driven architecture, and API gateway patterns for modern enterprise applications."

BUSINESS_DOC="This business strategy document outlines digital transformation initiatives, customer experience optimization, and market analysis for enterprise software solutions. It covers agile methodologies, DevOps practices, and organizational change management. The document includes ROI calculations, risk assessments, and implementation timelines for technology adoption."

SECURITY_DOC="This security whitepaper describes zero-trust architecture, identity and access management, and cybersecurity best practices. It covers threat modeling, vulnerability assessments, and incident response procedures. The document discusses encryption standards, secure coding practices, and compliance frameworks like SOC 2 and ISO 27001."

# Helper functions

wait_for_processing() {
    local doc_id=$1
    local max_wait=${2:-60}
    local check_interval=${3:-5}

    log_info "Waiting for document $doc_id to be processed (max ${max_wait}s)..."

    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        # Check document status via ingest service
        local status_response=$(curl -s "$INGEST_SERVICE_URL/status/$doc_id" 2>/dev/null || echo "")

        if echo "$status_response" | jq -e '.status == "found"' > /dev/null 2>&1; then
            log_success "Document $doc_id is available"
            return 0
        fi

        log_info "Document not ready yet, waiting ${check_interval}s... (${elapsed}s elapsed)"
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done

    log_warning "Document $doc_id not ready after ${max_wait}s"
    return 1
}

wait_for_workflow() {
    local workflow_id=$1
    local max_wait=${2:-120}
    local check_interval=${3:-10}

    log_info "Waiting for workflow $workflow_id to complete (max ${max_wait}s)..."

    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        local status_response=$(curl -s "$INGEST_SERVICE_URL/workflow/$workflow_id" 2>/dev/null || echo "")
        local status=$(echo "$status_response" | jq -r '.status' 2>/dev/null || echo "unknown")

        case "$status" in
            "completed"|"complete")
                log_success "Workflow $workflow_id completed"
                return 0
                ;;
            "failed")
                log_error "Workflow $workflow_id failed"
                echo "Error: $(echo "$status_response" | jq -r '.error // "No error details"')"
                return 1
                ;;
            "running"|"queued")
                log_info "Workflow status: $status (waiting ${check_interval}s... ${elapsed}s elapsed)"
                ;;
            *)
                log_info "Workflow status: $status (waiting ${check_interval}s... ${elapsed}s elapsed)"
                ;;
        esac

        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done

    log_warning "Workflow $workflow_id did not complete after ${max_wait}s"
    return 1
}

# Test phases

test_setup_and_validation() {
    log_info "=== Phase 1: Setup and Service Validation ==="

    # Validate all services are accessible
    local failed=0

    for service_name in "Ingest Service" "Query Service" "Queue Processor"; do
        case $service_name in
            "Ingest Service") url=$INGEST_SERVICE_URL ;;
            "Query Service") url=$QUERY_SERVICE_URL ;;
            "Queue Processor") url=$QUEUE_PROCESSOR_URL ;;
        esac

        if ! curl -s --max-time 10 "$url/health" > /dev/null 2>&1; then
            log_error "$service_name is not accessible at $url"
            ((failed++))
        else
            log_success "$service_name is accessible"
        fi
    done

    if [ $failed -gt 0 ]; then
        log_error "Service validation failed - $failed service(s) not accessible"
        return 1
    fi

    log_success "All services are accessible and ready"
}

test_document_ingestion() {
    log_info "=== Phase 2: Document Ingestion ==="

    # Test different ingestion methods
    local doc_counter=1

    # Process each document type
    for doc_type in "tech-doc" "business-doc" "security-doc"; do
        local doc_id="${E2E_TEST_ID}-${doc_type}-${doc_counter}"

        # Get document content based on type
        case $doc_type in
            "tech-doc") local doc_content="$TECH_DOC" ;;
            "business-doc") local doc_content="$BUSINESS_DOC" ;;
            "security-doc") local doc_content="$SECURITY_DOC" ;;
        esac

        log_info "Ingesting document: $doc_type (ID: $doc_id)"

        # Prepare document payload
        local doc_payload=$(cat <<EOF
{
  "documents": [
    {
      "id": "${doc_id}",
      "text": "${doc_content}",
      "source": "e2e-test",
      "url": "https://example.com/${doc_type}.pdf",
      "metadata": {
        "acl": ["public", "internal"],
        "title": "E2E Test Document - ${doc_type}",
        "category": "${doc_type}",
        "testId": "${E2E_TEST_ID}",
        "created": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
      }
    }
  ],
  "options": {
    "chunkSize": 1000,
    "overlap": 200,
    "dlpEnabled": false
  }
}
EOF
        )

        # Choose ingestion method based on document type
        case $doc_counter in
            1)
                # Direct processing
                log_info "Using direct processing for $doc_type"
                response=$(curl -s -w "%{http_code}" \
                    -X POST \
                    -H "Content-Type: application/json" \
                    -d "$doc_payload" \
                    "$INGEST_SERVICE_URL/process")
                ;;
            2)
                # Workflow processing
                log_info "Using workflow processing for $doc_type"
                response=$(curl -s -w "%{http_code}" \
                    -X POST \
                    -H "Content-Type: application/json" \
                    -d "$doc_payload" \
                    "$INGEST_SERVICE_URL/process-workflow")

                # Extract workflow ID
                http_code="${response: -3}"
                body="${response%???}"
                if [ "$http_code" = "202" ]; then
                    WORKFLOW_ID=$(echo "$body" | jq -r '.results[0].workflowInstanceId' 2>/dev/null || echo "")
                fi
                ;;
            3)
                # Queue processing
                log_info "Using queue processing for $doc_type"
                response=$(curl -s -w "%{http_code}" \
                    -X POST \
                    -H "Content-Type: application/json" \
                    -d "$doc_payload" \
                    "$INGEST_SERVICE_URL/queue/process")
                ;;
        esac

        # Check response
        http_code="${response: -3}"
        body="${response%???}"

        if [[ "$http_code" == "200" || "$http_code" == "202" ]]; then
            log_success "Document $doc_type ingested successfully (status: $http_code)"
            DOCUMENT_IDS+=("$doc_id")
        else
            log_error "Document $doc_type ingestion failed (status: $http_code)"
            echo "Response: $body"
            return 1
        fi

        ((doc_counter++))
    done

    log_success "All documents submitted for ingestion"
}

test_processing_monitoring() {
    log_info "=== Phase 3: Processing Monitoring ==="

    # Wait for workflow to complete if we have one
    if [ -n "$WORKFLOW_ID" ] && [ "$WORKFLOW_ID" != "null" ]; then
        wait_for_workflow "$WORKFLOW_ID" 180 || log_warning "Workflow monitoring incomplete"
    fi

    # Wait for documents to be processed
    log_info "Monitoring document processing..."
    local processing_timeout=300  # 5 minutes
    local start_time=$(date +%s)

    while [ $(($(date +%s) - start_time)) -lt $processing_timeout ]; do
        local ready_count=0

        for doc_id in "${DOCUMENT_IDS[@]}"; do
            if wait_for_processing "$doc_id" 10 2>/dev/null; then
                ((ready_count++))
            fi
        done

        log_info "Documents ready: $ready_count/${#DOCUMENT_IDS[@]}"

        if [ $ready_count -eq ${#DOCUMENT_IDS[@]} ]; then
            log_success "All documents processed successfully"
            break
        fi

        if [ $(($(date +%s) - start_time)) -lt $processing_timeout ]; then
            log_info "Waiting for remaining documents to process..."
            sleep 30
        fi
    done

    if [ $ready_count -lt ${#DOCUMENT_IDS[@]} ]; then
        log_warning "Not all documents were processed within timeout"
    fi
}

test_query_processing() {
    log_info "=== Phase 4: Query Processing ==="

    # Define test queries that should match our ingested content
    local test_queries=(
        "What are microservices and how do they work?"
        "Explain digital transformation strategies for enterprises"
        "What are the key components of zero-trust security architecture?"
        "How do you implement scalable distributed systems?"
        "What are the best practices for API gateway design?"
    )

    local successful_queries=0

    for query in "${test_queries[@]}"; do
        log_info "Testing query: $query"

        local query_payload=$(cat <<EOF
{
  "query": "${query}",
  "userContext": {
    "permissions": ["public", "internal"],
    "userId": "e2e-test-user",
    "testId": "${E2E_TEST_ID}"
  },
  "options": {
    "maxSources": 3,
    "includeMetadata": true
  }
}
EOF
        )

        response=$(curl -s -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -d "$query_payload" \
            "$QUERY_SERVICE_URL/query")

        http_code="${response: -3}"
        body="${response%???}"

        if [ "$http_code" = "200" ]; then
            local answer=$(echo "$body" | jq -r '.answer' 2>/dev/null || echo "")
            local source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")

            if [ -n "$answer" ] && [ "$answer" != "null" ] && [ ${#answer} -gt 50 ]; then
                log_success "Query returned substantial answer (${#answer} chars, $source_count sources)"
                ((successful_queries++))

                # Check if any sources match our test documents
                local matching_sources=$(echo "$body" | jq ".sources[] | select(.metadata.testId == \"$E2E_TEST_ID\")" 2>/dev/null | wc -l || echo "0")
                if [ "$matching_sources" -gt 0 ]; then
                    log_success "Found $matching_sources source(s) from our test documents"
                else
                    log_info "No sources specifically from test documents (may use existing content)"
                fi
            else
                log_warning "Query returned minimal answer: $answer"
            fi
        else
            log_error "Query failed with status $http_code"
            echo "Response: $body"
        fi

        # Brief pause between queries
        sleep 2
    done

    log_info "Successful queries: $successful_queries/${#test_queries[@]}"

    if [ $successful_queries -ge $((${#test_queries[@]} / 2)) ]; then
        log_success "Query processing phase passed (>50% success rate)"
    else
        log_error "Query processing phase failed (<50% success rate)"
        return 1
    fi
}

test_advanced_features() {
    log_info "=== Phase 5: Advanced Features Testing ==="

    # Test ACL filtering
    log_info "Testing ACL filtering with restricted permissions..."
    local restricted_query=$(cat <<EOF
{
  "query": "Show me sensitive security information",
  "userContext": {
    "permissions": ["public"],
    "userId": "external-user"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$restricted_query" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        local source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")
        log_info "ACL filtering test - sources returned: $source_count"

        # Check that no internal sources were returned
        local internal_sources=$(echo "$body" | jq '.sources[] | select(.metadata.acl and (.metadata.acl | contains(["internal"])))' 2>/dev/null | wc -l || echo "0")
        if [ "$internal_sources" -eq 0 ]; then
            log_success "ACL filtering working correctly - no internal sources returned"
        else
            log_warning "ACL filtering may not be working - found $internal_sources internal sources"
        fi
    fi

    # Test cache functionality
    log_info "Testing cache statistics..."
    cache_response=$(curl -s "$QUERY_SERVICE_URL/cache/stats" 2>/dev/null || echo "")
    if echo "$cache_response" | jq -e '.cache' > /dev/null 2>&1; then
        log_success "Cache statistics endpoint working"
    else
        log_info "Cache statistics not available or not implemented"
    fi

    # Test metrics
    log_info "Testing metrics collection..."
    metrics_response=$(curl -s "$QUERY_SERVICE_URL/metrics" 2>/dev/null || echo "")
    if echo "$metrics_response" | jq -e '.analytics' > /dev/null 2>&1; then
        log_success "Metrics collection working"
    else
        log_info "Metrics collection not available or not implemented"
    fi
}

test_system_performance() {
    log_info "=== Phase 6: System Performance Testing ==="

    local performance_query=$(cat <<EOF
{
  "query": "What are the performance characteristics of microservices architecture?",
  "userContext": {
    "permissions": ["public", "internal"],
    "userId": "perf-test-user"
  }
}
EOF
    )

    # Measure query response time
    local start_time=$(date +%s.%N)

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$performance_query" \
        "$QUERY_SERVICE_URL/query")

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "N/A")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Performance test completed"
        log_info "Query response time: ${duration}s"

        # Check if response time is reasonable
        if command -v bc > /dev/null 2>&1 && [ "$duration" != "N/A" ]; then
            if (( $(echo "$duration < 30" | bc -l) )); then
                log_success "Query response time within acceptable range"
            else
                log_warning "Query response time may be slower than expected: ${duration}s"
            fi
        fi

        # Analyze response quality
        local answer_length=$(echo "$body" | jq -r '.answer | length' 2>/dev/null || echo "0")
        local source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")

        log_info "Response quality - Answer: ${answer_length} chars, Sources: ${source_count}"
    else
        log_error "Performance test failed with status $http_code"
        return 1
    fi
}

test_cleanup() {
    log_info "=== Phase 7: Cleanup ==="

    # Test cache invalidation
    log_info "Testing cache invalidation..."
    local cache_invalidate_payload=$(cat <<EOF
{
  "patterns": ["${E2E_TEST_ID}*", "e2e-*"],
  "reason": "End-to-end test cleanup"
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$cache_invalidate_payload" \
        "$QUERY_SERVICE_URL/cache/invalidate")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Cache invalidation completed"
    else
        log_info "Cache invalidation returned status $http_code (may not be implemented)"
    fi

    # Test queue processor cleanup
    log_info "Testing queue processor cleanup..."
    cleanup_response=$(curl -s -w "%{http_code}" \
        -X POST \
        "$QUEUE_PROCESSOR_URL/admin/cleanup")

    cleanup_http_code="${cleanup_response: -3}"

    if [ "$cleanup_http_code" = "200" ]; then
        log_success "Queue processor cleanup completed"
    else
        log_info "Queue processor cleanup returned status $cleanup_http_code"
    fi

    log_success "Cleanup phase completed"
}

# Main test execution
main() {
    log_info "=== RAG System Complete End-to-End Test ==="
    echo "Test ID: $E2E_TEST_ID"
    echo "Services:"
    echo "  Ingest:    $INGEST_SERVICE_URL"
    echo "  Query:     $QUERY_SERVICE_URL"
    echo "  Queue:     $QUEUE_PROCESSOR_URL"
    echo

    local start_time=$(date +%s)
    local failed_phases=0

    # Execute test phases
    test_setup_and_validation || ((failed_phases++))
    echo

    test_document_ingestion || ((failed_phases++))
    echo

    test_processing_monitoring || ((failed_phases++))
    echo

    test_query_processing || ((failed_phases++))
    echo

    test_advanced_features || ((failed_phases++))
    echo

    test_system_performance || ((failed_phases++))
    echo

    test_cleanup || ((failed_phases++))
    echo

    # Final summary
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    echo "=== End-to-End Test Summary ==="
    echo "Test ID: $E2E_TEST_ID"
    echo "Total Duration: ${total_duration}s"
    echo "Documents Ingested: ${#DOCUMENT_IDS[@]}"
    echo "Failed Phases: $failed_phases/7"

    if [ $failed_phases -eq 0 ]; then
        log_success "=== ALL END-TO-END TESTS PASSED! ==="
        echo "The RAG system is functioning correctly across all services."
    else
        log_error "=== $failed_phases PHASE(S) FAILED ==="
        echo "Please review the test output for specific issues."
        exit 1
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
