#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Docker Compose Generator
# =============================================================================
# Generates docker-compose.yml from template with proper variable substitution.
# Replaces the 92-line sed-based inline function in spoke-init.sh
#
# Template placeholders:
#   {{INSTANCE_CODE_UPPER}} - 3-letter uppercase code
#   {{INSTANCE_CODE_LOWER}} - 3-letter lowercase code
#   {{INSTANCE_NAME}}       - Human-readable name
#   {{SPOKE_ID}}            - Unique identifier
#   {{IDP_HOSTNAME}}        - Keycloak container hostname
#   {{API_URL}}             - Backend API URL
#   {{BASE_URL}}            - Frontend URL
#   {{IDP_URL}}             - Keycloak IdP URL
#   {{KEYCLOAK_HOST_PORT}}  - Keycloak HTTPS port
#   {{BACKEND_HOST_PORT}}   - Backend port
#   {{FRONTEND_HOST_PORT}}  - Frontend port
#   {{OPA_HOST_PORT}}       - OPA port
#   {{KAS_HOST_PORT}}       - KAS port
#   {{TIMESTAMP}}           - Generation timestamp
#   {{TEMPLATE_HASH}}       - Template version hash
#   {{TEMPLATE_LAST_UPDATED}} - Template modification date
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing (readonly vars would error on re-source)
[ -n "${SPOKE_COMPOSE_GENERATOR_LOADED:-}" ] && return 0
export SPOKE_COMPOSE_GENERATOR_LOADED=1

# =============================================================================
# LOAD COUNTRY DATABASE
# =============================================================================
# Source nato-countries.sh (which also loads iso-countries.sh)
# This provides unified port assignments for all country types
_compose_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_nato_db="${_compose_script_dir}/../../../nato-countries.sh"
if [ -f "$_nato_db" ]; then
    # shellcheck source=../../../nato-countries.sh
    source "$_nato_db"
fi
unset _compose_script_dir _nato_db

# =============================================================================
# TEMPLATE CONFIGURATION
# =============================================================================

SPOKE_TEMPLATE_FILE="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"
SPOKE_ECR_TEMPLATE_FILE="${DIVE_ROOT}/templates/spoke/docker-compose.ecr.template.yml"

# Select ECR template only when ECR_REGISTRY is configured
# Remote mode without ECR builds from source (same as local mode)
_spoke_get_template_file() {
    if [ -n "${ECR_REGISTRY:-}" ]; then
        if [ -f "$SPOKE_ECR_TEMPLATE_FILE" ]; then
            echo "$SPOKE_ECR_TEMPLATE_FILE"
            return
        fi
        log_warn "ECR template not found, falling back to local template"
    fi
    echo "$SPOKE_TEMPLATE_FILE"
}

# Port offset for spoke instances (to avoid Hub port conflicts)
# Use a function to calculate instead of readonly constant
spoke_get_port_offset() {
    echo 10000
}

# Default ports (before offset)
readonly DEFAULT_FRONTEND_PORT=3000
readonly DEFAULT_BACKEND_PORT=4000
readonly DEFAULT_KEYCLOAK_PORT=8443
readonly DEFAULT_OPA_PORT=8181
readonly DEFAULT_KAS_PORT=9000  # Fixed: was 8080 (conflicted with Keycloak HTTP port)
readonly DEFAULT_KEYCLOAK_HTTP_PORT=8080
readonly DEFAULT_OPAL_OPA_PORT=9181

# =============================================================================
# MAIN GENERATION FUNCTION
# =============================================================================

##
# Generate docker-compose.yml from template
#
# Arguments:
#   $1 - Instance code
#   $2 - Target directory (defaults to instances/{code})
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_compose_generate() {
    local instance_code="$1"
    local target_dir="${2:-}"

    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    # Set default target directory
    if [ -z "$target_dir" ]; then
        target_dir="${DIVE_ROOT}/instances/${code_lower}"
    fi

    local output_file="$target_dir/docker-compose.yml"

    log_step "Generating docker-compose.yml for $code_upper"

    # Select template (ECR for remote, local for local dev)
    local active_template
    active_template=$(_spoke_get_template_file)

    # Verify template exists
    if [ ! -f "$active_template" ]; then
        log_error "Template not found: $active_template"
        orch_record_error "$SPOKE_ERROR_COMPOSE_GENERATE" "$ORCH_SEVERITY_CRITICAL" \
            "Docker compose template not found" "compose" \
            "Ensure templates/spoke/docker-compose.template.yml exists"
        return 1
    fi

    if [ "$active_template" = "$SPOKE_ECR_TEMPLATE_FILE" ]; then
        log_info "Using ECR template (pre-built images from registry)"
    fi

    # Ensure target directory exists
    mkdir -p "$target_dir"

    # Get all placeholder values
    local placeholders
    placeholders=$(spoke_compose_get_placeholders "$code_upper" "$code_lower" "$target_dir")

    # Generate from template
    if ! spoke_compose_render_template "$placeholders" "$output_file"; then
        return 1
    fi

    # Validate generated file
    if ! spoke_compose_validate "$output_file"; then
        return 1
    fi

    log_success "Generated: $output_file"
    return 0
}

