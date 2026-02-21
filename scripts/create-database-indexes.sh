#!/bin/bash
#
# Create Performance-Critical Database Indexes
# Based on DIVE V3 best practices and performance requirements
#
# Usage: ./create-database-indexes.sh
#

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get MongoDB password
MONGO_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-mongo-password-usa --project=dive25 2>/dev/null || echo "")

if [[ -z "$MONGO_PASSWORD" ]]; then
    log_warning "Could not fetch from GCP, trying dive-v3-mongodb-usa..."
    MONGO_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project=dive25 2>/dev/null || echo "")
fi

if [[ -z "$MONGO_PASSWORD" ]]; then
    log_error "MongoDB password not available. Set MONGO_PASSWORD environment variable."
    exit 1
fi

log_info "========================================="
log_info "Creating MongoDB Indexes"
log_info "========================================="

# Create indexes using mongosh
docker exec dive-hub-mongodb mongosh -u admin -p "$MONGO_PASSWORD" --authenticationDatabase admin --quiet <<'MONGOEOF'
use dive-v3-hub;

print("\n📊 Creating indexes for resources collection...");

// Resources - Performance-critical indexes
db.resources.createIndex(
    { resourceId: 1 }, 
    { unique: true, name: "idx_resourceId_unique", background: true }
);
print("✅ Created unique index: resourceId");

db.resources.createIndex(
    { classification: 1 }, 
    { name: "idx_classification", background: true }
);
print("✅ Created index: classification");

db.resources.createIndex(
    { releasabilityTo: 1 }, 
    { name: "idx_releasabilityTo", background: true }
);
print("✅ Created index: releasabilityTo");

db.resources.createIndex(
    { COI: 1 }, 
    { name: "idx_coi", background: true }
);
print("✅ Created index: COI");

db.resources.createIndex(
    { creationDate: -1 }, 
    { name: "idx_creationDate", background: true }
);
print("✅ Created index: creationDate");

db.resources.createIndex(
    { encrypted: 1 }, 
    { name: "idx_encrypted", background: true }
);
print("✅ Created index: encrypted");

db.resources.createIndex(
    { originRealm: 1 }, 
    { name: "idx_originRealm", background: true }
);
print("✅ Created index: originRealm");

// Compound index for common authz queries
db.resources.createIndex(
    { classification: 1, releasabilityTo: 1 }, 
    { name: "idx_classification_releasability", background: true }
);
print("✅ Created compound index: classification + releasabilityTo");

// Text search index for resource search
db.resources.createIndex(
    { title: "text", description: "text", content: "text" },
    { name: "idx_text_search", background: true }
);
print("✅ Created text search index");

print("\n📊 Creating indexes for trustedIssuers collection...");

db.trustedIssuers.createIndex(
    { issuerUrl: 1 },
    { unique: true, name: "idx_issuerUrl_unique", background: true }
);
print("✅ Created unique index: issuerUrl");

db.trustedIssuers.createIndex(
    { tenant: 1 },
    { name: "idx_tenant", background: true }
);
print("✅ Created index: tenant");

db.trustedIssuers.createIndex(
    { country: 1 },
    { name: "idx_country", background: true }
);
print("✅ Created index: country");

db.trustedIssuers.createIndex(
    { trustLevel: 1 },
    { name: "idx_trustLevel", background: true }
);
print("✅ Created index: trustLevel");

print("\n📊 Creating indexes for auditLog collection...");

db.auditLog.createIndex(
    { timestamp: -1 },
    { name: "idx_timestamp", background: true }
);
print("✅ Created index: timestamp");

db.auditLog.createIndex(
    { "subject.uniqueID": 1, timestamp: -1 },
    { name: "idx_subject_timestamp", background: true }
);
print("✅ Created index: subject + timestamp");

db.auditLog.createIndex(
    { resourceId: 1, timestamp: -1 },
    { name: "idx_resourceId_timestamp", background: true }
);
print("✅ Created index: resourceId + timestamp");

db.auditLog.createIndex(
    { eventType: 1, timestamp: -1 },
    { name: "idx_eventType_timestamp", background: true }
);
print("✅ Created index: eventType + timestamp");

// TTL index - automatically delete logs after 90 days (ACP-240 compliance)
db.auditLog.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 7776000, name: "idx_timestamp_ttl", background: true }
);
print("✅ Created TTL index: 90-day retention");

print("\n📊 Creating indexes for federationSpokes collection...");

db.federationSpokes.createIndex(
    { spokeId: 1 },
    { unique: true, name: "idx_spokeId_unique", background: true }
);
print("✅ Created unique index: spokeId");

db.federationSpokes.createIndex(
    { instanceCode: 1 },
    { name: "idx_instanceCode", background: true }
);
print("✅ Created index: instanceCode");

db.federationSpokes.createIndex(
    { status: 1 },
    { name: "idx_status", background: true }
);
print("✅ Created index: status");

db.federationSpokes.createIndex(
    { lastHeartbeat: -1 },
    { name: "idx_lastHeartbeat", background: true }
);
print("✅ Created index: lastHeartbeat");

print("\n📊 Creating indexes for coiDefinitions collection...");

db.coiDefinitions.createIndex(
    { coiId: 1 },
    { unique: true, name: "idx_coiId_unique", background: true }
);
print("✅ Created unique index: coiId");

db.coiDefinitions.createIndex(
    { type: 1 },
    { name: "idx_type", background: true }
);
print("✅ Created index: type");

db.coiDefinitions.createIndex(
    { enabled: 1 },
    { name: "idx_enabled", background: true }
);
print("✅ Created index: enabled");

print("\n✅ MongoDB index creation complete");
MONGOEOF

log_success "MongoDB indexes created"

# ============================================
# POSTGRESQL INDEX CREATION
# ============================================

log_info ""
log_info "========================================="
log_info "Creating PostgreSQL Indexes"
log_info "========================================="

POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-postgres-password-usa --project=dive25 2>/dev/null || echo "")

if [[ -z "$POSTGRES_PASSWORD" ]]; then
    log_warning "Could not fetch from GCP, trying dive-v3-postgres-usa..."
    POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-postgres-usa --project=dive25 2>/dev/null || echo "")
fi

if [[ -z "$POSTGRES_PASSWORD" ]]; then
    log_error "PostgreSQL password not available"
    exit 1
fi

log_info "Creating indexes for NextAuth tables..."

PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" dive-hub-postgres psql -U postgres -d dive-v3-hub <<'PGEOF'
-- NextAuth accounts table
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_expires_at ON accounts(expires_at);
CREATE INDEX IF NOT EXISTS idx_accounts_provider_account ON accounts(provider, provider_account_id);

-- NextAuth sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

-- NextAuth verification_tokens table
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_token(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_token(identifier);

-- Performance query analysis
\echo ''
\echo '📊 Index Summary:'
SELECT 
    tablename, 
    indexname,
    indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('accounts', 'sessions', 'verification_token')
ORDER BY tablename, indexname;

\echo ''
\echo '✅ PostgreSQL index creation complete'
PGEOF

log_success "PostgreSQL indexes created"

# ============================================
# VERIFICATION
# ============================================

log_info ""
log_info "========================================="
log_info "Verification"
log_info "========================================="

log_info "Running index verification..."
./scripts/verify-database-indexes.sh

log_success "Index creation complete!"
