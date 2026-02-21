#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Optimization (Corrects issues from first run)
# =============================================================================
# Issues found:
#   1. package.json changes weren't staged (Docker COPY got old files)
#   2. docker-compose.hub.yml still uses Dockerfile.dev (not optimized)
#   3. Need to rebuild with correct Dockerfiles
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔧 DIVE V3 Optimization Fix"
echo "============================"
echo ""

# =============================================================================
# STEP 1: Stage package.json changes
# =============================================================================
echo "📝 [1/4] Staging package.json changes for Docker build..."
cd "${DIVE_ROOT}"

# Stage the modified package files
git add frontend/package.json frontend/package-lock.json
git add backend/package.json backend/package-lock.json

echo "  ✅ Staged: frontend/package.json, frontend/package-lock.json"
echo "  ✅ Staged: backend/package.json, backend/package-lock.json"
echo ""

# Show what changed
echo "📊 Changes staged:"
echo "  Frontend test deps removed from dependencies:"
git diff --cached --stat frontend/package.json | grep -v "^$" || echo "  (no changes detected)"
echo ""
echo "  Backend test deps removed from dependencies:"
git diff --cached --stat backend/package.json | grep -v "^$" || echo "  (no changes detected)"
echo ""

# =============================================================================
# STEP 2: Update docker-compose.hub.yml to use production Dockerfiles
# =============================================================================
echo "🐳 [2/4] Updating docker-compose.hub.yml to use production Dockerfiles..."

# Backup docker-compose
cp docker-compose.hub.yml ".cursor/docker-compose.hub.yml.backup.$(date +%Y%m%d_%H%M%S)"

# Update frontend dockerfile reference
sed -i.bak 's|dockerfile: Dockerfile.dev  # Frontend|dockerfile: Dockerfile.prod  # Frontend (optimized)|g' docker-compose.hub.yml

# Update backend dockerfile reference
sed -i.bak 's|dockerfile: Dockerfile.dev  # Backend|dockerfile: Dockerfile.prod  # Backend (optimized)|g' docker-compose.hub.yml

# Generic replacement if the above didn't match
sed -i.bak 's|dockerfile: Dockerfile.dev$|dockerfile: Dockerfile.prod|g' docker-compose.hub.yml

# Remove backup file created by sed
rm -f docker-compose.hub.yml.bak

echo "  ✅ Updated docker-compose.hub.yml"
echo "  ✅ Backup saved to: .cursor/docker-compose.hub.yml.backup.*"
echo ""

# Show the changes
echo "📊 Docker-compose changes:"
grep -n "dockerfile:" docker-compose.hub.yml | grep -E "frontend|backend"
echo ""

# =============================================================================
# STEP 3: Clean rebuild
# =============================================================================
echo "🚀 [3/4] Rebuilding with optimized Dockerfiles..."
echo ""

# Nuke existing deployment
echo "  🗑️  Nuking existing deployment..."
./dive nuke all --yes > /dev/null 2>&1 || echo "  ⚠️  Nuke failed (may already be clean)"

echo "  🔨 Building optimized images..."
# Build with --no-cache to ensure fresh build
docker compose -f docker-compose.hub.yml build --no-cache frontend backend

echo ""
echo "  📦 Deploying Hub..."
./dive hub deploy

echo ""
echo "  ✅ Deployment complete"
echo ""

# =============================================================================
# STEP 4: Verification
# =============================================================================
echo "✅ [4/4] Verification..."
echo ""

# Wait for services
echo "  ⏳ Waiting 30s for services to stabilize..."
sleep 30

# Check image sizes
echo "  📊 New image sizes:"
docker images --format "  {{.Repository}}\t{{.Size}}" | grep -E "dive-hub-(frontend|backend)"
echo ""

# Health checks
echo "  🏥 Health checks:"
FRONTEND_HEALTH=$(curl -ksf https://localhost:3000/api/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
BACKEND_HEALTH=$(curl -ksf https://localhost:4000/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")
echo "    Frontend: ${FRONTEND_HEALTH}"
echo "    Backend:  ${BACKEND_HEALTH}"
echo ""

# Dependency verification
cd "${DIVE_ROOT}/frontend"
FRONTEND_TEST_DEPS=$(cat package.json | jq '[.dependencies | keys[] | select(test("test|jest|playwright|@testing"))] | length')

cd "${DIVE_ROOT}/backend"
BACKEND_TEST_DEPS=$(cat package.json | jq '[.dependencies | keys[] | select(test("test|jest|supertest"))] | length')

echo "  📋 Dependency verification:"
echo "    Frontend test deps in dependencies: ${FRONTEND_TEST_DEPS} (should be 0)"
echo "    Backend test deps in dependencies: ${BACKEND_TEST_DEPS} (should be 0)"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "=========================================="
echo "FIX COMPLETE"
echo "=========================================="
echo ""

# Get actual sizes
FRONTEND_SIZE=$(docker images dive-hub-frontend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")
BACKEND_SIZE=$(docker images dive-hub-backend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")

echo "📈 Results:"
echo "  Frontend: ${FRONTEND_SIZE} (target: ~400MB)"
echo "  Backend:  ${BACKEND_SIZE} (target: ~180MB)"
echo ""

# Check if we hit targets
if [[ "${FRONTEND_SIZE}" == *"GB"* ]]; then
    echo "⚠️  WARNING: Frontend still in GB range"
    echo "    This suggests the optimized Dockerfile may not be working correctly"
    echo "    Check: frontend/Dockerfile.prod exists and is being used"
elif [[ "${FRONTEND_SIZE}" =~ ^[0-9]+MB$ ]] && [[ ${FRONTEND_SIZE%MB} -lt 600 ]]; then
    echo "✅ SUCCESS: Frontend optimized!"
fi

if [[ "${BACKEND_SIZE}" =~ ^[0-9]+MB$ ]] && [[ ${BACKEND_SIZE%MB} -lt 300 ]]; then
    echo "✅ SUCCESS: Backend optimized!"
elif [[ "${BACKEND_SIZE}" == *"GB"* ]]; then
    echo "⚠️  WARNING: Backend still in GB range"
fi

echo ""
echo "📋 Next Steps:"
echo "  1. Review changes: git diff --cached"
echo "  2. Commit if satisfied: git commit -m 'Optimize Docker images (remove test deps, use production builds)'"
echo "  3. Test functionality thoroughly"
echo ""
