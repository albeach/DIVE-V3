#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Secrets Provider Implementations (AWS, Vault)
# =============================================================================
# Extracted from configuration/secrets.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_SECRETS_PROVIDERS_LOADED:-}" ] && return 0

# =============================================================================
# HASHICORP VAULT FUNCTIONS
# =============================================================================

VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
VAULT_CACERT="${VAULT_CACERT:-${DIVE_ROOT:-}/certs/vault/node1/ca.pem}"

# Build curl TLS flags for Vault API calls
# For localhost connections, use --insecure (no MITM risk, avoids CA mismatch
# issues during bootstrap→Vault PKI cert rotation transitions)
_vault_curl_flags() {
    local -a flags=()
    if [[ "${VAULT_ADDR:-}" =~ (localhost|127\.0\.0\.1) ]]; then
        flags+=(--insecure)
    elif [ -n "$VAULT_CACERT" ] && [ -f "$VAULT_CACERT" ]; then
        flags+=(--cacert "$VAULT_CACERT")
    fi
    printf '%s\n' "${flags[@]}"
}

##
# Check if Vault is authenticated
##
vault_is_authenticated() {
    if [ -z "$VAULT_TOKEN" ]; then
        # Try to load from .vault-token file
        if [ -f ~/.vault-token ]; then
            VAULT_TOKEN=$(cat ~/.vault-token)
        elif [ -f "${DIVE_ROOT}/.vault-token" ]; then
            VAULT_TOKEN=$(cat "${DIVE_ROOT}/.vault-token")
        else
            return 1
        fi
        export VAULT_TOKEN
    fi

    # Test token validity (standbyok=true for HA clusters where node may be standby)
    local -a vault_curl_args=()
    local _vault_curl_arg
    while IFS= read -r _vault_curl_arg; do
        [ -n "$_vault_curl_arg" ] && vault_curl_args+=("$_vault_curl_arg")
    done < <(_vault_curl_flags)
    curl -sfL "${vault_curl_args[@]}" -H "X-Vault-Token: $VAULT_TOKEN" \
        "${VAULT_ADDR}/v1/sys/health?standbyok=true" >/dev/null 2>&1
}

##
# Authenticate using AppRole (for spoke service accounts)
# Arguments:
#   $1 - Role ID
#   $2 - Secret ID
##
vault_approle_login() {
    local role_id="$1"
    local secret_id="$2"

    local response
    local -a vault_curl_args=()
    local _vault_curl_arg
    while IFS= read -r _vault_curl_arg; do
        [ -n "$_vault_curl_arg" ] && vault_curl_args+=("$_vault_curl_arg")
    done < <(_vault_curl_flags)
    response=$(curl -sf "${vault_curl_args[@]}" -X POST \
        -d "{\"role_id\":\"$role_id\",\"secret_id\":\"$secret_id\"}" \
        "${VAULT_ADDR}/v1/auth/approle/login")

    if [ -n "$response" ]; then
        VAULT_TOKEN=$(echo "$response" | jq -r '.auth.client_token')
        export VAULT_TOKEN
        echo "$VAULT_TOKEN" > "${DIVE_ROOT}/.vault-token"
        chmod 600 "${DIVE_ROOT}/.vault-token"
        log_success "Vault AppRole authentication successful"
        return 0
    fi

    log_error "Vault AppRole authentication failed"
    return 1
}

