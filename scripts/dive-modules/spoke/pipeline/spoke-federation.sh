#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Unified Spoke Federation Setup
# =============================================================================
# Consolidates bidirectional federation configuration:
#   1. Configure usa-idp in spoke Keycloak (upstream IdP)
#   2. Register spoke-idp in Hub Keycloak
#   3. Synchronize federation secrets
#   4. Verify bidirectional connectivity
#
# Consolidates spoke_deploy() Steps 7, 8, 9, 10, 11 (lines 959-1475)
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# FIX (2026-01-15): Clear guard variable if set in parent shell
# This prevents the guard from blocking module load during deployment
if [ -n "$SPOKE_FEDERATION_LOADED" ]; then
    # Already loaded in parent - functions should be available
    # If not, something is wrong with exports
    if ! type spoke_federation_setup &>/dev/null; then
        # Functions not available - force reload
        unset SPOKE_FEDERATION_LOADED
    else
        # Functions available - skip reload
        return 0
    fi
fi
export SPOKE_FEDERATION_LOADED=1

# =============================================================================
# LOAD FEDERATION-LINK MODULE FOR BIDIRECTIONAL SETUP
# =============================================================================
# Load federation-link.sh to make _federation_link_direct() available
# This is required for automated bidirectional federation
if [ -z "$DIVE_FEDERATION_LINK_LOADED" ]; then
    _fed_link_path="${BASH_SOURCE[0]%/*}/../federation-link.sh"
    if [ -f "$_fed_link_path" ]; then
        source "$_fed_link_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh"
    fi
    unset _fed_link_path
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Hub Keycloak defaults
readonly HUB_KC_CONTAINER="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
# FIX (2026-01-15): Use HUB_REALM from common.sh (dive-v3-broker-usa)
# LEGACY dive-v3-broker (without suffix) is DEPRECATED
readonly HUB_REALM="${HUB_REALM:-dive-v3-broker-usa}"
readonly HUB_IDP_ALIAS_PREFIX="spoke-idp-"

# Federation status states
readonly FED_STATUS_UNREGISTERED="unregistered"
readonly FED_STATUS_PENDING="pending"
readonly FED_STATUS_ACTIVE="active"
readonly FED_STATUS_ERROR="error"

# =============================================================================
# MAIN FEDERATION SETUP
# =============================================================================

##
# Configure complete bidirectional federation for a spoke
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_setup() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Setting up federation for $code_upper"

    # Step 1: Configure usa-idp in spoke Keycloak
    if ! spoke_federation_configure_upstream_idp "$instance_code" "usa"; then
        orch_record_error "$SPOKE_ERROR_FEDERATION_SETUP" "$ORCH_SEVERITY_HIGH" \
            "Failed to configure upstream IdP" "federation" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_FEDERATION_SETUP $instance_code)"
        return 1
    fi

    # Step 2: Register spoke-idp in Hub Keycloak
    if ! spoke_federation_register_in_hub "$instance_code"; then
        orch_record_error "$SPOKE_ERROR_FEDERATION_REGISTER" "$ORCH_SEVERITY_HIGH" \
            "Failed to register in Hub" "federation" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_FEDERATION_REGISTER $instance_code)"
        return 1
    fi

    # ==========================================================================
    # NEW STEP 2.5: Create Bidirectional Federation (Hub→Spoke)
    # ==========================================================================
    # This completes bidirectional SSO by creating spoke-idp in Hub Keycloak
    # Previously required manual './dive federation link [CODE]' command
    # FIX (2026-01-14): Now automatic during deployment
    # ==========================================================================
    if ! spoke_federation_create_bidirectional "$instance_code"; then
        log_warn "Bidirectional IdP creation incomplete (non-blocking)"
        log_warn "Run manually: ./dive federation link $code_upper"
    fi

    # Step 3: Synchronize client secrets
    if ! spoke_secrets_sync_federation "$instance_code"; then
        log_warn "Federation secret sync incomplete (non-blocking)"
    fi

    # Step 4: Verify bidirectional connectivity
    local verification_result
    verification_result=$(spoke_federation_verify "$instance_code")

    if echo "$verification_result" | grep -q '"bidirectional":true'; then
        log_success "Bidirectional federation established"
        return 0
    else
        log_warn "Federation setup complete but verification pending"
        echo "$verification_result"
        return 0  # Non-blocking - verification can fail temporarily
    fi
}

# =============================================================================
# UPSTREAM IDP CONFIGURATION
# =============================================================================

