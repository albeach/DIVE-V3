#!/usr/bin/env bash
# =============================================================================
# ⚠️  DEPRECATED - DO NOT USE ⚠️
# =============================================================================
# This script creates NON-ZTDF resources which violates ACP-240 compliance.
#
# SSOT (Single Source of Truth) for hub seeding:
#   ./dive hub seed [count]
#
# Which uses:
#   - scripts/dive-modules/hub/seed.sh (hub_seed function)
#   - backend/src/scripts/seed-instance-resources.ts (ZTDF-compliant)
#
# This legacy script will be removed in a future version.
# =============================================================================
# DIVE V3 Hub Resource Seeding Script (LEGACY)
#
# Purpose: Seed sample resources into the Hub MongoDB with proper distribution
#          across classification levels for ABAC testing
#
# Usage: ./seed-hub-resources.sh [resource_count]
# =============================================================================

echo ""
echo "⚠️  WARNING: This script is DEPRECATED and creates NON-ZTDF resources!"
echo ""
echo "   Use the SSOT instead:"
echo "   ./dive hub seed [count]"
echo ""
echo "   Continuing in 5 seconds... (Ctrl+C to abort)"
sleep 5

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_info()  { echo -e "${CYAN}ℹ${NC} $1"; }

# Configuration
RESOURCE_COUNT="${1:-200}"
MONGO_CONTAINER="${MONGO_CONTAINER:-dive-hub-mongodb}"
DB_NAME="${DB_NAME:-dive-v3}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Hub Resource Seeding                         ║"
echo "║              Resources: ${RESOURCE_COUNT}                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Check MongoDB Container
# =============================================================================
log_step "Checking MongoDB container..."

if ! docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    log_error "MongoDB container '${MONGO_CONTAINER}' is not running"
    exit 1
fi
log_success "MongoDB container running"

# Get MongoDB password
MONGO_PASS=$(docker exec ${MONGO_CONTAINER} printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
if [ -z "$MONGO_PASS" ]; then
    log_warn "Could not get MongoDB password, trying without auth"
    MONGO_AUTH=""
else
    MONGO_AUTH="mongodb://admin:${MONGO_PASS}@localhost:27017/${DB_NAME}?authSource=admin"
fi

# =============================================================================
# Seed Resources
# =============================================================================
log_step "Seeding ${RESOURCE_COUNT} resources..."

docker exec ${MONGO_CONTAINER} mongosh --quiet "${MONGO_AUTH}" --eval "
// Classifications and releasability patterns
const classifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
const releasabilityPatterns = [
    ['USA'],
    ['USA', 'GBR'],
    ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
    ['USA', 'GBR', 'FRA', 'DEU'],
    ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'NOR', 'DNK', 'BEL', 'ALB']
];
const coiPatterns = [[], ['NATO'], ['FVEY'], ['NATO', 'FVEY']];
const docTypes = ['intel', 'ops', 'fuel', 'logistics', 'comms'];

// Generate resources
const resources = [];
const resourceCount = ${RESOURCE_COUNT};

for (let i = 0; i < resourceCount; i++) {
    const classification = classifications[i % 4];
    const releasability = releasabilityPatterns[i % 5];
    const coi = coiPatterns[i % 4];
    const docType = docTypes[i % 5];

    resources.push({
        resourceId: 'usa-' + docType + '-' + String(i).padStart(4, '0'),
        title: docType.charAt(0).toUpperCase() + docType.slice(1) + ' Report ' + i,
        classification: classification,
        releasabilityTo: releasability,
        COI: coi,
        instance: 'USA',
        encrypted: i % 10 === 0,
        contentType: 'application/pdf',
        category: docType,
        createdAt: new Date(),
        updatedAt: new Date()
    });
}

// Clear existing and insert
db.resources.deleteMany({});
const result = db.resources.insertMany(resources);

// Create indexes
db.resources.createIndex({ resourceId: 1 }, { unique: true });
db.resources.createIndex({ classification: 1 });
db.resources.createIndex({ releasabilityTo: 1 });
db.resources.createIndex({ COI: 1 });

// Report
print('');
print('Resources seeded:');
print('  UNCLASSIFIED: ' + db.resources.countDocuments({classification: 'UNCLASSIFIED'}));
print('  CONFIDENTIAL: ' + db.resources.countDocuments({classification: 'CONFIDENTIAL'}));
print('  SECRET: ' + db.resources.countDocuments({classification: 'SECRET'}));
print('  TOP_SECRET: ' + db.resources.countDocuments({classification: 'TOP_SECRET'}));
print('  Total: ' + db.resources.countDocuments());
" 2>/dev/null

log_success "Resources seeded"

echo ""
log_success "Hub resource seeding complete!"
echo ""
