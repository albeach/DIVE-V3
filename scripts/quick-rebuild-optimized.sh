#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Quick Rebuild with Optimized Images
# =============================================================================
# Prerequisites (already done):
#   ✅ package.json files modified (test deps moved)
#   ✅ docker-compose.hub.yml updated (uses Dockerfile.prod)
#
# This script just does: Stage files → Nuke → Rebuild → Deploy → Verify
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 DIVE V3 Quick Rebuild (Optimized)"
echo "====================================="
echo ""

# Stage files if not already staged
echo "📝 Staging package.json files..."
cd "${DIVE_ROOT}"
git add -f frontend/package.json frontend/package-lock.json 2>/dev/null || true
git add -f backend/package.json backend/package-lock.json 2>/dev/null || true
echo "  ✅ Files staged"
echo ""

# Show what we're building with
echo "🔍 Verification before build:"
echo "  docker-compose frontend: $(grep -A 2 "  frontend:" docker-compose.hub.yml | grep dockerfile | awk '{print $2}')"
echo "  docker-compose backend:  $(grep -A 2 "  backend:" docker-compose.hub.yml | grep dockerfile | awk '{print $2}')"
echo ""

# Nuke
echo "🗑️  Nuking existing deployment..."
./dive nuke all --yes

echo ""
echo "🔨 Building optimized images (this takes ~10-15 min)..."
docker compose -f docker-compose.hub.yml build --no-cache --pull frontend backend

echo ""
echo "📦 Deploying Hub..."
./dive hub deploy

echo ""
echo "⏳ Waiting 45s for services to stabilize..."
sleep 45

echo ""
echo "✅ Verification"
echo "==============="
echo ""

# Image sizes
echo "📊 Image Sizes:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "dive-hub-(frontend|backend)|REPOSITORY"
echo ""

# Health checks
echo "🏥 Health Checks:"
FRONTEND_HEALTH=$(curl -ksf https://localhost:3000/api/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
BACKEND_HEALTH=$(curl -ksf https://localhost:4000/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
echo "  Frontend: ${FRONTEND_HEALTH}"
echo "  Backend:  ${BACKEND_HEALTH}"
echo ""

# Dependency check
echo "📋 Dependencies:"
cd "${DIVE_ROOT}/frontend"
FRONTEND_TEST=$(cat package.json | jq -r '.dependencies | keys[] | select(test("test|jest|playwright|@testing"))' 2>/dev/null | wc -l | xargs)
cd "${DIVE_ROOT}/backend"
BACKEND_TEST=$(cat package.json | jq -r '.dependencies | keys[] | select(test("test|jest|supertest"))' 2>/dev/null | wc -l | xargs)
echo "  Frontend test deps in dependencies: ${FRONTEND_TEST} (should be 0)"
echo "  Backend test deps in dependencies: ${BACKEND_TEST} (should be 0)"
echo ""

# Final results
FRONTEND_SIZE=$(docker images dive-hub-frontend:latest --format "{{.Size}}" 2>/dev/null)
BACKEND_SIZE=$(docker images dive-hub-backend:latest --format "{{.Size}}" 2>/dev/null)

echo "🎯 Final Results:"
echo "  Frontend: ${FRONTEND_SIZE}"
echo "  Backend:  ${BACKEND_SIZE}"
echo ""

# Check success
SUCCESS=true
if [[ "${FRONTEND_SIZE}" == *"GB"* ]]; then
    echo "❌ Frontend still in GB range (expected ~400MB)"
    SUCCESS=false
else
    echo "✅ Frontend optimized successfully!"
fi

if [[ "${BACKEND_SIZE}" == *"GB"* ]]; then
    echo "❌ Backend still in GB range (expected ~180MB)"
    SUCCESS=false
else
    echo "✅ Backend optimized successfully!"
fi

if [ "${FRONTEND_TEST}" != "0" ] || [ "${BACKEND_TEST}" != "0" ]; then
    echo "⚠️  Test dependencies still in dependencies section"
    SUCCESS=false
fi

echo ""
if [ "$SUCCESS" = true ]; then
    echo "🎉 OPTIMIZATION COMPLETE!"
    echo ""
    echo "Before: Frontend 5.7GB + Backend 1.02GB = 6.72GB"
    echo "After:  Frontend ${FRONTEND_SIZE} + Backend ${BACKEND_SIZE}"
    echo ""
    echo "Next: git commit -m 'Optimize Docker images (remove test deps, production builds)'"
else
    echo "⚠️  Optimization incomplete, check errors above"
fi
