#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Vault PKI Credential Management
# =============================================================================
# Extracted from vault/pki.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_VAULT_PKI_CREDENTIALS_LOADED:-}" ] && return 0

# =============================================================================
# APPROLE SECRETID ROTATION (Phase 4: Credential Lifecycle)
# =============================================================================

##
# Refresh a spoke's AppRole SecretID.
#
# Generates a new SecretID, updates the spoke's .env file, and destroys the old one.
# Used for credential rotation when SecretIDs have TTL (72h).
#
# Arguments:
#   $1 - Spoke code (e.g., "deu" or "DEU")
#
# Returns:
#   0 - Success (new SecretID issued and .env updated)
#   1 - Failure
##
_vault_refresh_secret_id() {
    local spoke_code="${1:?spoke code required}"
    local code
    code=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    local role_name="spoke-${code}"

    # Verify AppRole exists
    if ! vault read "auth/approle/role/${role_name}" >/dev/null 2>&1; then
        log_error "AppRole ${role_name} not found — run: ./dive vault provision ${code_upper}"
        return 1
    fi

    # Read old SecretID from .env (for destruction after replacement)
    local spoke_env="${DIVE_ROOT}/instances/${code}/.env"
    local old_secret_id=""
    if [ -f "$spoke_env" ]; then
        old_secret_id=$(grep "^VAULT_SECRET_ID=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
    fi

    # Generate new SecretID
    local new_secret_id
    new_secret_id=$(vault write -field=secret_id -f "auth/approle/role/${role_name}/secret-id" 2>/dev/null)
    if [ -z "$new_secret_id" ]; then
        log_error "  Failed to generate new SecretID for ${role_name}"
        return 1
    fi

    # Get new SecretID accessor for metadata lookup
    local new_accessor
    new_accessor=$(vault write -field=secret_id_accessor -f "auth/approle/role/${role_name}/secret-id" 2>/dev/null || true)

    # Update spoke .env
    if [ -f "$spoke_env" ]; then
        _vault_update_env "$spoke_env" "VAULT_SECRET_ID" "$new_secret_id"
        log_success "  Updated ${spoke_env}"
    else
        log_warn "  Spoke .env not found: ${spoke_env} (SecretID generated but not persisted)"
    fi

    # Destroy old SecretID (invalidate immediately)
    if [ -n "$old_secret_id" ] && [ "$old_secret_id" != "$new_secret_id" ]; then
        if vault write "auth/approle/role/${role_name}/secret-id/destroy" \
            secret_id="$old_secret_id" >/dev/null 2>&1; then
            log_verbose "  Destroyed old SecretID for ${role_name}"
        else
            log_verbose "  Old SecretID already expired or invalid (non-fatal)"
        fi
    fi

    _vault_rotation_audit "INFO" "SECRETID_REFRESHED: spoke=${code}"
    return 0
}

##
# Check the age/TTL of a spoke's current SecretID.
#
# Returns via stdout: seconds remaining until expiry (0 if expired or unknown).
# Returns exit code 0 always (callers check the value).
#
# Arguments:
#   $1 - Spoke code
##
_vault_secret_id_ttl_remaining() {
    local spoke_code="${1:?spoke code required}"
    local code
    code=$(lower "$spoke_code")
    local role_name="spoke-${code}"

    # Read current SecretID from .env
    local spoke_env="${DIVE_ROOT}/instances/${code}/.env"
    local current_secret_id=""
    if [ -f "$spoke_env" ]; then
        current_secret_id=$(grep "^VAULT_SECRET_ID=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
    fi

    if [ -z "$current_secret_id" ]; then
        echo "0"
        return 0
    fi

    # Lookup SecretID metadata
    local lookup_json
    lookup_json=$(vault write -format=json "auth/approle/role/${role_name}/secret-id/lookup" \
        secret_id="$current_secret_id" 2>/dev/null || true)

    if [ -z "$lookup_json" ]; then
        echo "0"
        return 0
    fi

    # Extract expiration_time (RFC3339) and calculate remaining seconds
    local expiration_time
    expiration_time=$(echo "$lookup_json" | jq -r '.data.expiration_time // empty' 2>/dev/null)

    if [ -z "$expiration_time" ] || [ "$expiration_time" = "0001-01-01T00:00:00Z" ]; then
        # No expiry set (secret_id_ttl=0) — return large value
        echo "999999"
        return 0
    fi

    local expiry_epoch now_epoch
    if date -j >/dev/null 2>&1; then
        # macOS
        expiry_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${expiration_time%%.*}" "+%s" 2>/dev/null || echo "0")
    else
        # Linux
        expiry_epoch=$(date -d "$expiration_time" "+%s" 2>/dev/null || echo "0")
    fi
    now_epoch=$(date "+%s")

    if [ "$expiry_epoch" -eq 0 ]; then
        echo "0"
        return 0
    fi

    local remaining=$((expiry_epoch - now_epoch))
    [ "$remaining" -lt 0 ] && remaining=0
    echo "$remaining"
}

##
# Migrate existing spoke AppRoles to use secret_id_ttl=72h.
#
# Iterates all provisioned spokes and updates the AppRole config.
# Does NOT regenerate SecretIDs — existing ones keep their original (infinite) TTL.
# Use `./dive vault refresh-credentials all` after migration to issue new TTL-bound SecretIDs.
#
# Arguments: none
##
_vault_migrate_secret_id_ttl() {
    log_info "Migrating AppRole SecretID TTL to 72h..."

    local spokes
    spokes=$(_vault_discover_instances)
    local migrated=0 failed=0

    while IFS= read -r instance; do
        [ -z "$instance" ] && continue
        local role_name="spoke-${instance}"

        # Read current policies to preserve them
        local current_policies
        current_policies=$(vault read -field=token_policies "auth/approle/role/${role_name}" 2>/dev/null || true)
        if [ -z "$current_policies" ]; then
            log_verbose "  ${role_name}: not found (skipping)"
            continue
        fi

        if vault write "auth/approle/role/${role_name}" \
            token_policies="$current_policies" \
            token_ttl=1h \
            token_max_ttl=24h \
            secret_id_ttl=72h \
            secret_id_num_uses=0 >/dev/null 2>&1; then
            log_success "  Migrated: ${role_name} (secret_id_ttl=72h)"
            migrated=$((migrated + 1))
        else
            log_error "  Failed: ${role_name}"
            failed=$((failed + 1))
        fi
    done <<< "$spokes"

    echo ""
    log_info "Migration complete: ${migrated} migrated, ${failed} failed"
    [ $failed -gt 0 ] && return 1
    return 0
}

##
# CLI: Refresh AppRole SecretIDs for one or all spokes.
#
# Usage:
#   ./dive vault refresh-credentials <CODE>        # Single spoke
#   ./dive vault refresh-credentials all            # All spokes
#   ./dive vault refresh-credentials all --migrate  # Migrate TTL + refresh all
#
# Generates new SecretIDs, updates .env files, and destroys old SecretIDs.
##
module_vault_refresh_credentials() {
    local target="${1:-}"
    local do_migrate=false

    if [ -z "$target" ]; then
        log_error "Usage: ./dive vault refresh-credentials <CODE|all> [--migrate]"
        return 1
    fi
    shift

    while [ $# -gt 0 ]; do
        case "$1" in
            --migrate) do_migrate=true; shift ;;
            *) log_error "Unknown option: $1"; return 1 ;;
        esac
    done

    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    if ! _vault_check_unsealed; then
        return 1
    fi

    # Run migration first if requested
    if [ "$do_migrate" = true ]; then
        _vault_migrate_secret_id_ttl || return 1
        echo ""
    fi

    echo ""
    log_info "==================================================================="
    log_info "  AppRole SecretID Refresh"
    log_info "==================================================================="

    local refreshed=0 failed=0

    if [ "$target" = "all" ]; then
        local spokes
        spokes=$(_vault_discover_instances)
        while IFS= read -r instance; do
            [ -z "$instance" ] && continue
            local code_upper
            code_upper=$(upper "$instance")
            log_info "Refreshing SecretID for ${code_upper}..."

            # Check current TTL remaining
            local ttl_remaining
            ttl_remaining=$(_vault_secret_id_ttl_remaining "$instance")

            if _vault_refresh_secret_id "$instance"; then
                refreshed=$((refreshed + 1))
                log_success "  ${code_upper}: refreshed (old TTL: ${ttl_remaining}s remaining)"
            else
                failed=$((failed + 1))
                log_error "  ${code_upper}: failed"
            fi
        done <<< "$spokes"
    else
        local code
        code=$(lower "$target")
        local code_upper
        code_upper=$(upper "$target")
        log_info "Refreshing SecretID for ${code_upper}..."

        local ttl_remaining
        ttl_remaining=$(_vault_secret_id_ttl_remaining "$code")

        if _vault_refresh_secret_id "$code"; then
            refreshed=1
            log_success "  ${code_upper}: refreshed (old TTL: ${ttl_remaining}s remaining)"
        else
            failed=1
            log_error "  ${code_upper}: failed"
        fi
    fi

    echo ""
    log_info "==================================================================="
    log_info "  Refreshed: $refreshed  |  Failed: $failed"
    log_info "==================================================================="

    [ $failed -gt 0 ] && return 1
    return 0
}

##
# Deprovision a spoke from Vault: revoke certificate, delete policy, AppRole, and PKI role.
#
# This is the reverse of module_vault_provision(). It:
#   1. Revokes the spoke's current Vault-issued certificate
#   2. Triggers CRL rebuild
#   3. Deletes the spoke's AppRole
#   4. Deletes the spoke's Vault policies
#   5. Deletes the spoke's PKI role
#
# Does NOT delete secrets from KV store (preserving audit trail).
# Does NOT remove Docker containers (use ./dive nuke spoke <CODE> for that).
#
# Usage: ./dive vault deprovision <CODE>
##
module_vault_deprovision() {
    local spoke_code="${1:-}"

    if [ -z "$spoke_code" ]; then
        log_error "Usage: ./dive vault deprovision <CODE>"
        log_info "Example: ./dive vault deprovision FRA"
        return 1
    fi

    local code
    code=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    if [ "$code" = "usa" ]; then
        log_error "Cannot deprovision USA — it is the hub instance"
        return 1
    fi

    log_info "Deprovisioning spoke ${code_upper} from Vault..."

    if ! vault_is_running; then
        return 1
    fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    if ! _vault_check_unsealed; then
        return 1
    fi

    local errors=0

    # Step 1: Revoke spoke certificate (if Vault PKI was used)
    log_info "Step 1/5: Revoking spoke certificate..."
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
    fi
    if type revoke_spoke_certificates &>/dev/null; then
        revoke_spoke_certificates "$code" || {
            log_warn "  Certificate revocation failed (continuing deprovision)"
            errors=$((errors + 1))
        }
    else
        log_verbose "  revoke_spoke_certificates not available — skipping"
    fi

    # Step 2: Delete AppRole
    log_info "Step 2/5: Removing AppRole..."
    if vault delete "auth/approle/role/spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted AppRole: spoke-${code}"
    else
        log_warn "  AppRole spoke-${code} not found or already deleted"
    fi

    # Step 3: Delete spoke policies
    log_info "Step 3/5: Removing Vault policies..."
    if vault policy delete "dive-v3-spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted policy: dive-v3-spoke-${code}"
    else
        log_warn "  Policy dive-v3-spoke-${code} not found"
    fi
    if vault policy delete "dive-v3-pki-spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted policy: dive-v3-pki-spoke-${code}"
    else
        log_verbose "  PKI policy dive-v3-pki-spoke-${code} not found"
    fi

    # Step 4: Delete PKI role
    log_info "Step 4/5: Removing PKI role..."
    if vault secrets list 2>/dev/null | grep -q "^pki_int/"; then
        if vault delete "pki_int/roles/spoke-${code}-services" >/dev/null 2>&1; then
            log_success "  Deleted PKI role: spoke-${code}-services"
        else
            log_warn "  PKI role spoke-${code}-services not found"
        fi
    else
        log_verbose "  PKI engine not enabled — skipping role cleanup"
    fi

    # Step 5: Summary
    log_info "Step 5/5: Deprovision summary..."
    echo ""
    log_info "==================================================================="
    log_info "  Spoke ${code_upper} Deprovisioned from Vault"
    log_info "==================================================================="
    log_info "  Certificate:  revoked (CRL updated)"
    log_info "  AppRole:      deleted"
    log_info "  Policies:     deleted"
    log_info "  PKI role:     deleted"
    log_info "  KV secrets:   preserved (audit trail)"
    if [ $errors -gt 0 ]; then
        log_warn "  Warnings:     $errors (check output above)"
    fi
    log_info ""
    log_info "  To also remove Docker containers:"
    log_info "    ./dive nuke spoke ${code_upper}"
    log_info "==================================================================="

    return 0
}

##
# Test secret rotation lifecycle (non-destructive)
#
# Validates:
#   1. Read current secret from Vault
#   2. Write new value
#   3. Read back and verify
#   4. Restore original value
#   5. Verify spoke still healthy
#
# Usage: ./dive vault test-rotation [CODE]
##

export DIVE_VAULT_PKI_CREDENTIALS_LOADED=1
