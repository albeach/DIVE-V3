# Optimized multi-stage build for DIVE V3 KAS
FROM node:20-alpine AS base
RUN apk add --no-cache curl && \
    apk cache clean

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
# Install all dependencies (including dev) for development builds
RUN npm ci --no-audit --no-fund && \
    npm cache clean --force

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install all dependencies including dev dependencies for building
RUN npm ci --no-audit --no-fund && \
    npm run build

FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 kasuser

# Copy files from builder (includes dev dependencies)
COPY --from=builder --chown=kasuser:nodejs /app/dist ./dist
COPY --from=builder --chown=kasuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=kasuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=kasuser:nodejs /app/tsconfig.json ./tsconfig.json
# Copy source for development mode
COPY --from=builder --chown=kasuser:nodejs /app/src ./src

# Create logs directory with correct permissions
RUN mkdir -p logs && \
    chown -R kasuser:nodejs /app

USER kasuser

EXPOSE 8080

ENV KAS_PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Support both development and production modes
CMD if [ "$NODE_ENV" = "development" ]; then npm run dev; else node dist/server.js; fi

