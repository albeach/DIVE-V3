#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — Vault Secret Rotation Automation (Phase 6)
# =============================================================================
# Provides: rotate, rotation-status, rotation-check, test-rotation-full
# Sourced by: vault/module.sh
# Depends on: common.sh, configuration/secrets.sh, vault/module.sh, vault/db-engine.sh
# =============================================================================

# ---------------------------------------------------------------------------
# Secret Definitions (format: "subpath:field:gen_type")
# gen_type: password (24-char base64), secret (full base64), hex64 (64-char hex), key (full base64)
# ---------------------------------------------------------------------------
_VAULT_CORE_INSTANCE_SECRETS=(
    "postgres:password:password"
    "mongodb:password:password"
    "redis:password:password"
    "keycloak-admin:password:password"
)
_VAULT_CORE_SHARED_SECRETS=(
    "shared/redis-blacklist:password:password"
)
_VAULT_AUTH_INSTANCE_SECRETS=(
    "nextauth:secret:secret"
)
_VAULT_AUTH_SHARED_SECRETS=(
    "shared/keycloak-client:secret:password"
    "shared/kas-signing:key:key"
    "shared/kas-encryption:key:key"
)

# PKI renewal threshold (days before expiry to trigger auto-renewal)
VAULT_PKI_RENEW_BEFORE_DAYS="${VAULT_PKI_RENEW_BEFORE_DAYS:-30}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_vault_load_token() {
    if [ -n "$VAULT_TOKEN" ]; then return 0; fi
    local token_file="${VAULT_TOKEN_FILE:-${DIVE_ROOT}/.vault-token}"
    if [ -f "$token_file" ]; then
        VAULT_TOKEN=$(cat "$token_file")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi
}

_vault_rotation_audit() {
    local level="$1" message="$2"
    local log_dir="${DIVE_ROOT}/logs/vault"
    mkdir -p "$log_dir"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [${level}] ${message}" >> "${log_dir}/rotation-audit.log"
}

_vault_generate_value() {
    local gen_type="$1"
    case "$gen_type" in
        password) openssl rand -base64 32 | tr -d '/+=' | cut -c1-24 ;;
        secret|key) openssl rand -base64 32 ;;
        hex64)   openssl rand -hex 32 ;;
        *)       openssl rand -base64 32 | tr -d '/+=' | cut -c1-24 ;;
    esac
}

# Discover active instances from Vault KV store (excludes "shared")
_vault_discover_instances() {
    vault kv list -format=json dive-v3/core/ 2>/dev/null \
        | jq -r '.[]' 2>/dev/null \
        | sed 's|/$||' \
        | grep -v '^shared$' || true
}

# ---------------------------------------------------------------------------
# Single secret rotation with rollback
# ---------------------------------------------------------------------------

_vault_rotate_single_kv() {
    local category="$1" path="$2" field="$3" gen_type="$4" dry_run="$5"

    # Read current value (snapshot for rollback)
    local original
    original=$(vault_get_secret "$category" "$path" "$field")
    if [ -z "$original" ]; then
        log_warn "  Cannot read: dive-v3/${category}/${path}:${field} (skipping)"
        return 1
    fi

    if [ "$dry_run" = "true" ]; then
        log_info "  [DRY-RUN] Would rotate: dive-v3/${category}/${path}:${field}"
        return 0
    fi

    # Generate new value
    local new_value
    new_value=$(_vault_generate_value "$gen_type")

    # Write to Vault
    if ! vault_set_secret "$category" "$path" "{\"${field}\":\"${new_value}\"}"; then
        log_error "  Write failed: dive-v3/${category}/${path}:${field}"
        _vault_rotation_audit "ERROR" "WRITE_FAILED: dive-v3/${category}/${path}:${field}"
        return 1
    fi

    # Verify readback
    local readback
    readback=$(vault_get_secret "$category" "$path" "$field")
    if [ "$readback" != "$new_value" ]; then
        log_error "  Readback mismatch: dive-v3/${category}/${path}:${field} — restoring original"
        vault_set_secret "$category" "$path" "{\"${field}\":\"${original}\"}"
        _vault_rotation_audit "ERROR" "READBACK_MISMATCH: dive-v3/${category}/${path}:${field} — restored"
        return 1
    fi

    _vault_rotation_audit "INFO" "ROTATED: dive-v3/${category}/${path}:${field}"
    log_success "  Rotated: dive-v3/${category}/${path}:${field}"
    return 0
}