##
# Configure an upstream Identity Provider in spoke Keycloak
#
# Arguments:
#   $1 - Instance code
#   $2 - Upstream IdP code (e.g., "usa" for Hub)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_configure_upstream_idp() {
    local instance_code="$1"
    local upstream_code="${2:-usa}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Configuring ${upstream_code}-idp in spoke Keycloak..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    # Check if Keycloak is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_error "Spoke Keycloak container not running"
        return 1
    fi

    # Get admin token
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        log_error "Cannot get Keycloak admin token"
        return 1
    fi

    # Create IdP configuration
    local realm_name="dive-v3-broker-${code_lower}"
    local idp_alias="${upstream_code}-idp"

    # Get Hub Keycloak URL
    local hub_idp_url="${HUB_IDP_URL:-https://hub.dive25.com:8443}"

    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_verbose "IdP ${idp_alias} already exists - updating"
    fi

    # Build IdP configuration JSON
    local idp_config
    idp_config=$(cat << EOF
{
    "alias": "${idp_alias}",
    "displayName": "USA Hub Federation",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "addReadTokenRoleOnCreate": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "config": {
        "authorizationUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/auth",
        "tokenUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/token",
        "userInfoUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/userinfo",
        "logoutUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/logout",
        "jwksUrl": "${hub_idp_url}/realms/${HUB_REALM}/protocol/openid-connect/certs",
        "issuer": "${hub_idp_url}/realms/${HUB_REALM}",
        "clientId": "dive-v3-broker-${code_lower}",
        "clientAuthMethod": "client_secret_post",
        "syncMode": "FORCE",
        "validateSignature": "true",
        "useJwksUrl": "true",
        "pkceEnabled": "true",
        "pkceMethod": "S256"
    }
}
EOF
)

    # Create or update IdP
    local http_method="POST"
    local url="http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances"

    if echo "$existing_idp" | grep -q '"alias"'; then
        http_method="PUT"
        url="${url}/${idp_alias}"
    fi

    local response
    response=$(docker exec "$kc_container" curl -sf \
        -X "$http_method" \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        "$url" 2>&1)

    # Check for errors
    if echo "$response" | grep -qi "error"; then
        log_error "Failed to configure IdP: $response"
        return 1
    fi

    log_success "Configured ${idp_alias} in spoke Keycloak"

    # Configure protocol mappers for the IdP
    spoke_federation_configure_idp_mappers "$instance_code" "$idp_alias"

    return 0
}

##
# Configure protocol mappers for the upstream IdP
##
spoke_federation_configure_idp_mappers() {
    local instance_code="$1"
    local idp_alias="$2"

    local code_lower=$(lower "$instance_code")
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        return 1
    fi

    # Define required mappers
    local mappers=(
        '{"name":"clearance","identityProviderMapper":"oidc-user-attribute-idp-mapper","identityProviderAlias":"'$idp_alias'","config":{"claim":"clearance","user.attribute":"clearance","syncMode":"FORCE"}}'
        '{"name":"countryOfAffiliation","identityProviderMapper":"oidc-user-attribute-idp-mapper","identityProviderAlias":"'$idp_alias'","config":{"claim":"countryOfAffiliation","user.attribute":"countryOfAffiliation","syncMode":"FORCE"}}'
        '{"name":"uniqueID","identityProviderMapper":"oidc-user-attribute-idp-mapper","identityProviderAlias":"'$idp_alias'","config":{"claim":"uniqueID","user.attribute":"uniqueID","syncMode":"FORCE"}}'
        '{"name":"acpCOI","identityProviderMapper":"oidc-user-attribute-idp-mapper","identityProviderAlias":"'$idp_alias'","config":{"claim":"acpCOI","user.attribute":"acpCOI","syncMode":"FORCE"}}'
    )

    log_verbose "Configuring IdP attribute mappers..."

    for mapper in "${mappers[@]}"; do
        docker exec "$kc_container" curl -sf \
            -X POST \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$mapper" \
            "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null || true
    done

    log_verbose "IdP mappers configured"
}

# =============================================================================
# HUB REGISTRATION
# =============================================================================

