# Vowel Core

Self-hosted token service + Web UI for the vowel platform. Ephemeral token minting for sndbrd, OpenAI Realtime, and Grok Realtime. Create apps, API keys, and generate tokens.

**No auth. No billing. No Convex.** Single Docker container.

## Quick Start

```bash
bun install
cd ui && bun install
cd .. && bun run db:init
bun run dev          # Elysia API (standalone, serves built UI if present)
bun run dev:ui      # vinext dev server (UI only, proxies /api/* to API)
```

For full dev with hot reload: run `bun run dev:api` (API on 3001) and `bun run dev:ui` (UI on 3000). Or build UI once and use Elysia standalone:

```bash
bun run build       # Build vinext UI to ui/dist
bun run dev         # Elysia serves API + static UI
```

Or run both dev servers concurrently from one command:

```bash
bun run dev:stack
```

Open http://localhost:3000

## Docker

```bash
docker compose up --build
```

Runs Elysia (API on 3001) + vinext (UI on 3000) in one container. vinext proxies `/api/*` and `/vowel/api/*` to Elysia.

## Tests

```bash
bun test
```

## Cloudflare Tunnel

For local dev with a public URL (e.g. WebSocket testing):

```bash
bun run dev:tunnel
```

This starts Core API + UI in dev mode and immediately starts the Cloudflare tunnel.
If API or UI are already running, `dev:tunnel` will reuse them and avoid
starting duplicate dev processes.
Requires `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. See `docs/CLOUDFLARE_TUNNEL.md`.

Environment options:

```bash
bun run dev:tunnel:testing   # uses testing-core.vowel.to
bun run dev:tunnel:dev       # uses core-dev.vowel.to
bun run dev:tunnel:staging   # uses staging-core.vowel.to
bun run dev:tunnel:production # uses core.vowel.to (requires caution)
```

## Environment

See `.env.example` for required variables.

## Plan

See [.ai/plans/february-2026/core-self-hosted/](../../.ai/plans/february-2026/core-self-hosted/) in the platform repo.
