#!/bin/bash

# Set up Cloudflare infrastructure for RAG workers
set -e

echo "🏗️ Setting up Cloudflare infrastructure for RAG workers..."

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

# Create R2 bucket for documents
echo "📦 Creating R2 bucket for documents..."
wrangler r2 bucket create rag-documents || echo "Bucket may already exist"

# Create Vectorize index
echo "🔍 Creating Vectorize index for embeddings..."
wrangler vectorize create rag-embeddings \
  --dimensions=768 \
  --metric=cosine \
  --description="RAG embeddings index" || echo "Index may already exist"

# Get account ID
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
echo "Account ID: $ACCOUNT_ID"

# Create AI binding (this needs to be done manually in the dashboard)
echo "🤖 AI binding needs to be configured manually:"
echo "1. Go to https://dash.cloudflare.com/ai/workers-ai"
echo "2. Enable Workers AI for your account"
echo "3. Update wrangler.jsonc files with your account ID: $ACCOUNT_ID"

echo ""
echo "✅ Infrastructure setup complete!"
echo ""
echo "📋 Manual steps required:"
echo "1. Enable Workers AI in the Cloudflare dashboard"
echo "2. Update VECTORIZE_INDEX_ID and AI_ACCOUNT_ID in wrangler.jsonc files"
echo "3. Run ./scripts/deploy-all.sh to deploy the workers"