##
# Get secret from Vault KV v2
# Arguments:
#   $1 - Secret category (core, auth, federation, opal)
#   $2 - Secret path (e.g., "usa/postgres", "deu/mongodb")
#   $3 - Secret field (default: "password")
##
vault_get_secret() {
    local category="$1"
    local path="$2"
    local field="${3:-password}"

    if ! vault_is_authenticated; then
        log_error "Vault not authenticated"
        return 1
    fi

    # KV v2 uses /data/ in API path
    local full_path="dive-v3/${category}/data/${path}"
    local api_path="${VAULT_ADDR}/v1/${full_path}"

    local response
    local -a vault_curl_args=()
    local _vault_curl_arg
    while IFS= read -r _vault_curl_arg; do
        [ -n "$_vault_curl_arg" ] && vault_curl_args+=("$_vault_curl_arg")
    done < <(_vault_curl_flags)
    response=$(curl -sfL "${vault_curl_args[@]}" -H "X-Vault-Token: $VAULT_TOKEN" "$api_path")

    if [ -n "$response" ]; then
        echo "$response" | jq -r ".data.data.${field} // empty"
    else
        return 1
    fi
}

##
# Set secret in Vault KV v2
# Arguments:
#   $1 - Secret category
#   $2 - Secret path
#   $3 - Secret value (as JSON object, e.g., '{"password":"..."}')
##
vault_set_secret() {
    local category="$1"
    local path="$2"
    local value="$3"

    if ! vault_is_authenticated; then
        log_error "Vault not authenticated"
        return 1
    fi

    local full_path="dive-v3/${category}/data/${path}"
    local api_path="${VAULT_ADDR}/v1/${full_path}"

    local -a vault_curl_args=()
    local _vault_curl_arg
    while IFS= read -r _vault_curl_arg; do
        [ -n "$_vault_curl_arg" ] && vault_curl_args+=("$_vault_curl_arg")
    done < <(_vault_curl_flags)
    curl -sfL "${vault_curl_args[@]}" -X POST \
        -H "X-Vault-Token: $VAULT_TOKEN" \
        -d "{\"data\":$value}" \
        "${api_path}" >/dev/null 2>&1

    log_verbose "Vault secret updated: $full_path"
}

##
# Check if Vault secret exists
##
vault_secret_exists() {
    local category="$1"
    local path="$2"

    vault_get_secret "$category" "$path" "password" >/dev/null 2>&1
}

# =============================================================================
# GCP SECRET MANAGER FUNCTIONS
# =============================================================================

##
# Check if GCP is authenticated
##
gcp_is_authenticated() {
    gcloud auth print-access-token >/dev/null 2>&1
}

##
# Get secret from GCP Secret Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
#
# Returns:
#   Secret value on stdout
##
gcp_get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    if [ "$USE_GCP_SECRETS" != "true" ]; then
        log_warn "GCP secrets disabled - returning empty"
        return 1
    fi

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated - run: gcloud auth application-default login"
        return 1
    fi

    gcloud secrets versions access latest \
        --secret="$full_name" \
        --project="$GCP_PROJECT_ID" \
        2>/dev/null
}

##
# Set secret in GCP Secret Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Secret value
#   $3 - Instance code (optional)
##
gcp_set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated"
        return 1
    fi

    # Create secret if not exists
    gcloud secrets describe "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1 || \
        gcloud secrets create "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1

    # Add new version
    echo -n "$secret_value" | gcloud secrets versions add "$full_name" \
        --data-file=- \
        --project="$GCP_PROJECT_ID" \
        >/dev/null 2>&1

    log_verbose "Secret updated: $full_name"
}

##
# Check if secret exists
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
##
gcp_secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    gcloud secrets describe "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1
}

# =============================================================================
# UNIFIED CONVENIENCE FUNCTIONS (Provider-agnostic)
# =============================================================================

