#!/bin/bash

# Local-Only Tests - Tests that don't require deployed services
# Useful for validating test scripts and logic without service dependencies

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Test functions that don't require live services

test_script_syntax() {
    log_info "=== Testing Script Syntax ==="

    local scripts=(
        "test-environment.sh"
        "test-ingest-service.sh"
        "test-query-service.sh"
        "test-queue-processor.sh"
        "test-end-to-end.sh"
        "run-all-tests.sh"
        "diagnose-services.sh"
    )

    local failed=0

    for script in "${scripts[@]}"; do
        local script_path="$SCRIPT_DIR/$script"

        if [ -f "$script_path" ]; then
            log_info "Checking syntax of $script"

            if bash -n "$script_path" 2>/dev/null; then
                log_success "$script syntax is valid"
            else
                log_error "$script has syntax errors"
                ((failed++))
            fi
        else
            log_warning "$script not found"
        fi
    done

    if [ $failed -eq 0 ]; then
        log_success "All test scripts have valid syntax"
        return 0
    else
        log_error "$failed script(s) have syntax errors"
        return 1
    fi
}

test_json_payloads() {
    log_info "=== Testing JSON Payload Generation ==="

    # Test that we can generate valid JSON payloads
    local test_payload=$(cat <<EOF
{
  "documents": [
    {
      "id": "test-doc-123",
      "text": "This is a test document",
      "source": "test",
      "url": "https://example.com/test.pdf",
      "metadata": {
        "acl": ["public"],
        "title": "Test Document"
      }
    }
  ]
}
EOF
    )

    if echo "$test_payload" | jq . > /dev/null 2>&1; then
        log_success "JSON payload generation works correctly"
    else
        log_error "JSON payload generation has issues"
        return 1
    fi

    # Test query payload
    local query_payload=$(cat <<EOF
{
  "query": "What is machine learning?",
  "userContext": {
    "permissions": ["public"],
    "userId": "test-user"
  }
}
EOF
    )

    if echo "$query_payload" | jq . > /dev/null 2>&1; then
        log_success "Query JSON payload generation works correctly"
    else
        log_error "Query JSON payload generation has issues"
        return 1
    fi
}

test_environment_variables() {
    log_info "=== Testing Environment Variables ==="

    local required_vars=(
        "INGEST_SERVICE_URL"
        "QUERY_SERVICE_URL"
        "QUEUE_PROCESSOR_URL"
    )

    local missing=0

    for var in "${required_vars[@]}"; do
        if [ -n "${!var}" ]; then
            log_success "$var is set: ${!var}"
        else
            log_warning "$var is not set"
            ((missing++))
        fi
    done

    if [ $missing -eq 0 ]; then
        log_success "All required environment variables are set"
    else
        log_info "$missing environment variable(s) not set (will use defaults)"
    fi
}

test_required_tools() {
    log_info "=== Testing Required Tools ==="

    local tools=("curl" "jq" "bc")
    local missing=0

    for tool in "${tools[@]}"; do
        if command -v "$tool" > /dev/null 2>&1; then
            local version=$(${tool} --version 2>/dev/null | head -1 || echo "version unknown")
            log_success "$tool is available ($version)"
        else
            log_error "$tool is not installed"
            ((missing++))
        fi
    done

    if [ $missing -eq 0 ]; then
        log_success "All required tools are available"
        return 0
    else
        log_error "$missing required tool(s) missing"
        echo
        log_info "Installation commands:"
        echo "# On macOS with Homebrew:"
        echo "brew install curl jq bc"
        echo
        echo "# On Ubuntu/Debian:"
        echo "sudo apt-get install curl jq bc"
        echo
        echo "# On CentOS/RHEL:"
        echo "sudo yum install curl jq bc"
        return 1
    fi
}

test_url_validation() {
    log_info "=== Testing URL Validation Logic ==="

    local test_urls=(
        "https://ingest-service.edgeprocure.workers.dev"
        "https://query-service.edgeprocure.workers.dev"
        "https://queue-processor.edgeprocure.workers.dev"
    )

    for url in "${test_urls[@]}"; do
        # Test URL format validation
        if echo "$url" | grep -E '^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' > /dev/null; then
            log_success "URL format valid: $url"
        else
            log_error "URL format invalid: $url"
            return 1
        fi
    done

    log_success "All URL formats are valid"
}

test_data_generation() {
    log_info "=== Testing Test Data Generation ==="

    # Test document ID generation
    local test_id="test-$(date +%s)"
    if [ ${#test_id} -gt 10 ]; then
        log_success "Test ID generation works: $test_id"
    else
        log_error "Test ID generation failed"
        return 1
    fi

    # Test timestamp generation
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S.000Z)
    if [ -n "$timestamp" ]; then
        log_success "Timestamp generation works: $timestamp"
    else
        log_error "Timestamp generation failed"
        return 1
    fi
}

# Main execution
main() {
    log_info "=== Local-Only Test Suite ==="
    echo "These tests validate the test scripts without requiring deployed services."
    echo

    local failed_tests=0

    test_script_syntax || ((failed_tests++))
    echo

    test_required_tools || ((failed_tests++))
    echo

    test_environment_variables || ((failed_tests++))
    echo

    test_url_validation || ((failed_tests++))
    echo

    test_json_payloads || ((failed_tests++))
    echo

    test_data_generation || ((failed_tests++))
    echo

    # Summary
    if [ $failed_tests -eq 0 ]; then
        log_success "=== All local tests passed! ==="
        echo "Your test scripts are ready to use."
        echo
        echo "Next steps:"
        echo "1. Deploy your services using 'wrangler deploy'"
        echo "2. Run './scripts/diagnose-services.sh' to check deployment status"
        echo "3. Run './scripts/run-all-tests.sh' for full testing"
    else
        log_error "=== $failed_tests local test(s) failed ==="
        echo "Please fix the issues before running tests against deployed services."
        exit 1
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
