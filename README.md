# Enterprise RAG System

A comprehensive, production-ready RAG (Retrieval-Augmented Generation) system built on Cloudflare Workers using the Hono web framework. This system enables intelligent document processing, semantic search, and AI-powered query responses.

## 🏗️ System Overview

This RAG system consists of two specialized Cloudflare Workers that work together to provide enterprise-grade document intelligence:

- **Ingest Service** - Processes documents, generates embeddings, and stores them for retrieval
- **Query Service** - Handles user queries, performs semantic search, and generates AI responses with source citations

## Why a Monorepo for RAG?

Managing a complex RAG system with multiple interconnected services benefits from a monorepo approach:

- **Simplified dependency management** - `pnpm workspaces` manage dependencies across workers and shared packages. `syncpack` keeps versions consistent across the entire system.
- **Code sharing and reuse** - Common RAG logic, types, and utilities are shared between workers via the `packages/` directory. Changes to shared code are immediately available to all consumers.
- **Atomic commits** - Changes affecting multiple workers or shared libraries can be committed together, ensuring consistency across the entire RAG pipeline.
- **Consistent tooling** - Unified build, test, linting, and formatting configurations via Turborepo and shared configs ensure consistent code quality across all RAG components.
- **Streamlined CI/CD** - Single pipeline builds, tests, and deploys all RAG workers, simplifying the release process for the entire system.
- **Easier refactoring** - Refactoring RAG logic that spans multiple workers or shared packages is significantly easier within a single repository.

## 🚀 Quick Start

### Prerequisites

- Node.js v22 or later
- pnpm v10 or later
- Cloudflare account with Workers AI enabled
- Wrangler CLI installed globally
- rg (ripgrep) - optional, but recommended for shell formatting
- shfmt - optional, but recommended for shell formatting
- mise - optional, but recommended for tool management

### Setup

**1. Install Dependencies:**

```bash
just install
```

**2. Set up Cloudflare Infrastructure:**

```bash
./scripts/setup-infrastructure.sh
```

**3. Configure Environment Variables:**

Update the following in your wrangler.jsonc files:

- `VECTORIZE_INDEX_ID`: Your Vectorize index ID
- `AI_ACCOUNT_ID`: Your Cloudflare AI account ID

**4. Run Development Servers:**

```bash
# Start Ingest Service
cd apps/ingest-service && pnpm dev

# Start Query Service (in another terminal)
cd apps/query-service && pnpm dev
```

**5. Deploy All Workers:**

```bash
just deploy
```

This will deploy both RAG workers to Cloudflare.

## 📦 Repository Structure

This RAG system monorepo is organized as follows:

- `apps/` - Contains the two RAG Cloudflare Worker applications:
  - `ingest-service` - Processes documents and generates embeddings for storage
  - `query-service` - Handles user queries and generates AI responses
- `packages/` - Shared libraries, utilities, and configurations:
  - `rag-types` - Shared TypeScript types for the RAG system
  - `hono-rag-utils` - Hono utilities and middleware for RAG operations
  - `hono-helpers` - General Hono framework helpers
  - `eslint-config` - Shared ESLint configuration
  - `typescript-config` - Shared TypeScript configurations
  - `tools/` - Development scripts and CLI utilities
- `docs/` - Comprehensive documentation for the RAG system
- `scripts/` - Deployment and infrastructure setup scripts
- `turbo/` - Contains `turbo gen` templates for creating new workers
- `Justfile` - Defines convenient aliases for common development tasks
- `pnpm-workspace.yaml` - Defines the pnpm workspace structure
- `turbo.json` - Configures Turborepo build and task execution
- `.syncpackrc.cjs` - Configures `syncpack` for managing dependency versions across packages

## 🛠️ Available Commands

This repository uses a `Justfile` to provide easy access to common commands. You can explore all available commands by running `just --list`.

### Development Commands

- `just install` - Install all dependencies across the RAG system
- `just dev` - Start development server (context-aware: runs `bun runx dev`)
- `just build` - Build all RAG workers (runs `bun turbo build`)
- `just test` - Run tests for all components (runs `bun vitest`)
- `just check` - Check code quality: deps, lint, types, format (runs `bun runx check`)
- `just fix` - Fix code issues: deps, lint, format, workers-types (runs `bun runx fix`)

### RAG-Specific Commands

- `just deploy` - Deploy both RAG workers (runs `bun turbo deploy`)
- `just preview` - Run RAG workers in preview mode
- `just new-worker` (alias: `just gen`) - Generate a new Cloudflare Worker
- `just new-package` - Generate a new package for sharing code

### Maintenance Commands

- `just cs` - Create a new changeset for versioning
- `just update deps` - Update dependencies across the monorepo with syncpack
- `just update pnpm` - Update pnpm version
- `just update turbo` - Update turbo version

For a complete list of available commands, run `just` or see the [Justfile](./Justfile) for more details.

## 🔄 GitHub Actions

This repository includes GitHub Actions workflows for automated testing and deployment:

- **`branches.yml` (Branches Workflow):**
  - Triggered on pushes to any branch _except_ `main`
  - Installs dependencies with pnpm
  - Runs comprehensive checks/tests (`bun runx ci check`) for the entire RAG system

- **`release.yml` (Release Workflow):**
  - Triggered on pushes to the `main` branch
  - Contains two jobs:
    - `test-and-deploy`: Installs dependencies, runs checks/tests (`bun turbo check:ci`), and deploys both RAG workers (`bun turbo deploy`). Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
    - `create-release-pr`: Uses [Changesets](https://github.com/changesets/changesets) to create a pull request that compiles changelogs and bumps package versions.

## 📚 RAG System Documentation

For detailed information about the RAG system architecture and usage:

- [RAG System Overview](./docs/README-RAG.md) - Comprehensive guide to the RAG system
- [Ingest Service](./apps/ingest-service/README.md) - Document processing worker documentation
- [Query Service](./apps/query-service/README.md) - Query processing worker documentation

## 🔧 Development Standards

This project follows comprehensive Cloudflare Workers development standards with Hono:

- **TypeScript First**: Full type safety throughout the RAG system
- **Hono Framework**: Modern web framework for Workers
- **Zod Validation**: Request/response validation for all endpoints
- **Error Handling**: Comprehensive error management across workers
- **Testing**: Vitest with Miniflare for local testing
- **Security**: ACL enforcement and input validation for document access
