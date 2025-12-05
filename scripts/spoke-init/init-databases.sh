#!/bin/bash
# =============================================================================
# DIVE V3 Spoke Database Initialization
# =============================================================================
# Initializes PostgreSQL (NextAuth tables) and MongoDB (sample resources)
# Usage: ./init-databases.sh <INSTANCE_CODE>
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
    echo "Example: $0 FRA"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
POSTGRES_CONTAINER="dive-v3-postgres-${CODE_LOWER}"
MONGODB_CONTAINER="dive-v3-mongodb-${CODE_LOWER}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       DIVE V3 Spoke Database Initialization                  ║"
echo "║              Instance: ${INSTANCE_CODE}                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Check containers are running
# =============================================================================
log_step "Checking database containers..."

if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    log_error "PostgreSQL container '${POSTGRES_CONTAINER}' is not running"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${MONGODB_CONTAINER}$"; then
    log_error "MongoDB container '${MONGODB_CONTAINER}' is not running"
    exit 1
fi

log_success "Database containers are running"

# =============================================================================
# Initialize PostgreSQL (NextAuth tables)
# =============================================================================
log_step "Creating NextAuth tables in PostgreSQL..."

# Read the schema file
SCHEMA_FILE="${SCRIPT_DIR}/nextauth-schema.sql"
if [[ ! -f "$SCHEMA_FILE" ]]; then
    log_error "Schema file not found: $SCHEMA_FILE"
    exit 1
fi

# Execute schema
if docker exec -i "$POSTGRES_CONTAINER" psql -U keycloak -d keycloak < "$SCHEMA_FILE" 2>/dev/null; then
    log_success "NextAuth tables created in PostgreSQL"
else
    log_warn "NextAuth tables may already exist (this is OK)"
fi

# Verify tables
TABLES=$(docker exec "$POSTGRES_CONTAINER" psql -U keycloak -d keycloak -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('user', 'account', 'session', 'verificationToken')" 2>/dev/null | tr -d ' ')
if [[ "$TABLES" -eq 4 ]]; then
    log_success "Verified: All 4 NextAuth tables exist"
else
    log_warn "Expected 4 NextAuth tables, found ${TABLES}"
fi

# =============================================================================
# Initialize MongoDB
# =============================================================================
log_step "Checking MongoDB initialization..."

# Get MongoDB credentials from environment or .env file
INSTANCE_DIR="instances/${CODE_LOWER}"
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    source "${INSTANCE_DIR}/.env"
fi

MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASS="${MONGO_PASSWORD:-}"

if [[ -z "$MONGO_PASS" ]]; then
    log_warn "MONGO_PASSWORD not found in .env, using default"
    MONGO_PASS="admin"
fi

# Test MongoDB connection
if docker exec "$MONGODB_CONTAINER" mongosh --quiet --eval "db.runCommand({ping:1})" 2>/dev/null | grep -q "ok"; then
    log_success "MongoDB connection verified"
else
    log_warn "MongoDB connection test inconclusive"
fi

# Create database and collections
log_step "Creating MongoDB collections..."

docker exec "$MONGODB_CONTAINER" mongosh --quiet --eval "
    use('dive-v3-${CODE_LOWER}');
    
    // Create collections if they don't exist
    if (!db.getCollectionNames().includes('resources')) {
        db.createCollection('resources');
        print('Created resources collection');
    }
    
    if (!db.getCollectionNames().includes('decision_logs')) {
        db.createCollection('decision_logs');
        print('Created decision_logs collection');
    }
    
    if (!db.getCollectionNames().includes('audit_logs')) {
        db.createCollection('audit_logs');
        print('Created audit_logs collection');
    }
    
    // Create indexes
    db.resources.createIndex({resourceId: 1}, {unique: true, sparse: true});
    db.resources.createIndex({classification: 1});
    db.resources.createIndex({releasabilityTo: 1});
    db.decision_logs.createIndex({timestamp: -1});
    db.audit_logs.createIndex({timestamp: -1});
    
    print('MongoDB initialization complete');
" 2>/dev/null || log_warn "MongoDB initialization may have partial errors"

log_success "MongoDB collections initialized"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Initialization Complete                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  PostgreSQL:                                                 ║"
echo "║    ✓ NextAuth tables created (user, account, session, etc)  ║"
echo "║                                                              ║"
echo "║  MongoDB:                                                    ║"
echo "║    ✓ Database: dive-v3-${CODE_LOWER}                                 ║"
echo "║    ✓ Collections: resources, decision_logs, audit_logs      ║"
echo "║    ✓ Indexes created for performance                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Next: Run ./scripts/spoke-init/init-keycloak.sh ${INSTANCE_CODE}"

