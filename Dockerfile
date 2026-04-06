# =============================================================================
# Stage 1: Build Client Library
# =============================================================================
FROM oven/bun:1.2-alpine AS client-builder

WORKDIR /app/client

# Copy client dependencies
COPY client/package.json ./
RUN bun install --no-cache

# Copy client source and build
COPY client/ ./
RUN bun run build

# =============================================================================
# Stage 2: Build UI
# =============================================================================
FROM oven/bun:1.2-alpine AS ui-builder

WORKDIR /app/core/ui

# Copy built client from stage 1
COPY --from=client-builder /app/client /app/client

# Copy UI dependencies
COPY core/ui/package.json core/ui/bun.lock ./
RUN bun install --frozen-lockfile --no-cache

# Copy UI source and build
COPY core/ui/ ./
RUN bun run build

# =============================================================================
# Stage 2: Build Server
# =============================================================================
FROM oven/bun:1.2-alpine AS server-builder

WORKDIR /app/core

# Copy server dependencies
COPY core/package.json core/bun.lock ./
RUN bun install --frozen-lockfile --no-cache

# Copy server source
COPY core/src/ ./src/

# Build server (optional, for type checking)
# RUN bun run build:server

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
FROM oven/bun:1.2-alpine

# Install curl for healthchecks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY core/package.json core/bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production --no-cache

# Copy server source
COPY core/src/ ./src/

# Copy built UI from stage 1
COPY --from=ui-builder /app/core/ui/dist ./ui/dist

# Create data directory
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/core.db

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["bun", "run", "src/server/index.ts"]
