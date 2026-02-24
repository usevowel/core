# Vowel Core

Self-hosted token service + Web UI for the vowel platform. Ephemeral token minting for sndbrd, OpenAI Realtime, and Grok Realtime. Create apps, API keys, and generate tokens.

**No auth. No billing. No Convex.** Single Docker container.

## Quick Start

```bash
bun install
bun run db:init
bun run dev
```

Open http://localhost:3000

## Docker

```bash
docker compose up --build
```

## Environment

See `.env.example` for required variables.

## Plan

See [.ai/plans/february-2026/core-self-hosted/](../../.ai/plans/february-2026/core-self-hosted/) in the platform repo.
