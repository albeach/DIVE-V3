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

# FIX (2026-01-18): Simplified guard - always allow reload if functions missing
# This ensures module loads correctly even when sourced multiple times
if [ -n "$SPOKE_FEDERATION_LOADED" ]; then
    # Check if critical functions exist
    if type spoke_federation_create_bidirectional &>/dev/null && \
       type spoke_federation_setup &>/dev/null; then
        # Functions available - module already loaded successfully
        return 0
    else
        # Guard set but functions missing - force reload
        unset SPOKE_FEDERATION_LOADED
    fi
fi
export SPOKE_FEDERATION_LOADED=1

# =============================================================================
# LOAD FEDERATION-LINK MODULE FOR BIDIRECTIONAL SETUP
# =============================================================================
# Load federation-link.sh to make _federation_link_direct() available
# This is required for automated bidirectional federation
if [ -z "$DIVE_FEDERATION_LINK_LOADED" ]; then
    # CRITICAL FIX (2026-01-18): Correct path - spoke-federation.sh is in spoke/pipeline/,
    # federation-link.sh is in modules/ root, so need to go up TWO levels
    _fed_link_path="${BASH_SOURCE[0]%/*}/../../federation-link.sh"
    if [ -f "$_fed_link_path" ]; then
        source "$_fed_link_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh"
    fi
    unset _fed_link_path
fi

# =============================================================================
# LOAD FEDERATION STATE DATABASE MODULE (2026-01-16)
# =============================================================================
# Database-driven federation state management
# Part of Orchestration Architecture Review
if [ -z "$FEDERATION_STATE_DB_LOADED" ]; then
    # CRITICAL FIX (2026-01-18): Path calculation - spoke-federation.sh is in spoke/pipeline/,
    # federation-state-db.sh is in modules/ root
    # ${BASH_SOURCE[0]%/*} = scripts/dive-modules/spoke/pipeline
    # ../../ goes up to scripts/dive-modules/
    _fed_db_path="${BASH_SOURCE[0]%/*}/../../federation-state-db.sh"
    if [ -f "$_fed_db_path" ]; then
        source "$_fed_db_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh"
    else
        log_verbose "federation-state-db.sh not found - database state tracking unavailable"
    fi
    unset _fed_db_path
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Hub Keycloak defaults
# NOTE: Use local variables in functions instead of readonly module-level constants
# to avoid conflicts with common.sh which also defines HUB_REALM as readonly
: "${HUB_KC_CONTAINER:=dive-hub-keycloak}"
: "${HUB_REALM:=dive-v3-broker-usa}"
: "${HUB_IDP_ALIAS_PREFIX:=spoke-idp-}"