##
# Register spoke as an IdP in Hub Keycloak
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_register_in_hub() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Registering $code_upper in Hub Terraform configuration..."

    # ==========================================================================
    # BEST PRACTICE: Update Hub Terraform configuration (SSOT)
    # ==========================================================================
    # Instead of manually creating IdPs via Keycloak API, we update the Hub's
    # Terraform configuration and apply it. This ensures:
    # - Persistence across Hub redeployments
    # - Proper client creation with protocol mappers
    # - Consistent configuration management
    # ==========================================================================

    local hub_tfvars="${DIVE_ROOT}/terraform/hub/hub.tfvars"
    local spoke_config="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ ! -f "$spoke_config" ]; then
        log_error "Spoke config not found: $spoke_config"
        return 1
    fi

    # Extract spoke details from config.json
    local spoke_name=$(jq -r '.identity.name // "'"$code_upper"'"' "$spoke_config")
    local spoke_keycloak_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':')
    local spoke_frontend_port=$(jq -r '.endpoints.baseUrl // "https://localhost:3000"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':')
    
    # CRITICAL FIX (2026-01-15): Build URLs as complete strings to prevent line breaks
    # Previous behavior: Variable expansion could cause multi-line strings in Terraform
    # Root cause: If port extraction includes newlines, URLs split across lines (invalid TF syntax)
    local idp_url="https://localhost:${spoke_keycloak_port}"
    local frontend_url="https://localhost:${spoke_frontend_port}"

    # Check if already in tfvars
    if grep -q "\"${code_lower}\"" "$hub_tfvars" 2>/dev/null; then
        log_info "$code_upper already in Hub Terraform configuration"
    else
        log_step "Adding $code_upper to Hub federation_partners..."

        # Create federation partner entry (using pre-built URL variables)
        local federation_entry="  ${code_lower} = {
    instance_code         = \"${code_upper}\"
    instance_name         = \"${spoke_name}\"
    idp_url               = \"${idp_url}\"
    idp_internal_url      = \"https://dive-spoke-${code_lower}-keycloak:8443\"
    frontend_url          = \"${frontend_url}\"
    enabled               = true
    client_secret         = \"\"  # Loaded from GCP: dive-v3-federation-${code_lower}-usa
    disable_trust_manager = true
  }"

        # Backup tfvars
        cp "$hub_tfvars" "${hub_tfvars}.backup-$(date +%Y%m%d-%H%M%S)"

        # Write entry to temp file for safe multi-line handling (no quotes = variable expansion)
        cat > "${hub_tfvars}.entry" << ENTRY_EOF
$federation_entry
ENTRY_EOF

        # Use Python for reliable multi-line insertion (safer than sed/awk)
        python3 - "$hub_tfvars" "${hub_tfvars}.entry" "$code_upper" << 'PYTHON_EOF'
import sys
import re

hub_tfvars = sys.argv[1]
entry_file = sys.argv[2]
code_upper = sys.argv[3]

# Read the entry
with open(entry_file, 'r') as f:
    entry = f.read().strip()

# Read tfvars
with open(hub_tfvars, 'r') as f:
    lines = f.readlines()

# Find federation_partners = { line (not commented)
fed_start = None
for i, line in enumerate(lines):
    if re.match(r'^federation_partners\s*=\s*\{', line.strip()) and not line.strip().startswith('#'):
        fed_start = i
        break

if fed_start is None:
    print(f"ERROR: federation_partners block not found", file=sys.stderr)
    sys.exit(1)

# Check if empty map
if lines[fed_start].strip() == 'federation_partners = {}':
    # Replace entire line
    lines[fed_start] = f'federation_partners = {{\n{entry}\n}}\n'
