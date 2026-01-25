#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Migrate OPAL Public Keys to All Existing Spokes
# =============================================================================
# This script adds OPAL_AUTH_PUBLIC_KEY to all existing spoke .env files
# that don't have it, fixing the OPAL client crash issue.
#
# Purpose: One-time migration for existing spokes deployed before Phase 2 fix
# Safe to run multiple times (idempotent)
# =============================================================================

set -e

# Ensure DIVE_ROOT is set
if [ -z "$DIVE_ROOT" ]; then
    DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    export DIVE_ROOT
fi

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/phase-initialization.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  OPAL Public Key Migration - All Existing Spokes             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Get OPAL public key
log_step "Fetching OPAL public key..."
opal_public_key=$(spoke_get_hub_opal_public_key || echo "")

if [ -z "$opal_public_key" ]; then
    log_error "Could not retrieve OPAL public key"
    log_error "Hub OPAL server may not be running or SSH key not available"
    exit 1
fi

log_success "Retrieved OPAL public key (${#opal_public_key} characters)"
echo ""

# Find all existing spoke instances
log_step "Scanning for existing spoke instances..."
spoke_dirs=$(find "${DIVE_ROOT}/instances" -maxdepth 1 -type d -name "[a-z][a-z][a-z]" 2>/dev/null)

if [ -z "$spoke_dirs" ]; then
    log_info "No spoke instances found"
    exit 0
fi

log_info "Found spoke instances:"
echo "$spoke_dirs" | while read -r dir; do
    instance=$(basename "$dir")
    echo "  - $instance"
done
echo ""

# Migrate each spoke
updated_count=0
skipped_count=0
failed_count=0

for spoke_dir in $spoke_dirs; do
    instance=$(basename "$spoke_dir")
    instance_upper=$(upper "$instance")
    env_file="$spoke_dir/.env"

    if [ ! -f "$env_file" ]; then
        log_verbose "Skipping $instance_upper (no .env file)"
        ((skipped_count++))
        continue
    fi

    log_step "Processing $instance_upper..."

    # Check if OPAL_AUTH_PUBLIC_KEY already exists and is valid
    if grep -q "^OPAL_AUTH_PUBLIC_KEY=" "$env_file"; then
        existing_key=$(grep "^OPAL_AUTH_PUBLIC_KEY=" "$env_file" | cut -d'=' -f2- | tr -d '"')

        # Check if key is valid (not empty, not placeholder)
        if [ -n "$existing_key" ] && [ "$existing_key" != "# NOT_CONFIGURED" ] && [ "$existing_key" != '${OPAL_AUTH_PUBLIC_KEY}' ] && [[ "$existing_key" == ssh-* ]]; then
            log_verbose "  OPAL key already set and valid (skipping)"
            ((skipped_count++))
            continue
        fi

        # Invalid key - update it
        log_info "  Updating invalid OPAL key..."
        cp "$env_file" "${env_file}.bak.opal-$(date +%Y%m%d-%H%M%S)"
        sed -i.tmp "s|^OPAL_AUTH_PUBLIC_KEY=.*|OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"|" "$env_file"
        rm -f "${env_file}.tmp"
        log_success "  ✅ Updated OPAL key for $instance_upper"
        ((updated_count++))

        # Restart OPAL client if container is running
        local container="dive-spoke-${instance}-opal-client"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
            log_info "  Restarting OPAL client container..."
            cd "$spoke_dir"
            docker compose down opal-client-${instance} 2>/dev/null || true
            docker compose up -d opal-client-${instance} 2>/dev/null || true
            log_success "  ✅ OPAL client restarted"
        fi
    else
        # OPAL_AUTH_PUBLIC_KEY doesn't exist - add it
        log_info "  Adding OPAL key..."
        cp "$env_file" "${env_file}.bak.opal-$(date +%Y%m%d-%H%M%S)"
        echo "" >> "$env_file"
        echo "# OPAL Authentication (added by migration script)" >> "$env_file"
        echo "OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"" >> "$env_file"
        log_success "  ✅ Added OPAL key for $instance_upper"
        ((updated_count++))

        # Restart OPAL client if container is running
        local container="dive-spoke-${instance}-opal-client"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
            log_info "  Recreating OPAL client container to pick up new env var..."
            cd "$spoke_dir"
            docker compose down opal-client-${instance} 2>/dev/null || true
            docker compose up -d opal-client-${instance} 2>/dev/null || true
            log_success "  ✅ OPAL client recreated"
        fi
    fi

    echo ""
done

# Summary
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Migration Complete                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Updated:  $updated_count spokes"
echo "Skipped:  $skipped_count spokes (already configured)"
echo "Failed:   $failed_count spokes"
echo ""

if [ $updated_count -gt 0 ]; then
    log_success "OPAL public key migration complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Wait 10-15 seconds for OPAL clients to stabilize"
    echo "  2. Check OPAL client health:"
    echo "     docker ps --filter 'name=opal-client' --format 'table {{.Names}}\t{{.Status}}'"
    echo "  3. Verify OPAL clients are healthy (not restarting)"
    echo ""
fi
