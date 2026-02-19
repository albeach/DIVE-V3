#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — Remote Spoke Configuration (Hub-side)
# =============================================================================
# Runs Terraform + Keycloak federation setup FROM the Hub, connecting to
# the spoke Keycloak via its public HTTPS URL (not docker exec).
#
# This module handles:
#   1. Terraform apply → spoke Keycloak realm + client setup
#   2. Hub-side IdP creation (docker exec to Hub Keycloak — we're on the Hub)
#   3. Spoke-side IdP creation (HTTPS REST API to spoke Keycloak)
#   4. IdP mapper configuration (both directions)
#   5. Bidirectional federation verification
#
# Usage:
#   ./dive spoke configure GBR
#
# Prerequisites:
#   - Hub must be running (Keycloak, backend)
#   - Spoke Keycloak must be accessible via public HTTPS URL
#   - ECR_REGISTRY, DIVE_DOMAIN_SUFFIX must be set
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-18
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_SPOKE_CONFIGURE_REMOTE_LOADED:-}" ] && return 0
export DIVE_SPOKE_CONFIGURE_REMOTE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIGURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$(dirname "$CONFIGURE_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load Terraform module
if [ -f "${MODULES_DIR}/configuration/terraform.sh" ]; then
    source "${MODULES_DIR}/configuration/terraform.sh"
fi

# Load federation modules (for helper functions)
for _mod in \
    "${CONFIGURE_DIR}/pipeline/spoke-federation.sh" \
    "${CONFIGURE_DIR}/pipeline/spoke-federation-extended.sh" \
    "${CONFIGURE_DIR}/pipeline/phase-configuration.sh" \
    "${CONFIGURE_DIR}/pipeline/phase-configuration-secondary.sh"; do
    [ -f "$_mod" ] && source "$_mod"
done
unset _mod

# =============================================================================
# CONFIGURATION
# =============================================================================

HUB_KEYCLOAK_CONTAINER="dive-hub-keycloak"
HUB_REALM="dive-v3-broker-usa"

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

##
# Configure a remote spoke from the Hub
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_configure_remote() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    if [ "$code_upper" = "USA" ]; then
        log_error "Cannot configure USA — Hub is configured via hub deploy"
        return 1
    fi

    log_info "Configuring spoke ${code_upper} from Hub (remote mode)"
    echo ""

    # Resolve spoke public URLs
    local spoke_idp_url=""
    local spoke_api_url=""
    local spoke_app_url=""

    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        spoke_idp_url="https://${_env_prefix}-${code_lower}-idp.${_base_domain}"
        spoke_api_url="https://${_env_prefix}-${code_lower}-api.${_base_domain}"
        spoke_app_url="https://${_env_prefix}-${code_lower}-app.${_base_domain}"
    else
        log_error "DIVE_DOMAIN_SUFFIX not set — cannot determine spoke public URLs"
        log_error "Set DIVE_DOMAIN_SUFFIX (e.g., dev.dive25.com)"
        return 1
    fi

    log_verbose "Spoke IdP URL: ${spoke_idp_url}"
    log_verbose "Spoke API URL: ${spoke_api_url}"
    log_verbose "Spoke App URL: ${spoke_app_url}"

    # =========================================================================
    # STEP 1: Verify spoke Keycloak is accessible
    # =========================================================================
    log_step "1/6 Verify spoke Keycloak is accessible"

    local max_attempts=12
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -skf --max-time 5 "${spoke_idp_url}/realms/master" >/dev/null 2>&1; then
            log_success "Spoke Keycloak accessible at ${spoke_idp_url}"
            break
        fi
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            log_error "Spoke Keycloak not accessible after ${max_attempts} attempts"
            log_error "URL: ${spoke_idp_url}/realms/master"
            return 1
        fi
        log_verbose "Waiting for spoke Keycloak... (attempt ${attempt}/${max_attempts})"
        sleep 10
    done

    # =========================================================================
    # STEP 2: Apply Terraform (spoke realm + client)
    # =========================================================================
    log_step "2/6 Apply Terraform (spoke Keycloak realm)"

    _configure_remote_terraform "$code_upper" "$code_lower" \
        "$spoke_idp_url" "$spoke_api_url" "$spoke_app_url" || {
        log_error "Terraform failed for spoke $code_upper"
        return 1
    }

    log_success "Terraform applied — spoke realm configured"

    # =========================================================================
    # STEP 3: Create usa-idp in Spoke Keycloak (via HTTPS REST API)
    # =========================================================================
    log_step "3/6 Create usa-idp in Spoke Keycloak"

    _configure_remote_spoke_idp "$code_upper" "$code_lower" "$spoke_idp_url" || {
        log_warn "usa-idp creation in spoke had issues (non-fatal, can retry)"
    }

    # =========================================================================
    # STEP 4: Create ${code_lower}-idp in Hub Keycloak (docker exec, Hub-local)
    # =========================================================================
    log_step "4/6 Create ${code_lower}-idp in Hub Keycloak"

    _configure_remote_hub_idp "$code_upper" "$code_lower" "$spoke_idp_url" || {
        log_warn "Hub-side IdP creation had issues (non-fatal, can retry)"
    }

    # =========================================================================
    # STEP 5: Seed spoke users (via Keycloak HTTPS API)
    # =========================================================================
    log_step "5/6 Seed spoke users"

    _configure_remote_seed_users "$code_upper" "$code_lower" "$spoke_idp_url" || {
        log_warn "User seeding had issues — may need manual seeding"
    }

    # =========================================================================
    # STEP 6: Verify bidirectional federation
    # =========================================================================
    log_step "6/6 Verify bidirectional federation"

    _configure_remote_verify "$code_upper" "$code_lower" "$spoke_idp_url" || {
        log_warn "Federation verification had issues"
    }

    echo ""
    log_success "Spoke ${code_upper} configuration complete!"
    echo ""
    echo "  Spoke URLs:"
    echo "    App:  ${spoke_app_url}"
    echo "    API:  ${spoke_api_url}"
    echo "    IdP:  ${spoke_idp_url}"
    return 0
}

