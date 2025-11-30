FROM node:20-alpine AS base

# Install curl for health checks (required for Docker health check commands)
# Best practice: Use proper HTTP client instead of BusyBox wget workarounds
RUN apk add --no-cache curl

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 kasuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p logs
RUN chown -R kasuser:nodejs /app

USER kasuser

EXPOSE 8080

ENV KAS_PORT=8080

CMD ["node", "dist/server.js"]

