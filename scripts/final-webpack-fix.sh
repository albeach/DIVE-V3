#!/usr/bin/env bash
# =============================================================================
# Final Fix: Remove --webpack Flag and Rebuild
# =============================================================================
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🔧 Final Webpack Fix"
echo "===================="
echo ""
echo "Root Cause: 'next build --webpack' flag forces webpack at runtime"
echo "Fix Applied:"
echo "  1. Removed webpack config from next.config.ts"
echo "  2. Removed --webpack flag from build command"
echo ""

# Stop frontend
echo "🛑 Stopping frontend..."
docker stop dive-hub-frontend 2>/dev/null || true
docker rm -f dive-hub-frontend 2>/dev/null || true

# Rebuild with no cache
echo ""
echo "🔨 Rebuilding frontend (~5-7 min)..."
docker compose -f docker-compose.hub.yml build --no-cache frontend

# Start frontend
echo ""
echo "🚀 Starting frontend..."
docker compose -f docker-compose.hub.yml up -d frontend

# Wait for health
echo "⏳ Waiting for frontend to be healthy..."
for i in {1..60}; do
  STATUS=$(docker inspect dive-hub-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ Frontend is healthy!"
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "⚠️  Frontend unhealthy at attempt $i, checking logs..."
    docker logs dive-hub-frontend --tail 10
  fi
  echo "   Status: $STATUS (attempt $i/60)"
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Frontend failed to become healthy"
  echo ""
  echo "Full logs:"
  docker logs dive-hub-frontend
  exit 1
fi

echo ""
echo "🎉 SUCCESS! Frontend running with HTTPS"
echo ""
echo "📊 Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}" | grep -E "NAMES|frontend"

echo ""
echo "🔍 Verification:"
curl -ksf https://localhost:3000/ >/dev/null 2>&1 && echo "✅ Frontend HTTPS: OK" || echo "❌ Frontend HTTPS: FAILED"

echo ""
echo "📋 Debug logs: /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
