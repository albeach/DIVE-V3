# Optimized multi-stage build for DIVE V3 KAS
FROM node:20-alpine AS base
RUN apk add --no-cache curl && \
    apk cache clean

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
RUN npm run build && \
    npm prune --production && \
    npm cache clean --force

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 kasuser

# Copy only necessary files from builder
COPY --from=builder --chown=kasuser:nodejs /app/dist ./dist
COPY --from=builder --chown=kasuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=kasuser:nodejs /app/package.json ./package.json

# Create logs directory with correct permissions
RUN mkdir -p logs && \
    chown -R kasuser:nodejs /app

USER kasuser

EXPOSE 8080

ENV KAS_PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]