##
# Get all placeholder values as associative array export
#
# Arguments:
#   $1 - Instance code (uppercase)
#   $2 - Instance code (lowercase)
#   $3 - Target directory
#
# Prints:
#   Placeholder assignments for eval
##
spoke_compose_get_placeholders() {
    local code_upper="$1"
    local code_lower="$2"
    local target_dir="$3"

    # Get port assignments
    local ports
    ports=$(spoke_compose_get_ports "$code_upper")
    eval "$ports"

    # Generate unique spoke ID
    local spoke_id
    spoke_id=$(spoke_compose_get_spoke_id "$code_lower" "$target_dir")

    # Get instance name from NATO database or config
    local instance_name
    instance_name=$(spoke_compose_get_instance_name "$code_upper")

    # Generate template hash
    local template_hash
    template_hash=$(md5sum "$SPOKE_TEMPLATE_FILE" 2>/dev/null | cut -d' ' -f1 || echo "unknown")

    # Template modification date
    local template_date
    template_date=$(date -r "$SPOKE_TEMPLATE_FILE" +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")

    # Build URLs and ports
    local frontend_port="${SPOKE_FRONTEND_PORT:-$((DEFAULT_FRONTEND_PORT + SPOKE_PORT_OFFSET))}"
    local backend_port="${SPOKE_BACKEND_PORT:-$((DEFAULT_BACKEND_PORT + SPOKE_PORT_OFFSET))}"
    local keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-$((DEFAULT_KEYCLOAK_PORT + SPOKE_PORT_OFFSET))}"
    local keycloak_http_port="${SPOKE_KEYCLOAK_HTTP_PORT:-$((8080 + SPOKE_PORT_OFFSET))}"
    local opa_port="${SPOKE_OPA_PORT:-$((DEFAULT_OPA_PORT + SPOKE_PORT_OFFSET))}"
    local opal_opa_port=$((9181 + SPOKE_PORT_OFFSET))  # OPAL inline OPA (separate from standalone OPA)
    local kas_port="${SPOKE_KAS_PORT:-$((DEFAULT_KAS_PORT + SPOKE_PORT_OFFSET))}"

    # Domain-aware URLs: when DIVE_DOMAIN_SUFFIX is set (EC2 with Caddy),
    # use external domain names instead of localhost:port.
    # For non-local environments, DIVE_DOMAIN_SUFFIX or HUB_EXTERNAL_ADDRESS is required.
    local idp_hostname="dive-spoke-${code_lower}-keycloak"
    local idp_url="https://${idp_hostname}:8443"  # Container-to-container (always internal)

    # Resolve public-facing URLs via the SSOT helpers
    local base_url api_url idp_base_url
    base_url=$(resolve_spoke_public_url "$code_upper" "app")
    api_url=$(resolve_spoke_public_url "$code_upper" "api")
    idp_base_url=$(resolve_spoke_public_url "$code_upper" "idp")

    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        idp_hostname="${_env_prefix}-${code_lower}-idp.${_base_domain}"
        log_verbose "Caddy mode: spoke URLs use domain ${_base_domain}"
    elif [ "${ENVIRONMENT:-local}" != "local" ]; then
        log_warn "No DIVE_DOMAIN_SUFFIX set for non-local deployment — URLs will use ${HUB_EXTERNAL_ADDRESS:-localhost}:port"
        log_warn "Set --domain for remote deployment. Example: ./dive spoke deploy ${code_upper} --domain dev.dive25.com"
    fi

    # ECR registry and image tag (for ECR template)
    local ecr_registry="${ECR_REGISTRY:-}"
    local image_tag="${IMAGE_TAG:-latest}"

    # Output placeholders for rendering
    cat << EOF
INSTANCE_CODE_UPPER="${code_upper}"
INSTANCE_CODE_LOWER="${code_lower}"
INSTANCE_NAME="${instance_name}"
SPOKE_ID="${spoke_id}"
IDP_HOSTNAME="${idp_hostname}"
API_URL="${api_url}"
BASE_URL="${base_url}"
IDP_URL="${idp_url}"
KEYCLOAK_HOST_PORT="${keycloak_port}"
KEYCLOAK_HTTP_PORT="${keycloak_http_port}"
BACKEND_HOST_PORT="${backend_port}"
FRONTEND_HOST_PORT="${frontend_port}"
OPA_HOST_PORT="${opa_port}"
OPAL_OPA_PORT="${opal_opa_port}"
KAS_HOST_PORT="${kas_port}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TEMPLATE_HASH="${template_hash}"
TEMPLATE_LAST_UPDATED="${template_date}"
IDP_BASE_URL="${idp_base_url}"
ECR_REGISTRY="${ecr_registry}"
IMAGE_TAG="${image_tag}"
EOF
}

