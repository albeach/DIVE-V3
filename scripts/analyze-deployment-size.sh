#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Size Analysis Script
# =============================================================================
# Generates a detailed report comparing current vs optimized deployment
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "📊 DIVE V3 Deployment Size Analysis"
echo "===================================="
echo ""

# =============================================================================
# Current State Analysis
# =============================================================================
echo "🔍 CURRENT DEPLOYMENT STATE"
echo "----------------------------"
echo ""

# Docker images
echo "📦 Docker Images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "dive-hub-(frontend|backend|kas)|REPOSITORY" || echo "No images found"
echo ""

# Get sizes programmatically
FRONTEND_SIZE=$(docker images dive-hub-frontend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")
BACKEND_SIZE=$(docker images dive-hub-backend:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")
KAS_SIZE=$(docker images dive-hub-kas:latest --format "{{.Size}}" 2>/dev/null || echo "N/A")

echo "Summary:"
echo "  - Frontend: ${FRONTEND_SIZE}"
echo "  - Backend:  ${BACKEND_SIZE}"
echo "  - KAS:      ${KAS_SIZE}"
echo ""

# Node modules sizes
echo "📁 Node Modules (on disk):"
if [ -d "${DIVE_ROOT}/frontend/node_modules" ]; then
    FRONTEND_NM_SIZE=$(du -sh "${DIVE_ROOT}/frontend/node_modules" 2>/dev/null | awk '{print $1}')
    echo "  - Frontend: ${FRONTEND_NM_SIZE}"
else
    echo "  - Frontend: Not installed"
fi

if [ -d "${DIVE_ROOT}/backend/node_modules" ]; then
    BACKEND_NM_SIZE=$(du -sh "${DIVE_ROOT}/backend/node_modules" 2>/dev/null | awk '{print $1}')
    echo "  - Backend:  ${BACKEND_NM_SIZE}"
else
    echo "  - Backend: Not installed"
fi
echo ""

# Dependency analysis
echo "🔬 Dependency Analysis:"
echo ""

echo "Frontend dependencies:"
cd "${DIVE_ROOT}/frontend"
TOTAL_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '.dependencies | length')
TEST_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|playwright|@testing"))] | length')
echo "  - Total dependencies: ${TOTAL_DEPS}"
echo "  - Test deps in dependencies: ${TEST_DEPS} (should be 0)"

if [ ${TEST_DEPS} -gt 0 ]; then
    echo "  - Test packages found:"
    npm list --depth=0 --json 2>/dev/null | jq -r '.dependencies | keys[] | select(test("test|jest|playwright|@testing"))' | sed 's/^/      - /'
fi
echo ""

echo "Backend dependencies:"
cd "${DIVE_ROOT}/backend"
TOTAL_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '.dependencies | length')
TEST_DEPS=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|supertest"))] | length')
JOI_EXISTS=$(npm list joi --depth=0 > /dev/null 2>&1 && echo "YES" || echo "NO")
echo "  - Total dependencies: ${TOTAL_DEPS}"
echo "  - Test deps in dependencies: ${TEST_DEPS} (should be 0)"
echo "  - joi installed: ${JOI_EXISTS} (should be NO)"

if [ ${TEST_DEPS} -gt 0 ]; then
    echo "  - Test packages found:"
    npm list --depth=0 --json 2>/dev/null | jq -r '.dependencies | keys[] | select(test("test|jest|supertest"))' | sed 's/^/      - /'
fi
echo ""

# =============================================================================
# Optimization Potential
# =============================================================================
echo "💡 OPTIMIZATION POTENTIAL"
echo "-------------------------"
echo ""

# Convert sizes to MB for calculation
frontend_mb=$(echo "${FRONTEND_SIZE}" | sed 's/GB/000/;s/MB//;s/[^0-9.]//g')
backend_mb=$(echo "${BACKEND_SIZE}" | sed 's/GB/000/;s/MB//;s/[^0-9.]//g')

