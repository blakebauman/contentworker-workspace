#!/bin/bash

# Test Environment Configuration for RAG Services
# This script sets up environment variables and validates service endpoints

set -e

# Color output functions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default service URLs (modify these for your deployment)
INGEST_SERVICE_URL="${INGEST_SERVICE_URL:-https://ingest.contentworker.io}"
QUERY_SERVICE_URL="${QUERY_SERVICE_URL:-https://query.contentworker.io}"
QUEUE_PROCESSOR_URL="${QUEUE_PROCESSOR_URL:-https://queue.contentworker.io}"

# Test configuration
TEST_TIMEOUT=30
RETRY_ATTEMPTS=3
WAIT_BETWEEN_RETRIES=2

# Validation function
validate_url() {
    local url=$1
    local service_name=$2

    log_info "Validating $service_name at $url"

    # First check if URL is reachable at all
    if ! curl -s --max-time 5 --head "$url" > /dev/null 2>&1; then
        log_warning "$service_name may not be deployed or accessible"
        log_info "Trying health endpoint..."
    fi

    for i in $(seq 1 $RETRY_ATTEMPTS); do
        local response=$(curl -s --max-time $TEST_TIMEOUT "$url/health" 2>&1)
        local curl_exit_code=$?

        if [ $curl_exit_code -eq 0 ]; then
            log_success "$service_name is accessible"
            return 0
        else
            if [ $i -lt $RETRY_ATTEMPTS ]; then
                log_warning "Attempt $i failed (curl exit code: $curl_exit_code), retrying in ${WAIT_BETWEEN_RETRIES}s..."
                log_info "Error: $response"
                sleep $WAIT_BETWEEN_RETRIES
            fi
        fi
    done

    log_error "$service_name is not accessible at $url"
    log_error "Final error: $response"
    return 1
}

# Health check function
health_check() {
    local url=$1
    local service_name=$2

    log_info "Health check for $service_name"

    response=$(curl -s --max-time $TEST_TIMEOUT "$url/health" 2>/dev/null || echo "ERROR")

    if [ "$response" = "ERROR" ]; then
        log_error "$service_name health check failed"
        return 1
    fi

    # Try to parse JSON and check status
    if echo "$response" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        log_success "$service_name is healthy"
        return 0
    else
        log_warning "$service_name returned: $response"
        return 1
    fi
}

# Main validation function
main() {
    log_info "=== RAG Services Test Environment Setup ==="

    # Check required tools
    for tool in curl jq; do
        if ! command -v $tool > /dev/null 2>&1; then
            log_error "Required tool '$tool' is not installed"
            exit 1
        fi
    done

    log_success "Required tools are available"

    # Display service URLs
    echo
    log_info "Service URLs:"
    echo "  Ingest Service:    $INGEST_SERVICE_URL"
    echo "  Query Service:     $QUERY_SERVICE_URL"
    echo "  Queue Processor:   $QUEUE_PROCESSOR_URL"
    echo

    # Validate each service
    local failed=0

    validate_url "$INGEST_SERVICE_URL" "Ingest Service" || failed=1
    validate_url "$QUERY_SERVICE_URL" "Query Service" || failed=1
    validate_url "$QUEUE_PROCESSOR_URL" "Queue Processor" || failed=1

    echo

    # Health checks
    health_check "$INGEST_SERVICE_URL" "Ingest Service" || failed=1
    health_check "$QUERY_SERVICE_URL" "Query Service" || failed=1
    health_check "$QUEUE_PROCESSOR_URL" "Queue Processor" || failed=1

    if [ $failed -eq 0 ]; then
        echo
        log_success "=== All services are ready for testing ==="
        echo
        log_info "Environment variables to export:"
        echo "export INGEST_SERVICE_URL='$INGEST_SERVICE_URL'"
        echo "export QUERY_SERVICE_URL='$QUERY_SERVICE_URL'"
        echo "export QUEUE_PROCESSOR_URL='$QUEUE_PROCESSOR_URL'"
    else
        echo
        log_error "=== Some services are not ready ==="
        exit 1
    fi
}

# Export environment variables
export INGEST_SERVICE_URL
export QUERY_SERVICE_URL
export QUEUE_PROCESSOR_URL

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