##
# Get port assignments for a spoke instance
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Prints:
#   Port assignments for eval
##
spoke_compose_get_ports() {
    local code_upper="$1"

    # Priority 1: Use unified country database (NATO, Partner, ISO, Custom)
    # This ensures consistency between docker-compose and terraform tfvars
    if type get_any_country_ports &>/dev/null && type is_valid_country &>/dev/null; then
        if is_valid_country "$code_upper"; then
            get_any_country_ports "$code_upper"
            return
        fi
    fi

    # Priority 2: Use legacy port function if available
    if type get_instance_ports &>/dev/null; then
        get_instance_ports "$code_upper"
        return
    fi

    # Priority 3: Fallback for truly unknown codes
    # Calculate ports based on country code hash (consistent assignment)
    log_warn "Unknown country code '$code_upper' - using hash-based port assignment"

    local hash_value
    hash_value=$(echo -n "$code_upper" | od -A n -t d1 | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum % 100}')

    local port_offset
    port_offset=$(spoke_get_port_offset)
    local base_offset=$((port_offset + hash_value * 10))

    cat << EOF
SPOKE_PORT_OFFSET=${base_offset}
SPOKE_FRONTEND_PORT=$((DEFAULT_FRONTEND_PORT + base_offset))
SPOKE_BACKEND_PORT=$((DEFAULT_BACKEND_PORT + base_offset))
SPOKE_KEYCLOAK_HTTPS_PORT=$((DEFAULT_KEYCLOAK_PORT + base_offset))
SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + base_offset))
SPOKE_OPA_PORT=$((DEFAULT_OPA_PORT + base_offset))
SPOKE_KAS_PORT=$((DEFAULT_KAS_PORT + base_offset))
EOF
}

##
# Get or generate spoke ID
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Target directory
#
# Prints:
#   Spoke ID
##
spoke_compose_get_spoke_id() {
    local code_lower="$1"
    local target_dir="$2"

    # ==========================================================================
    # CRITICAL FIX (2026-01-22): Get spokeId from Hub (SSOT), not local generation
    # ==========================================================================
    # Priority:
    # 1. .env file (set during registration)
    # 2. spoke_config_get (may have Hub-assigned ID)
    # 3. Query Hub MongoDB directly
    # 4. Use placeholder (will fail heartbeat until properly registered)
    
    # Priority 1: Check .env file (most up-to-date after registration)
    if [ -f "$target_dir/.env" ]; then
        local env_id
        env_id=$(grep "^SPOKE_ID=" "$target_dir/.env" 2>/dev/null | cut -d= -f2)
        if [ -n "$env_id" ] && [[ ! "$env_id" =~ ^spoke-.*-temp- ]] && [ "$env_id" != "PENDING_REGISTRATION" ]; then
            echo "$env_id"
            return
        fi
    fi
    
    # Priority 2: Check spoke_config_get (SSOT — reads from .env / env vars)
    local code_upper="${code_lower^^}"
    local config_id
    config_id=$(spoke_config_get "$code_upper" "identity.spokeId" "")
    if [ -n "$config_id" ] && [[ ! "$config_id" =~ ^spoke-.*-temp- ]] && [ "$config_id" != "PENDING_REGISTRATION" ]; then
        echo "$config_id"
        return
    fi
    
    # Priority 3: Query Hub MongoDB via API
    local hub_api
    hub_api=$(resolve_hub_public_url "api")
    local hub_spoke_id
    hub_spoke_id=$(curl -sk --max-time 5 "${hub_api}/api/federation/spokes?instanceCode=${code_upper}" 2>/dev/null | jq -r '.spokes[0].spokeId // empty' 2>/dev/null)
    if [ -n "$hub_spoke_id" ] && [ "$hub_spoke_id" != "null" ]; then
        echo "$hub_spoke_id"
        return
    fi
    
    # Priority 4: Use placeholder (registration required)
    log_warn "No valid spokeId found - spoke must be registered with Hub"
    echo "spoke-${code_lower}-UNREGISTERED"
}