# ---------------------------------------------------------------------------
# Category rotation
# ---------------------------------------------------------------------------

_vault_rotate_kv_category() {
    local category="$1" dry_run="$2"
    shift 2
    local instances=("$@")
    local rotated=0 failed=0

    # Instance-specific secrets
    local -a defs=()
    case "$category" in
        core) defs=("${_VAULT_CORE_INSTANCE_SECRETS[@]}") ;;
        auth) defs=("${_VAULT_AUTH_INSTANCE_SECRETS[@]}") ;;
    esac

    if [ ${#defs[@]} -gt 0 ]; then
        for instance in "${instances[@]}"; do
            for def in "${defs[@]}"; do
                local subpath="${def%%:*}"
                local rest="${def#*:}"
                local field="${rest%%:*}"
                local gen_type="${rest#*:}"
                if _vault_rotate_single_kv "$category" "${instance}/${subpath}" "$field" "$gen_type" "$dry_run"; then
                    rotated=$((rotated + 1))
                else
                    failed=$((failed + 1))
                fi
            done
        done
    fi

    # Shared secrets
    local -a shared_defs=()
    case "$category" in
        core) shared_defs=("${_VAULT_CORE_SHARED_SECRETS[@]}") ;;
        auth) shared_defs=("${_VAULT_AUTH_SHARED_SECRETS[@]}") ;;
    esac

    for def in "${shared_defs[@]}"; do
        local subpath="${def%%:*}"
        local rest="${def#*:}"
        local field="${rest%%:*}"
        local gen_type="${rest#*:}"
        if _vault_rotate_single_kv "$category" "$subpath" "$field" "$gen_type" "$dry_run"; then
            rotated=$((rotated + 1))
        else
            failed=$((failed + 1))
        fi
    done

    echo "${rotated}:${failed}"
}

_vault_rotate_opal_secrets() {
    local dry_run="$1"
    if _vault_rotate_single_kv "opal" "master-token" "token" "hex64" "$dry_run"; then
        echo "1:0"
    else
        echo "0:1"
    fi
}

_vault_rotate_federation_secrets() {
    local dry_run="$1"
    local rotated=0 failed=0

    # Discover existing federation pairs
    local pairs
    pairs=$(vault kv list -format=json dive-v3/federation/ 2>/dev/null | jq -r '.[]' 2>/dev/null || true)

    if [ -z "$pairs" ]; then
        log_info "  No federation pairs found"
        echo "0:0"
        return 0
    fi

    while IFS= read -r pair; do
        pair="${pair%/}"
        [ -z "$pair" ] && continue
        if _vault_rotate_single_kv "federation" "$pair" "client-secret" "password" "$dry_run"; then
            rotated=$((rotated + 1))
        else
            failed=$((failed + 1))
        fi
    done <<< "$pairs"

    echo "${rotated}:${failed}"
}

# ---------------------------------------------------------------------------
# .env sync after rotation
# ---------------------------------------------------------------------------

