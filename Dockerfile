# =============================================================================
# Vowel Core - Production Runtime
# =============================================================================
# This Dockerfile expects pre-built assets in the dist/ directory:
#   - dist/client/    - Client library assets
#   - dist/ui/        - Core UI build output
#   - dist/src/       - Server source code
#   - dist/package.json - Server package configuration
#
# Build locally first with: ./scripts/build.sh
# =============================================================================
FROM oven/bun:1.2-alpine

# Install curl for healthchecks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files and install production dependencies
COPY dist/package.json dist/bun.lock* ./
RUN bun install --frozen-lockfile --production --no-cache

# Copy server source
COPY dist/src/ ./src/

# Copy built UI assets
COPY dist/ui/ ./ui/dist/

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