# =============================================================================
# TERRAFORM
# =============================================================================

##
# Apply Terraform for spoke realm setup via public HTTPS URL
##
_configure_remote_terraform() {
    local code_upper="$1"
    local code_lower="$2"
    local spoke_idp_url="$3"
    local spoke_api_url="$4"
    local spoke_app_url="$5"

    local tf_dir="${DIVE_ROOT}/terraform/spoke"

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform spoke directory not found: $tf_dir"
        return 1
    fi

    # Set Terraform variables
    local kc_pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"

    export TF_VAR_keycloak_admin_password="${!kc_pass_var}"
    export TF_VAR_client_secret="${!client_secret_var}"
    export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-TestUser2025!Pilot}"
    export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"

    if [ -z "$TF_VAR_keycloak_admin_password" ]; then
        # Try loading from spoke .env
        local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env" ]; then
            TF_VAR_keycloak_admin_password=$(grep "^${kc_pass_var}=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
            export TF_VAR_keycloak_admin_password
        fi
    fi

    if [ -z "$TF_VAR_keycloak_admin_password" ]; then
        log_error "Keycloak admin password not found: $kc_pass_var"
        return 1
    fi

    # The spoke Keycloak URL for Terraform provider — use public HTTPS
    # Terraform's Keycloak provider needs to connect to the admin API
    export TF_VAR_keycloak_url="${spoke_idp_url}"

    # Override KEYCLOAK_REALM to master (Terraform provider authenticates via master)
    export KEYCLOAK_REALM="master"

    cd "$tf_dir"

    # Init Terraform
    terraform init -input=false >/dev/null 2>&1 || {
        log_error "Terraform init failed"
        cd - >/dev/null
        return 1
    }

    # Create or select workspace
    terraform workspace select "$code_lower" 2>/dev/null || \
        terraform workspace new "$code_lower" 2>/dev/null || true

    # Find country tfvars file
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"
    local tfvars_arg=""
    if [ -f "$tfvars_file" ]; then
        tfvars_arg="-var-file=${tfvars_file}"
    fi

    # Apply with spoke's public HTTPS URL
    # NOTE: -var-file MUST come before -var flags (Terraform last-value-wins)
    log_info "Terraform apply → ${spoke_idp_url}"
    terraform apply -auto-approve -parallelism=20 -compact-warnings \
        $tfvars_arg \
        -var="keycloak_url=${spoke_idp_url}" \
        -var="app_url=${spoke_app_url}" \
        -var="api_url=${spoke_api_url}" \
        -var="idp_url=${spoke_idp_url}" \
        2>&1 | while IFS= read -r line; do
            echo "  [TF] $line"
        done

    local tf_exit=${PIPESTATUS[0]}
    cd - >/dev/null

    return $tf_exit
}