##
# Get instance name from NATO database or default
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Prints:
#   Instance name
##
spoke_compose_get_instance_name() {
    local code_upper="$1"

    # Try NATO database (extract only country name, not full metadata)
    if [[ -n "${NATO_COUNTRIES["$code_upper"]+_}" ]]; then
        # NATO_COUNTRIES format: "CountryName|flag|color1|color2|timezone|year|code"
        # Extract only the country name (first field)
        local full_entry="${NATO_COUNTRIES["$code_upper"]}"
        local country_name
        country_name=$(echo "$full_entry" | cut -d'|' -f1)
        echo "$country_name"
        return
    fi

    # Fallback: use spoke_config_get (SSOT)
    local config_name
    config_name=$(spoke_config_get "$code_upper" "identity.name" "$code_upper Instance")
    echo "$config_name"
}

# =============================================================================
# TEMPLATE RENDERING
# =============================================================================

##
# Render template with placeholder substitution
#
# Arguments:
#   $1 - Placeholder values (eval-able string)
#   $2 - Output file path
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_compose_render_template() {
    local placeholders="$1"
    local output_file="$2"

    # Evaluate placeholders
    eval "$placeholders"

    # Select the active template
    local active_template
    active_template=$(_spoke_get_template_file)

    # Read template and substitute
    local template_content
    template_content=$(cat "$active_template")

    # Perform substitutions
    template_content="${template_content//\{\{INSTANCE_CODE_UPPER\}\}/${INSTANCE_CODE_UPPER}}"
    template_content="${template_content//\{\{INSTANCE_CODE_LOWER\}\}/${INSTANCE_CODE_LOWER}}"
    template_content="${template_content//\{\{INSTANCE_NAME\}\}/${INSTANCE_NAME}}"
    template_content="${template_content//\{\{SPOKE_ID\}\}/${SPOKE_ID}}"
    template_content="${template_content//\{\{IDP_HOSTNAME\}\}/${IDP_HOSTNAME}}"
    template_content="${template_content//\{\{API_URL\}\}/${API_URL}}"
    template_content="${template_content//\{\{BASE_URL\}\}/${BASE_URL}}"
    template_content="${template_content//\{\{IDP_URL\}\}/${IDP_URL}}"
    template_content="${template_content//\{\{IDP_BASE_URL\}\}/${IDP_BASE_URL}}"
    template_content="${template_content//\{\{KEYCLOAK_HOST_PORT\}\}/${KEYCLOAK_HOST_PORT}}"
    template_content="${template_content//\{\{KEYCLOAK_HTTP_PORT\}\}/${KEYCLOAK_HTTP_PORT}}"
    template_content="${template_content//\{\{BACKEND_HOST_PORT\}\}/${BACKEND_HOST_PORT}}"
    template_content="${template_content//\{\{FRONTEND_HOST_PORT\}\}/${FRONTEND_HOST_PORT}}"
    template_content="${template_content//\{\{OPA_HOST_PORT\}\}/${OPA_HOST_PORT}}"
    template_content="${template_content//\{\{OPAL_OPA_PORT\}\}/${OPAL_OPA_PORT}}"
    template_content="${template_content//\{\{KAS_HOST_PORT\}\}/${KAS_HOST_PORT}}"
    template_content="${template_content//\{\{TIMESTAMP\}\}/${TIMESTAMP}}"
    template_content="${template_content//\{\{TEMPLATE_HASH\}\}/${TEMPLATE_HASH}}"
    template_content="${template_content//\{\{TEMPLATE_LAST_UPDATED\}\}/${TEMPLATE_LAST_UPDATED}}"

    # ECR placeholders (only meaningful for ECR template, harmless for local)
    template_content="${template_content//\{\{ECR_REGISTRY\}\}/${ECR_REGISTRY:-}}"
    template_content="${template_content//\{\{IMAGE_TAG\}\}/${IMAGE_TAG:-latest}}"

    # CRITICAL FIX (2026-01-18): Do NOT substitute environment variable values
    # Docker Compose loads ${VAR_NAME} from .env file at runtime
    # Only template placeholders {{PLACEHOLDER}} should be substituted
    #
    # REMOVED: .env variable substitution (lines 363-389)
    # REASON: Caused hardcoded passwords in docker-compose.yml instead of ${POSTGRES_PASSWORD_FRA} references
    # IMPACT: Terraform apply failed because containers had hardcoded passwords but TF_VAR_* were not set
    #
    # The template has ${POSTGRES_PASSWORD_{{INSTANCE_CODE_UPPER}}} which becomes:
    #   Step 1: Replace {{INSTANCE_CODE_UPPER}} with FRA → ${POSTGRES_PASSWORD_FRA} ✅
    #   Step 2: Docker Compose loads POSTGRES_PASSWORD_FRA=value from .env at runtime ✅
    #   [REMOVED Step 3: Don't substitute ${POSTGRES_PASSWORD_FRA} with hardcoded value ❌]

    # Remote mode: strip dive-shared network references (cross-instance uses HTTPS)
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        # Remove dive-shared network declaration (external: true block)
        template_content=$(echo "$template_content" | sed '/^  dive-shared:$/,/^    external: true$/d')
        # Remove dive-shared from service network lists and associated aliases
        template_content=$(echo "$template_content" | sed '/^      dive-shared:$/,/^        aliases:$/{ /dive-shared:/d; /aliases:/d; }')
        template_content=$(echo "$template_content" | sed '/^      dive-shared:/d')
        template_content=$(echo "$template_content" | sed '/- dive-shared/d')
        # Remove alias lines that were under dive-shared (e.g., keycloak-{code} alias)
        template_content=$(echo "$template_content" | sed '/^          - keycloak-/d')
        log_verbose "Remote mode: stripped dive-shared network references from compose"
    fi

    # Write output
    echo "$template_content" > "$output_file"

    if [ -f "$output_file" ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# VALIDATION
# =============================================================================

##
# Validate generated docker-compose file
#
# Arguments:
#   $1 - File path
#
# Returns:
#   0 - Valid
#   1 - Invalid
##
spoke_compose_validate() {
    local file_path="$1"

    # Check file exists and has content
    if [ ! -s "$file_path" ]; then
        log_error "Generated compose file is empty"
        return 1
    fi

    # Check for unresolved placeholders
    if grep -q '{{[A-Z_]*}}' "$file_path"; then
        local unresolved
        unresolved=$(grep -o '{{[A-Z_]*}}' "$file_path" | sort -u | head -5)
        log_error "Unresolved placeholders in compose file: $unresolved"
        return 1
    fi

    # Validate YAML syntax (if docker available)
    if command -v docker &>/dev/null; then
        local dir
        dir=$(dirname "$file_path")
        cd "$dir" || return 1

        if ! docker compose config >/dev/null 2>&1; then
            log_error "Invalid docker compose syntax"
            return 1
        fi
    fi

    log_verbose "Compose file validation passed"
    return 0
}

# =============================================================================
# UPDATE / DRIFT DETECTION
# =============================================================================

##
# Check if compose file needs regeneration (template drift)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Up to date
#   1 - Needs update
##
spoke_compose_check_drift() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local compose_file="$spoke_dir/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        return 1  # Needs generation
    fi

    # Get current template hash
    local active_template
    active_template=$(_spoke_get_template_file)
    local template_hash
    template_hash=$(md5sum "$active_template" 2>/dev/null | cut -d' ' -f1)

    # Get hash from generated file
    local current_hash
    current_hash=$(grep "Template Hash:" "$compose_file" 2>/dev/null | grep -o '[a-f0-9]\{32\}')

    if [ "$template_hash" = "$current_hash" ]; then
        return 0  # Up to date
    else
        return 1  # Needs update
    fi
}

##
# Update compose file from template
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_compose_update() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Updating compose file for $(upper "$instance_code")"

    # Backup current file
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        cp "$spoke_dir/docker-compose.yml" "$spoke_dir/docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)"
    fi

    # Regenerate
    spoke_compose_generate "$instance_code" "$spoke_dir"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Export functions for use by other modules
export -f spoke_compose_generate
export -f spoke_compose_get_placeholders
export -f spoke_compose_get_ports
export -f spoke_compose_get_spoke_id
export -f spoke_compose_get_instance_name
export -f spoke_compose_render_template
export -f spoke_compose_validate
export -f spoke_compose_check_drift
export -f spoke_compose_update

log_verbose "Compose generator module loaded (9 functions)"

# sc2034-anchor
: "${DEFAULT_KEYCLOAK_HTTP_PORT:-}" "${DEFAULT_OPAL_OPA_PORT:-}"
