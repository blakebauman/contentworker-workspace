#!/bin/bash

# Service Diagnostics Script
# Helps identify deployment and connectivity issues

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Diagnostic functions

check_dns_resolution() {
    local url=$1
    local service_name=$2

    log_info "Checking DNS resolution for $service_name"

    # Extract hostname from URL
    local hostname=$(echo "$url" | sed 's|https\?://||' | sed 's|/.*||')

    if nslookup "$hostname" > /dev/null 2>&1; then
        log_success "DNS resolution successful for $hostname"
    else
        log_error "DNS resolution failed for $hostname"
        log_info "This may indicate the service is not deployed or the domain is incorrect"
    fi
}

check_http_response() {
    local url=$1
    local service_name=$2

    log_info "Checking HTTP response for $service_name"

    local response=$(curl -s -w "HTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n" "$url" 2>/dev/null || echo "CURL_FAILED")

    if [ "$response" = "CURL_FAILED" ]; then
        log_error "HTTP request failed completely"
        return 1
    fi

    local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    local time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d: -f2)
    local body=$(echo "$response" | grep -v "HTTP_CODE:\|TIME_TOTAL:")

    log_info "HTTP Status: $http_code"
    log_info "Response Time: ${time_total}s"

    case $http_code in
        200) log_success "Service responding normally" ;;
        404) log_warning "Service may not have a root endpoint (trying /health)" ;;
        500) log_error "Service has internal errors" ;;
        502|503|504) log_error "Service gateway/proxy errors" ;;
        *) log_warning "Unexpected HTTP status: $http_code" ;;
    esac

    if [ -n "$body" ] && [ ${#body} -lt 500 ]; then
        log_info "Response body: $body"
    fi
}

check_service_endpoints() {
    local base_url=$1
    local service_name=$2

    log_info "Checking common endpoints for $service_name"

    local endpoints=("/" "/health")

    for endpoint in "${endpoints[@]}"; do
        local url="${base_url}${endpoint}"
        log_info "Testing endpoint: $endpoint"

        local response=$(curl -s -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "FAILED")
        local http_code="${response: -3}"
        local body="${response%???}"

        if [ "$response" = "FAILED" ]; then
            log_error "  $endpoint: Connection failed"
        else
            case $http_code in
                200) log_success "  $endpoint: OK ($http_code)" ;;
                404) log_info "  $endpoint: Not Found ($http_code)" ;;
                *) log_warning "  $endpoint: Status $http_code" ;;
            esac
        fi
    done
}

check_cloudflare_workers() {
    log_info "Checking Cloudflare Workers deployment status"

    # Check if wrangler is available
    if command -v wrangler > /dev/null 2>&1; then
        log_success "Wrangler CLI is available"

        log_info "Checking deployments..."

        # Check each service deployment
        for service in "ingest-service" "query-service" "queue-processor"; do
            log_info "Checking $service deployment..."

            if wrangler deployments list --name "$service" > /dev/null 2>&1; then
                log_success "$service appears to be deployed"
            else
                log_warning "$service deployment status unclear"
            fi
        done
    else
        log_warning "Wrangler CLI not available - cannot check deployment status"
        log_info "Install with: npm install -g wrangler"
    fi
}

generate_deployment_commands() {
    log_info "=== Deployment Commands ==="

    echo "If services are not deployed, use these commands:"
    echo
    echo "# Deploy Ingest Service"
    echo "cd apps/ingest-service && wrangler deploy"
    echo
    echo "# Deploy Query Service"
    echo "cd apps/query-service && wrangler deploy"
    echo
    echo "# Deploy Queue Processor"
    echo "cd apps/queue-processor && wrangler deploy"
    echo
    echo "# Check deployment status"
    echo "wrangler deployments list"
}

# Main diagnostic function
main() {
    log_info "=== RAG Services Diagnostic Tool ==="
    echo "Checking services:"
    echo "  Ingest Service:    $INGEST_SERVICE_URL"
    echo "  Query Service:     $QUERY_SERVICE_URL"
    echo "  Queue Processor:   $QUEUE_PROCESSOR_URL"
    echo

    # Service diagnostics
    local services=(
        "$INGEST_SERVICE_URL|Ingest Service"
        "$QUERY_SERVICE_URL|Query Service"
        "$QUEUE_PROCESSOR_URL|Queue Processor"
    )

    for service_info in "${services[@]}"; do
        local url=$(echo "$service_info" | cut -d'|' -f1)
        local name=$(echo "$service_info" | cut -d'|' -f2)

        echo
        log_info "=== Diagnosing $name ==="

        check_dns_resolution "$url" "$name"
        check_http_response "$url" "$name"
        check_service_endpoints "$url" "$name"
    done

    echo
    check_cloudflare_workers

    echo
    generate_deployment_commands

    echo
    log_info "=== Network Connectivity Test ==="

    # Test basic internet connectivity
    if curl -s --max-time 5 https://www.cloudflare.com > /dev/null 2>&1; then
        log_success "Internet connectivity is working"
    else
        log_error "Internet connectivity issues detected"
    fi

    # Test Cloudflare Workers platform
    if curl -s --max-time 5 https://api.cloudflare.com/client/v4/accounts > /dev/null 2>&1; then
        log_success "Cloudflare API is accessible"
    else
        log_warning "Cloudflare API connectivity issues"
    fi

    echo
    log_info "=== Diagnosis Complete ==="
    echo "If services are not accessible:"
    echo "1. Ensure they are deployed using wrangler deploy"
    echo "2. Check the correct domain/subdomain is being used"
    echo "3. Verify Cloudflare Workers are enabled for your account"
    echo "4. Check for any deployment errors in wrangler logs"
}

# Run diagnostics if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
