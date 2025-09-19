#!/bin/bash

# Master Test Runner for RAG System
# Runs all test suites in sequence or individually

set -e

# Source environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-environment.sh" > /dev/null 2>&1

# Configuration
RUN_MODE="${1:-all}"  # all, individual, services, e2e
PARALLEL_MODE="${2:-false}"  # true to run service tests in parallel

# Display usage information
show_usage() {
    echo "Usage: $0 [mode] [parallel]"
    echo
    echo "Modes:"
    echo "  all        - Run all tests (environment, services, end-to-end)"
    echo "  individual - Run individual service tests only"
    echo "  services   - Run all service tests"
    echo "  e2e        - Run end-to-end tests only"
    echo "  env        - Run environment validation only"
    echo
    echo "Parallel:"
    echo "  false      - Run service tests sequentially (default)"
    echo "  true       - Run service tests in parallel"
    echo
    echo "Examples:"
    echo "  $0                     # Run all tests sequentially"
    echo "  $0 individual true     # Run service tests in parallel"
    echo "  $0 e2e                 # Run only end-to-end tests"
    echo "  $0 env                 # Run only environment validation"
}

# Test runner functions

run_environment_validation() {
    log_info "=== Running Environment Validation ==="
    if "$SCRIPT_DIR/test-environment.sh"; then
        log_success "Environment validation passed"
        return 0
    else
        log_error "Environment validation failed"
        log_info "Running diagnostics to help identify issues..."
        echo
        "$SCRIPT_DIR/diagnose-services.sh"
        return 1
    fi
}

run_service_tests_sequential() {
    log_info "=== Running Service Tests (Sequential) ==="

    local failed_services=0

    # Ingest Service Tests
    log_info "Starting Ingest Service tests..."
    if "$SCRIPT_DIR/test-ingest-service.sh"; then
        log_success "Ingest Service tests passed"
    else
        log_error "Ingest Service tests failed"
        ((failed_services++))
    fi
    echo

    # Query Service Tests
    log_info "Starting Query Service tests..."
    if "$SCRIPT_DIR/test-query-service.sh"; then
        log_success "Query Service tests passed"
    else
        log_error "Query Service tests failed"
        ((failed_services++))
    fi
    echo

    # Queue Processor Tests
    log_info "Starting Queue Processor tests..."
    if "$SCRIPT_DIR/test-queue-processor.sh"; then
        log_success "Queue Processor tests passed"
    else
        log_error "Queue Processor tests failed"
        ((failed_services++))
    fi
    echo

    if [ $failed_services -eq 0 ]; then
        log_success "All service tests passed"
        return 0
    else
        log_error "$failed_services service test(s) failed"
        return 1
    fi
}

