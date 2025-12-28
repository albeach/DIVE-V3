#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Naming Convention Migration Script
# =============================================================================
# Migrates all instances to use centralized naming convention from config
# Fixes inconsistencies in docker-compose files, Keycloak clients, and env vars
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export DIVE_ROOT="$PROJECT_ROOT"

# Source naming conventions library
source "${SCRIPT_DIR}/lib/naming-conventions.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

DRY_RUN=false
BACKUP=true
INSTANCES_TO_MIGRATE=()

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            BACKUP=false
            shift
            ;;
        --instance)
            INSTANCES_TO_MIGRATE+=("$2")
            shift 2
            ;;
        --all)
            # Migrate all instances
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run, -n          Show what would be changed without making changes"
            echo "  --no-backup            Skip backup creation"
            echo "  --instance <CODE>      Migrate specific instance (can be repeated)"
            echo "  --all                  Migrate all instances (default if no --instance specified)"
            echo "  -h, --help             Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --dry-run                    # Preview changes"
            echo "  $0 --instance ESP --instance GBR  # Migrate ESP and GBR only"
            echo "  $0 --all                        # Migrate all instances"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# If no specific instances specified, find all
if [ ${#INSTANCES_TO_MIGRATE[@]} -eq 0 ]; then
    log_info "Discovering all instances..."
    for instance_dir in "$PROJECT_ROOT"/instances/*/; do
        if [ -d "$instance_dir" ] && [ -f "$instance_dir/docker-compose.yml" ]; then
            instance_code=$(basename "$instance_dir" | tr '[:lower:]' '[:upper:]')
            INSTANCES_TO_MIGRATE+=("$instance_code")
        fi
    done
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DIVE V3 Naming Convention Migration                        ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
log_info "Mode: $([ "$DRY_RUN" = true ] && echo "DRY RUN (no changes)" || echo "LIVE (will modify files)")"
log_info "Backup: $([ "$BACKUP" = true ] && echo "Enabled" || echo "Disabled")"
log_info "Instances to migrate: ${#INSTANCES_TO_MIGRATE[@]}"
echo ""

# Create backup if requested
if [ "$BACKUP" = true ] && [ "$DRY_RUN" = false ]; then
    BACKUP_DIR="$PROJECT_ROOT/backups/naming-migration-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    log_info "Creating backup at: $BACKUP_DIR"
    for instance_code in "${INSTANCES_TO_MIGRATE[@]}"; do
        instance_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
        if [ -d "$PROJECT_ROOT/instances/$instance_lower" ]; then
            cp -r "$PROJECT_ROOT/instances/$instance_lower" "$BACKUP_DIR/"
        fi
    done
    log_success "Backup created"
    echo ""
fi

# Statistics
TOTAL_INSTANCES=0
MIGRATED_INSTANCES=0
SKIPPED_INSTANCES=0
FAILED_INSTANCES=0

# Migrate each instance
for instance_code in "${INSTANCES_TO_MIGRATE[@]}"; do
    TOTAL_INSTANCES=$((TOTAL_INSTANCES + 1))
    instance_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    instance_dir="$PROJECT_ROOT/instances/$instance_lower"
    docker_compose_file="$instance_dir/docker-compose.yml"

    echo -e "${BOLD}─────────────────────────────────────────────────────────────────${NC}"
    log_step "Migrating: $instance_code"
    echo ""

    # Validate instance code
    if ! validate_instance_code "$instance_code" 2>/dev/null; then
        log_warn "Invalid instance code format, skipping"
        SKIPPED_INSTANCES=$((SKIPPED_INSTANCES + 1))
        continue
    fi

    # Check if docker-compose exists
    if [ ! -f "$docker_compose_file" ]; then
        log_warn "docker-compose.yml not found, skipping"
        SKIPPED_INSTANCES=$((SKIPPED_INSTANCES + 1))
        continue
    fi

    # Get standardized names
    expected_realm=$(get_realm_name "$instance_code")
    expected_client_id=$(get_client_id "$instance_code")

    # Check current client ID in docker-compose
    current_client_id=$(grep "AUTH_KEYCLOAK_ID:" "$docker_compose_file" | head -1 | sed 's/.*AUTH_KEYCLOAK_ID: *//' | tr -d '"' | tr -d ' ')

    if [ -z "$current_client_id" ]; then
        log_warn "AUTH_KEYCLOAK_ID not found in docker-compose.yml, skipping"
        SKIPPED_INSTANCES=$((SKIPPED_INSTANCES + 1))
        continue
    fi

    # Check if migration needed
    if [ "$current_client_id" = "$expected_client_id" ]; then
        log_success "Already using correct client ID: $expected_client_id"
        SKIPPED_INSTANCES=$((SKIPPED_INSTANCES + 1))
        continue
    fi

    log_info "Current client ID:  $current_client_id"
    log_info "Expected client ID: $expected_client_id"

    # Perform migration
    if [ "$DRY_RUN" = false ]; then
        # Update AUTH_KEYCLOAK_ID in docker-compose.yml
        sed -i.bak "s|AUTH_KEYCLOAK_ID: ${current_client_id}|AUTH_KEYCLOAK_ID: ${expected_client_id}|g" "$docker_compose_file"

        # Also update KEYCLOAK_CLIENT_ID if present (backend uses this)
        if grep -q "KEYCLOAK_CLIENT_ID:" "$docker_compose_file"; then
            sed -i.bak2 "s|KEYCLOAK_CLIENT_ID: ${current_client_id}|KEYCLOAK_CLIENT_ID: ${expected_client_id}|g" "$docker_compose_file"
        fi

        # Remove backup files
        rm -f "$docker_compose_file.bak" "$docker_compose_file.bak2"

        log_success "Updated docker-compose.yml"
        MIGRATED_INSTANCES=$((MIGRATED_INSTANCES + 1))
    else
        log_info "[DRY RUN] Would update AUTH_KEYCLOAK_ID: $current_client_id → $expected_client_id"
        MIGRATED_INSTANCES=$((MIGRATED_INSTANCES + 1))
    fi

    echo ""
done

# Summary
echo -e "${BOLD}─────────────────────────────────────────────────────────────────${NC}"
echo ""
echo -e "${BOLD}Migration Summary:${NC}"
echo "  Total instances:    $TOTAL_INSTANCES"
echo "  Migrated:           $MIGRATED_INSTANCES"
echo "  Skipped (up-to-date): $SKIPPED_INSTANCES"
echo "  Failed:             $FAILED_INSTANCES"
echo ""

if [ "$DRY_RUN" = false ]; then
    if [ $MIGRATED_INSTANCES -gt 0 ]; then
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  Migration Complete!                                           ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        log_info "Next steps:"
        echo "  1. Restart affected instances: ./dive --instance <CODE> restart"
        echo "  2. Reconfigure Keycloak protocol mappers: ./scripts/spoke-init/configure-localized-mappers.sh <CODE>"
        echo "  3. Verify login works correctly"
        echo ""
        if [ "$BACKUP" = true ]; then
            log_info "Backup location: $BACKUP_DIR"
        fi
    else
        log_info "No instances required migration"
    fi
else
    log_warn "DRY RUN mode - no changes were made"
    log_info "Run without --dry-run to apply changes"
fi


