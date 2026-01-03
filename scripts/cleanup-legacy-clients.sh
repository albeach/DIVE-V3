#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Legacy Client Cleanup Script
# =============================================================================
# Purpose: Remove deprecated dive-v3-client-* clients from all Keycloak instances
#
# These legacy clients use the OLD naming pattern:
#   - dive-v3-client-{instance}
#   - dive-v3-client-broker-{instance}
#
# The CORRECT naming pattern (SSOT) is:
#   - dive-v3-broker-{instance}    (main app client)
#   - dive-v3-cross-border-client  (cross-border federation)
#
# Usage:
#   ./scripts/cleanup-legacy-clients.sh [--dry-run] [--instance CODE]
#
# Options:
#   --dry-run     Show what would be deleted without actually deleting
#   --instance    Only clean up a specific instance (e.g., USA, FRA, POL)
#   --force       Skip confirmation prompts
#
# Examples:
#   ./scripts/cleanup-legacy-clients.sh --dry-run
#   ./scripts/cleanup-legacy-clients.sh --instance FRA
#   ./scripts/cleanup-legacy-clients.sh --force
# =============================================================================

# Don't use set -e as we want to continue on errors for individual instances
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Options
DRY_RUN=false
FORCE=false
TARGET_INSTANCE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --instance|-i)
            TARGET_INSTANCE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
            shift 2
            ;;
        -h|--help)
            head -40 "$0" | tail -35
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Banner
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}              DIVE V3 - Legacy Client Cleanup Script${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}🔍 DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

# =============================================================================
# Functions
# =============================================================================

get_admin_token() {
    local container="$1"
    local password=""

    # Try different password sources
    password=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n') || true
    if [ -z "$password" ]; then
        password=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n') || true
    fi

    if [ -z "$password" ]; then
        log_error "Could not get admin password for $container"
        return 1
    fi

    local token=$(docker exec "$container" curl -sf -X POST \
        "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${password}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Could not get admin token for $container"
        return 1
    fi

    echo "$token"
}

get_legacy_clients() {
    local container="$1"
    local token="$2"
    local realm="$3"

    docker exec "$container" curl -sf -H "Authorization: Bearer ${token}" \
        "http://localhost:8080/admin/realms/${realm}/clients" 2>/dev/null | \
        jq -r '.[] | select(.clientId | test("^dive-v3-client-")) | "\(.id)|\(.clientId)"'
}

delete_client() {
    local container="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"
    local client_id="$5"

    if [ "$DRY_RUN" = true ]; then
        log_warn "Would delete: $client_id (UUID: $client_uuid)"
        return 0
    fi

    local http_code=$(docker exec "$container" curl -sf -o /dev/null -w "%{http_code}" \
        -X DELETE -H "Authorization: Bearer ${token}" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}" 2>/dev/null)

    if [ "$http_code" = "204" ] || [ "$http_code" = "200" ]; then
        log_success "Deleted: $client_id"
        return 0
    else
        log_error "Failed to delete $client_id (HTTP $http_code)"
        return 1
    fi
}

cleanup_instance() {
    local container="$1"
    local realm="$2"
    local instance_code="$3"

    echo ""
    echo -e "${BOLD}────────────────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BOLD}Instance: $instance_code (Container: $container, Realm: $realm)${NC}"
    echo -e "${BOLD}────────────────────────────────────────────────────────────────────────────${NC}"

    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "Container $container is not running, skipping"
        return 0
    fi

    # Get admin token
    local token=$(get_admin_token "$container")
    if [ -z "$token" ]; then
        return 1
    fi

    # Get legacy clients
    local legacy_clients=$(get_legacy_clients "$container" "$token" "$realm")

    if [ -z "$legacy_clients" ]; then
        log_success "No legacy clients found"
        return 0
    fi

    # Process each legacy client
    local deleted=0
    local failed=0

    while IFS='|' read -r uuid client_id; do
        if [ -n "$uuid" ] && [ -n "$client_id" ]; then
            if delete_client "$container" "$token" "$realm" "$uuid" "$client_id"; then
                ((deleted++))
            else
                ((failed++))
            fi
        fi
    done <<< "$legacy_clients"

    if [ "$DRY_RUN" = true ]; then
        log_info "Would delete $deleted legacy client(s)"
    else
        log_info "Deleted $deleted legacy client(s), $failed failed"
    fi

    return 0
}

# =============================================================================
# Main
# =============================================================================

# Confirmation prompt (unless --force or --dry-run)
if [ "$DRY_RUN" != true ] && [ "$FORCE" != true ]; then
    echo -e "${YELLOW}This script will DELETE legacy Keycloak clients.${NC}"
    echo ""
    echo "Legacy clients to be removed:"
    echo "  - dive-v3-client-{instance}"
    echo "  - dive-v3-client-broker-{instance}"
    echo ""
    read -p "Are you sure you want to continue? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
    fi
fi

# Track totals
total_deleted=0
total_failed=0

# =============================================================================
# Hub (USA)
# =============================================================================
if [ -z "$TARGET_INSTANCE" ] || [ "$TARGET_INSTANCE" = "USA" ]; then
    cleanup_instance "dive-hub-keycloak" "dive-v3-broker-usa" "USA"
fi

# =============================================================================
# Spokes (all running spoke containers)
# =============================================================================
spoke_containers=$(docker ps --format '{{.Names}}' 2>/dev/null | grep 'dive-spoke-.*-keycloak' || true)

if [ -n "$spoke_containers" ]; then
    while read -r container; do
        if [ -n "$container" ]; then
            # Extract instance code from container name (e.g., dive-spoke-fra-keycloak -> FRA)
            instance_code=$(echo "$container" | sed 's/dive-spoke-\(.*\)-keycloak/\1/' | tr '[:lower:]' '[:upper:]')
            realm="dive-v3-broker-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"

            if [ -z "$TARGET_INSTANCE" ] || [ "$TARGET_INSTANCE" = "$instance_code" ]; then
                cleanup_instance "$container" "$realm" "$instance_code"
            fi
        fi
    done <<< "$spoke_containers"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                              CLEANUP COMPLETE${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    log_info "Dry run complete. Run without --dry-run to apply changes."
else
    log_success "Legacy client cleanup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Verify clients: ./dive fed verify"
    echo "  2. Test federation: ./dive test federation"
fi

echo ""
