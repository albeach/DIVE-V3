#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Initialize NextAuth Database Schema
# =============================================================================
# Creates the required PostgreSQL tables for NextAuth.js session management
# Must be run AFTER Keycloak is healthy (shared PostgreSQL database)
# =============================================================================

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Get instance code from argument
INSTANCE_CODE="${1:-}"
if [ -z "$INSTANCE_CODE" ]; then
    log_error "Usage: $0 <INSTANCE_CODE>"
    exit 1
fi

CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')

log_info "Initializing NextAuth database schema for ${CODE_UPPER}..."

# Determine container name
if [ "$CODE_UPPER" = "USA" ]; then
    POSTGRES_CONTAINER="dive-hub-postgres"
else
    POSTGRES_CONTAINER="dive-spoke-${CODE_LOWER}-postgres"
fi

# Check if container exists
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    log_error "PostgreSQL container '${POSTGRES_CONTAINER}' not found or not running"
    exit 1
fi

# Wait for PostgreSQL to be ready
log_info "Waiting for PostgreSQL to be ready..."
for _i in {1..30}; do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U keycloak -d keycloak >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Create NextAuth tables using heredoc with proper SQL
log_info "Creating NextAuth tables..."

docker exec -i "$POSTGRES_CONTAINER" psql -U keycloak -d keycloak << 'EOSQL'
-- =============================================================================
-- NextAuth.js Database Schema for PostgreSQL
-- =============================================================================
-- Required tables: user, account, session, verificationToken
-- Uses gen_random_uuid() for automatic UUID generation
-- =============================================================================

-- User table: Stores authenticated user profiles
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
    email TEXT,
    "emailVerified" TIMESTAMP,
    image TEXT
);

-- Account table: Links OAuth providers to users
CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    UNIQUE(provider, "providerAccountId")
);

-- Session table: Database-backed sessions
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionToken" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL,
    expires TIMESTAMP NOT NULL
);

-- Verification token table: Email verification
CREATE TABLE IF NOT EXISTS "verificationToken" (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    PRIMARY KEY(identifier, token)
);

-- Add foreign key constraints (if not exists)
DO $$ BEGIN
    ALTER TABLE account ADD CONSTRAINT account_userId_fkey
        FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE session ADD CONSTRAINT session_userId_fkey
        FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS account_userId_idx ON account("userId");
CREATE INDEX IF NOT EXISTS session_userId_idx ON session("userId");
CREATE INDEX IF NOT EXISTS session_sessionToken_idx ON session("sessionToken");

EOSQL

if [ $? -eq 0 ]; then
    log_success "NextAuth database schema created for ${CODE_UPPER}"
else
    log_error "Failed to create NextAuth database schema"
    exit 1
fi

# Verify tables exist
log_info "Verifying NextAuth tables..."
TABLES=$(docker exec "$POSTGRES_CONTAINER" psql -U keycloak -d keycloak -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('user', 'account', 'session', 'verificationToken')")
TABLES=$(echo "$TABLES" | tr -d ' ')

if [ "$TABLES" -ge 4 ]; then
    log_success "All NextAuth tables verified (${TABLES}/4)"
else
    log_warn "Only ${TABLES}/4 NextAuth tables found"
fi

# sc2034-anchor
: "${DIVE_ROOT:-}"
