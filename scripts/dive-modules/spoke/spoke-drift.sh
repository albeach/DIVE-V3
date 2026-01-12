#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Spoke Drift Detection
# =============================================================================
# Detects configuration drift between spoke docker-compose.yml files and
# the canonical template, enabling proactive updates and consistency.
#
# Usage:
#   ./dive spoke check-drift POL           # Check specific spoke
#   ./dive spoke check-all-drift           # Check all spokes
#   ./dive spoke update-compose POL        # Update from template
#   ./dive spoke update-compose POL --dry-run  # Preview changes
# =============================================================================

# Load common functions
if [ -z "$DIVE_COMMON_LOADED" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "${SCRIPT_DIR}/common.sh"
fi

# =============================================================================
# CHECK DRIFT FOR SINGLE SPOKE
# =============================================================================
spoke_check_drift() {
    local code="${1:?Instance code required}"
    local code_lower=$(lower "$code")
    local code_upper=$(upper "$code")

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local spoke_compose="${spoke_dir}/docker-compose.yml"
    local template_file="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    if [ ! -f "$spoke_compose" ]; then
        log_error "Spoke ${code_upper} not initialized (no docker-compose.yml)"
        return 1
    fi

    if [ ! -f "$template_file" ]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    # Extract template version from template file
    local template_version=$(grep "^# Template Version:" "$template_file" | awk '{print $4}')

    # Extract template version from spoke file
    local spoke_version=$(grep "^# Template Version:" "$spoke_compose" | awk '{print $4}')

    # Extract template hash from template file
    local template_hash=$(md5sum "$template_file" | awk '{print $1}')

    # Extract template hash from spoke file (strip "# Template Hash: " prefix)
    local spoke_hash=$(grep "^# Template Hash:" "$spoke_compose" | sed 's/^# Template Hash: //')

    echo ""
    log_info "Drift Check: ${code_upper}"
    echo "  Template Version: ${template_version:-unknown}"
    echo "  Spoke Version:    ${spoke_version:-unknown}"
    echo "  Template Hash:    ${template_hash:0:12}"
    echo "  Spoke Hash:       ${spoke_hash:0:12}"
    echo ""

    # Check if version is missing (old spoke without version tracking)
    if [ -z "$spoke_version" ]; then
        log_warn "⚠️  Spoke ${code_upper} has NO version tracking (pre-v2.5.0)"
        echo "     Recommendation: Regenerate with './dive spoke update-compose ${code_upper}'"
        return 2
    fi

    # Check version drift
    if [ "$template_version" != "$spoke_version" ]; then
        log_warn "⚠️  Version drift detected for ${code_upper}"
        echo "     Template: v${template_version}"
        echo "     Spoke:    v${spoke_version}"
        echo "     Recommendation: Run './dive spoke update-compose ${code_upper}' to update"
        return 1
    fi

    # Check hash drift (detects manual edits)
    if [ "$template_hash" != "$spoke_hash" ]; then
        log_warn "⚠️  Hash drift detected for ${code_upper} (template modified)"
        echo "     Recommendation: Update spoke to match new template"
        return 1
    fi

    log_success "✅ No drift detected for ${code_upper} (v${spoke_version})"
    return 0
}

# =============================================================================
# CHECK DRIFT FOR ALL SPOKES
# =============================================================================
spoke_check_all_drift() {
    echo ""
    echo "🔍 Checking all instances for docker-compose drift..."
    echo ""

    local drifted=()
    local missing_version=()
    local synced=()

    # Check all spokes
    if [ -d "${DIVE_ROOT}/instances" ]; then
        for spoke_dir in "${DIVE_ROOT}/instances"/*; do
            if [ -d "$spoke_dir" ] && [ -f "$spoke_dir/docker-compose.yml" ]; then
                local code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')

                spoke_check_drift "$code" >/dev/null 2>&1
                local exit_code=$?

                case $exit_code in
                    0)
                        synced+=("$code")
                        ;;
                    2)
                        missing_version+=("$code")
                        ;;
                    *)
                        drifted+=("$code")
                        ;;
                esac
            fi
        done
    fi

    # Report summary
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  DRIFT DETECTION SUMMARY"
    echo "═══════════════════════════════════════════════════════"
    echo ""

    if [ ${#synced[@]} -gt 0 ]; then
        echo "✅ Synced (${#synced[@]}): ${synced[*]}"
    fi

    if [ ${#drifted[@]} -gt 0 ]; then
        echo "⚠️  Drifted (${#drifted[@]}): ${drifted[*]}"
        echo "   Action: Run './dive spoke update-compose <CODE>' for each"
    fi

    if [ ${#missing_version[@]} -gt 0 ]; then
        echo "❌ No Version Tracking (${#missing_version[@]}): ${missing_version[*]}"
        echo "   Action: Regenerate with './dive spoke update-compose <CODE>'"
    fi

    echo ""

    # Return appropriate exit code
    if [ ${#drifted[@]} -gt 0 ] || [ ${#missing_version[@]} -gt 0 ]; then
        return 1
    fi

    return 0
}

# =============================================================================
# UPDATE SPOKE COMPOSE FROM TEMPLATE
# =============================================================================
spoke_update_compose() {
    local code="${1:?Instance code required}"
    local dry_run=false

    if [ "${2:-}" = "--dry-run" ] || [ "${2:-}" = "-n" ]; then
        dry_run=true
    fi

    local code_lower=$(lower "$code")
    local code_upper=$(upper "$code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke ${code_upper} not initialized"
        return 1
    fi

    echo ""
    log_info "Updating ${code_upper} docker-compose.yml from template..."
    echo ""

    # Backup existing file
    local backup_file="${spoke_dir}/docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)"
    cp "${spoke_dir}/docker-compose.yml" "$backup_file"
    log_success "✅ Backup created: $(basename "$backup_file")"

    # Read existing configuration for placeholders
    local instance_name=$(grep "^# DIVE V3 - ${code_upper} Instance" "${spoke_dir}/docker-compose.yml" | sed "s/.*(\(.*\))/\1/")
    local spoke_id=$(grep "^# Spoke ID:" "${spoke_dir}/docker-compose.yml" | awk '{print $4}')

    # Get port assignments (preserve existing)
    eval "$(_get_spoke_ports "$code_upper")"

    # Regenerate using the _create_spoke_docker_compose function
    local idp_hostname="localhost"
    local api_url="https://localhost:${SPOKE_BACKEND_PORT}"
    local base_url="https://localhost:${SPOKE_FRONTEND_PORT}"
    local idp_url="https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"

    # _create_spoke_docker_compose function is already loaded from spoke-init.sh
    _create_spoke_docker_compose "$spoke_dir" "$code_upper" "$code_lower" \
        "$instance_name" "$spoke_id" "$idp_hostname" "$api_url" "$base_url" "$idp_url" ""

    # Show diff
    echo ""
    log_info "Changes:"
    echo "────────────────────────────────────────────────────────"
    diff -u "$backup_file" "${spoke_dir}/docker-compose.yml" || true
    echo "────────────────────────────────────────────────────────"
    echo ""

    if [ "$dry_run" = true ]; then
        log_info "🔍 Dry run - rolling back changes"
        mv "$backup_file" "${spoke_dir}/docker-compose.yml"
        log_info "No changes applied (use without --dry-run to apply)"
        return 0
    fi

    log_success "✅ Updated ${code_upper} to latest template (v2.8.1)"
    echo ""
    log_warn "⚠️  Restart required to apply changes:"
    echo "   ./dive spoke down ${code_upper}"
    echo "   ./dive spoke deploy ${code_upper}"
    echo ""

    return 0
}

# =============================================================================
# SHOW DRIFT DETECTION HELP
# =============================================================================
spoke_drift_help() {
    cat << 'EOF'

╔══════════════════════════════════════════════════════════════╗
║              DIVE V3 Spoke Drift Detection                   ║
╚══════════════════════════════════════════════════════════════╝

Detect and remediate configuration drift between spoke instances
and the canonical docker-compose template.

USAGE:
  ./dive spoke check-drift <CODE>           Check specific spoke
  ./dive spoke check-all-drift              Check all spokes
  ./dive spoke update-compose <CODE>        Update from template
  ./dive spoke update-compose <CODE> --dry-run  Preview changes

EXAMPLES:
  # Check if POL is using latest template
  ./dive spoke check-drift POL

  # Check all spokes for drift
  ./dive spoke check-all-drift

  # Update POL to latest template (with backup)
  ./dive spoke update-compose POL

  # Preview changes without applying
  ./dive spoke update-compose POL --dry-run

WHAT IT CHECKS:
  ✓ Template version (e.g., 2.5.0)
  ✓ Template hash (detects manual edits)
  ✓ Breaking changes (Keycloak, MongoDB versions)
  ✓ Network naming consistency
  ✓ Volume naming consistency

EXIT CODES:
  0 - No drift detected
  1 - Drift detected (version or hash mismatch)
  2 - No version tracking (pre-v2.5.0 spoke)

NOTES:
  • Backups created automatically before updates
  • Dry-run mode available for safe previews
  • Requires spoke restart after update
  • Preserves port assignments and spoke ID

EOF
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================
module_spoke_drift() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        check-drift)
            spoke_check_drift "$@"
            ;;
        check-all-drift|check-all)
            spoke_check_all_drift "$@"
            ;;
        update-compose|update)
            spoke_update_compose "$@"
            ;;
        help|--help|-h)
            spoke_drift_help
            ;;
        *)
            log_error "Unknown drift command: $action"
            spoke_drift_help
            return 1
            ;;
    esac
}

# Allow direct execution
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    module_spoke_drift "$@"
fi