_vault_rotation_sync_env() {
    local instances
    instances=$(_vault_discover_instances)

    if [ -z "$instances" ]; then
        log_warn "No instances found in Vault — cannot sync .env files"
        return 1
    fi

    # Sync hub .env.hub
    local hub_env="${DIVE_ROOT}/.env.hub"
    if [ -f "$hub_env" ]; then
        log_info "Syncing secrets to .env.hub..."

        while IFS= read -r instance; do
            [ -z "$instance" ] && continue
            local code_upper
            code_upper=$(upper "$instance")

            local pg mongo redis kc auth client
            pg=$(vault_get_secret "core" "${instance}/postgres" "password")
            mongo=$(vault_get_secret "core" "${instance}/mongodb" "password")
            redis=$(vault_get_secret "core" "${instance}/redis" "password")
            kc=$(vault_get_secret "core" "${instance}/keycloak-admin" "password")
            auth=$(vault_get_secret "auth" "${instance}/nextauth" "secret")
            client=$(vault_get_secret "auth" "shared/keycloak-client" "secret")

            _vault_update_env "$hub_env" "POSTGRES_PASSWORD_${code_upper}" "$pg"
            _vault_update_env "$hub_env" "KC_ADMIN_PASSWORD_${code_upper}" "$kc"
            _vault_update_env "$hub_env" "KC_BOOTSTRAP_ADMIN_PASSWORD_${code_upper}" "$kc"
            _vault_update_env "$hub_env" "KEYCLOAK_ADMIN_PASSWORD_${code_upper}" "$kc"
            _vault_update_env "$hub_env" "MONGO_PASSWORD_${code_upper}" "$mongo"
            _vault_update_env "$hub_env" "REDIS_PASSWORD_${code_upper}" "$redis"
            _vault_update_env "$hub_env" "AUTH_SECRET_${code_upper}" "$auth"
            _vault_update_env "$hub_env" "NEXTAUTH_SECRET_${code_upper}" "$auth"
            _vault_update_env "$hub_env" "JWT_SECRET_${code_upper}" "$auth"
            _vault_update_env "$hub_env" "KEYCLOAK_CLIENT_SECRET_${code_upper}" "$client"
        done <<< "$instances"

        # Shared secrets
        local blacklist opal_token
        blacklist=$(vault_get_secret "core" "shared/redis-blacklist" "password")
        opal_token=$(vault_get_secret "opal" "master-token" "token")
        _vault_update_env "$hub_env" "REDIS_PASSWORD_BLACKLIST" "$blacklist"
        _vault_update_env "$hub_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

        log_success "Hub .env.hub synced"
    fi

    # Sync spoke .env files
    while IFS= read -r instance; do
        [ -z "$instance" ] && continue
        local spoke_env="${DIVE_ROOT}/instances/${instance}/.env"
        if [ -f "$spoke_env" ]; then
            local code_upper
            code_upper=$(upper "$instance")
            log_info "Syncing secrets to instances/${instance}/.env..."

            local pg mongo redis kc auth
            pg=$(vault_get_secret "core" "${instance}/postgres" "password")
            mongo=$(vault_get_secret "core" "${instance}/mongodb" "password")
            redis=$(vault_get_secret "core" "${instance}/redis" "password")
            kc=$(vault_get_secret "core" "${instance}/keycloak-admin" "password")
            auth=$(vault_get_secret "auth" "${instance}/nextauth" "secret")

            _vault_update_env "$spoke_env" "POSTGRES_PASSWORD" "$pg"
            _vault_update_env "$spoke_env" "KC_ADMIN_PASSWORD" "$kc"
            _vault_update_env "$spoke_env" "KEYCLOAK_ADMIN_PASSWORD" "$kc"
            _vault_update_env "$spoke_env" "MONGO_PASSWORD" "$mongo"
            _vault_update_env "$spoke_env" "REDIS_PASSWORD" "$redis"
            _vault_update_env "$spoke_env" "AUTH_SECRET" "$auth"
            _vault_update_env "$spoke_env" "NEXTAUTH_SECRET" "$auth"

            log_success "${code_upper} .env synced"
        fi
    done <<< "$instances"

    # Sync PG static creds
    if type -t _vault_db_sync_pg_creds_to_env &>/dev/null; then
        _vault_db_sync_pg_creds_to_env 2>/dev/null || true
    fi
}

# ---------------------------------------------------------------------------
# PKI certificate renewal helpers
# ---------------------------------------------------------------------------

# Returns days until cert expires, or -1 if unreadable
_vault_cert_days_remaining() {
    local cert_file="$1"
    [ ! -f "$cert_file" ] && echo "-1" && return

    local enddate
    enddate=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | sed 's/notAfter=//')
    [ -z "$enddate" ] && echo "-1" && return

    local expiry_epoch now_epoch
    # macOS and Linux date compatibility
    if date -j >/dev/null 2>&1; then
        expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$enddate" "+%s" 2>/dev/null || echo "0")
    else
        expiry_epoch=$(date -d "$enddate" "+%s" 2>/dev/null || echo "0")
    fi
    now_epoch=$(date "+%s")

    if [ "$expiry_epoch" -eq 0 ]; then
        echo "-1"
        return
    fi

    local remaining_seconds=$((expiry_epoch - now_epoch))
    echo $((remaining_seconds / 86400))
}

_vault_cert_needs_renewal() {
    local cert_file="$1"
    local days_remaining
    days_remaining=$(_vault_cert_days_remaining "$cert_file")

    if [ "$days_remaining" -lt 0 ]; then
        return 1  # unreadable — don't auto-renew
    fi

    [ "$days_remaining" -lt "$VAULT_PKI_RENEW_BEFORE_DAYS" ]
}

# ---------------------------------------------------------------------------
# Prometheus metrics writer
# ---------------------------------------------------------------------------

