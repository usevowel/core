# Stage 1: Build vinext UI
FROM oven/bun:1-alpine AS ui-builder
WORKDIR /app/ui
COPY ui/package.json ui/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY ui/ ./
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine
WORKDIR /app

# Node for vinext start (vinext prod server uses node:http)
RUN apk add --no-cache nodejs

COPY package.json bun.lock* ./
COPY src/ ./src/
COPY --from=ui-builder /app/ui/dist ./ui/dist

RUN bun install --frozen-lockfile 2>/dev/null || bun install

# UI deps for vinext start
WORKDIR /app/ui
COPY ui/package.json ui/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

WORKDIR /app

EXPOSE 3000

ENV API_ONLY=1
ENV API_PORT=3001
ENV PORT=3000
ENV API_BASE_URL=http://127.0.0.1:3001

COPY scripts/docker-start.sh /app/scripts/docker-start.sh
RUN chmod +x /app/scripts/docker-start.sh

CMD ["/app/scripts/docker-start.sh"]
