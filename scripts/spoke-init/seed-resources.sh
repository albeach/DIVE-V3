#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Resource Seeding
# =============================================================================
# Seeds 5000 sample DIVE resources into MongoDB with even distribution
# across classifications, releasability, and COIs
# Usage: ./seed-resources.sh <INSTANCE_CODE>
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"
RESOURCE_COUNT="${2:-5000}"  # Allow override, default 5000

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
    echo "Usage: $0 <INSTANCE_CODE> [RESOURCE_COUNT]"
    echo "  RESOURCE_COUNT defaults to 5000"
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
echo "║              Resources: ${RESOURCE_COUNT}                                 ║"
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
# Generate 5000 sample resources with even distribution
# =============================================================================
log_step "Generating ${RESOURCE_COUNT} sample resources (this may take a moment)..."

# Create a temporary file with MongoDB commands
MONGO_SCRIPT=$(mktemp)
cat > "$MONGO_SCRIPT" << 'MONGOSCRIPT'
// Switch to the spoke database
use('DBNAME');

const now = new Date();
const instanceCode = 'CODE_UPPER';
const totalResources = RESOURCE_COUNT;

// =============================================================================
// ATTRIBUTE POOLS FOR EVEN DISTRIBUTION
// =============================================================================

// Classifications (4 levels - will be evenly distributed)
const classifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

// Releasability combinations (10 patterns)
const releasabilityPatterns = [
    [instanceCode],                                           // Instance only
    [instanceCode, 'USA'],                                    // Bilateral with USA
    [instanceCode, 'USA', 'GBR'],                            // Three eyes
    [instanceCode, 'USA', 'GBR', 'CAN', 'AUS', 'NZL'],       // Five Eyes
    [instanceCode, 'USA', 'GBR', 'DEU'],                     // NATO core
    [instanceCode, 'USA', 'GBR', 'FRA', 'DEU', 'CAN'],       // Extended NATO
    [instanceCode, 'USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP'], // NATO expanded
    ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],                     // FVEY only (not instance)
    [instanceCode, 'FRA', 'DEU'],                            // EU partners
    [instanceCode, 'USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'CAN', 'NLD', 'BEL'] // Wide NATO
];

// COI patterns (8 patterns)
const coiPatterns = [
    [],                          // No COI
    ['NATO'],                    // NATO only
    ['FVEY'],                    // Five Eyes
    ['NATO-COSMIC'],             // NATO Cosmic
    ['NATO', 'FVEY'],            // NATO + FVEY
    ['NATO-COSMIC', 'FVEY'],     // High security
    ['EU-RESTRICTED'],           // EU specific
    ['AUKUS']                    // AUKUS
];

// Document types (10 types)
const documentTypes = [
    { prefix: 'doc', title: 'Operational Document', contentType: 'application/pdf', category: 'operations' },
    { prefix: 'intel', title: 'Intelligence Report', contentType: 'application/pdf', category: 'intelligence' },
    { prefix: 'fuel', title: 'Fuel Inventory Report', contentType: 'application/json', category: 'logistics' },
    { prefix: 'personnel', title: 'Personnel Record', contentType: 'application/json', category: 'hr' },
    { prefix: 'cyber', title: 'Cybersecurity Assessment', contentType: 'application/pdf', category: 'cyber' },
    { prefix: 'comms', title: 'Communications Log', contentType: 'text/plain', category: 'communications' },
    { prefix: 'exercise', title: 'Exercise Plan', contentType: 'application/pdf', category: 'training' },
    { prefix: 'supply', title: 'Supply Chain Report', contentType: 'application/json', category: 'logistics' },
    { prefix: 'threat', title: 'Threat Assessment', contentType: 'application/pdf', category: 'intelligence' },
    { prefix: 'policy', title: 'Policy Document', contentType: 'application/pdf', category: 'governance' }
];

// Topic variations (20 topics)
const topics = [
    'Q4 2025 Status', 'December Assessment', 'Weekly Update', 'Monthly Summary',
    'Annual Review', 'Quarterly Brief', 'Emergency Protocol', 'Standard Procedure',
    'Training Manual', 'Reference Guide', 'Compliance Report', 'Audit Findings',
    'Risk Analysis', 'Strategic Plan', 'Tactical Brief', 'Operational Order',
    'Mission Report', 'After Action Review', 'Lessons Learned', 'Best Practices'
];

// Creators pool
const creators = [
    `officer-${instanceCode.toLowerCase()}`,
    `analyst-${instanceCode.toLowerCase()}`,
    `admin-${instanceCode.toLowerCase()}`,
    `commander-${instanceCode.toLowerCase()}`,
    `intel-${instanceCode.toLowerCase()}`
];

// =============================================================================
// GENERATE RESOURCES
// =============================================================================

print(`\n  Generating ${totalResources} resources with even distribution...\n`);

const resources = [];
const perClassification = Math.floor(totalResources / classifications.length);
let resourceIndex = 0;

