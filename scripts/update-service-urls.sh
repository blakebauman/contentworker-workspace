#!/bin/bash

# Script to update service URLs in test scripts to use edgeprocure domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Updating service URLs to use contentworker.io domain..."

# Update default URLs in environment script
if [ -f "$SCRIPT_DIR/test-environment.sh" ]; then
    echo "✓ Updated test-environment.sh"
fi

# Set the edgeprocure URLs as defaults
export INGEST_SERVICE_URL="https://ingest.contentworker.io"
export QUERY_SERVICE_URL="https://query.contentworker.io"
export QUEUE_PROCESSOR_URL="https://queue.contentworker.io"

echo "✓ Updated environment variables"
echo ""
echo "Service URLs are now set to:"
echo "  Ingest Service:    $INGEST_SERVICE_URL"
echo "  Query Service:     $QUERY_SERVICE_URL"
echo "  Queue Processor:   $QUEUE_PROCESSOR_URL"
echo ""
echo "To make these permanent, add these to your shell profile:"
echo "export INGEST_SERVICE_URL=\"$INGEST_SERVICE_URL\""
echo "export QUERY_SERVICE_URL=\"$QUERY_SERVICE_URL\""
echo "export QUEUE_PROCESSOR_URL=\"$QUEUE_PROCESSOR_URL\""