else:
    # Find matching closing brace
    brace_count = 1
    close_idx = None
    for i in range(fed_start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith('#'):
            continue
        brace_count += stripped.count('{') - stripped.count('}')
        if brace_count == 0:
            close_idx = i
            break

    if close_idx is None:
        print(f"ERROR: Could not find closing brace for federation_partners", file=sys.stderr)
        sys.exit(1)

    # Insert entry before closing brace
    lines.insert(close_idx, f'{entry}\n')

# Write back
with open(hub_tfvars, 'w') as f:
    f.writelines(lines)

print(f"✓ Added {code_upper} to federation_partners")
PYTHON_EOF
        local python_exit=$?

        rm -f "${hub_tfvars}.entry"
        
        if [ $python_exit -eq 0 ]; then
            log_success "Added $code_upper to Hub Terraform configuration"
        else
            log_error "Failed to update Hub Terraform configuration"
            return 1
        fi
    fi

    # Apply Hub Terraform
    log_step "Applying Hub Terraform to create federation client..."

    local hub_tf_dir="${DIVE_ROOT}/terraform/hub"
    cd "$hub_tf_dir" || return 1

    # Load Hub secrets
    export INSTANCE="usa"
    if type spoke_secrets_load &>/dev/null; then
        spoke_secrets_load "USA" 2>/dev/null || true
    fi

    # Export TF_VAR environment variables
    export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null)}"
    export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25 2>/dev/null)}"
    export TF_VAR_test_user_password="${TF_VAR_keycloak_admin_password}"
    export TF_VAR_admin_user_password="${TF_VAR_keycloak_admin_password}"
    export KEYCLOAK_USER="admin"
    export KEYCLOAK_PASSWORD="${TF_VAR_keycloak_admin_password}"

    # Initialize if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Hub Terraform..."
        local init_output
        local init_exit_code=0
        init_output=$(terraform init -upgrade 2>&1) || init_exit_code=$?
        
        if [ $init_exit_code -ne 0 ]; then
            log_error "Terraform init failed (exit code: $init_exit_code)"
            echo "$init_output" | tail -30
            return 1
        fi
    fi

    # Apply
    log_info "Running terraform apply for Hub..."
    
    # Capture output for proper error reporting (don't hide errors!)
    local tf_output
    local tf_exit_code=0
    tf_output=$(terraform apply -var-file=hub.tfvars -auto-approve 2>&1) || tf_exit_code=$?
    
    if [ $tf_exit_code -eq 0 ]; then
        log_success "Hub Terraform applied - federation client created for $code_upper"
    else
        log_error "Hub Terraform apply failed (exit code: $tf_exit_code)"
        echo "$tf_output" | tail -50  # Show last 50 lines of error
        return 1
    fi

    cd - &>/dev/null
    return 0
}

# =============================================================================
# BIDIRECTIONAL FEDERATION (NEW - 2026-01-14)
# =============================================================================

##
# Create bidirectional federation by adding spoke-idp to Hub
#
# This automates what './dive federation link [CODE]' does manually.
# Creates {spoke}-idp in Hub Keycloak so Hub users can authenticate via spoke.
#
# Arguments:
#   $1 - Instance code (spoke)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_create_bidirectional() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Creating bidirectional federation (Hub→Spoke)..."

    # Check if Hub is accessible
    if ! docker ps --format '{{.Names}}' | grep -q "^${HUB_KC_CONTAINER}$"; then
        log_warn "Hub Keycloak not running - skipping bidirectional setup"
        return 1
    fi

    # Use federation-link.sh helper if available
    if type _federation_link_direct &>/dev/null; then
        log_verbose "Using federation-link.sh helper for bidirectional setup"
        if _federation_link_direct "USA" "$code_upper"; then
            log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"
            return 0
        else
            log_warn "Failed to create bidirectional IdP via helper"
            return 1
        fi
    fi

    # Fallback: Direct implementation
    log_verbose "Creating $code_lower-idp in Hub directly..."

    # Get Hub admin token
    local hub_admin_token
    hub_admin_token=$(spoke_federation_get_admin_token "$HUB_KC_CONTAINER")

    if [ -z "$hub_admin_token" ]; then
        log_error "Cannot get Hub admin token"
        return 1
    fi

    # Get spoke details
    local spoke_keycloak_port
    spoke_keycloak_port=$(jq -r '.endpoints.idpPublicUrl // ""' "${DIVE_ROOT}/instances/${code_lower}/config.json" | grep -o ':[0-9]*' | tr -d ':')

    if [ -z "$spoke_keycloak_port" ]; then
        log_error "Cannot determine spoke Keycloak port"
        return 1
    fi

    # Source URLs (spoke)
    local source_public_url="https://localhost:${spoke_keycloak_port}"
    local source_internal_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local source_realm="dive-v3-broker-${code_lower}"

    # Get federation client secret (from GCP or generate)
    local client_secret
    if type _get_federation_secret &>/dev/null; then
        client_secret=$(_get_federation_secret "$code_lower" "usa")
    else
        # Generate if helper not available
        client_secret=$(openssl rand -base64 24 | tr -d '/+=')
    fi

    # IdP configuration
    local idp_alias="${code_lower}-idp"
    local idp_config="{
        \"alias\": \"${idp_alias}\",
        \"displayName\": \"${code_upper} Federation\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"trustEmail\": true,
        \"storeToken\": true,
        \"linkOnly\": false,
        \"firstBrokerLoginFlowAlias\": \"\",
        \"updateProfileFirstLoginMode\": \"off\",
        \"postBrokerLoginFlowAlias\": \"\",
        \"config\": {
            \"clientId\": \"dive-v3-broker-usa\",
            \"clientSecret\": \"${client_secret}\",
            \"authorizationUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/auth\",
            \"tokenUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/token\",
            \"userInfoUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/userinfo\",
            \"logoutUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/logout\",
            \"issuer\": \"${source_public_url}/realms/${source_realm}\",
            \"validateSignature\": \"false\",
            \"useJwksUrl\": \"true\",
            \"jwksUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/certs\",
            \"syncMode\": \"FORCE\",
            \"clientAuthMethod\": \"client_secret_post\"
        }
    }"

    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$HUB_KC_CONTAINER" curl -sf \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_info "$idp_alias already exists in Hub (skipping)"
        return 0
    fi

    # Create IdP
    local create_result
    create_result=$(docker exec "$HUB_KC_CONTAINER" curl -sf \
        -X POST "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances" \
        -H "Authorization: Bearer $hub_admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"

        # Configure IdP mappers
        if type _configure_idp_mappers &>/dev/null; then
            _configure_idp_mappers "$HUB_KC_CONTAINER" "$hub_admin_token" "$HUB_REALM" "$idp_alias"
        fi

        return 0
    else
        log_error "Failed to create bidirectional IdP: $create_result"
        return 1
    fi
}

