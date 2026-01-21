# syntax=docker/dockerfile:1
FROM oven/bun:1-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ src/
COPY tsconfig.json ./

FROM oven/bun:1-slim

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/src src/
COPY --from=builder /app/package.json ./

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

# Environment variables (to be overridden)
ENV INOREADER_APP_ID=""
ENV INOREADER_APP_KEY=""
ENV INOREADER_ACCESS_TOKEN=""
ENV INOREADER_REFRESH_TOKEN=""

ENTRYPOINT ["bun", "run", "src/index.ts"]
