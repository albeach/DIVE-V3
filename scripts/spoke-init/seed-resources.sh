#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Resource Seeding
# =============================================================================
# Seeds sample DIVE resources into MongoDB
# Usage: ./seed-resources.sh <INSTANCE_CODE>
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

if [[ -z "$INSTANCE_CODE" ]]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
PROJECT_PREFIX="${COMPOSE_PROJECT_NAME:-$CODE_LOWER}"
container_name() {
    local service="$1"
    echo "${PROJECT_PREFIX}-${service}-1"
}
MONGODB_CONTAINER="$(container_name "mongodb-${CODE_LOWER}")"
DB_NAME="dive-v3-${CODE_LOWER}"

# Load .env for credentials
INSTANCE_DIR="instances/${CODE_LOWER}"
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    source "${INSTANCE_DIR}/.env"
fi

# Mongo connection settings (allow override via env/.env)
MONGO_HOST="${MONGO_HOST:-mongodb-${CODE_LOWER}}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USERNAME="${MONGO_USERNAME:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-${MONGO_PASSWORD_GBR:-}}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Spoke Resource Seeding                       ║"
echo "║              Instance: ${CODE_UPPER}                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Check MongoDB container
# =============================================================================
log_step "Checking MongoDB container..."

if ! docker ps --format '{{.Names}}' | grep -q "^${MONGODB_CONTAINER}$"; then
    log_error "MongoDB container '${MONGODB_CONTAINER}' is not running"
    exit 1
fi
log_success "MongoDB container running"

# =============================================================================
# Generate sample resources
# =============================================================================
log_step "Generating sample resources..."

# Create a temporary file with MongoDB commands
MONGO_SCRIPT=$(mktemp)
cat > "$MONGO_SCRIPT" << 'MONGOSCRIPT'
// Switch to the spoke database
use('DBNAME');

const now = new Date();
const instanceCode = 'CODE_UPPER';