_vault_rotation_write_metrics() {
    local metrics_dir="${DIVE_ROOT}/monitoring/textfile"
    mkdir -p "$metrics_dir"
    local prom_file="${metrics_dir}/vault_rotation.prom"

    {
        echo "# HELP vault_pki_cert_expiry_days Days until PKI certificate expires"
        echo "# TYPE vault_pki_cert_expiry_days gauge"

        # Hub cert
        local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
        if [ -f "$hub_cert" ]; then
            local days
            days=$(_vault_cert_days_remaining "$hub_cert")
            echo "vault_pki_cert_expiry_days{instance=\"hub\"} ${days}"
        fi

        # Spoke certs
        local instances
        instances=$(_vault_discover_instances)
        while IFS= read -r instance; do
            [ -z "$instance" ] && continue
            local cert="${DIVE_ROOT}/instances/${instance}/certs/certificate.pem"
            if [ -f "$cert" ]; then
                local days
                days=$(_vault_cert_days_remaining "$cert")
                echo "vault_pki_cert_expiry_days{instance=\"${instance}\"} ${days}"
            fi
        done <<< "$instances"

        echo ""
        echo "# HELP vault_static_role_last_rotation_timestamp Epoch of last Vault static role rotation"
        echo "# TYPE vault_static_role_last_rotation_timestamp gauge"

        for role in keycloak-hub nextauth-hub; do
            local rotation_time
            rotation_time=$(vault read -field=last_vault_rotation "database/static-creds/${role}" 2>/dev/null || true)
            if [ -n "$rotation_time" ]; then
                local epoch
                if date -j >/dev/null 2>&1; then
                    epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${rotation_time%%.*}" "+%s" 2>/dev/null || echo "0")
                else
                    epoch=$(date -d "$rotation_time" "+%s" 2>/dev/null || echo "0")
                fi
                echo "vault_static_role_last_rotation_timestamp{role=\"${role}\"} ${epoch}"
            fi
        done
    } > "$prom_file"

    log_verbose "Metrics written to ${prom_file}"
}

# ===========================================================================
# CLI Commands
# ===========================================================================

