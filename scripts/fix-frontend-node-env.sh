#!/usr/bin/env bash
# =============================================================================
# Quick Fix: Rebuild Frontend with Correct NODE_ENV
# =============================================================================
set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIVE_ROOT}"

echo "🔧 Quick Frontend Fix"
echo "====================="
echo ""
echo "Root Cause: docker-compose.hub.yml had NODE_ENV: development"
echo "Fix Applied: Changed to NODE_ENV: production"
echo ""

# Rebuild frontend only
echo "🔨 Rebuilding frontend container..."
docker compose -f docker-compose.hub.yml build --no-cache frontend

# Stop and remove old frontend container
echo "🗑️  Removing old frontend container..."
docker rm -f dive-hub-frontend 2>/dev/null || true

# Start new frontend
echo "🚀 Starting new frontend..."
docker compose -f docker-compose.hub.yml up -d frontend

# Wait for health
echo ""
echo "⏳ Waiting for frontend to be healthy..."
for i in {1..30}; do
  STATUS=$(docker inspect dive-hub-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "✅ Frontend is healthy!"
    break
  fi
  echo "   Status: $STATUS (attempt $i/30)"
  sleep 2
done

# Show logs
echo ""
echo "📋 Recent frontend logs:"
docker logs dive-hub-frontend --tail 20

echo ""
echo "✅ Frontend fix complete!"
echo ""
echo "Test: curl -ksf https://localhost:3000/api/health"
