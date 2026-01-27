#!/usr/bin/env bash
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🔧 Quick Fix: Remove Instrumentation Before require('next')"
echo "=========================================================="
echo ""

docker stop dive-hub-frontend 2>/dev/null || true
docker rm -f dive-hub-frontend 2>/dev/null || true

echo "🔨 Rebuilding..."
docker compose -f docker-compose.hub.yml build --no-cache frontend

echo "🚀 Starting..."
docker compose -f docker-compose.hub.yml up -d frontend

echo "⏳ Waiting 60s..."
for i in {1..30}; do
  STATUS=$(docker inspect dive-hub-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ HEALTHY!"
    exit 0
  fi
  echo "   $STATUS (attempt $i/30)"
  sleep 2
done

echo "❌ Failed"
docker logs dive-hub-frontend --tail 50
exit 1