# Federation status states (safe to make readonly - not used in common.sh)
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

    # ==========================================================================
    # DATABASE STATE: Create initial federation link records (2026-01-16)
    # ==========================================================================
    # Record both directions as PENDING before attempting creation
    local fed_db_available=false
    if type fed_db_upsert_link &>/dev/null; then
        # Spoke→Hub direction (usa-idp in spoke)
        if fed_db_upsert_link "$code_lower" "usa" "SPOKE_TO_HUB" "usa-idp" "PENDING" \
            "dive-v3-broker-${code_lower}"; then
            log_verbose "✓ Federation link recorded: $code_lower → usa"
            fed_db_available=true
        else
            log_verbose "Federation database not available (federation_links table missing)"
            log_verbose "State tracking limited - IdP configuration will still work"
            fed_db_available=false
        fi
        
        # Hub→Spoke direction (spoke-idp in hub) - only if first succeeded
        if [ "$fed_db_available" = true ]; then
            if fed_db_upsert_link "usa" "$code_lower" "HUB_TO_SPOKE" "${code_lower}-idp" "PENDING" \
                "dive-v3-broker-usa"; then
                log_verbose "✓ Federation link recorded: usa → $code_lower"
            fi
        fi
    else
        log_verbose "Federation state database module not loaded - state tracking limited"
    fi

    # Step 1: Configure usa-idp in spoke Keycloak
    if ! spoke_federation_configure_upstream_idp "$instance_code" "usa"; then
        # Update database state to FAILED
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "$code_lower" "usa" "SPOKE_TO_HUB" "FAILED" \
                "Failed to configure upstream IdP" "$SPOKE_ERROR_FEDERATION_SETUP"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
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

    # Step 4: Verify bidirectional connectivity with retry
    # Federation resources may take a moment to propagate in Keycloak
    local max_verify_retries=3
    local verify_delay=5
    local verification_passed=false

    for ((i=1; i<=max_verify_retries; i++)); do
        log_verbose "Verification attempt $i/$max_verify_retries..."

        local verification_result
        verification_result=$(spoke_federation_verify "$instance_code" 2>/dev/null)

        if echo "$verification_result" | grep -q '"bidirectional":true'; then
            verification_passed=true
            log_success "Bidirectional federation established (attempt $i)"
            break
        elif echo "$verification_result" | grep -q '"spoke_to_hub":true.*"hub_to_spoke":true\|"hub_to_spoke":true.*"spoke_to_hub":true'; then
            verification_passed=true
            log_success "Bidirectional federation established (attempt $i)"
            break
        else
            if [ $i -lt $max_verify_retries ]; then
                log_verbose "Verification pending, waiting ${verify_delay}s before retry..."
                sleep $verify_delay
            fi
        fi
    done

    if [ "$verification_passed" = "true" ]; then
        return 0
    else
        log_warn "Federation verification incomplete after $max_verify_retries attempts"
        log_warn "This is non-blocking - federation may still work"
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
    local federation_client_id="dive-v3-broker-${code_lower}"

    # ==========================================================================
    # URL STRATEGY FOR FEDERATION (2026-01-16 Best Practice)
    # ==========================================================================
    # - authorizationUrl/logoutUrl: External URL (localhost:8443) for browser redirects
    # - tokenUrl/userInfoUrl/jwksUrl: Internal Docker URL for server-to-server calls
    # - issuer: External URL (must match what's in the tokens)
    # ==========================================================================
    local hub_public_url="https://localhost:8443"
    local hub_internal_url="https://keycloak:8443"

    # ==========================================================================
    # GET CLIENT SECRET FROM HUB (CRITICAL FIX)
    # ==========================================================================
    # Without the client secret, the IdP cannot authenticate to the Hub's token endpoint
    # Error: "Invalid client or Invalid client credentials"
    # ==========================================================================
    log_verbose "Retrieving client secret from Hub Keycloak..."

    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"
    local client_secret=""

    # Get Hub admin token
    local hub_admin_pass
    hub_admin_pass=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null || \
                    docker exec "$hub_kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

    if [ -n "$hub_admin_pass" ]; then
        local hub_admin_token
        hub_admin_token=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" -d "password=${hub_admin_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$hub_admin_token" ]; then
            # Get client UUID
            local client_uuid
            client_uuid=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${hub_realm}/clients?clientId=${federation_client_id}" 2>/dev/null | \
                grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

            if [ -n "$client_uuid" ]; then
                client_secret=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
                    -H "Authorization: Bearer $hub_admin_token" \
                    "http://localhost:8080/admin/realms/${hub_realm}/clients/${client_uuid}/client-secret" 2>/dev/null | \
                    grep -o '"value":"[^"]*' | cut -d'"' -f4)
                log_verbose "Retrieved client secret from Hub"
            else
                log_warn "Federation client ${federation_client_id} not found in Hub"
            fi
        fi
    fi

    # Fallback to GCP Secret Manager
    if [ -z "$client_secret" ]; then
        log_verbose "Trying GCP Secret Manager for federation secret..."
        if type _get_federation_secret &>/dev/null; then
            client_secret=$(_get_federation_secret "$code_lower" "usa")
        fi
    fi

    if [ -z "$client_secret" ]; then
        log_error "Cannot retrieve client secret for federation"
        log_error "Ensure the Hub has the client '${federation_client_id}' configured"
        return 1
    fi

    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_verbose "IdP ${idp_alias} already exists - updating"
    fi

    # Build IdP configuration JSON with client secret and proper URLs
    local idp_config
    idp_config=$(cat << EOF
{
    "alias": "${idp_alias}",
    "displayName": "USA Hub Federation",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "linkOnly": false,
    "firstBrokerLoginFlowAlias": "",
    "updateProfileFirstLoginMode": "off",
    "postBrokerLoginFlowAlias": "",
    "config": {
        "clientId": "${federation_client_id}",
        "clientSecret": "${client_secret}",
        "authorizationUrl": "${hub_public_url}/realms/${hub_realm}/protocol/openid-connect/auth",
        "tokenUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/token",
        "userInfoUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/userinfo",
        "logoutUrl": "${hub_public_url}/realms/${hub_realm}/protocol/openid-connect/logout",
        "jwksUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/certs",
        "issuer": "${hub_public_url}/realms/${hub_realm}",
        "validateSignature": "false",
        "useJwksUrl": "true",
        "clientAuthMethod": "client_secret_post",
        "syncMode": "FORCE"
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

    # ==========================================================================
    # DATABASE STATE: Update SPOKE_TO_HUB link to ACTIVE (2026-01-16)
    # ==========================================================================
    if [ "$fed_db_available" = true ] && type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "$code_lower" "usa" "SPOKE_TO_HUB" "ACTIVE"; then
            log_verbose "✓ Federation link status updated: $code_lower → usa ACTIVE"
        else
            log_verbose "Federation database update failed (non-fatal - IdP still configured)"
        fi
    fi

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

    # Define required mappers (CRITICAL DIVE attributes)
    local mapper_configs=(
        "unique-id-mapper:uniqueID:uniqueID"
        "clearance-mapper:clearance:clearance"
        "country-mapper:countryOfAffiliation:countryOfAffiliation"
        "coi-mapper:acpCOI:acpCOI"
    )

    log_verbose "Configuring IdP attribute mappers (idempotent)..."

    # Get existing mappers to avoid duplicates (SF-029 fix)
    local existing_mappers
    existing_mappers=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null | \
        jq -r '.[].name' 2>/dev/null || echo "")

    for mapper_config in "${mapper_configs[@]}"; do
        IFS=':' read -r mapper_name claim_name user_attr <<< "$mapper_config"
        
        # Check if mapper already exists (prevent duplicates)
        if echo "$existing_mappers" | grep -q "^${mapper_name}$"; then
            log_verbose "  ✓ Mapper exists: $mapper_name (skipping)"
            continue
        fi
        
        # Create mapper
        local mapper_json=$(cat <<EOF
{
  "name": "${mapper_name}",
  "identityProviderMapper": "oidc-user-attribute-idp-mapper",
  "identityProviderAlias": "${idp_alias}",
  "config": {
    "claim": "${claim_name}",
    "user.attribute": "${user_attr}",
    "syncMode": "FORCE"
  }
}
EOF
)
        
        local result
        result=$(docker exec "$kc_container" curl -sf -w "%{http_code}" -o /dev/null \
            -X POST \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$mapper_json" \
            "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null)
        
        if [ "$result" = "201" ]; then
            log_verbose "  ✓ Created mapper: $mapper_name"
        elif [ "$result" = "409" ]; then
            log_verbose "  ✓ Mapper exists: $mapper_name (conflict - OK)"
        else
            log_verbose "  ⚠ Mapper creation returned HTTP $result: $mapper_name"
        fi
    done

    log_verbose "IdP mappers configured (no duplicates)"
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

    # CRITICAL FIX (2026-01-15): Port extraction was including leading newlines causing multi-line Terraform strings
    # Root cause: grep -o can include newlines in output, tr -d only removes ':', not whitespace
    # Solution: Use xargs to trim ALL whitespace (including newlines)
    local spoke_keycloak_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':' | xargs)
    local spoke_frontend_port=$(jq -r '.endpoints.baseUrl // "https://localhost:3000"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':' | xargs)

    # Build complete URLs as atomic strings (no variable expansion that could introduce newlines)
    local idp_url="https://localhost:${spoke_keycloak_port}"
    local frontend_url="https://localhost:${spoke_frontend_port}"

    # Check if already in tfvars (specifically in federation_partners block)
    # Use a more precise check that looks for the key assignment, not just the string
    if grep -E "^\s*${code_lower}\s*=" "$hub_tfvars" 2>/dev/null | grep -v "^#" | head -1 | grep -q .; then
        log_info "$code_upper already in Hub Terraform configuration (federation_partners)"
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
        python3 - "$hub_tfvars" "${hub_tfvars}.entry" "$code_lower" << 'PYTHON_EOF'
import sys
import re

hub_tfvars = sys.argv[1]
entry_file = sys.argv[2]
code_lower = sys.argv[3]

# Read the entry
with open(entry_file, 'r') as f:
    entry = f.read().strip()

# Read tfvars
with open(hub_tfvars, 'r') as f:
    content = f.read()
    lines = content.splitlines(keepends=True)

# Check for duplicate: look for "code_lower = {" pattern (not in comments)
duplicate_pattern = re.compile(rf'^\s*{re.escape(code_lower)}\s*=\s*\{{', re.MULTILINE)
if duplicate_pattern.search(content):
    print(f"✓ {code_lower.upper()} already exists in federation_partners (skipping)")
    sys.exit(0)

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

print(f"✓ Added {code_lower.upper()} to federation_partners")
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
        if ! spoke_secrets_load "USA" 2>/dev/null; then
            log_verbose "Could not load USA secrets (may already be loaded)"
        fi
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

    # ==========================================================================
    # TARGETED TERRAFORM APPLY
    # ==========================================================================
    # Instead of applying all resources (which fails if some already exist),
    # we target only the resources for this specific spoke. This handles:
    # - Existing resources in Keycloak that aren't in TF state
    # - Partial deployments that left orphaned resources
    # - State drift from manual operations
    # ==========================================================================
    log_info "Running targeted terraform apply for Hub (${code_lower} only)..."

    # Define the resources to target for this spoke
    local target_args=(
        -target="module.instance.keycloak_oidc_identity_provider.federation_partner[\"${code_lower}\"]"
        -target="module.instance.keycloak_openid_client.incoming_federation[\"${code_lower}\"]"
    )

    # First, try to import existing resources if they exist in Keycloak
    # This syncs Terraform state with Keycloak reality
    local hub_realm="dive-v3-broker-usa"
    local idp_alias="${code_lower}-idp"
    local client_id="dive-v3-broker-${code_lower}"

    # Check if IdP exists and try to import it
    local idp_exists=$(docker exec dive-hub-keycloak curl -sf \
        -H "Authorization: Bearer $(docker exec dive-hub-keycloak curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" \
            -d "password=${TF_VAR_keycloak_admin_password}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')" \
        "http://localhost:8080/admin/realms/${hub_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if [ -n "$idp_exists" ] && echo "$idp_exists" | jq -e '.alias' &>/dev/null; then
        log_info "IdP ${idp_alias} exists in Keycloak, importing to state..."
        terraform import \
            "module.instance.keycloak_oidc_identity_provider.federation_partner[\"${code_lower}\"]" \
            "${hub_realm}/${idp_alias}" 2>/dev/null || log_verbose "Import skipped (may already be in state)"
    fi

    # Check if client exists and try to import it
    local client_uuid=$(docker exec dive-hub-keycloak curl -sf \
        -H "Authorization: Bearer $(docker exec dive-hub-keycloak curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" \
            -d "password=${TF_VAR_keycloak_admin_password}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')" \
        "http://localhost:8080/admin/realms/${hub_realm}/clients?clientId=${client_id}" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -n "$client_uuid" ]; then
        log_info "Client ${client_id} exists in Keycloak, importing to state..."
        terraform import \
            "module.instance.keycloak_openid_client.incoming_federation[\"${code_lower}\"]" \
            "${hub_realm}/${client_uuid}" 2>/dev/null || log_verbose "Import skipped (may already be in state)"
    fi

    # Now apply with targets
    local tf_output
    local tf_exit_code=0
    tf_output=$(terraform apply -var-file=hub.tfvars "${target_args[@]}" -auto-approve 2>&1) || tf_exit_code=$?

    if [ $tf_exit_code -eq 0 ]; then
        log_success "Hub Terraform applied - federation client created for $code_upper"
    else
        # Check if it's a 409 conflict (resource already exists)
        if echo "$tf_output" | grep -q "409 Conflict"; then
            log_warn "Some resources already exist in Keycloak (409 Conflict)"
            log_info "This is OK - resources were created by a previous deployment"
            # Don't fail - the resources exist, which is what we wanted
        else
            log_error "Hub Terraform apply failed (exit code: $tf_exit_code)"
            echo "$tf_output" | tail -50  # Show last 50 lines of error
            return 1
        fi
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

    # ==========================================================================
    # DATABASE STATE: Mark HUB_TO_SPOKE as CREATING (if database available)
    # ==========================================================================
    if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "CREATING"; then
            log_verbose "✓ Federation link status: usa → $code_lower CREATING"
        fi
    fi

    # Check if Hub is accessible (use default if HUB_KC_CONTAINER not set)
    local hub_container="${HUB_KC_CONTAINER:-dive-hub-keycloak}"
    if ! docker ps --format '{{.Names}}' | grep -q "^${hub_container}$"; then
        log_warn "Hub Keycloak not running (expected container: $hub_container)"
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                "Hub Keycloak not running"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
        return 1
    fi

    # Use federation-link.sh helper if available
    if type _federation_link_direct &>/dev/null; then
        log_verbose "Using federation-link.sh helper for bidirectional setup"
        if _federation_link_direct "USA" "$code_upper"; then
            log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"
            # Update database state to ACTIVE (if database available)
            if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
                if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "ACTIVE"; then
                    log_verbose "✓ Federation link status: usa → $code_lower ACTIVE"
                fi
            fi
            return 0
        else
            log_warn "Failed to create bidirectional IdP via helper"
            if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
                if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                    "Failed via federation-link helper"; then
                    log_verbose "Could not update federation status (database may be unavailable)"
                fi
            fi
            return 1
        fi
    fi

    # Fallback: Direct implementation
    log_verbose "Creating $code_lower-idp in Hub directly..."

    # Get Hub admin token (use local variable, not constant which may be empty)
    log_verbose "DEBUG: hub_container='$hub_container', HUB_KC_CONTAINER='${HUB_KC_CONTAINER:-NOT_SET}'"
    log_verbose "DEBUG: Calling spoke_federation_get_admin_token with container: $hub_container"

    local hub_admin_token
    hub_admin_token=$(spoke_federation_get_admin_token "$hub_container" "true")  # Enable debug

    if [ -z "$hub_admin_token" ]; then
        log_error "Cannot get Hub admin token for container: $hub_container"
        log_error "DEBUG: Check if container is running: docker ps | grep $hub_container"
        return 1
    fi

    log_verbose "DEBUG: Hub admin token retrieved successfully (${#hub_admin_token} chars)"

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
    existing_idp=$(docker exec "$hub_container" curl -sf \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_info "$idp_alias already exists in Hub (skipping)"
        return 0
    fi

    # Create IdP
    local create_result
    create_result=$(docker exec "$hub_container" curl -sf \
        -X POST "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances" \
        -H "Authorization: Bearer $hub_admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"

        # Configure IdP mappers
        if type _configure_idp_mappers &>/dev/null; then
            _configure_idp_mappers "$hub_container" "$hub_admin_token" "$HUB_REALM" "$idp_alias"
        fi

        # ==========================================================================
        # DATABASE STATE: Mark HUB_TO_SPOKE as ACTIVE (if database available)
        # ==========================================================================
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "ACTIVE"; then
                log_verbose "✓ Federation link status: usa → $code_lower ACTIVE"
            fi
        fi

        return 0
    else
        log_error "Failed to create bidirectional IdP: $create_result"
        # Update database state to FAILED
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                "Failed to create IdP: $create_result"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
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

    # ==========================================================================
    # DATABASE STATE: Record health check results (2026-01-16)
    # ==========================================================================
    if type fed_db_record_health &>/dev/null; then
        # Record Spoke→Hub health
        if [ "${fed_db_available:-false}" = true ] && type fed_db_record_health &>/dev/null; then
            if fed_db_record_health "$code_lower" "usa" "SPOKE_TO_HUB" \
                "$spoke_to_hub" "$spoke_to_hub" "true" "true" \
                "$spoke_to_hub" "" ""; then
                log_verbose "✓ Spoke→Hub health recorded"
            fi
            # Record Hub→Spoke health
            if fed_db_record_health "usa" "$code_lower" "HUB_TO_SPOKE" \
                "$hub_to_spoke" "$hub_to_spoke" "true" "true" \
                "$hub_to_spoke" "" ""; then
                log_verbose "✓ Hub→Spoke health recorded"
            fi
        else
            log_verbose "Federation health recording skipped (database not available)"
        fi
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
    local debug="${2:-false}"  # Optional debug parameter

    # Get admin password - try multiple sources
    local admin_pass=""
    local source="unknown"

    # 1. Try container environment variables
    admin_pass=$(docker exec "$container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    [ -n "$admin_pass" ] && source="KC_ADMIN_PASSWORD"

    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="KC_BOOTSTRAP_ADMIN_PASSWORD"
    fi
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="KEYCLOAK_ADMIN_PASSWORD"
    fi

    # 2. Try local environment variables (instance-suffixed)
    if [ -z "$admin_pass" ]; then
        # Extract instance code from container name (dive-spoke-{code}-keycloak or dive-hub-keycloak)
        local instance_code
        if [[ "$container" =~ dive-spoke-([a-z]+)-keycloak ]]; then
            instance_code="${BASH_REMATCH[1]^^}"
        elif [[ "$container" == "dive-hub-keycloak" ]]; then
            instance_code="USA"
        fi

        if [ -n "$instance_code" ]; then
            local env_var="KEYCLOAK_ADMIN_PASSWORD_${instance_code}"
            admin_pass="${!env_var}"
            if [ -n "$admin_pass" ]; then
                source="env:$env_var"
                log_verbose "Using local env var $env_var for admin token"
            fi
        fi
    fi

    # 3. Try KEYCLOAK_ADMIN_PASSWORD without suffix (legacy)
    if [ -z "$admin_pass" ] && [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        admin_pass="$KEYCLOAK_ADMIN_PASSWORD"
        source="env:KEYCLOAK_ADMIN_PASSWORD"
    fi

    # 4. Try GCP Secret Manager for Hub (last resort)
    if [ -z "$admin_pass" ] && [[ "$container" == "dive-hub-keycloak" ]]; then
        if type check_gcloud &>/dev/null && check_gcloud 2>/dev/null; then
            admin_pass=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-usa" --project=dive25 2>/dev/null | tr -d '\n\r')
            if [ -n "$admin_pass" ]; then
                source="gcp:dive-v3-keycloak-usa"
                log_verbose "Retrieved Hub password from GCP Secret Manager"
            fi
        fi
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot get admin password for $container from any source"
        log_error "Tried: container env vars, KEYCLOAK_ADMIN_PASSWORD_*, KEYCLOAK_ADMIN_PASSWORD, GCP secrets"
        if [ "$debug" = "true" ]; then
            log_error "Debug: KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-NOT_SET}"
            log_error "Debug: KEYCLOAK_ADMIN_PASSWORD_USA=${KEYCLOAK_ADMIN_PASSWORD_USA:-NOT_SET}"
            log_error "Debug: Container running: $(docker ps --filter name=$container --format '{{.Names}}')"
        fi
        return 1
    fi

    [ "$debug" = "true" ] && log_verbose "Password source: $source (length: ${#admin_pass})"

    # Get token
    local response
    response=$(docker exec "$container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Token request to $container failed (empty response)"
        return 1
    fi

    local token
    token=$(echo "$response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$token" ]; then
        log_error "No access_token in response from $container"
        [ "$debug" = "true" ] && log_error "Response: $response"
        return 1
    fi

    echo "$token"
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