##
# Get secret (routes to correct provider)
##
get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"

    case "$SECRETS_PROVIDER" in
        vault)
            # Map legacy secret names to Vault paths
            local category path field
            # Vault paths are lowercase (usa/, deu/, etc.)
            local vault_instance
            vault_instance=$(lower "${instance_code:-shared}")

            case "$secret_name" in
                keycloak-admin-password|keycloak)
                    category="core"
                    path="${vault_instance}/keycloak-admin"
                    field="password"
                    ;;
                postgres-password|postgres)
                    category="core"
                    path="${vault_instance}/postgres"
                    field="password"
                    ;;
                mongo-password|mongodb)
                    category="core"
                    path="${vault_instance}/mongodb"
                    field="password"
                    ;;
                redis-password|redis)
                    category="core"
                    path="${vault_instance}/redis"
                    field="password"
                    ;;
                auth-secret)
                    category="auth"
                    path="${vault_instance}/nextauth"
                    field="secret"
                    ;;
                keycloak-client-secret)
                    category="auth"
                    path="shared/keycloak-client"
                    field="secret"
                    ;;
                redis-blacklist)
                    category="core"
                    path="shared/redis-blacklist"
                    field="password"
                    ;;
                opal-master-token)
                    category="opal"
                    path="master-token"
                    field="token"
                    ;;
                opal-data-source-token)
                    category="opal"
                    path="data-source-token"
                    field="token"
                    ;;
                *)
                    log_error "Unknown secret type for Vault: $secret_name"
                    return 1
                    ;;
            esac

            vault_get_secret "$category" "$path" "$field"
            ;;
        aws)
            aws_get_secret "$secret_name" "$instance_code"
            ;;
        gcp|*)
            gcp_get_secret "$secret_name" "$instance_code"
            ;;
    esac
}

##
# Set secret (routes to correct provider)
##
set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"

    case "$SECRETS_PROVIDER" in
        vault)
            # Map legacy secret names to Vault paths (same as get_secret)
            local category path
            local vault_instance
            vault_instance=$(lower "${instance_code:-shared}")

            case "$secret_name" in
                keycloak-admin-password|keycloak|postgres-password|postgres|mongo-password|mongodb|redis-password|redis)
                    category="core"
                    path="${vault_instance}/${secret_name%-*}"  # Extract base name
                    ;;
                auth-secret)
                    category="auth"
                    path="${vault_instance}/nextauth"
                    ;;
                keycloak-client-secret)
                    category="auth"
                    path="shared/keycloak-client"
                    ;;
                redis-blacklist)
                    category="core"
                    path="shared/redis-blacklist"
                    ;;
                opal-master-token)
                    category="opal"
                    path="master-token"
                    ;;
                opal-data-source-token)
                    category="opal"
                    path="data-source-token"
                    ;;
                *)
                    log_error "Unknown secret type for Vault: $secret_name"
                    return 1
                    ;;
            esac

            # Wrap value in JSON based on field type
            local json_value
            if [[ "$secret_name" == *"auth"* ]] || [[ "$secret_name" == *"client-secret"* ]]; then
                json_value="{\"secret\":\"$secret_value\"}"
            elif [[ "$secret_name" == *"token"* ]]; then
                json_value="{\"token\":\"$secret_value\"}"
            else
                json_value="{\"password\":\"$secret_value\"}"
            fi

            vault_set_secret "$category" "$path" "$json_value"
            ;;
        aws)
            aws_set_secret "$secret_name" "$secret_value" "$instance_code"
            ;;
        gcp|*)
            gcp_set_secret "$secret_name" "$secret_value" "$instance_code"
            ;;
    esac
}

##
# Check if secret exists (routes to correct provider)
##
secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"

    case "$SECRETS_PROVIDER" in
        vault)
            # Use get_secret to check existence (returns 1 if not found)
            get_secret "$secret_name" "$instance_code" >/dev/null 2>&1
            ;;
        aws)
            aws_secret_exists "$secret_name" "$instance_code"
            ;;
        gcp|*)
            gcp_secret_exists "$secret_name" "$instance_code"
            ;;
    esac
}

##
# Check if authenticated (routes to correct provider)
##
is_authenticated() {
    case "$SECRETS_PROVIDER" in
        vault) vault_is_authenticated ;;
        aws)   aws_is_authenticated ;;
        gcp|*) gcp_is_authenticated ;;
    esac
}

# =============================================================================

export DIVE_SECRETS_PROVIDERS_LOADED=1
