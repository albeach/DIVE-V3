#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Federation (Hub Registration & Bidirectional)
# =============================================================================
# Extracted from spoke-federation.sh (Phase 13d)
# Contains: register_in_hub, create_bidirectional, verify, get_admin_token,
#   update_status
# =============================================================================

[ -n "${SPOKE_FEDERATION_EXTENDED_LOADED:-}" ] && return 0

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

    # ==========================================================================
    # CRITICAL: Ensure Hub Keycloak admin API is ready before Terraform
    # ==========================================================================
    log_verbose "Verifying Hub Keycloak ready for Terraform operations..."
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 120; then
            log_error "Hub Keycloak admin API not ready for Terraform"
            return 1
        fi
        log_verbose "✓ Hub Keycloak admin API ready for Terraform"
    fi

    # Apply Hub Terraform
    log_step "Applying Hub Terraform to create federation client..."

    local hub_tf_dir="${DIVE_ROOT}/terraform/hub"
    cd "$hub_tf_dir" || return 1

    # Load Hub secrets from .env.hub (SSOT for hub deployment config)
    # NOTE: Do NOT use spoke_secrets_load "USA" here — the spoke's Vault AppRole
    # is scoped to its own instance (e.g., FRA) and cannot read USA secrets.
    export INSTANCE="usa"
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        log_verbose "Loading USA secrets from Hub SSOT (.env.hub)"
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
    else
        log_warn "Hub .env.hub not found — Hub Terraform may fail"
    fi

    # Export TF_VAR environment variables
    export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project="${GCP_PROJECT:-dive25}" 2>/dev/null)}"
    export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project="${GCP_PROJECT:-dive25}" 2>/dev/null)}"
    # Use test user passwords following Hub pattern
    export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${TF_VAR_keycloak_admin_password}}"
    export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${TF_VAR_keycloak_admin_password}}"
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

    # Use federation/setup.sh helper if available
    if type _federation_link_direct &>/dev/null; then
        log_verbose "Using federation/setup.sh helper for bidirectional setup"
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
        \"firstBrokerLoginFlowAlias\": \"first broker login\",
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
            \"defaultScope\": \"openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr\",
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
            # FIXED: Use {code}-idp format, not spoke-idp-{code}
            # Federation link creates fra-idp, not spoke-idp-fra
            hub_idp_status=$(docker exec "$HUB_KC_CONTAINER" curl -sf \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${code_lower}-idp" 2>/dev/null)

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
        return 0  # FIXED (2026-02-07): Return success when bidirectional
    else
        # PHASE 1 FIX: Convert soft-fail to hard failure
        # Incomplete federation means spoke cannot function properly
        if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
            log_warn "Federation incomplete: spoke→hub=$spoke_to_hub, hub→spoke=$hub_to_spoke"
            log_warn "Federation skipped - continuing deployment"
            return 0  # Allow deployment to proceed when federation explicitly skipped
        else
            log_error "Federation incomplete: spoke→hub=$spoke_to_hub, hub→spoke=$hub_to_spoke"
            log_error "Impact: Spoke cannot perform bidirectional federated operations"
            log_error "Fix: Run './dive federation link $code_upper' to complete federation"
            log_error "      Verify Keycloak IdPs: ./dive federation verify $code_upper"
            log_error "      Override: Use --skip-federation flag to deploy without federation"
            return 1
        fi
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

    # CRITICAL FIX (2026-02-07): Get password from the BACKEND container
    # Keycloak container doesn't have environment variables - they're in backend
    local admin_pass=""
    local source="unknown"

    # Extract instance code from container name
    local instance_code=""
    local backend_container=""
    
    if [[ "$container" =~ dive-spoke-([a-z]+)-keycloak ]]; then
        instance_code="${BASH_REMATCH[1]}"
        backend_container="dive-spoke-${instance_code}-backend"
    elif [[ "$container" == "dive-hub-keycloak" ]]; then
        instance_code="usa"
        backend_container="dive-hub-backend"
    fi

    # 1. Get password from backend container (SSOT)
    if [ -n "$backend_container" ] && docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # Try KC_BOOTSTRAP_ADMIN_PASSWORD first (used during bootstrap)
        admin_pass=$(docker exec "$backend_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        if [ -n "$admin_pass" ]; then
            source="backend:KC_BOOTSTRAP_ADMIN_PASSWORD"
            [ "$debug" = "true" ] && log_verbose "Retrieved password from $backend_container (KC_BOOTSTRAP_ADMIN_PASSWORD)"
        fi
        
        # Try KEYCLOAK_ADMIN_PASSWORD (standard var)
        if [ -z "$admin_pass" ]; then
            admin_pass=$(docker exec "$backend_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
            if [ -n "$admin_pass" ]; then
                source="backend:KEYCLOAK_ADMIN_PASSWORD"
                [ "$debug" = "true" ] && log_verbose "Retrieved password from $backend_container (KEYCLOAK_ADMIN_PASSWORD)"
            fi
        fi
    fi

    # 2. Fallback: Try Keycloak container environment (legacy, unlikely to work)
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KC_ADMIN_PASSWORD"
    fi
    
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KC_BOOTSTRAP_ADMIN_PASSWORD"
    fi
    
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KEYCLOAK_ADMIN_PASSWORD"
    fi

    # 3. Fallback: Try host environment variables (deployment context)
    if [ -z "$admin_pass" ] && [ -n "$instance_code" ]; then
        local env_var="KEYCLOAK_ADMIN_PASSWORD_${instance_code^^}"
        admin_pass="${!env_var}"
        if [ -n "$admin_pass" ]; then
            source="host:$env_var"
            [ "$debug" = "true" ] && log_verbose "Using host environment variable $env_var"
        fi
    fi

    # 4. Fallback: GCP Secret Manager (last resort)
    if [ -z "$admin_pass" ] && [[ "$container" == "dive-hub-keycloak" ]]; then
        if type check_gcloud &>/dev/null && check_gcloud 2>/dev/null; then
            admin_pass=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-usa" --project="${GCP_PROJECT:-dive25}" 2>/dev/null | tr -d '\n\r')
            if [ -n "$admin_pass" ]; then
                source="gcp:dive-v3-keycloak-usa"
                [ "$debug" = "true" ] && log_verbose "Retrieved Hub password from GCP Secret Manager"
            fi
        fi
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot get admin password for $container from any source"
        log_error "Tried: backend container ($backend_container), keycloak container, host env vars, GCP secrets"
        if [ "$debug" = "true" ]; then
            log_error "Debug: Backend container running: $(docker ps --filter name=$backend_container --format '{{.Names}}')"
            log_error "Debug: Keycloak container running: $(docker ps --filter name=$container --format '{{.Names}}')"
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

export SPOKE_FEDERATION_EXTENDED_LOADED=1