##
# Rotate KV v2 secrets with automatic .env sync
# Usage: ./dive vault rotate [category] [--dry-run] [--instance CODE]
##
module_vault_rotate() {
    local category="all" dry_run="false" target_instance=""

    # Parse args
    while [ $# -gt 0 ]; do
        case "$1" in
            --dry-run) dry_run="true"; shift ;;
            --instance) target_instance="$2"; shift 2 ;;
            core|auth|opal|federation|all) category="$1"; shift ;;
            *) log_error "Unknown argument: $1"; return 1 ;;
        esac
    done

    if ! vault_is_running; then return 1; fi
    _vault_load_token || return 1
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh" 2>/dev/null

    # Discover instances
    local -a instances=()
    if [ -n "$target_instance" ]; then
        instances=("$(lower "$target_instance")")
    else
        while IFS= read -r inst; do
            [ -n "$inst" ] && instances+=("$inst")
        done < <(_vault_discover_instances)
    fi

    if [ ${#instances[@]} -eq 0 ]; then
        log_error "No instances found in Vault KV store"
        return 1
    fi

    local total_rotated=0 total_failed=0
    local mode="ROTATE"
    [ "$dry_run" = "true" ] && mode="DRY-RUN"

    echo ""
    log_info "==================================================================="
    log_info "  Vault Secret Rotation [${mode}]"
    log_info "  Category: ${category}  |  Instances: ${instances[*]}"
    log_info "==================================================================="
    echo ""

    _vault_rotation_audit "INFO" "ROTATION_START: category=${category} instances=${instances[*]} dry_run=${dry_run}"

    # Rotate by category
    if [ "$category" = "core" ] || [ "$category" = "all" ]; then
        log_info "Rotating core secrets..."
        local result
        result=$(_vault_rotate_kv_category "core" "$dry_run" "${instances[@]}")
        total_rotated=$((total_rotated + ${result%%:*}))
        total_failed=$((total_failed + ${result##*:}))
    fi

    if [ "$category" = "auth" ] || [ "$category" = "all" ]; then
        log_info "Rotating auth secrets..."
        local result
        result=$(_vault_rotate_kv_category "auth" "$dry_run" "${instances[@]}")
        total_rotated=$((total_rotated + ${result%%:*}))
        total_failed=$((total_failed + ${result##*:}))
    fi

    if [ "$category" = "opal" ] || [ "$category" = "all" ]; then
        log_info "Rotating OPAL secrets..."
        local result
        result=$(_vault_rotate_opal_secrets "$dry_run")
        total_rotated=$((total_rotated + ${result%%:*}))
        total_failed=$((total_failed + ${result##*:}))
    fi

    if [ "$category" = "federation" ] || [ "$category" = "all" ]; then
        log_info "Rotating federation secrets..."
        local result
        result=$(_vault_rotate_federation_secrets "$dry_run")
        total_rotated=$((total_rotated + ${result%%:*}))
        total_failed=$((total_failed + ${result##*:}))
    fi

    # Sync .env files (skip in dry-run)
    if [ "$dry_run" != "true" ] && [ $total_rotated -gt 0 ]; then
        echo ""
        log_info "Syncing rotated secrets to .env files..."
        _vault_rotation_sync_env
    fi

    # Summary
    echo ""
    log_info "==================================================================="
    log_info "  Rotation Summary [${mode}]"
    log_info "==================================================================="
    log_info "  Rotated: ${total_rotated} secrets"
    if [ $total_failed -gt 0 ]; then
        log_error "  Failed:  ${total_failed} secrets"
    fi
    if [ "$dry_run" != "true" ] && [ $total_rotated -gt 0 ]; then
        log_warn "  Services must be restarted to pick up new credentials"
        log_info "  Hub:   ./dive hub stop && ./dive hub deploy"
        log_info "  Spoke: ./dive spoke deploy <CODE>"
    fi
    log_info "==================================================================="

    _vault_rotation_audit "INFO" "ROTATION_END: rotated=${total_rotated} failed=${total_failed}"

    [ $total_failed -gt 0 ] && return 1
    return 0
}

##
# Dashboard showing rotation status for all secret types
# Usage: ./dive vault rotation-status
##
module_vault_rotation_status() {
    if ! vault_is_running; then return 1; fi
    _vault_load_token || return 1
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh" 2>/dev/null

    echo ""
    log_info "==================================================================="
    log_info "  Vault Rotation Status Dashboard"
    log_info "==================================================================="

    # ---- KV v2 Secrets ----
    echo ""
    log_info "KV v2 Secrets:"
    printf "  %-42s  %-8s  %s\n" "PATH" "VERSION" "LAST MODIFIED"

    for category in core auth opal federation; do
        local paths
        paths=$(vault kv list -format=json "dive-v3/${category}/" 2>/dev/null | jq -r '.[]' 2>/dev/null | sed 's|/$||' || true)
        [ -z "$paths" ] && continue

        while IFS= read -r path; do
            [ -z "$path" ] && continue
            # Try nested paths (instance/subpath)
            local subpaths
            subpaths=$(vault kv list -format=json "dive-v3/${category}/${path}/" 2>/dev/null | jq -r '.[]' 2>/dev/null | sed 's|/$||' || true)

            if [ -n "$subpaths" ]; then
                while IFS= read -r subpath; do
                    [ -z "$subpath" ] && continue
                    local full_path="${path}/${subpath}"
                    local metadata
                    metadata=$(vault kv metadata get -format=json "dive-v3/${category}/${full_path}" 2>/dev/null || true)
                    if [ -n "$metadata" ]; then
                        local version created
                        version=$(echo "$metadata" | jq -r '.data.current_version // "?"')
                        created=$(echo "$metadata" | jq -r '.data.versions[(.data.current_version|tostring)].created_time // "?"' | cut -c1-19)
                        printf "  %-42s  v%-7s  %s\n" "${category}/${full_path}" "$version" "$created"
                    fi
                done <<< "$subpaths"
            else
                local metadata
                metadata=$(vault kv metadata get -format=json "dive-v3/${category}/${path}" 2>/dev/null || true)
                if [ -n "$metadata" ]; then
                    local version created
                    version=$(echo "$metadata" | jq -r '.data.current_version // "?"')
                    created=$(echo "$metadata" | jq -r '.data.versions[(.data.current_version|tostring)].created_time // "?"' | cut -c1-19)
                    printf "  %-42s  v%-7s  %s\n" "${category}/${path}" "$version" "$created"
                fi
            fi
        done <<< "$paths"
    done

    # ---- Static DB Roles ----
    echo ""
    log_info "Static DB Roles (PostgreSQL):"
    printf "  %-25s  %-12s  %s\n" "ROLE" "TTL" "LAST ROTATED"

    for role in keycloak-hub nextauth-hub; do
        local creds
        creds=$(vault read -format=json "database/static-creds/${role}" 2>/dev/null || true)
        if [ -n "$creds" ]; then
            local ttl last_rotation
            ttl=$(echo "$creds" | jq -r '.data.ttl // "?"')
            last_rotation=$(echo "$creds" | jq -r '.data.last_vault_rotation // "?"' | cut -c1-19)
            printf "  %-25s  %-12s  %s\n" "$role" "${ttl}s" "$last_rotation"
        else
            printf "  %-25s  %-12s  %s\n" "$role" "-" "not configured"
        fi
    done

    # ---- Dynamic DB Roles ----
    echo ""
    log_info "Dynamic DB Roles (MongoDB):"
    printf "  %-25s  %s\n" "ROLE" "ACTIVE LEASES"

    for role in backend-hub-rw kas-hub-ro; do
        local count
        count=$(vault list -format=json "sys/leases/lookup/database/creds/${role}" 2>/dev/null | jq -r 'length' 2>/dev/null || echo "0")
        printf "  %-25s  %s\n" "$role" "$count"
    done

    # ---- PKI Certificates ----
    echo ""
    log_info "PKI Certificates:"
    printf "  %-15s  %-12s  %s\n" "INSTANCE" "DAYS LEFT" "EXPIRES"

    local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
    if [ -f "$hub_cert" ]; then
        local days expiry status_flag=""
        days=$(_vault_cert_days_remaining "$hub_cert")
        expiry=$(openssl x509 -enddate -noout -in "$hub_cert" 2>/dev/null | sed 's/notAfter=//')
        [ "$days" -ge 0 ] && [ "$days" -lt "$VAULT_PKI_RENEW_BEFORE_DAYS" ] && status_flag=" (RENEWAL DUE)"
        printf "  %-15s  %-12s  %s%s\n" "hub" "$days" "$expiry" "$status_flag"
    fi

    local instances
    instances=$(_vault_discover_instances)
    while IFS= read -r instance; do
        [ -z "$instance" ] && continue
        local cert="${DIVE_ROOT}/instances/${instance}/certs/certificate.pem"
        if [ -f "$cert" ]; then
            local days expiry status_flag=""
            days=$(_vault_cert_days_remaining "$cert")
            expiry=$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | sed 's/notAfter=//')
            [ "$days" -ge 0 ] && [ "$days" -lt "$VAULT_PKI_RENEW_BEFORE_DAYS" ] && status_flag=" (RENEWAL DUE)"
            printf "  %-15s  %-12s  %s%s\n" "$instance" "$days" "$expiry" "$status_flag"
        fi
    done <<< "$instances"

    echo ""
    log_info "==================================================================="
}

##
# Scheduled health check: sync static DB creds, auto-renew expiring PKI certs
# Usage: ./dive vault rotation-check
##
module_vault_rotation_check() {
    if ! vault_is_running; then return 1; fi
    _vault_load_token || return 1

    echo ""
    log_info "==================================================================="
    log_info "  Vault Rotation Health Check"
    log_info "==================================================================="
    echo ""

    local issues=0

    # ---- Static DB credential sync ----
    log_info "Checking static DB credentials..."
    for role in keycloak-hub nextauth-hub; do
        local ttl
        ttl=$(vault read -field=ttl "database/static-creds/${role}" 2>/dev/null || echo "0")
        if [ "${ttl:-0}" -le 0 ]; then
            log_warn "  ${role}: TTL expired — forcing rotation"
            vault write -f "database/rotate-role/${role}" 2>/dev/null || true
            issues=$((issues + 1))
        else
            log_success "  ${role}: TTL=${ttl}s (healthy)"
        fi
    done

    # Sync latest PG creds to .env
    if type -t _vault_db_sync_pg_creds_to_env &>/dev/null; then
        _vault_db_sync_pg_creds_to_env 2>/dev/null || true
    fi

    # ---- PKI certificate renewal ----
    echo ""
    log_info "Checking PKI certificates..."

    # Source certificates.sh for PKI renewal functions
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" 2>/dev/null || true
    fi

    # Hub cert
    local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
    if [ -f "$hub_cert" ]; then
        local days
        days=$(_vault_cert_days_remaining "$hub_cert")
        if [ "$days" -ge 0 ] && [ "$days" -lt "$VAULT_PKI_RENEW_BEFORE_DAYS" ]; then
            log_warn "  Hub cert expires in ${days} days — renewing"
            cp "$hub_cert" "${hub_cert}.bak" 2>/dev/null || true
            if type -t generate_hub_certificate_vault &>/dev/null; then
                if generate_hub_certificate_vault; then
                    log_success "  Hub cert renewed"
                    _vault_rotation_audit "INFO" "PKI_RENEWED: hub"
                    rm -f "${hub_cert}.bak"
                else
                    log_error "  Hub cert renewal failed — restoring backup"
                    mv "${hub_cert}.bak" "$hub_cert" 2>/dev/null || true
                    _vault_rotation_audit "ERROR" "PKI_RENEWAL_FAILED: hub"
                    issues=$((issues + 1))
                fi
            else
                log_warn "  generate_hub_certificate_vault() not available"
                issues=$((issues + 1))
            fi
        elif [ "$days" -ge 0 ]; then
            log_success "  Hub cert: ${days} days remaining (healthy)"
        fi
    fi

    # Spoke certs
    local instances
    instances=$(_vault_discover_instances)
    while IFS= read -r instance; do
        [ -z "$instance" ] && continue
        local cert="${DIVE_ROOT}/instances/${instance}/certs/certificate.pem"
        if [ -f "$cert" ]; then
            local days
            days=$(_vault_cert_days_remaining "$cert")
            if [ "$days" -ge 0 ] && [ "$days" -lt "$VAULT_PKI_RENEW_BEFORE_DAYS" ]; then
                local code_upper
                code_upper=$(upper "$instance")
                log_warn "  ${code_upper} cert expires in ${days} days — renewing"
                cp "$cert" "${cert}.bak" 2>/dev/null || true
                if type -t generate_spoke_certificate_vault &>/dev/null; then
                    if generate_spoke_certificate_vault "$instance"; then
                        log_success "  ${code_upper} cert renewed"
                        _vault_rotation_audit "INFO" "PKI_RENEWED: ${instance}"
                        rm -f "${cert}.bak"
                    else
                        log_error "  ${code_upper} cert renewal failed — restoring backup"
                        mv "${cert}.bak" "$cert" 2>/dev/null || true
                        _vault_rotation_audit "ERROR" "PKI_RENEWAL_FAILED: ${instance}"
                        issues=$((issues + 1))
                    fi
                else
                    log_warn "  generate_spoke_certificate_vault() not available"
                    issues=$((issues + 1))
                fi
            elif [ "$days" -ge 0 ]; then
                log_success "  $(upper "$instance") cert: ${days} days remaining (healthy)"
            fi
        fi
    done <<< "$instances"

    # Write Prometheus metrics
    echo ""
    log_info "Writing Prometheus metrics..."
    _vault_rotation_write_metrics

    # Summary
    echo ""
    log_info "==================================================================="
    if [ $issues -eq 0 ]; then
        log_success "  All rotation checks passed"
    else
        log_warn "  ${issues} issue(s) found"
    fi
    log_info "==================================================================="

    [ $issues -gt 0 ] && return 1
    return 0
}

##
# Comprehensive rotation test suite (7 checks)
# Usage: ./dive vault test-rotation-full [CODE]
##
module_vault_test_rotation_full() {
    local target_code="${1:-DEU}"
    local code_lower
    code_lower=$(lower "$target_code")

    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    if ! vault_is_running; then return 1; fi
    _vault_load_token || return 1
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh" 2>/dev/null

    test_suite_start "Vault Rotation Full Test (${target_code})"

    # ------------------------------------------------------------------
    # Test 1: KV v2 rotate + restore
    # ------------------------------------------------------------------
    test_start "KV v2 rotate and restore"
    local secret_path="dive-v3/core/${code_lower}/redis"
    local original_value
    original_value=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ -n "$original_value" ]; then
        local test_value="rotation-full-test-$(date +%s)"
        if vault kv put "$secret_path" password="$test_value" >/dev/null 2>&1; then
            local readback
            readback=$(vault kv get -field=password "$secret_path" 2>/dev/null)
            if [ "$readback" = "$test_value" ]; then
                vault kv put "$secret_path" password="$original_value" >/dev/null 2>&1
                test_pass
            else
                vault kv put "$secret_path" password="$original_value" >/dev/null 2>&1
                test_fail "Readback mismatch"
            fi
        else
            test_fail "Cannot write to $secret_path"
        fi
    else
        test_fail "Cannot read $secret_path"
    fi

    # ------------------------------------------------------------------
    # Test 2: KV v2 metadata accessible
    # ------------------------------------------------------------------
    test_start "KV v2 metadata accessible"
    local metadata
    metadata=$(vault kv metadata get -format=json "$secret_path" 2>/dev/null || true)
    if [ -n "$metadata" ]; then
        local version created
        version=$(echo "$metadata" | jq -r '.data.current_version // empty')
        created=$(echo "$metadata" | jq -r '.data.versions[(.data.current_version|tostring)].created_time // empty')
        if [ -n "$version" ] && [ -n "$created" ]; then
            test_pass "version=${version}"
        else
            test_fail "Missing version or created_time"
        fi
    else
        test_fail "Cannot read metadata for $secret_path"
    fi

    # ------------------------------------------------------------------
    # Test 3: Static DB creds readable with positive TTL
    # ------------------------------------------------------------------
    test_start "Static DB creds readable (keycloak-hub)"
    local pg_creds
    pg_creds=$(vault read -format=json "database/static-creds/keycloak-hub" 2>/dev/null || true)
    if [ -n "$pg_creds" ]; then
        local ttl
        ttl=$(echo "$pg_creds" | jq -r '.data.ttl // 0')
        if [ "${ttl:-0}" -gt 0 ]; then
            test_pass "TTL=${ttl}s"
        else
            test_fail "TTL is 0 or negative"
        fi
    else
        test_skip "Database secrets engine not configured"
    fi

    # ------------------------------------------------------------------
    # Test 4: Dynamic DB lease issuable + renewable
    # ------------------------------------------------------------------
    test_start "Dynamic DB lease issuable (backend-hub-rw)"
    local dynamic_creds
    dynamic_creds=$(vault read -format=json "database/creds/backend-hub-rw" 2>/dev/null || true)
    if [ -n "$dynamic_creds" ]; then
        local lease_id
        lease_id=$(echo "$dynamic_creds" | jq -r '.lease_id // empty')
        if [ -n "$lease_id" ]; then
            if vault lease renew "$lease_id" >/dev/null 2>&1; then
                vault lease revoke "$lease_id" >/dev/null 2>&1 || true
                test_pass
            else
                vault lease revoke "$lease_id" >/dev/null 2>&1 || true
                test_fail "Lease renewal failed"
            fi
        else
            test_fail "No lease_id in response"
        fi
    else
        test_skip "Database secrets engine not configured"
    fi

    # ------------------------------------------------------------------
    # Test 5: PKI cert expiry date readable
    # ------------------------------------------------------------------
    test_start "PKI cert expiry readable"
    local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
    local spoke_cert="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"
    local found_cert=""
    [ -f "$hub_cert" ] && found_cert="$hub_cert"
    [ -f "$spoke_cert" ] && found_cert="$spoke_cert"

    if [ -n "$found_cert" ]; then
        local days
        days=$(_vault_cert_days_remaining "$found_cert")
        if [ "$days" -ge 0 ]; then
            test_pass "${days} days remaining"
        else
            test_fail "Cannot parse cert expiry"
        fi
    else
        test_skip "No PKI certs found for hub or ${target_code}"
    fi

    # ------------------------------------------------------------------
    # Test 6: Dry-run produces no writes
    # ------------------------------------------------------------------
    test_start "Dry-run produces no writes"
    local pre_version
    pre_version=$(vault kv metadata get -format=json "$secret_path" 2>/dev/null | jq -r '.data.current_version // "0"')
    _vault_rotate_single_kv "core" "${code_lower}/redis" "password" "password" "true" >/dev/null 2>&1
    local post_version
    post_version=$(vault kv metadata get -format=json "$secret_path" 2>/dev/null | jq -r '.data.current_version // "0"')

    if [ "$pre_version" = "$post_version" ]; then
        test_pass "version unchanged (v${pre_version})"
    else
        test_fail "Version changed: v${pre_version} → v${post_version}"
    fi

    # ------------------------------------------------------------------
    # Test 7: Audit log writable
    # ------------------------------------------------------------------
    test_start "Audit log writable"
    _vault_rotation_audit "TEST" "test-rotation-full validation"
    local log_file="${DIVE_ROOT}/logs/vault/rotation-audit.log"
    if [ -f "$log_file" ] && grep -q "test-rotation-full validation" "$log_file"; then
        test_pass
    else
        test_fail "Audit log not writable"
    fi

    test_suite_end
}
