#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Complete Optimization Implementation Script
# =============================================================================
# This script runs the complete dependency optimization:
#   Phase 1: Clean up package.json (test deps, unused libs)
#   Phase 2: Build optimized production images
#   Phase 3: Deploy and validate
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${DIVE_ROOT}/.cursor/optimization-log.txt"

echo "🚀 DIVE V3 Complete Optimization Pipeline"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Clean up dependencies (move test deps, remove unused)"
echo "  2. Build optimized production Docker images"
echo "  3. Deploy with new images"
echo "  4. Validate and report results"
echo ""

# Prompt for confirmation
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Create log file
echo "📝 Logging to: ${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo ""
echo "⏱️  Started at: $(date)"
echo ""

# =============================================================================
# PHASE 1: Dependency Cleanup
# =============================================================================
echo "=========================================="
echo "PHASE 1: Dependency Cleanup"
echo "=========================================="
echo ""

if [ -f "${DIVE_ROOT}/scripts/cleanup-dependencies-phase1.sh" ]; then
    bash "${DIVE_ROOT}/scripts/cleanup-dependencies-phase1.sh"
else
    echo "⚠️  cleanup-dependencies-phase1.sh not found, skipping..."
fi

echo ""
echo "✅ Phase 1 complete"
echo ""

# =============================================================================
# PHASE 2: Build Optimized Images
# =============================================================================
echo "=========================================="
echo "PHASE 2: Build Optimized Production Images"
echo "=========================================="
echo ""

# Record sizes before
echo "📊 Image sizes BEFORE optimization:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "dive-hub-(frontend|backend)|REPOSITORY" || echo "No existing images"
echo ""

# Backup current Dockerfiles
echo "💾 Backing up current Dockerfiles..."
cp "${DIVE_ROOT}/frontend/Dockerfile" "${DIVE_ROOT}/frontend/Dockerfile.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
cp "${DIVE_ROOT}/backend/Dockerfile" "${DIVE_ROOT}/backend/Dockerfile.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true

# Use optimized Dockerfiles
echo "🔄 Switching to optimized Dockerfiles..."
if [ -f "${DIVE_ROOT}/frontend/Dockerfile.prod.optimized" ]; then
    cp "${DIVE_ROOT}/frontend/Dockerfile.prod.optimized" "${DIVE_ROOT}/frontend/Dockerfile.prod"
    echo "  ✅ Frontend: Dockerfile.prod.optimized → Dockerfile.prod"
fi

if [ -f "${DIVE_ROOT}/backend/Dockerfile.prod.optimized" ]; then
    cp "${DIVE_ROOT}/backend/Dockerfile.prod.optimized" "${DIVE_ROOT}/backend/Dockerfile.prod"
    echo "  ✅ Backend: Dockerfile.prod.optimized → Dockerfile.prod"
fi

echo ""

# =============================================================================
# PHASE 3: Clean Deployment
# =============================================================================
echo "=========================================="
echo "PHASE 3: Clean Deployment"
echo "=========================================="
echo ""

echo "🗑️  Nuking existing deployment..."
./dive nuke all --yes || echo "⚠️  Nuke failed (might be already clean)"

echo ""
echo "🚀 Deploying Hub with optimized images..."
./dive hub deploy

echo ""
echo "✅ Phase 3 complete"
echo ""

# =============================================================================
# PHASE 4: Validation & Report
# =============================================================================
echo "=========================================="
echo "PHASE 4: Validation & Results"
echo "=========================================="
echo ""

# Wait for deployment to stabilize
echo "⏳ Waiting 30s for deployment to stabilize..."
sleep 30

# Check running containers
echo "📦 Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}" | grep -E "dive-hub|NAMES"
echo ""

# Image sizes after
echo "📊 Image sizes AFTER optimization:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "dive-hub-(frontend|backend)|REPOSITORY"
echo ""

# Calculate total sizes
FRONTEND_SIZE_BEFORE="5.7GB"
BACKEND_SIZE_BEFORE="1.02GB"

FRONTEND_SIZE_AFTER=$(docker images dive-hub-frontend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")
BACKEND_SIZE_AFTER=$(docker images dive-hub-backend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")

echo "📈 Optimization Results:"
echo "  Frontend: ${FRONTEND_SIZE_BEFORE} → ${FRONTEND_SIZE_AFTER}"
echo "  Backend:  ${BACKEND_SIZE_BEFORE} → ${BACKEND_SIZE_AFTER}"
echo ""

# Health checks
echo "🏥 Health checks:"
echo "  Frontend: $(curl -ksf https://localhost:3000/api/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")"
echo "  Backend:  $(curl -ksf https://localhost:4000/health > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Failed")"
echo ""

# Dependency verification
cd "${DIVE_ROOT}/frontend"
FRONTEND_TEST_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|playwright"))] | length')
cd "${DIVE_ROOT}/backend"
BACKEND_TEST_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|supertest"))] | length')
BACKEND_HAS_JOI=$(npm list joi --depth=0 > /dev/null 2>&1 && echo "1" || echo "0")

echo "✅ Dependency verification:"
echo "  Frontend test deps in dependencies: ${FRONTEND_TEST_DEPS} (should be 0)"
echo "  Backend test deps in dependencies: ${BACKEND_TEST_DEPS} (should be 0)"
echo "  Backend has joi: ${BACKEND_HAS_JOI} (should be 0)"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "=========================================="
echo "OPTIMIZATION COMPLETE"
echo "=========================================="
echo ""
echo "⏱️  Completed at: $(date)"
echo ""
echo "📋 Next Steps:"
echo "  1. Review deployment: docker ps"
echo "  2. Check logs: docker logs dive-hub-frontend"
echo "  3. Test functionality: ./scripts/test-endpoints.sh"
echo "  4. Review audit report: .cursor/DEPENDENCY-AUDIT-REPORT.md"
echo ""
echo "📄 Full log saved to: ${LOG_FILE}"