# =============================================================================
# FEDERATION VERIFICATION
# =============================================================================

##
# Verify bidirectional federation connectivity
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON status object
##
spoke_federation_verify() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation for $code_upper..."

    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    local spoke_to_hub="false"
    local hub_to_spoke="false"

    # Check spoke → Hub connectivity (usa-idp exists and enabled)
    if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$spoke_kc_container")

        if [ -n "$admin_token" ]; then
            local idp_status
            idp_status=$(docker exec "$spoke_kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/usa-idp" 2>/dev/null)

            if echo "$idp_status" | grep -q '"enabled":true'; then
                spoke_to_hub="true"
            fi
        fi
    fi

    # Check Hub → spoke connectivity (spoke-idp-{code} exists and enabled)
    if docker ps --format '{{.Names}}' | grep -q "^${HUB_KC_CONTAINER}$"; then
        local hub_admin_token
        hub_admin_token=$(spoke_federation_get_admin_token "$HUB_KC_CONTAINER")

        if [ -n "$hub_admin_token" ]; then
            local hub_idp_status
            hub_idp_status=$(docker exec "$HUB_KC_CONTAINER" curl -sf \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${HUB_IDP_ALIAS_PREFIX}${code_lower}" 2>/dev/null)

            if echo "$hub_idp_status" | grep -q '"enabled":true'; then
                hub_to_spoke="true"
            fi
        fi
    fi

    # Determine overall status
    local bidirectional="false"
    local status="$FED_STATUS_ERROR"

    if [ "$spoke_to_hub" = "true" ] && [ "$hub_to_spoke" = "true" ]; then
        bidirectional="true"
        status="$FED_STATUS_ACTIVE"
    elif [ "$spoke_to_hub" = "true" ] || [ "$hub_to_spoke" = "true" ]; then
        status="$FED_STATUS_PENDING"
    fi

    # Output JSON status
    cat << EOF
{
    "instance": "$code_upper",
    "status": "$status",
    "spoke_to_hub": $spoke_to_hub,
    "hub_to_spoke": $hub_to_spoke,
    "bidirectional": $bidirectional,
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

    if [ "$bidirectional" = "true" ]; then
        log_success "Bidirectional federation verified"
    else
        log_warn "Federation incomplete: spoke→hub=$spoke_to_hub, hub→spoke=$hub_to_spoke"
    fi
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Get Keycloak admin token
#
# Arguments:
#   $1 - Container name
#
# Returns:
#   Admin token or empty string
##
spoke_federation_get_admin_token() {
    local container="$1"

    # Get admin password
    local admin_pass
    admin_pass=$(docker exec "$container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    if [ -z "$admin_pass" ]; then
        return 1
    fi

    # Get token
    local response
    response=$(docker exec "$container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" 2>/dev/null)

    echo "$response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4
}

##
# Update federation status in config.json
##
spoke_federation_update_status() {
    local instance_code="$1"
    local status="$2"

    local code_lower=$(lower "$instance_code")
    local config_file="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ -f "$config_file" ]; then
        # Update status in config.json
        local temp_file=$(mktemp)
        jq --arg status "$status" '.federation.status = $status' "$config_file" > "$temp_file"
        mv "$temp_file" "$config_file"
    fi
}