// Generate evenly across classifications
for (let classIdx = 0; classIdx < classifications.length; classIdx++) {
    const classification = classifications[classIdx];
    const startIdx = classIdx * perClassification;
    const endIdx = (classIdx === classifications.length - 1) ? totalResources : startIdx + perClassification;
    
    for (let i = startIdx; i < endIdx; i++) {
        resourceIndex++;
        
        // Cycle through other attributes
        const docType = documentTypes[i % documentTypes.length];
        const releasability = releasabilityPatterns[i % releasabilityPatterns.length];
        const coi = coiPatterns[i % coiPatterns.length];
        const topic = topics[i % topics.length];
        const creator = creators[i % creators.length];
        
        // Determine encryption (TOP_SECRET and SECRET with COSMIC are encrypted)
        const encrypted = classification === 'TOP_SECRET' || 
                         (classification === 'SECRET' && coi.includes('NATO-COSMIC'));
        
        // Generate realistic file size based on type
        const baseSize = {
            'application/pdf': 1048576,    // 1MB base
            'application/json': 65536,     // 64KB base
            'text/plain': 32768            // 32KB base
        }[docType.contentType] || 524288;
        const size = Math.floor(baseSize * (0.5 + Math.random() * 2)); // 50% to 250% of base
        
        // Create date variation (within last 365 days)
        const createdDate = new Date(now.getTime() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000));
        
        const resource = {
            resourceId: `${instanceCode.toLowerCase()}-${docType.prefix}-${String(resourceIndex).padStart(5, '0')}`,
            title: `${instanceCode} ${docType.title} - ${topic}`,
            description: `${docType.category.charAt(0).toUpperCase() + docType.category.slice(1)} document for ${instanceCode} operations`,
            classification: classification,
            releasabilityTo: releasability,
            COI: coi,
            instance: instanceCode,
            createdBy: creator,
            createdAt: createdDate,
            updatedAt: now,
            encrypted: encrypted,
            contentType: docType.contentType,
            size: size,
            category: docType.category,
            tags: [docType.category, classification.toLowerCase(), instanceCode.toLowerCase()]
        };
        
        resources.push(resource);
    }
}

// =============================================================================
// BULK INSERT WITH PROGRESS
// =============================================================================

print(`  Classification distribution:`);
print(`    - UNCLASSIFIED:  ${resources.filter(r => r.classification === 'UNCLASSIFIED').length}`);
print(`    - CONFIDENTIAL:  ${resources.filter(r => r.classification === 'CONFIDENTIAL').length}`);
print(`    - SECRET:        ${resources.filter(r => r.classification === 'SECRET').length}`);
print(`    - TOP_SECRET:    ${resources.filter(r => r.classification === 'TOP_SECRET').length}`);
print('');

// Drop existing resources and insert fresh
print(`  Clearing existing resources...`);
db.resources.deleteMany({ instance: instanceCode });

print(`  Inserting ${resources.length} resources in batches...`);

const batchSize = 500;
let totalInserted = 0;

for (let i = 0; i < resources.length; i += batchSize) {
    const batch = resources.slice(i, i + batchSize);
    const result = db.resources.insertMany(batch, { ordered: false });
    totalInserted += result.insertedCount;
    
    const progress = Math.floor((i + batch.length) / resources.length * 100);
    print(`    Progress: ${progress}% (${totalInserted} inserted)`);
}

// Create indexes for performance
print(`\n  Creating indexes...`);
db.resources.createIndex({ resourceId: 1 }, { unique: true });
db.resources.createIndex({ instance: 1 });
db.resources.createIndex({ classification: 1 });
db.resources.createIndex({ 'releasabilityTo': 1 });
db.resources.createIndex({ 'COI': 1 });
db.resources.createIndex({ category: 1 });
db.resources.createIndex({ createdAt: -1 });

print(`\n  ✓ Successfully seeded ${totalInserted} resources`);

// Print distribution summary
print('\n  Document type distribution:');
const typeCounts = {};
resources.forEach(r => {
    const type = r.resourceId.split('-')[1];
    typeCounts[type] = (typeCounts[type] || 0) + 1;
});
Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    print(`    - ${type}: ${count}`);
});
MONGOSCRIPT

# Replace placeholders
sed -i.bak "s/DBNAME/${DB_NAME}/g" "$MONGO_SCRIPT"
sed -i.bak "s/CODE_UPPER/${CODE_UPPER}/g" "$MONGO_SCRIPT"
sed -i.bak "s/RESOURCE_COUNT/${RESOURCE_COUNT}/g" "$MONGO_SCRIPT"
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

if [[ -z "$MONGO_PASS" ]]; then
    COUNT=$(docker exec "$MONGODB_CONTAINER" mongosh --quiet --eval "
        use('${DB_NAME}');
        db.resources.countDocuments();
    " 2>/dev/null | tail -1)
else
    COUNT=$(docker exec "$MONGODB_CONTAINER" mongosh --quiet \
        "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/${DB_NAME}?authSource=admin" --eval "
        db.resources.countDocuments();
    " 2>/dev/null | tail -1)
fi

log_success "Total resources in database: ${COUNT}"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Resource Seeding Complete                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Database: ${DB_NAME}                                    ║"
echo "║  Resources: ${COUNT} documents                               ║"
echo "║                                                              ║"
echo "║  Distribution (even across):                                 ║"
echo "║    - 4 Classification levels (1250 each)                     ║"
echo "║    - 10 Releasability patterns                               ║"
echo "║    - 8 COI combinations                                      ║"
echo "║    - 10 Document types                                       ║"
echo "║    - 20 Topic variations                                     ║"
echo "║                                                              ║"
echo "║  Indexes created for query performance                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_success "Spoke resource seeding complete!"
log_info "Your ${CODE_UPPER} spoke now has ${COUNT} resources."
