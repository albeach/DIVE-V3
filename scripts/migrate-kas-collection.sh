#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - MongoDB KAS Registry Migration
# =============================================================================
# Purpose: Rename kas_registry to kas_servers for consistency
# Usage:   ./scripts/migrate-kas-collection.sh [hub|SPOKE_CODE]
# Example: ./scripts/migrate-kas-collection.sh hub
#          ./scripts/migrate-kas-collection.sh nzl
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GCP_PROJECT="dive25"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✅${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠️${NC} $1"; }
log_error() { echo -e "${RED}❌${NC} $1"; }

# =============================================================================
# FUNCTIONS
# =============================================================================

migrate_instance() {
    local INSTANCE=$1
    local instance_lower
    instance_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

    log_info "Migrating KAS registry for ${INSTANCE}..."

    # Get MongoDB password from GCP
    if [ "$INSTANCE" = "hub" ]; then
        MONGO_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project="${GCP_PROJECT}" 2>/dev/null)
        CONTAINER_NAME="dive-hub-mongodb"
        DB_NAME="dive-v3"
    else
        MONGO_PASSWORD=$(gcloud secrets versions access latest --secret="dive-v3-mongodb-${instance_lower}" --project="${GCP_PROJECT}" 2>/dev/null)
        CONTAINER_NAME="dive-spoke-${instance_lower}-mongodb"
        DB_NAME="dive-v3-${instance_lower}"
    fi

    if [ -z "$MONGO_PASSWORD" ]; then
        log_error "Could not retrieve MongoDB password from GCP"
        return 1
    fi

    # Check if container is running
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        log_error "MongoDB container not running: $CONTAINER_NAME"
        log_info "Start the instance first: ./dive ${INSTANCE} up"
        return 1
    fi

    log_info "Checking current collections..."

    # Check if old collection exists
    OLD_EXISTS=$(docker exec "$CONTAINER_NAME" mongosh \
        "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
        --quiet --eval "db.getCollectionNames().includes('kas_registry')" 2>/dev/null || echo "false")

    # Check if new collection exists
    NEW_EXISTS=$(docker exec "$CONTAINER_NAME" mongosh \
        "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
        --quiet --eval "db.getCollectionNames().includes('kas_servers')" 2>/dev/null || echo "false")

    if [ "$OLD_EXISTS" = "true" ] && [ "$NEW_EXISTS" = "false" ]; then
        log_info "Renaming kas_registry → kas_servers..."

        docker exec "$CONTAINER_NAME" mongosh \
            "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
            --quiet --eval "db.kas_registry.renameCollection('kas_servers')" >/dev/null 2>&1

        if [ $? -eq 0 ]; then
            log_success "Collection renamed successfully"

            # Verify document count
            DOC_COUNT=$(docker exec "$CONTAINER_NAME" mongosh \
                "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
                --quiet --eval "db.kas_servers.countDocuments()" 2>/dev/null)

            log_info "Documents migrated: $DOC_COUNT"
            return 0
        else
            log_error "Failed to rename collection"
            return 1
        fi

    elif [ "$NEW_EXISTS" = "true" ]; then
        log_success "Collection kas_servers already exists"

        DOC_COUNT=$(docker exec "$CONTAINER_NAME" mongosh \
            "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
            --quiet --eval "db.kas_servers.countDocuments()" 2>/dev/null)

        log_info "Documents in kas_servers: $DOC_COUNT"

        if [ "$OLD_EXISTS" = "true" ]; then
            log_warn "Both kas_registry and kas_servers exist!"
            log_warn "Manual cleanup may be needed"
        fi
        return 0

    elif [ "$OLD_EXISTS" = "false" ] && [ "$NEW_EXISTS" = "false" ]; then
        log_warn "Neither kas_registry nor kas_servers collection exists"
        log_info "This is normal for a fresh deployment"
        return 0
    fi
}

verify_migration() {
    local INSTANCE=$1
    local instance_lower
    instance_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

    log_info "Verifying migration for ${INSTANCE}..."

    # Get MongoDB password
    if [ "$INSTANCE" = "hub" ]; then
        MONGO_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project="${GCP_PROJECT}" 2>/dev/null)
        CONTAINER_NAME="dive-hub-mongodb"
        DB_NAME="dive-v3"
    else
        MONGO_PASSWORD=$(gcloud secrets versions access latest --secret="dive-v3-mongodb-${instance_lower}" --project="${GCP_PROJECT}" 2>/dev/null)
        CONTAINER_NAME="dive-spoke-${instance_lower}-mongodb"
        DB_NAME="dive-v3-${instance_lower}"
    fi

    # Get sample document
    SAMPLE=$(docker exec "$CONTAINER_NAME" mongosh \
        "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/${DB_NAME}?authSource=admin" \
        --quiet --eval "JSON.stringify(db.kas_servers.findOne())" 2>/dev/null)

    if [ -n "$SAMPLE" ] && [ "$SAMPLE" != "null" ]; then
        log_success "Migration verified - kas_servers collection is accessible"
        echo "$SAMPLE" | jq '.' 2>/dev/null || echo "$SAMPLE"
        return 0
    else
        log_warn "No documents found in kas_servers collection"
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

COMMAND=${1:-help}

case "$COMMAND" in
    hub)
        migrate_instance "hub"
        verify_migration "hub"
        ;;

    verify)
        INSTANCE=${2:-hub}
        verify_migration "$INSTANCE"
        ;;

    all)
        log_info "Migrating ALL instances (hub + spokes)..."

        migrate_instance "hub"

        # Get list of running spoke containers
        SPOKES=$(docker ps --format '{{.Names}}' | grep "dive-spoke-.*-mongodb" | sed 's/dive-spoke-//' | sed 's/-mongodb//' | tr '\n' ' ')

        for spoke in $SPOKES; do
            SPOKE_UPPER=$(echo "$spoke" | tr '[:lower:]' '[:upper:]')
            migrate_instance "$SPOKE_UPPER"
        done

        log_success "All migrations complete!"
        ;;

    help|--help|-h)
        cat << EOF
DIVE V3 - MongoDB KAS Registry Migration

Purpose: Rename kas_registry collection to kas_servers for consistency

Usage:
  ./scripts/migrate-kas-collection.sh hub              Migrate hub
  ./scripts/migrate-kas-collection.sh nzl              Migrate NZL spoke
  ./scripts/migrate-kas-collection.sh all              Migrate all running instances
  ./scripts/migrate-kas-collection.sh verify [INST]    Verify migration

Examples:
  ./scripts/migrate-kas-collection.sh hub
  ./scripts/migrate-kas-collection.sh nzl
  ./scripts/migrate-kas-collection.sh all
  ./scripts/migrate-kas-collection.sh verify hub

What it does:
  1. Checks if kas_registry collection exists
  2. Renames it to kas_servers
  3. Verifies document count
  4. Non-destructive (safe to run multiple times)

EOF
        ;;

    *)
        # Assume it's a spoke code
        SPOKE_UPPER=$(echo "$COMMAND" | tr '[:lower:]' '[:upper:]')
        migrate_instance "$SPOKE_UPPER"
        verify_migration "$SPOKE_UPPER"
        ;;
esac

# sc2034-anchor
: "${DIVE_ROOT:-}"
