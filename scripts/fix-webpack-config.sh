#!/usr/bin/env bash
# =============================================================================
# Quick Frontend-Only Rebuild (Webpack Config Fix)
# =============================================================================
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🔧 Frontend Webpack Config Fix"
echo "==============================="
echo ""
echo "Issue: next.config.ts had webpack customization requiring webpack at runtime"
echo "Fix: Removed webpack config (serverExternalPackages handles postgres externalization)"
echo ""

# Stop frontend only
echo "🛑 Stopping frontend..."
docker stop dive-hub-frontend 2>/dev/null || true
docker rm -f dive-hub-frontend 2>/dev/null || true

# Rebuild frontend with no cache
echo ""
echo "🔨 Rebuilding frontend (~5 min)..."
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
    echo "❌ Frontend is unhealthy, checking logs..."
    docker logs dive-hub-frontend --tail 30
    exit 1
  fi
  echo "   Status: $STATUS (attempt $i/60)"
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Frontend failed to become healthy after 120 seconds"
  echo ""
  echo "Frontend logs:"
  docker logs dive-hub-frontend --tail 50
  exit 1
fi

echo ""
echo "✅ Success! Frontend running with HTTPS"
echo ""
echo "📊 Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAMES|frontend"

echo ""
echo "🔍 Verification:"
echo -n "   Frontend (HTTPS): "
curl -ksf https://localhost:3000/ >/dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

echo ""
echo "📋 Check debug logs: /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
