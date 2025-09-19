#!/bin/bash

# Deploy all RAG workers to Cloudflare
set -e

echo "🚀 Deploying RAG Workers to Cloudflare..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run: wrangler login"
    exit 1
fi

# Deploy Ingest Service
echo "📦 Deploying Ingest Service..."
cd apps/ingest-service
pnpm build
wrangler deploy
cd ../..

# Deploy Query Service
echo "📦 Deploying Query Service..."
cd apps/query-service
pnpm build
wrangler deploy
cd ../..

echo "✅ All workers deployed successfully!"
echo ""
echo "🔗 Worker URLs:"
echo "Ingest Service: https://ingest-service.your-subdomain.workers.dev"
echo "Query Service: https://query-service.your-subdomain.workers.dev"
echo ""
echo "📋 Next steps:"
echo "1. Configure your R2 bucket and Vectorize index"
echo "2. Set up your AI account and bindings"
echo "3. Test the workers with sample data"
