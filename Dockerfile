# =============================================================================
# Stage 1: Build UI
# =============================================================================
FROM oven/bun:1.2-alpine AS ui-builder

WORKDIR /app/ui

# Copy UI dependencies
COPY ui/package.json ui/bun.lock ./
RUN bun install --frozen-lockfile

# Copy UI source and build
COPY ui/ ./
RUN bun run build

# =============================================================================
# Stage 2: Build Server
# =============================================================================
FROM oven/bun:1.2-alpine AS server-builder

WORKDIR /app

# Copy server dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy server source
COPY src/ ./src/

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
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy server source
COPY src/ ./src/

# Copy built UI from stage 1
COPY --from=ui-builder /app/ui/dist ./ui/dist

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
