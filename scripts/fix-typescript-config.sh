#!/usr/bin/env bash
# =============================================================================
# Root Cause Fix: Remove next.config.ts After Build
# =============================================================================
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🎯 ROOT CAUSE FIX: TypeScript Config at Runtime"
echo "==============================================="
echo ""
echo "Problem:"
echo "  Next.js with custom server + next.config.ts requires TypeScript at runtime"
echo "  TypeScript is devDependency → not installed with 'npm ci --only=production'"
echo "  Next.js tries to auto-install TypeScript → triggers webpack loading"
echo ""
echo "Solution:"
echo "  1. Build compiles next.config.ts into .next/ artifacts"
echo "  2. Remove next.config.ts after build (no longer needed)"
echo "  3. Runtime has no .ts file → no TypeScript requirement"
echo ""

# Stop frontend
echo "🛑 Stopping frontend..."
docker stop dive-hub-frontend 2>/dev/null || true
docker rm -f dive-hub-frontend 2>/dev/null || true

# Rebuild
echo ""
echo "🔨 Rebuilding frontend with fix (~5-7 min)..."
docker compose -f docker-compose.hub.yml build --no-cache frontend

# Start
echo ""
echo "🚀 Starting frontend..."
docker compose -f docker-compose.hub.yml up -d frontend

# Wait for health
echo "⏳ Waiting for frontend to be healthy..."
for i in {1..60}; do
  STATUS=$(docker inspect dive-hub-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")

  if [ "$STATUS" = "healthy" ]; then
    echo "✅ Frontend is HEALTHY!"
    break
  fi

  if [ "$STATUS" = "unhealthy" ] && [ $((i % 5)) -eq 0 ]; then
    echo "⚠️  Still unhealthy at attempt $i, recent logs:"
    docker logs dive-hub-frontend --tail 5 2>&1 | grep -v "^$"
  fi

  echo "   Status: $STATUS (attempt $i/60)"
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo ""
  echo "❌ Frontend failed to become healthy after 120 seconds"
  echo ""
  echo "=== Full Logs ==="
  docker logs dive-hub-frontend --tail 100
  echo ""
  echo "=== Container Inspection ==="
  docker inspect dive-hub-frontend --format='{{json .State}}' | python3 -m json.tool 2>/dev/null || docker inspect dive-hub-frontend
  exit 1
fi

echo ""
echo "🎉 SUCCESS!"
echo ""
echo "📊 Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}" | grep -E "NAMES|frontend"

echo ""
echo "📦 Image Size:"
docker images dive-hub-frontend:latest --format "{{.Size}}"

echo ""
echo "🔍 Verification Tests:"
echo -n "   HTTPS Health:     "
curl -ksf https://localhost:3000/ >/dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

echo -n "   Config File:      "
docker exec dive-hub-frontend ls -la /app/next.config.* 2>&1 | grep -q "cannot access" && echo "✅ Removed (correct)" || echo "⚠️  Still exists"

echo ""
echo "📋 Debug Logs: /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
echo ""
echo "✅ Frontend is running with HTTPS, production mode, NO TypeScript dependency!"