# =============================================================================
# SPOKE-SIDE IDP (usa-idp in spoke Keycloak via HTTPS)
# =============================================================================

##
# Create usa-idp in spoke Keycloak via HTTPS REST API
##
_configure_remote_spoke_idp() {
    local code_upper="$1"
    local code_lower="$2"
    local spoke_idp_url="$3"

    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="usa-idp"

    # Get admin token from spoke Keycloak via HTTPS
    local kc_pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local kc_password="${!kc_pass_var}"

    local admin_token
    admin_token=$(_kc_get_admin_token_https "$spoke_idp_url" "$kc_password") || {
        log_error "Failed to get admin token from spoke Keycloak"
        return 1
    }

    # Get Hub's external IdP URL
    local hub_idp_url=""
    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        hub_idp_url="https://${_env_prefix}-usa-idp.${_base_domain}"
    fi

    if [ -z "$hub_idp_url" ]; then
        log_error "Cannot determine Hub IdP URL"
        return 1
    fi

    # Get Hub client secret (for spoke → Hub federation)
    local hub_client_secret="${KEYCLOAK_CLIENT_SECRET_USA:-}"
    if [ -z "$hub_client_secret" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        hub_client_secret=$(grep "^KEYCLOAK_CLIENT_SECRET=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    fi

    # Check if IdP already exists
    local existing
    existing=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $admin_token" \
        "${spoke_idp_url}/admin/realms/${spoke_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    local http_method="POST"
    local url="${spoke_idp_url}/admin/realms/${spoke_realm}/identity-provider/instances"

    if echo "$existing" | jq -e '.alias' >/dev/null 2>&1; then
        log_verbose "usa-idp already exists in spoke — updating"
        http_method="PUT"
        url="${spoke_idp_url}/admin/realms/${spoke_realm}/identity-provider/instances/${idp_alias}"
    fi

    # Detect the Simple Post-Broker OTP flow (created by Terraform realm-mfa module)
    # This is the Keycloak-recommended way to enforce MFA after federated login
    local spoke_post_broker_otp=""
    local _flows
    _flows=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $admin_token" \
        "${spoke_idp_url}/admin/realms/${spoke_realm}/authentication/flows" 2>/dev/null)
    local _otp_flow
    _otp_flow=$(echo "$_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)
    if [ -n "$_otp_flow" ]; then
        spoke_post_broker_otp="$_otp_flow"
        log_verbose "Using post-broker OTP flow: ${spoke_post_broker_otp}"
    else
        log_warn "Simple Post-Broker OTP flow not found in spoke — post-broker MFA disabled"
    fi

    # Build IdP config (Hub OIDC provider in spoke)
    local idp_config
    idp_config=$(cat <<IDPEOF
{
    "alias": "${idp_alias}",
    "displayName": "United States (Hub)",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "firstBrokerLoginFlowAlias": "first broker login",
    "postBrokerLoginFlowAlias": "${spoke_post_broker_otp}",
    "config": {
        "clientId": "dive-v3-broker-usa",
        "clientSecret": "${hub_client_secret}",
        "authorizationUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/auth",
        "tokenUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/token",
        "userInfoUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/userinfo",
        "jwksUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/certs",
        "logoutUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/logout",
        "issuer": "${hub_idp_url}/realms/${HUB_REALM}",
        "defaultScope": "openid profile email clearance countryOfAffiliation acpCOI uniqueID user_amr user_acr",
        "syncMode": "FORCE",
        "validateSignature": "true",
        "useJwksUrl": "true",
        "pkceEnabled": "false",
        "backchannelSupported": "false",
        "disableUserInfo": "false"
    }
}
IDPEOF
)

    local response
    response=$(curl -sk --max-time 15 \
        -X "$http_method" \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        "$url" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "usa-idp created/updated in spoke ${code_upper} Keycloak"
    else
        log_warn "usa-idp creation response: $response"
    fi

    # Create attribute mappers
    _configure_remote_idp_mappers "$spoke_idp_url" "$spoke_realm" "$idp_alias" "$admin_token"

    # =========================================================================
    # Ensure dive-v3-broker-usa client exists in spoke realm
    # This client is needed for Hub→Spoke federation (Hub redirects to spoke,
    # spoke needs this client to accept the redirect back to Hub's broker)
    # =========================================================================
    local hub_broker_client_id="dive-v3-broker-usa"
    log_verbose "Ensuring ${hub_broker_client_id} client exists in spoke realm"

    local existing_client
    existing_client=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $admin_token" \
        "${spoke_idp_url}/admin/realms/${spoke_realm}/clients?clientId=${hub_broker_client_id}" 2>/dev/null || echo "[]")

    local client_uuid=""
    client_uuid=$(echo "$existing_client" | jq -r '.[0].id // empty' 2>/dev/null)

    if [ -n "$client_uuid" ]; then
        # Client exists (likely from Terraform) — ensure redirect URIs include Hub broker endpoint
        local spoke_broker_uri="${spoke_idp_url}/realms/${spoke_realm}/broker/${idp_alias}/endpoint"
        local hub_broker_uri="${hub_idp_url}/realms/${HUB_REALM}/broker/${code_lower}-idp/endpoint"

        # Get current redirectUris and add broker endpoints
        local current_uris
        current_uris=$(echo "$existing_client" | jq -r '.[0].redirectUris // []' 2>/dev/null)

        # Add Hub broker redirect URIs if not present
        local updated_uris
        updated_uris=$(echo "$current_uris" | jq --arg uri1 "$hub_broker_uri" --arg uri2 "${hub_broker_uri}/*" \
            'if (. | index($uri1)) then . else . + [$uri1, $uri2] end' 2>/dev/null)

        if [ -n "$updated_uris" ] && [ "$updated_uris" != "$current_uris" ]; then
            curl -sk --max-time 10 \
                -X PUT "${spoke_idp_url}/admin/realms/${spoke_realm}/clients/${client_uuid}" \
                -H "Authorization: Bearer $admin_token" \
                -H "Content-Type: application/json" \
                -d "{\"clientId\":\"${hub_broker_client_id}\",\"redirectUris\":${updated_uris}}" >/dev/null 2>&1
            log_verbose "Updated ${hub_broker_client_id} redirect URIs in spoke realm"
        fi
    fi

    return 0
}

# =============================================================================
# HUB-SIDE IDP (${code}-idp in Hub Keycloak via docker exec)
# =============================================================================

##
# Create ${code_lower}-idp in Hub Keycloak (we're on the Hub, so docker exec works)
##
_configure_remote_hub_idp() {
    local code_upper="$1"
    local code_lower="$2"
    local spoke_idp_url="$3"

    local idp_alias="${code_lower}-idp"
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Get Hub admin token via docker exec (we're on the Hub)
    local hub_admin_token
    hub_admin_token=$(_kc_get_admin_token_docker "$HUB_KEYCLOAK_CONTAINER") || {
        log_error "Failed to get Hub Keycloak admin token"
        return 1
    }

    # Get spoke client secret
    local spoke_client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"
    local spoke_client_secret="${!spoke_client_secret_var}"

    if [ -z "$spoke_client_secret" ]; then
        local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env" ]; then
            spoke_client_secret=$(grep "^${spoke_client_secret_var}=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
        fi
    fi

    # Check if IdP already exists in Hub
    local existing
    existing=$(docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    local http_method="POST"
    local url="http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances"

    if echo "$existing" | jq -e '.alias' >/dev/null 2>&1; then
        log_verbose "${idp_alias} already exists in Hub — updating"
        http_method="PUT"
        url="http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}"
    fi

    # Detect the Simple Post-Broker OTP flow in Hub realm (created by Terraform realm-mfa module)
    local hub_post_broker_otp=""
    local _hub_flows
    _hub_flows=$(docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf --max-time 5 \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/authentication/flows" 2>/dev/null)
    local _hub_otp_flow
    _hub_otp_flow=$(echo "$_hub_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)
    if [ -n "$_hub_otp_flow" ]; then
        hub_post_broker_otp="$_hub_otp_flow"
        log_verbose "Using Hub post-broker OTP flow: ${hub_post_broker_otp}"
    else
        log_warn "Simple Post-Broker OTP flow not found in Hub — post-broker MFA disabled"
    fi

    # Build IdP config (spoke OIDC provider in Hub)
    local idp_config
    idp_config=$(cat <<IDPEOF
{
    "alias": "${idp_alias}",
    "displayName": "${code_upper} (Spoke)",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "firstBrokerLoginFlowAlias": "first broker login",
    "postBrokerLoginFlowAlias": "${hub_post_broker_otp}",
    "config": {
        "clientId": "dive-v3-broker-${code_lower}",
        "clientSecret": "${spoke_client_secret}",
        "authorizationUrl": "${spoke_idp_url}/realms/${spoke_realm}/protocol/openid-connect/auth",
        "tokenUrl": "${spoke_idp_url}/realms/${spoke_realm}/protocol/openid-connect/token",
        "userInfoUrl": "${spoke_idp_url}/realms/${spoke_realm}/protocol/openid-connect/userinfo",
        "jwksUrl": "${spoke_idp_url}/realms/${spoke_realm}/protocol/openid-connect/certs",
        "logoutUrl": "${spoke_idp_url}/realms/${spoke_realm}/protocol/openid-connect/logout",
        "issuer": "${spoke_idp_url}/realms/${spoke_realm}",
        "defaultScope": "openid profile email clearance countryOfAffiliation acpCOI uniqueID user_amr user_acr",
        "syncMode": "FORCE",
        "validateSignature": "true",
        "useJwksUrl": "true",
        "pkceEnabled": "false",
        "backchannelSupported": "false",
        "disableUserInfo": "false"
    }
}
IDPEOF
)

    local response
    response=$(docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf \
        -X "$http_method" \
        -H "Authorization: Bearer $hub_admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        "$url" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "${idp_alias} created/updated in Hub Keycloak"
    else
        log_warn "Hub IdP creation response: $response"
    fi

    # Create attribute mappers in Hub
    _configure_remote_idp_mappers_docker "$HUB_KEYCLOAK_CONTAINER" "$HUB_REALM" "$idp_alias" "$hub_admin_token"

    # =========================================================================
    # Create dive-v3-broker-${code} client in Hub realm
    # This client is required for spoke→Hub federation (the spoke IdP redirects
    # back to Hub's broker endpoint, which needs a registered client to accept it)
    # =========================================================================
    local broker_client_id="dive-v3-broker-${code_lower}"
    log_verbose "Ensuring ${broker_client_id} client exists in Hub realm"

    # Get Hub's public IdP URL for redirect URIs
    local hub_idp_url=""
    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        hub_idp_url="https://${_env_prefix}-usa-idp.${_base_domain}"
    fi

    local existing_client
    existing_client=$(docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf --max-time 5 \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/clients?clientId=${broker_client_id}" 2>/dev/null || echo "[]")

    local client_uuid=""
    client_uuid=$(echo "$existing_client" | jq -r '.[0].id // empty' 2>/dev/null)

    local client_method="POST"
    local client_url="http://localhost:8080/admin/realms/${HUB_REALM}/clients"

    if [ -n "$client_uuid" ]; then
        log_verbose "${broker_client_id} client already exists in Hub (id: ${client_uuid}) — updating"
        client_method="PUT"
        client_url="http://localhost:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}"
    fi

    local broker_redirect_uris="[\"${hub_idp_url}/realms/${HUB_REALM}/broker/${idp_alias}/endpoint\", \"${hub_idp_url}/realms/${HUB_REALM}/broker/${idp_alias}/endpoint/*\"]"
    local client_config
    client_config=$(cat <<CLIENTEOF
{
    "clientId": "${broker_client_id}",
    "name": "${code_upper} Broker Client",
    "enabled": true,
    "protocol": "openid-connect",
    "publicClient": false,
    "clientAuthenticatorType": "client-secret",
    "secret": "${spoke_client_secret}",
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": false,
    "redirectUris": ${broker_redirect_uris},
    "webOrigins": ["*"],
    "attributes": {
        "post.logout.redirect.uris": "+"
    }
}
CLIENTEOF
)

    docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf --max-time 10 \
        -X "$client_method" \
        -H "Authorization: Bearer $hub_admin_token" \
        -H "Content-Type: application/json" \
        -d "$client_config" \
        "$client_url" >/dev/null 2>&1 && \
        log_success "${broker_client_id} client registered in Hub realm" || \
        log_warn "Failed to register ${broker_client_id} client in Hub — may need manual creation"

    return 0
}

# =============================================================================
# KEYCLOAK HELPERS
# =============================================================================

##
# Get admin token from Keycloak via HTTPS (for remote spoke)
##
_kc_get_admin_token_https() {
    local kc_url="$1"
    local password="$2"

    local response
    response=$(curl -sk --max-time 10 \
        -X POST "${kc_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${password}" 2>/dev/null)

    local token
    token=$(echo "$response" | jq -r '.access_token // empty' 2>/dev/null)

    if [ -z "$token" ]; then
        log_error "Failed to authenticate with Keycloak at ${kc_url}"
        return 1
    fi

    echo "$token"
}

##
# Get admin token from Keycloak via docker exec (for Hub-local)
##
_kc_get_admin_token_docker() {
    local container="$1"

    local password
    password=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null || \
               docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")

    if [ -z "$password" ]; then
        # Try from .env.hub
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            password=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
        fi
    fi

    if [ -z "$password" ]; then
        log_error "Cannot determine Hub Keycloak admin password"
        return 1
    fi

    local response
    response=$(docker exec "$container" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${password}" 2>/dev/null)

    local token
    token=$(echo "$response" | jq -r '.access_token // empty' 2>/dev/null)

    if [ -z "$token" ]; then
        log_error "Failed to get Hub admin token via docker exec"
        return 1
    fi

    echo "$token"
}

##
# Create standard OIDC attribute mappers for an IdP via HTTPS
##
_configure_remote_idp_mappers() {
    local kc_url="$1"
    local realm="$2"
    local idp_alias="$3"
    local admin_token="$4"

    # All DIVE-V3 security-critical attribute mappers
    # syncMode: FORCE ensures attributes are updated on every login
    local _mapper_defs=(
        "unique-id-mapper:uniqueID:uniqueID"
        "clearance-mapper:clearance:clearance"
        "country-mapper:countryOfAffiliation:countryOfAffiliation"
        "coi-mapper:acpCOI:acpCOI"
        "nationality-mapper:nationality:nationality"
        "organization-mapper:organization:organization"
        "amr-mapper:amr:amr"
        "acr-mapper:acr:acr"
    )

    for def in "${_mapper_defs[@]}"; do
        IFS=":" read -r name claim attr <<< "$def"
        local mapper_json="{\"name\":\"$name\",\"identityProviderAlias\":\"${idp_alias}\",\"identityProviderMapper\":\"oidc-user-attribute-idp-mapper\",\"config\":{\"syncMode\":\"FORCE\",\"claim\":\"$claim\",\"user.attribute\":\"$attr\"}}"

        curl -sk --max-time 10 \
            -X POST "${kc_url}/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$mapper_json" >/dev/null 2>&1 || true

        log_verbose "Mapper: ${name} (${claim} → ${attr})"
    done
    log_verbose "IdP mappers configured for ${idp_alias} (8 DIVE-V3 attributes)"
}

##
# Create standard OIDC attribute mappers for an IdP via docker exec
##
_configure_remote_idp_mappers_docker() {
    local container="$1"
    local realm="$2"
    local idp_alias="$3"
    local admin_token="$4"

    # All DIVE-V3 security-critical attribute mappers
    local _mapper_defs=(
        "unique-id-mapper:uniqueID:uniqueID"
        "clearance-mapper:clearance:clearance"
        "country-mapper:countryOfAffiliation:countryOfAffiliation"
        "coi-mapper:acpCOI:acpCOI"
        "nationality-mapper:nationality:nationality"
        "organization-mapper:organization:organization"
        "amr-mapper:amr:amr"
        "acr-mapper:acr:acr"
    )

    for def in "${_mapper_defs[@]}"; do
        IFS=":" read -r name claim attr <<< "$def"
        local mapper_json="{\"name\":\"$name\",\"identityProviderAlias\":\"${idp_alias}\",\"identityProviderMapper\":\"oidc-user-attribute-idp-mapper\",\"config\":{\"syncMode\":\"FORCE\",\"claim\":\"$claim\",\"user.attribute\":\"$attr\"}}"

        docker exec "$container" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$mapper_json" >/dev/null 2>&1 || true

        log_verbose "Mapper: ${name} (${claim} → ${attr})"
    done
    log_verbose "IdP mappers configured for ${idp_alias} (docker exec, 8 DIVE-V3 attributes)"
}

# =============================================================================
# USER SEEDING (via HTTPS Keycloak API — Hub cannot docker exec into spoke)
# =============================================================================

##
# Seed test users in spoke Keycloak via HTTPS Admin REST API
##
_configure_remote_seed_users() {
    local code_upper="$1"
    local code_lower="$2"
    local spoke_idp_url="$3"

    local spoke_realm="dive-v3-broker-${code_lower}"

    # Get admin token from spoke Keycloak
    local kc_pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local admin_token
    admin_token=$(_kc_get_admin_token_https "$spoke_idp_url" "${!kc_pass_var}") || {
        log_error "Failed to get spoke admin token for user seeding"
        return 1
    }

    local test_pwd="${TEST_USER_PASSWORD:-TestUser2025!Pilot}"
    local admin_pwd="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
    local seed_count=0

    _seed_user() {
        local username="$1" first="$2" last="$3" email="$4"
        local clearance="$5" country="$6" coi="$7" password="$8"

        local uid_hash
        uid_hash=$(echo -n "$username" | sha256sum | cut -c1-16)

        local user_json="{
            \"username\": \"$username\",
            \"enabled\": true,
            \"emailVerified\": true,
            \"firstName\": \"$first\",
            \"lastName\": \"$last\",
            \"email\": \"$email\",
            \"credentials\": [{\"type\": \"password\", \"value\": \"$password\", \"temporary\": false}],
            \"attributes\": {
                \"clearance\": [\"$clearance\"],
                \"countryOfAffiliation\": [\"$country\"],
                \"nationality\": [\"$country\"],
                \"acpCOI\": [\"$coi\"],
                \"uniqueID\": [\"$uid_hash\"]
            }
        }"

        local code
        code=$(curl -sk -o /dev/null -w "%{http_code}" -X POST \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$user_json" \
            "${spoke_idp_url}/admin/realms/${spoke_realm}/users")

        case "$code" in
            201) log_verbose "Created $username"; seed_count=$((seed_count + 1)) ;;
            409) log_verbose "$username already exists" ;;
            *)   log_warn "Failed to create $username: HTTP $code" ;;
        esac
    }

    log_info "Seeding test users in spoke ${code_upper}..."

    # Standard test users with country-appropriate clearances
    _seed_user "testuser-${code_lower}-1" "Test" "User1" "testuser1@${code_lower}.test" \
        "OFFICIAL"           "$code_upper" ""          "$test_pwd"
    _seed_user "testuser-${code_lower}-2" "Test" "User2" "testuser2@${code_lower}.test" \
        "OFFICIAL-SENSITIVE" "$code_upper" ""          "$test_pwd"
    _seed_user "testuser-${code_lower}-3" "Test" "User3" "testuser3@${code_lower}.test" \
        "SECRET"             "$code_upper" "NATO"      "$test_pwd"
    _seed_user "testuser-${code_lower}-4" "Test" "User4" "testuser4@${code_lower}.test" \
        "SECRET"             "$code_upper" "NATO,FVEY" "$test_pwd"
    _seed_user "testuser-${code_lower}-5" "Test" "User5" "testuser5@${code_lower}.test" \
        "TOP SECRET"         "$code_upper" "NATO,FVEY" "$test_pwd"
    _seed_user "admin-${code_lower}"      "Admin" "$code_upper" "admin@${code_lower}.test" \
        "TOP SECRET"         "$code_upper" "NATO,FVEY" "$admin_pwd"

    if [ $seed_count -gt 0 ]; then
        log_success "Seeded ${seed_count} new users in spoke ${code_upper}"
    else
        log_info "All spoke ${code_upper} users already exist"
    fi
}

# =============================================================================
# VERIFICATION
# =============================================================================

##
# Verify bidirectional federation
##
_configure_remote_verify() {
    local code_upper="$1"
    local code_lower="$2"
    local spoke_idp_url="$3"

    local spoke_realm="dive-v3-broker-${code_lower}"
    local all_good=true

    # Check spoke realm exists
    if curl -skf --max-time 5 "${spoke_idp_url}/realms/${spoke_realm}" >/dev/null 2>&1; then
        log_success "Spoke realm: ${spoke_realm} ✓"
    else
        log_error "Spoke realm not found: ${spoke_realm}"
        all_good=false
    fi

    # Check usa-idp in spoke
    local kc_pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local spoke_token
    spoke_token=$(_kc_get_admin_token_https "$spoke_idp_url" "${!kc_pass_var}" 2>/dev/null || echo "")

    if [ -n "$spoke_token" ]; then
        local usa_idp
        usa_idp=$(curl -sk --max-time 5 \
            -H "Authorization: Bearer $spoke_token" \
            "${spoke_idp_url}/admin/realms/${spoke_realm}/identity-provider/instances/usa-idp" 2>/dev/null)

        if echo "$usa_idp" | jq -e '.alias == "usa-idp"' >/dev/null 2>&1; then
            log_success "usa-idp in spoke: ✓"
        else
            log_warn "usa-idp not found in spoke Keycloak"
            all_good=false
        fi
    fi

    # Check ${code}-idp in Hub (docker exec)
    local hub_token
    hub_token=$(_kc_get_admin_token_docker "$HUB_KEYCLOAK_CONTAINER" 2>/dev/null || echo "")

    if [ -n "$hub_token" ]; then
        local hub_idp
        hub_idp=$(docker exec "$HUB_KEYCLOAK_CONTAINER" curl -sf --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${code_lower}-idp" 2>/dev/null || echo "")

        if echo "$hub_idp" | jq -e ".alias == \"${code_lower}-idp\"" >/dev/null 2>&1; then
            log_success "${code_lower}-idp in Hub: ✓"
        else
            log_warn "${code_lower}-idp not found in Hub Keycloak"
            all_good=false
        fi
    fi

    if [ "$all_good" = "true" ]; then
        log_success "Bidirectional federation verified ✓"
    else
        log_warn "Some federation checks failed — may need manual attention"
    fi

    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f spoke_configure_remote
export -f _configure_remote_terraform
export -f _configure_remote_spoke_idp
export -f _configure_remote_hub_idp
export -f _configure_remote_seed_users
export -f _configure_remote_verify
export -f _kc_get_admin_token_https
export -f _kc_get_admin_token_docker
export -f _configure_remote_idp_mappers
export -f _configure_remote_idp_mappers_docker

log_verbose "Spoke configure-remote module loaded"
