#!/bin/bash

# Query Service End-to-End Test Scripts
# Tests all endpoints of the RAG Query Service

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Test functions

test_health_check() {
    log_info "=== Testing Query Service Health Check ==="

    response=$(curl -s -w "%{http_code}" "$QUERY_SERVICE_URL/health")
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

test_basic_query() {
    log_info "=== Testing Basic Query Processing ==="

    local test_payload=$(cat <<EOF
{
  "query": "What is machine learning and how does it work?",
  "userContext": {
    "permissions": ["public"],
    "userId": "test-user-$(date +%s)"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Basic query processed successfully"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check if we got an answer
        if echo "$body" | jq -e '.answer != null and .answer != ""' > /dev/null 2>&1; then
            log_success "Query returned a valid answer"

            # Check for sources
            source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")
            log_info "Number of sources returned: $source_count"
        else
            log_warning "Query response may not contain a valid answer"
        fi
    else
        log_error "Basic query failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_complex_query() {
    log_info "=== Testing Complex Query with ACL Filtering ==="

    local test_payload=$(cat <<EOF
{
  "query": "Explain the architecture of distributed systems and microservices, including their benefits and challenges. How do they relate to document processing workflows?",
  "userContext": {
    "permissions": ["public", "internal", "engineering"],
    "userId": "engineer-$(date +%s)",
    "department": "Engineering",
    "roles": ["developer", "architect"]
  },
  "options": {
    "maxSources": 5,
    "includeMetadata": true,
    "temperature": 0.7
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Complex query processed successfully"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Analyze response quality
        answer_length=$(echo "$body" | jq -r '.answer | length' 2>/dev/null || echo "0")
        source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")

        log_info "Answer length: $answer_length characters"
        log_info "Sources found: $source_count"

        if [ "$answer_length" -gt 100 ]; then
            log_success "Query returned a substantial answer"
        else
            log_warning "Answer may be too short for complex query"
        fi
    else
        log_error "Complex query failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_empty_results_query() {
    log_info "=== Testing Query with No Expected Results ==="

    local test_payload=$(cat <<EOF
{
  "query": "What is the price of cryptocurrency on Mars in the year 3000?",
  "userContext": {
    "permissions": ["public"],
    "userId": "test-user-no-results"
  }
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "No-results query handled gracefully"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check for appropriate handling of no results
        source_count=$(echo "$body" | jq '.sources | length' 2>/dev/null || echo "0")
        answer=$(echo "$body" | jq -r '.answer' 2>/dev/null || echo "")

        log_info "Sources found: $source_count"

        if [ "$source_count" -eq 0 ]; then
            log_success "Correctly returned no sources for unrelated query"
        fi

        if echo "$answer" | grep -qi "sorry\|don't\|unable\|not found\|no information"; then
            log_success "AI provided appropriate response for no matching content"
        fi
    else
        log_error "No-results query failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_restricted_access_query() {
    log_info "=== Testing Query with Restricted Access ==="

    local test_payload=$(cat <<EOF
{
  "query": "Show me sensitive internal documents about security protocols",
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
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Restricted access query processed"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check that restricted content is not returned
        sources_with_restricted=$(echo "$body" | jq '.sources[] | select(.metadata.acl and (.metadata.acl | contains(["internal"]) or contains(["confidential"]) or contains(["restricted"])))' 2>/dev/null | wc -l || echo "0")

        if [ "$sources_with_restricted" -eq 0 ]; then
            log_success "ACL filtering working correctly - no restricted content returned"
        else
            log_error "ACL filtering may not be working - found $sources_with_restricted restricted sources"
        fi
    else
        log_error "Restricted access query failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_malformed_query() {
    log_info "=== Testing Malformed Query Handling ==="

    local test_payload='{"invalid": "json", "missing": "required_fields"}'

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "400" ]; then
        log_success "Malformed query properly rejected with 400 status"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    elif [ "$http_code" = "422" ]; then
        log_success "Malformed query properly rejected with 422 status"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_warning "Malformed query returned unexpected status $http_code (expected 400 or 422)"
        echo "Response: $body"
    fi
}

test_metrics_endpoint() {
    log_info "=== Testing Metrics Endpoint ==="

    response=$(curl -s -w "%{http_code}" "$QUERY_SERVICE_URL/metrics")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Metrics endpoint accessible"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"

        # Check for expected metrics structure
        if echo "$body" | jq -e '.analytics' > /dev/null 2>&1; then
            log_success "Metrics contain analytics information"
        fi
    else
        log_error "Metrics endpoint failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_cache_stats() {
    log_info "=== Testing Cache Statistics ==="

    response=$(curl -s -w "%{http_code}" "$QUERY_SERVICE_URL/cache/stats")
    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Cache stats retrieved"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Cache stats failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_cache_invalidation() {
    log_info "=== Testing Cache Invalidation ==="

    local test_payload=$(cat <<EOF
{
  "patterns": ["test-*", "query-cache-*"],
  "reason": "End-to-end testing cache invalidation"
}
EOF
    )

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/cache/invalidate")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Cache invalidation requested"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        log_error "Cache invalidation failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

test_query_performance() {
    log_info "=== Testing Query Performance ==="

    local test_payload=$(cat <<EOF
{
  "query": "What are the best practices for implementing microservices architecture?",
  "userContext": {
    "permissions": ["public"],
    "userId": "perf-test-user"
  }
}
EOF
    )

    # Measure response time
    local start_time=$(date +%s.%N)

    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$QUERY_SERVICE_URL/query")

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "N/A")

    http_code="${response: -3}"
    body="${response%???}"

    if [ "$http_code" = "200" ]; then
        log_success "Performance test query completed"
        log_info "Response time: ${duration}s"

        # Check if response time is reasonable (under 30 seconds)
        if command -v bc > /dev/null 2>&1 && [ "$duration" != "N/A" ]; then
            if (( $(echo "$duration < 30" | bc -l) )); then
                log_success "Query completed within reasonable time"
            else
                log_warning "Query took longer than expected: ${duration}s"
            fi
        fi

        echo "Response preview: $(echo "$body" | jq -c '. | {answer: (.answer | .[0:100] + "..."), source_count: (.sources | length)}' 2>/dev/null || echo "Response summary not available")"
    else
        log_error "Performance test query failed with status $http_code"
        echo "Response: $body"
        return 1
    fi
}

# Main test execution
main() {
    log_info "=== RAG Query Service End-to-End Tests ==="
    echo "Testing against: $QUERY_SERVICE_URL"
    echo

    local failed_tests=0

    # Run all tests
    test_health_check || ((failed_tests++))
    echo

    test_basic_query || ((failed_tests++))
    echo

    test_complex_query || ((failed_tests++))
    echo

    test_empty_results_query || ((failed_tests++))
    echo

    test_restricted_access_query || ((failed_tests++))
    echo

    test_malformed_query || ((failed_tests++))
    echo

    test_metrics_endpoint || ((failed_tests++))
    echo

    test_cache_stats || ((failed_tests++))
    echo

    test_cache_invalidation || ((failed_tests++))
    echo

    test_query_performance || ((failed_tests++))
    echo

    # Summary
    if [ $failed_tests -eq 0 ]; then
        log_success "=== All Query Service tests passed! ==="
    else
        log_error "=== $failed_tests test(s) failed ==="
        exit 1
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