// Sample resources with various classifications
const resources = [
    {
        resourceId: `${instanceCode.toLowerCase()}-doc-001`,
        title: `${instanceCode} Operational Briefing - Q4 2025`,
        description: 'Quarterly operational status and planning document',
        classification: 'SECRET',
        releasabilityTo: [instanceCode, 'USA', 'GBR'],
        COI: ['NATO'],
        instance: instanceCode,  // CRITICAL: Required for filtering by federation instance
        createdBy: `officer-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: false,
        contentType: 'application/pdf',
        size: 2457600
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-doc-002`,
        title: `${instanceCode} Intelligence Summary - December 2025`,
        description: 'Monthly intelligence assessment and analysis',
        classification: 'TOP_SECRET',
        releasabilityTo: [instanceCode],
        COI: ['NATO-COSMIC', 'FVEY'],
        instance: instanceCode,
        createdBy: `analyst-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        contentType: 'application/pdf',
        size: 5120000
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-doc-003`,
        title: `${instanceCode} Public Affairs Guidance`,
        description: 'Guidelines for public communications',
        classification: 'UNCLASSIFIED',
        releasabilityTo: [instanceCode, 'USA', 'GBR', 'FRA', 'DEU', 'CAN'],
        COI: [],
        instance: instanceCode,
        createdBy: `admin-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: false,
        contentType: 'application/pdf',
        size: 512000
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-doc-004`,
        title: `${instanceCode} Coalition Exercise Plan - ATLANTIC RESOLVE`,
        description: 'Joint exercise planning documentation',
        classification: 'SECRET',
        releasabilityTo: [instanceCode, 'USA', 'GBR', 'DEU', 'CAN', 'FRA'],
        COI: ['NATO'],
        instance: instanceCode,
        createdBy: `officer-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: false,
        contentType: 'application/pdf',
        size: 3145728
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-doc-005`,
        title: `${instanceCode} Cybersecurity Threat Assessment`,
        description: 'Current cyber threat landscape analysis',
        classification: 'SECRET',
        releasabilityTo: [instanceCode, 'USA', 'GBR'],
        COI: ['FVEY'],
        instance: instanceCode,
        createdBy: `analyst-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        contentType: 'application/pdf',
        size: 1048576
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-fuel-001`,
        title: `${instanceCode} Fuel Inventory Report - NATO Base`,
        description: 'Current fuel stock levels and consumption rates',
        classification: 'CONFIDENTIAL',
        releasabilityTo: [instanceCode, 'USA', 'GBR', 'DEU'],
        COI: ['NATO'],
        instance: instanceCode,
        createdBy: `officer-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: false,
        contentType: 'application/json',
        size: 65536,
        metadata: {
            fuelType: 'JP-8',
            currentStock: 250000,
            unit: 'gallons',
            location: `${instanceCode}-NATO-BASE-01`
        }
    },
    {
        resourceId: `${instanceCode.toLowerCase()}-personnel-001`,
        title: `${instanceCode} Personnel Roster - Classified`,
        description: 'Current personnel assignments and contact information',
        classification: 'SECRET',
        releasabilityTo: [instanceCode],
        COI: [],
        instance: instanceCode,
        createdBy: `admin-${instanceCode.toLowerCase()}`,
        createdAt: now,
        updatedAt: now,
        encrypted: true,
        contentType: 'application/json',
        size: 204800
    }
];

// Insert resources (upsert to avoid duplicates)
let inserted = 0;
let updated = 0;

resources.forEach(resource => {
    const result = db.resources.updateOne(
        { resourceId: resource.resourceId },
        { $set: resource },
        { upsert: true }
    );
    if (result.upsertedCount > 0) {
        inserted++;
        print(`  ✓ Inserted: ${resource.resourceId}`);
    } else if (result.modifiedCount > 0) {
        updated++;
        print(`  ↻ Updated: ${resource.resourceId}`);
    } else {
        print(`  - Unchanged: ${resource.resourceId}`);
    }
});

print(`\n  Summary: ${inserted} inserted, ${updated} updated`);
MONGOSCRIPT

# Replace placeholders
sed -i.bak "s/DBNAME/${DB_NAME}/g" "$MONGO_SCRIPT"
sed -i.bak "s/CODE_UPPER/${CODE_UPPER}/g" "$MONGO_SCRIPT"
rm -f "${MONGO_SCRIPT}.bak"

# Get MongoDB credentials from .env
MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASS="${MONGO_PASSWORD:-}"

if [[ -z "$MONGO_PASS" ]]; then
    log_warn "MONGO_PASSWORD not set, trying without auth"
    docker exec -i "$MONGODB_CONTAINER" mongosh --quiet "${DB_NAME}" < "$MONGO_SCRIPT" 2>/dev/null
else
    # Execute with authentication
    docker exec -i "$MONGODB_CONTAINER" mongosh --quiet \
        "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/${DB_NAME}?authSource=admin" < "$MONGO_SCRIPT" 2>/dev/null
fi

# Cleanup
rm -f "$MONGO_SCRIPT"

log_success "Resources seeded"

# =============================================================================
# Verify
# =============================================================================
log_step "Verifying seeded resources..."

COUNT=$(docker exec "$MONGODB_CONTAINER" mongosh --quiet --eval "
    use('${DB_NAME}');
    db.resources.countDocuments();
" 2>/dev/null)

log_success "Total resources in database: ${COUNT}"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Resource Seeding Complete                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Database: ${DB_NAME}                                    ║"
echo "║  Resources: ${COUNT} documents                                    ║"
echo "║                                                              ║"
echo "║  Sample Resources:                                           ║"
echo "║    - Operational Briefings (SECRET)                          ║"
echo "║    - Intelligence Summaries (TOP_SECRET)                     ║"
echo "║    - Public Affairs (UNCLASSIFIED)                           ║"
echo "║    - Exercise Plans (SECRET/NATO)                            ║"
echo "║    - Fuel Inventory (CONFIDENTIAL)                           ║"
echo "║    - Personnel Roster (SECRET)                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_success "Spoke initialization complete!"
log_info "Your ${CODE_UPPER} spoke is ready to use."

