#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Dependency Cleanup Script (Phase 1: Critical Fixes)
# =============================================================================
# This script implements the CRITICAL priority items from the audit report:
#   1. Move test dependencies to devDependencies
#   2. Remove unused dependencies (joi)
#   3. Backup package.json files before changes
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${DIVE_ROOT}/.cursor/dependency-audit-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🧹 DIVE V3 Dependency Cleanup - Phase 1"
echo "========================================"
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# =============================================================================
# FRONTEND: Move test dependencies to devDependencies
# =============================================================================
echo "📦 [1/3] Frontend: Moving test dependencies..."
cd "${DIVE_ROOT}/frontend"

# Backup package.json
cp package.json "${BACKUP_DIR}/frontend-package.json.${TIMESTAMP}.bak"
echo "  ✅ Backed up to: ${BACKUP_DIR}/frontend-package.json.${TIMESTAMP}.bak"

# Read current package.json
TEST_DEPS_FRONTEND=(
    "@playwright/test"
    "@swc/jest"
    "@testing-library/jest-dom"
    "@testing-library/react"
    "@testing-library/user-event"
    "jest"
    "jest-environment-jsdom"
)

echo "  📝 Moving ${#TEST_DEPS_FRONTEND[@]} test packages to devDependencies..."

for dep in "${TEST_DEPS_FRONTEND[@]}"; do
    # Check if dependency exists in dependencies section
    if npm list --depth=0 --json 2>/dev/null | jq -e ".dependencies.\"${dep}\"" > /dev/null; then
        version=$(npm list --depth=0 --json 2>/dev/null | jq -r ".dependencies.\"${dep}\".version")
        echo "    - ${dep}@${version}"

        # Uninstall from dependencies
        npm uninstall "${dep}" --silent

        # Install as devDependency
        npm install --save-dev "${dep}@${version}" --silent
    fi
done

echo "  ✅ Frontend test dependencies moved"
echo ""

# =============================================================================
# BACKEND: Move test dependencies to devDependencies + Remove joi
# =============================================================================
echo "🔧 [2/3] Backend: Moving test dependencies and removing unused libs..."
cd "${DIVE_ROOT}/backend"

# Backup package.json
cp package.json "${BACKUP_DIR}/backend-package.json.${TIMESTAMP}.bak"
echo "  ✅ Backed up to: ${BACKUP_DIR}/backend-package.json.${TIMESTAMP}.bak"

# Test dependencies to move
TEST_DEPS_BACKEND=(
    "@types/jest"
    "@types/supertest"
    "jest"
    "supertest"
    "ts-jest"
)

echo "  📝 Moving ${#TEST_DEPS_BACKEND[@]} test packages to devDependencies..."

for dep in "${TEST_DEPS_BACKEND[@]}"; do
    if npm list --depth=0 --json 2>/dev/null | jq -e ".dependencies.\"${dep}\"" > /dev/null; then
        version=$(npm list --depth=0 --json 2>/dev/null | jq -r ".dependencies.\"${dep}\".version")
        echo "    - ${dep}@${version}"

        npm uninstall "${dep}" --silent
        npm install --save-dev "${dep}@${version}" --silent
    fi
done

# Remove joi (unused)
echo "  🗑️  Removing unused dependency: joi"
if npm list joi --depth=0 > /dev/null 2>&1; then
    npm uninstall joi --silent
    echo "    ✅ joi removed"
else
    echo "    ℹ️  joi not found (already removed)"
fi

echo "  ✅ Backend dependencies cleaned"
echo ""

# =============================================================================
# VERIFICATION
# =============================================================================
echo "✅ [3/3] Verifying changes..."

cd "${DIVE_ROOT}/frontend"
FRONTEND_TEST_IN_DEPS=$(grep -A 100 '"dependencies"' package.json | grep -E "@testing-library|jest|playwright" | wc -l || echo 0)
FRONTEND_TEST_IN_DEV=$(grep -A 100 '"devDependencies"' package.json | grep -E "@testing-library|jest|playwright" | wc -l || echo 0)

cd "${DIVE_ROOT}/backend"
BACKEND_TEST_IN_DEPS=$(grep -A 50 '"dependencies"' package.json | grep -E "@types/jest|supertest|ts-jest|jest[\"']" | wc -l || echo 0)
BACKEND_TEST_IN_DEV=$(grep -A 50 '"devDependencies"' package.json | grep -E "@types/jest|supertest|ts-jest|jest[\"']" | wc -l || echo 0)
BACKEND_HAS_JOI=$(npm list joi --depth=0 > /dev/null 2>&1 && echo "1" || echo "0")

echo ""
echo "📊 Verification Results:"
echo "  Frontend:"
echo "    - Test deps in dependencies: ${FRONTEND_TEST_IN_DEPS} (should be 0)"
echo "    - Test deps in devDependencies: ${FRONTEND_TEST_IN_DEV} (should be 7+)"
echo "  Backend:"
echo "    - Test deps in dependencies: ${BACKEND_TEST_IN_DEPS} (should be 0)"
echo "    - Test deps in devDependencies: ${BACKEND_TEST_IN_DEV} (should be 5+)"
echo "    - joi still present: ${BACKEND_HAS_JOI} (should be 0)"
echo ""

# Calculate approximate savings
echo "💾 Estimated Savings:"
echo "  - Docker image size: ~560MB reduction"
echo "  - Production node_modules: ~300MB reduction"
echo "  - Build time: ~15-20% faster"
echo ""

# =============================================================================
# NEXT STEPS
# =============================================================================
echo "🎯 Next Steps:"
echo "  1. Review changes: git diff frontend/package.json backend/package.json"
echo "  2. Test locally: npm test (in both frontend and backend)"
echo "  3. Clean deploy: ./dive nuke all --yes && ./dive hub deploy"
echo "  4. Verify images: docker images | grep dive-hub"
echo ""
echo "  Backups saved to: ${BACKUP_DIR}"
echo ""
echo "✅ Phase 1 cleanup complete!"
