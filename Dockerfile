# Stage 1: Build UI
FROM oven/bun:1 AS ui-builder
WORKDIR /app
COPY ui/package.json ui/bun.lockb* ./
COPY ui/ ./ui/
RUN cd ui && bun install --frozen-lockfile 2>/dev/null || bun install
RUN cd ui && bun run build

# Stage 2: Runtime
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lockb* ./
COPY src/ ./src/
COPY --from=ui-builder /app/ui/dist ./dist
RUN bun install --frozen-lockfile 2>/dev/null || bun install
EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
