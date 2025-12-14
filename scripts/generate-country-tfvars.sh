#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - NATO Country Terraform Variable Generator
# =============================================================================
# Generates Terraform tfvars files for any NATO country based on ISO code
# Uses centralized NATO countries database for consistent metadata
#
# Usage: ./scripts/generate-country-tfvars.sh <COUNTRY_CODE> [--all] [--force]
#
# Examples:
#   ./scripts/generate-country-tfvars.sh GBR          # Generate GBR tfvars
#   ./scripts/generate-country-tfvars.sh --all        # Generate all 32 NATO tfvars
#   ./scripts/generate-country-tfvars.sh ALB --force  # Regenerate even if exists
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TFVARS_DIR="$PROJECT_ROOT/terraform/countries"

# Load NATO countries database
source "$SCRIPT_DIR/nato-countries.sh"

# Parse arguments
FORCE=false
ALL=false
COUNTRY_CODE=""
HUB_CODE="${DIVE_HUB:-USA}"  # Default hub is USA

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all|-a)
            ALL=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --hub)
            HUB_CODE="${2^^}"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 <COUNTRY_CODE> [--all] [--force] [--hub <CODE>]"
            echo ""
            echo "Options:"
            echo "  --all, -a      Generate tfvars for all 32 NATO countries"
            echo "  --force, -f    Regenerate tfvars even if it exists"
            echo "  --hub <CODE>   Set hub country code (default: USA)"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 GBR              Generate UK tfvars"
            echo "  $0 --all            Generate all 32 NATO tfvars"
            echo "  $0 POL --force      Regenerate Poland tfvars"
            exit 0
            ;;
        *)
            COUNTRY_CODE="${1^^}"
            shift
            ;;
    esac
done

# Ensure output directory exists
mkdir -p "$TFVARS_DIR"