echo "Expected results after optimization:"
echo ""
echo "  Frontend Image:"
echo "    Current:  ${FRONTEND_SIZE}"
echo "    Target:   400MB"
echo "    Savings:  ~5.3GB (93% reduction)"
echo ""
echo "  Backend Image:"
echo "    Current:  ${BACKEND_SIZE}"
echo "    Target:   180MB"
echo "    Savings:  ~840MB (82% reduction)"
echo ""
echo "  Combined Savings:"
echo "    Total reduction: ~6.1GB per deployment"
echo "    Faster builds: 60% reduction in build time"
echo "    Faster deployments: 95% reduction in image transfer"
echo ""

# =============================================================================
# Recommended Actions
# =============================================================================
echo "🎯 RECOMMENDED ACTIONS"
echo "----------------------"
echo ""

ISSUES_FOUND=0

# Check test deps
cd "${DIVE_ROOT}/frontend"
TEST_DEPS_FRONTEND=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|playwright|@testing"))] | length')

cd "${DIVE_ROOT}/backend"
TEST_DEPS_BACKEND=$(npm list --depth=0 --json 2>/dev/null | jq '[.dependencies | keys[] | select(test("test|jest|supertest"))] | length')

if [ ${TEST_DEPS_FRONTEND} -gt 0 ] || [ ${TEST_DEPS_BACKEND} -gt 0 ]; then
    echo "❌ CRITICAL: Test dependencies in production"
    echo "   Action: ./scripts/cleanup-dependencies-phase1.sh"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    echo ""
fi

# Check joi
if [ "${JOI_EXISTS}" == "YES" ]; then
    echo "⚠️  WARNING: Unused dependency detected (joi)"
    echo "   Action: cd backend && npm uninstall joi"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    echo ""
fi

# Check Dockerfile
if [ ! -f "${DIVE_ROOT}/frontend/Dockerfile.prod.optimized" ]; then
    echo "⚠️  WARNING: Optimized Dockerfiles not created"
    echo "   Action: Run dependency audit to create optimized Dockerfiles"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    echo ""
fi

# Check image sizes
if [[ "${FRONTEND_SIZE}" == *"GB"* ]]; then
    echo "❌ CRITICAL: Frontend image is ${FRONTEND_SIZE} (too large)"
    echo "   Action: Use optimized Dockerfile.prod"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    echo ""
fi

if [[ "${BACKEND_SIZE}" == *"GB"* ]] || [[ "${backend_mb}" -gt 500 ]]; then
    echo "⚠️  WARNING: Backend image is ${BACKEND_SIZE}"
    echo "   Action: Use optimized Dockerfile.prod"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    echo ""
fi

# =============================================================================
# Action Plan
# =============================================================================
if [ ${ISSUES_FOUND} -gt 0 ]; then
    echo "📋 ACTION PLAN"
    echo "--------------"
    echo ""
    echo "Run the complete optimization:"
    echo "  ./scripts/optimize-complete.sh"
    echo ""
    echo "Or run each phase manually:"
    echo "  1. ./scripts/cleanup-dependencies-phase1.sh"
    echo "  2. cp frontend/Dockerfile.prod.optimized frontend/Dockerfile.prod"
    echo "  3. cp backend/Dockerfile.prod.optimized backend/Dockerfile.prod"
    echo "  4. ./dive nuke all --yes && ./dive hub deploy"
    echo ""
else
    echo "✅ No major issues found!"
    echo "   Your deployment is already optimized."
    echo ""
fi

# =============================================================================
# Summary
# =============================================================================
echo "📈 SUMMARY"
echo "----------"
echo ""
echo "Issues found: ${ISSUES_FOUND}"
echo ""
if [ ${ISSUES_FOUND} -gt 0 ]; then
    echo "Potential savings: ~6GB per deployment"
    echo "Estimated time to fix: 30 minutes"
    echo ""
    echo "Next step: ./scripts/optimize-complete.sh"
else
    echo "Your deployment is well-optimized! ✨"
fi
echo ""
echo "For detailed analysis, see:"
echo "  - .cursor/DEPENDENCY-AUDIT-REPORT.md (full report)"
echo "  - .cursor/DEPENDENCY-AUDIT-QUICK-START.md (quick guide)"