run_service_tests_parallel() {
    log_info "=== Running Service Tests (Parallel) ==="

    # Start all service tests in background
    local pids=()
    local test_results=()

    log_info "Starting all service tests in parallel..."

    # Ingest Service
    (
        echo "INGEST_START:$(date)"
        if "$SCRIPT_DIR/test-ingest-service.sh" > "/tmp/ingest-test-$$.log" 2>&1; then
            echo "INGEST_RESULT:PASS"
        else
            echo "INGEST_RESULT:FAIL"
        fi
    ) &
    pids+=($!)

    # Query Service
    (
        echo "QUERY_START:$(date)"
        if "$SCRIPT_DIR/test-query-service.sh" > "/tmp/query-test-$$.log" 2>&1; then
            echo "QUERY_RESULT:PASS"
        else
            echo "QUERY_RESULT:FAIL"
        fi
    ) &
    pids+=($!)

    # Queue Processor
    (
        echo "QUEUE_START:$(date)"
        if "$SCRIPT_DIR/test-queue-processor.sh" > "/tmp/queue-test-$$.log" 2>&1; then
            echo "QUEUE_RESULT:PASS"
        else
            echo "QUEUE_RESULT:FAIL"
        fi
    ) &
    pids+=($!)

    # Wait for all tests to complete
    local failed_services=0

    for i in "${!pids[@]}"; do
        local pid=${pids[$i]}
        wait $pid
        local exit_code=$?

        case $i in
            0) service_name="Ingest Service" ;;
            1) service_name="Query Service" ;;
            2) service_name="Queue Processor" ;;
        esac

        if [ $exit_code -eq 0 ]; then
            log_success "$service_name tests completed successfully"
        else
            log_error "$service_name tests failed"
            ((failed_services++))
        fi
    done

    # Display test logs if there were failures
    if [ $failed_services -gt 0 ]; then
        echo
        log_info "=== Test Log Summary ==="

        for log_file in /tmp/*-test-$$.log; do
            if [ -f "$log_file" ]; then
                echo "--- $(basename "$log_file") ---"
                tail -20 "$log_file" || true
                echo
            fi
        done
    fi

    # Cleanup log files
    rm -f /tmp/*-test-$$.log 2>/dev/null || true

    if [ $failed_services -eq 0 ]; then
        log_success "All parallel service tests passed"
        return 0
    else
        log_error "$failed_services parallel service test(s) failed"
        return 1
    fi
}

run_end_to_end_tests() {
    log_info "=== Running End-to-End Tests ==="
    if "$SCRIPT_DIR/test-end-to-end.sh"; then
        log_success "End-to-end tests passed"
        return 0
    else
        log_error "End-to-end tests failed"
        return 1
    fi
}

# Progress tracking
track_progress() {
    local current_step=$1
    local total_steps=$2
    local step_name=$3

    local progress=$((current_step * 100 / total_steps))
    log_info "Progress: [$current_step/$total_steps] ($progress%) - $step_name"
}

# Main execution
main() {
    log_info "=== RAG System Test Runner ==="
    echo "Mode: $RUN_MODE"
    echo "Parallel: $PARALLEL_MODE"
    echo

    local start_time=$(date +%s)
    local total_failures=0

    case "$RUN_MODE" in
        "help"|"-h"|"--help")
            show_usage
            exit 0
            ;;

        "env")
            track_progress 1 1 "Environment Validation"
            run_environment_validation || ((total_failures++))
            ;;

        "individual"|"services")
            track_progress 1 2 "Environment Validation"
            run_environment_validation || ((total_failures++))
            echo

            track_progress 2 2 "Service Tests"
            if [ "$PARALLEL_MODE" = "true" ]; then
                run_service_tests_parallel || ((total_failures++))
            else
                run_service_tests_sequential || ((total_failures++))
            fi
            ;;

        "e2e")
            track_progress 1 2 "Environment Validation"
            run_environment_validation || ((total_failures++))
            echo

            track_progress 2 2 "End-to-End Tests"
            run_end_to_end_tests || ((total_failures++))
            ;;

        "all")
            track_progress 1 3 "Environment Validation"
            run_environment_validation || ((total_failures++))
            echo

            track_progress 2 3 "Service Tests"
            if [ "$PARALLEL_MODE" = "true" ]; then
                run_service_tests_parallel || ((total_failures++))
            else
                run_service_tests_sequential || ((total_failures++))
            fi
            echo

            track_progress 3 3 "End-to-End Tests"
            run_end_to_end_tests || ((total_failures++))
            ;;

        *)
            log_error "Unknown mode: $RUN_MODE"
            show_usage
            exit 1
            ;;
    esac

    # Final summary
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    echo
    echo "=== Test Execution Summary ==="
    echo "Mode: $RUN_MODE"
    echo "Duration: ${total_duration}s"
    echo "Failures: $total_failures"
    echo

    if [ $total_failures -eq 0 ]; then
        log_success "=== ALL TESTS PASSED! ==="
        echo "The RAG system is functioning correctly."

        # Display service URLs for reference
        echo
        echo "Tested Services:"
        echo "  Ingest Service:    $INGEST_SERVICE_URL"
        echo "  Query Service:     $QUERY_SERVICE_URL"
        echo "  Queue Processor:   $QUEUE_PROCESSOR_URL"

    else
        log_error "=== $total_failures TEST SUITE(S) FAILED ==="
        echo "Please review the test output for specific issues."
        echo
        echo "To debug issues:"
        echo "  1. Check service logs and deployment status"
        echo "  2. Verify environment configuration"
        echo "  3. Run individual test scripts for detailed output"
        echo "  4. Check network connectivity to services"

        exit 1
    fi
}

# Trap to handle interruption
trap 'log_warning "Test execution interrupted"; exit 130' INT TERM

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
