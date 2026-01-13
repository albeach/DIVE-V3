# Optimized multi-stage build for DIVE V3 Backend
FROM node:24-alpine AS base
# Install bash and essential tools for robust scripting and debugging
RUN apk add --no-cache bash curl jq ca-certificates tzdata && \
    apk cache clean

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for better layer caching
COPY package*.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Build with production optimizations
ENV NODE_ENV=production
RUN npm run build

FROM base AS deps-prod
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Docker CLI for running OPA tests via docker exec
RUN apk add --no-cache docker-cli

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# Copy only necessary files from builder and deps-prod
COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --from=builder --chown=expressjs:nodejs /app/src ./src
COPY --from=deps-prod --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=expressjs:nodejs /app/tsconfig.json ./tsconfig.json

# Create necessary directories and fix all permissions (including hidden files)
RUN mkdir -p logs uploads/idp-themes config && \
    chown -R expressjs:nodejs /app && \
    chmod -R u+rw /app

USER expressjs

EXPOSE 4000

ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]