# =============================================================================
# Generate tfvars for a single country
# =============================================================================
generate_tfvars() {
    local code="$1"
    local code_lower="${code,,}"
    
    # Validate NATO country
    if ! is_nato_country "$code"; then
        echo "❌ Unknown country code: $code"
        echo "   Run './dive spoke list-countries' to see valid codes"
        return 1
    fi
    
    local tfvars_file="$TFVARS_DIR/${code_lower}.tfvars"
    
    # Check if tfvars exists
    if [ -f "$tfvars_file" ] && [ "$FORCE" != true ]; then
        echo "  ⏭️  $code: tfvars exists (use --force to regenerate)"
        return 0
    fi
    
    # Get country data from NATO database
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    local timezone=$(get_country_timezone "$code")
    
    # Get port assignments
    eval "$(get_country_ports "$code")"
    
    # Determine if this is the hub
    local is_hub=false
    if [ "$code" = "$HUB_CODE" ]; then
        is_hub=true
    fi
    
    echo "  ✨ Generating: $name ($code) $flag"
    
    # Generate the tfvars file
    cat > "$tfvars_file" << TFVARS
# =============================================================================
# DIVE V3 - ${name} (${code}) Instance Configuration
# =============================================================================
# Auto-generated from NATO countries database
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
#
# To use: terraform plan -var-file=countries/${code_lower}.tfvars
# =============================================================================

# Instance identification
instance_code = "${code}"
instance_name = "${name}"

# =============================================================================
# URLs - Update these for your deployment environment
# =============================================================================
# For local development:
#   app_url = "https://localhost:${SPOKE_FRONTEND_PORT}"
#   api_url = "https://localhost:${SPOKE_BACKEND_PORT}"
#   idp_url = "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
#
# For Cloudflare tunnel (production):
#   app_url = "https://${code_lower}-app.dive25.com"
#   api_url = "https://${code_lower}-api.dive25.com"
#   idp_url = "https://${code_lower}-idp.dive25.com"
# =============================================================================

# Local development URLs (default)
app_url = "https://localhost:${SPOKE_FRONTEND_PORT}"
api_url = "https://localhost:${SPOKE_BACKEND_PORT}"
idp_url = "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"

# =============================================================================
# Client Configuration
# =============================================================================
client_id     = "dive-v3-client-broker"
# SECURITY: Get this from GCP Secret Manager: dive-v3-keycloak-client-secret
# gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25
client_secret = null  # Set via TF_VAR_client_secret environment variable

# =============================================================================
# Theme Configuration
# =============================================================================
login_theme = "dive-v3-${code_lower}"

# =============================================================================
# WebAuthn / Passkey Configuration
# =============================================================================
# For local development, leave empty ("")
# For production with Cloudflare: "dive25.com"
webauthn_rp_id = ""

# =============================================================================
# User Configuration
# =============================================================================
create_test_users = true
# SECURITY: Get these from GCP Secret Manager
# gcloud secrets versions access latest --secret=dive-v3-test-user-password --project=dive25
test_user_password  = null  # Set via TF_VAR_test_user_password
admin_user_password = null  # Set via TF_VAR_admin_user_password

# =============================================================================
# Federation Partners
# =============================================================================
# This ${name} instance federates with the following partners.
# The hub (${HUB_CODE}) is always included for spokes.
# =============================================================================
TFVARS

    # Add federation partners (hub always included for spokes)
    if [ "$is_hub" = true ]; then
        # Hub has no outgoing federation by default (partners federate TO hub)
        cat >> "$tfvars_file" << 'TFVARS'
federation_partners = {
  # Hub instance - partners federate TO this instance
  # Add spoke federations here as needed:
  # gbr = {
  #   instance_code = "GBR"
  #   instance_name = "United Kingdom"
  #   idp_url       = "https://gbr-idp.dive25.com"
  #   enabled       = true
  #   client_secret = "placeholder-sync-after-terraform"
  # }
}

incoming_federation_secrets = {
  # Secrets for incoming federation clients
  # gbr = "secret-from-dive-v3-federation-usa-gbr"
}
TFVARS
    else
        # Spoke federates to hub
        local hub_name=$(get_country_name "$HUB_CODE")
        local hub_lower="${HUB_CODE,,}"
        # Get hub ports separately
        local hub_port_output=$(get_country_ports "$HUB_CODE")
        local hub_port=$(echo "$hub_port_output" | grep SPOKE_KEYCLOAK_HTTPS_PORT | cut -d= -f2)
        
        cat >> "$tfvars_file" << TFVARS
federation_partners = {
  ${hub_lower} = {
    instance_code = "${HUB_CODE}"
    instance_name = "${hub_name}"
    # Local: "https://localhost:${hub_port}"
    # Production: "https://${hub_lower}-idp.dive25.com"
    idp_url       = "https://localhost:${hub_port}"
    enabled       = true
    # SECURITY: Sync after Terraform with scripts/sync-federation-secrets.sh
    client_secret = "placeholder-sync-after-terraform"
  }
}

incoming_federation_secrets = {
  # Secret for ${HUB_CODE} to federate TO this ${code} instance
  # Get from GCP: dive-v3-federation-${code_lower}-${hub_lower}
  ${hub_lower} = null  # Set via TF_VAR_incoming_federation_secrets
}
TFVARS
    fi

    # Add port reference comment
    cat >> "$tfvars_file" << TFVARS

# =============================================================================
# Port Reference (from NATO countries database)
# =============================================================================
# Frontend:   ${SPOKE_FRONTEND_PORT}
# Backend:    ${SPOKE_BACKEND_PORT}
# Keycloak:   ${SPOKE_KEYCLOAK_HTTPS_PORT}
# PostgreSQL: ${SPOKE_POSTGRES_PORT}
# MongoDB:    ${SPOKE_MONGODB_PORT}
# Redis:      ${SPOKE_REDIS_PORT}
# OPA:        ${SPOKE_OPA_PORT}
# KAS:        ${SPOKE_KAS_PORT}
# =============================================================================
TFVARS

    echo "     ✓ Created: $tfvars_file"
    return 0
}

# =============================================================================
# Main execution
# =============================================================================

if [ "$ALL" = true ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Generating Terraform tfvars for All 32 NATO Countries"
    echo "  Hub: $HUB_CODE ($(get_country_name "$HUB_CODE"))"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    generated=0
    failed=0
    
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        generate_tfvars "$code" && generated=$((generated + 1)) || failed=$((failed + 1))
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Summary: Processed ${#NATO_COUNTRIES[@]} countries"
    echo "  Generated/Updated: $generated tfvars files"
    if [ $failed -gt 0 ]; then
        echo "  Failed: $failed"
    fi
    echo ""
    echo "  Output directory: $TFVARS_DIR"
    echo "═══════════════════════════════════════════════════════════════════════"
    
elif [ -n "$COUNTRY_CODE" ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Generating Terraform tfvars: ${COUNTRY_CODE,,}.tfvars"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    if generate_tfvars "$COUNTRY_CODE"; then
        echo ""
        echo "To use this configuration:"
        echo "  cd terraform"
        echo "  terraform init"
        echo "  terraform plan -var-file=countries/${COUNTRY_CODE,,}.tfvars"
        echo ""
        echo "Remember to set sensitive variables via environment:"
        echo "  export TF_VAR_client_secret=\$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25)"
        echo "  export TF_VAR_test_user_password=\$(gcloud secrets versions access latest --secret=dive-v3-test-user-password --project=dive25)"
    fi
else
    echo "❌ Usage: $0 <COUNTRY_CODE> [--all] [--force]"
    echo "   Run '$0 --help' for more options"
    exit 1
fi

