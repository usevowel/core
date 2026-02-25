#!/bin/sh
# Start Elysia (API) and vinext (UI) in the same container.
# Elysia: 3001, vinext: 3000

set -e

# Start Elysia API in background
API_ONLY=1 API_PORT=3001 bun run src/server/index.ts &
API_PID=$!

# Wait for API to be ready
sleep 2

# Start vinext UI (blocks)
cd ui && bun run start &
UI_PID=$!

# Forward signals
trap "kill $API_PID $UI_PID 2>/dev/null; exit" INT TERM

wait
