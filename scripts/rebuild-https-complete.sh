#!/usr/bin/env bash
# =============================================================================
# Complete HTTPS Rebuild - Frontend + Backend
# =============================================================================
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🔐 DIVE V3 - Full HTTPS Rebuild (mTLS-Compatible)"
echo "=================================================="
echo ""
echo "Changes:"
echo "  ✅ Frontend: NODE_ENV=production (was development)"
echo "  ✅ Backend:  https-server.js (was server.js)"
echo "  ✅ Both:     HTTPS health checks"
echo ""

# Stop frontend and backend
echo "🛑 Stopping frontend and backend..."
docker stop dive-hub-frontend dive-hub-backend 2>/dev/null || true
docker rm -f dive-hub-frontend dive-hub-backend 2>/dev/null || true

# Rebuild both with no cache
echo ""
echo "🔨 Rebuilding frontend and backend (~10-15 min)..."
docker compose -f docker-compose.hub.yml build --no-cache frontend backend

# Start backend first (frontend depends on it)
echo ""
echo "🚀 Starting backend (HTTPS)..."
docker compose -f docker-compose.hub.yml up -d backend

# Wait for backend health
echo "⏳ Waiting for backend to be healthy..."
for i in {1..60}; do
  STATUS=$(docker inspect dive-hub-backend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ Backend is healthy!"
    break
  fi
  echo "   Backend status: $STATUS (attempt $i/60)"
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Backend failed to become healthy"
  echo ""
  echo "Backend logs:"
  docker logs dive-hub-backend --tail 50
  exit 1
fi

# Start frontend
echo ""
echo "🚀 Starting frontend (HTTPS)..."
docker compose -f docker-compose.hub.yml up -d frontend

# Wait for frontend health
echo "⏳ Waiting for frontend to be healthy..."
for i in {1..60}; do
  STATUS=$(docker inspect dive-hub-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ Frontend is healthy!"
    break
  fi
  echo "   Frontend status: $STATUS (attempt $i/60)"
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Frontend failed to become healthy"
  echo ""
  echo "Frontend logs:"
  docker logs dive-hub-frontend --tail 50
  exit 1
fi

echo ""
echo "🎉 Success! Both services running with HTTPS"
echo ""
echo "📊 Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAMES|dive-hub-(frontend|backend)"

echo ""
echo "🔍 Verification:"
echo -n "   Backend (HTTPS):  "
curl -ksf https://localhost:4000/health >/dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"
echo -n "   Frontend (HTTPS): "
curl -ksf https://localhost:3000/ >/dev/null 2>&1 && echo "✅ OK" || echo "❌ FAILED"

echo ""
echo "📋 Next: Check debug logs at .cursor/debug.log"
