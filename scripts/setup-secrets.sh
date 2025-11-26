#!/bin/bash
# =============================================================================
# DIVE V3 - Secrets Setup Script
# =============================================================================
# This script helps you set up secrets properly for DIVE V3.
#
# Usage:
#   ./scripts/setup-secrets.sh [generate|verify|export]
#
#   generate  - Generate new random secrets and create .env.secrets
#   verify    - Check that all required secrets are set
#   export    - Export secrets as environment variables (for current shell)
#
# After running 'generate', you can:
#   1. Source the secrets:  source .env.secrets
#   2. Run Terraform:       terraform apply
#   3. Run Docker:          docker compose up
# =============================================================================

set -e

SECRETS_FILE=".env.secrets"
EXAMPLE_FILE=".env.secrets.example"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Generate a random password
generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | cut -c1-32
}

# Generate secrets file
cmd_generate() {
    echo -e "${YELLOW}Generating secrets...${NC}"
    
    if [ -f "$SECRETS_FILE" ]; then
        echo -e "${YELLOW}Warning: $SECRETS_FILE already exists.${NC}"
        read -p "Overwrite? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "Aborted."
            exit 1
        fi
    fi
    
    # Generate passwords
    KC_ADMIN_PASS=$(generate_password)
    PG_PASS=$(generate_password)
    MONGO_PASS=$(generate_password)
    REDIS_PASS=$(generate_password)
    AUTH_SECRET=$(generate_password)
    
    cat > "$SECRETS_FILE" << EOF
# =============================================================================
# DIVE V3 - SECRETS (AUTO-GENERATED)
# =============================================================================
# Generated on: $(date)
# 
# IMPORTANT: 
#   - NEVER commit this file to version control
#   - Keep a backup in a secure location (1Password, Vault, etc.)
#   - Rotate these secrets every 90 days
# =============================================================================

# -----------------------------------------------------------------------------
# KEYCLOAK ADMIN CREDENTIALS
# -----------------------------------------------------------------------------
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=${KC_ADMIN_PASS}

# -----------------------------------------------------------------------------
# DATABASE CREDENTIALS  
# -----------------------------------------------------------------------------
# PostgreSQL (Keycloak database)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${PG_PASS}

# MongoDB (Resource metadata)
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASS}

# Redis
REDIS_PASSWORD=${REDIS_PASS}

# -----------------------------------------------------------------------------
# APPLICATION SECRETS
# -----------------------------------------------------------------------------
AUTH_SECRET=${AUTH_SECRET}

# Keycloak Client Secret - retrieve from Keycloak admin console after first startup
# Go to: Keycloak Admin > Realm > Clients > dive-v3-client-broker > Credentials
KEYCLOAK_CLIENT_SECRET=RETRIEVE_FROM_KEYCLOAK_AFTER_SETUP

# -----------------------------------------------------------------------------
# TERRAFORM VARIABLES
# -----------------------------------------------------------------------------
# These are automatically picked up by Terraform when you source this file
export TF_VAR_keycloak_admin_password=\${KEYCLOAK_ADMIN_PASSWORD}

# -----------------------------------------------------------------------------
# DOCKER COMPOSE VARIABLES
# -----------------------------------------------------------------------------
# These override the defaults in docker-compose.yml
export POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
export MONGO_INITDB_ROOT_PASSWORD=\${MONGO_INITDB_ROOT_PASSWORD}
export KEYCLOAK_ADMIN_PASSWORD=\${KEYCLOAK_ADMIN_PASSWORD}
EOF

    chmod 600 "$SECRETS_FILE"
    
    echo -e "${GREEN}✓ Generated $SECRETS_FILE${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Save these credentials securely!${NC}"
    echo ""
    echo "Keycloak Admin Password: ${KC_ADMIN_PASS}"
    echo "PostgreSQL Password:     ${PG_PASS}"
    echo "MongoDB Password:        ${MONGO_PASS}"
    echo "Redis Password:          ${REDIS_PASS}"
    echo "Auth Secret:             ${AUTH_SECRET}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "  1. Save these passwords in your password manager"
    echo "  2. Source the secrets: source .env.secrets"
    echo "  3. Start services:     docker compose up -d"
    echo "  4. Get Keycloak client secret from admin console"
    echo "  5. Update KEYCLOAK_CLIENT_SECRET in .env.secrets"
}

# Verify all secrets are set
cmd_verify() {
    echo -e "${YELLOW}Verifying secrets configuration...${NC}"
    echo ""
    
    errors=0
    
    # Check if secrets file exists
    if [ ! -f "$SECRETS_FILE" ]; then
        echo -e "${RED}✗ $SECRETS_FILE not found${NC}"
        echo "  Run: ./scripts/setup-secrets.sh generate"
        exit 1
    fi
    
    # Source the file to check values
    source "$SECRETS_FILE"
    
    # Check each required secret
    check_secret() {
        local name=$1
        local value=$2
        if [ -z "$value" ] || [ "$value" = "CHANGE_ME"* ] || [ "$value" = "RETRIEVE_FROM"* ]; then
            echo -e "${RED}✗ $name is not set or using placeholder${NC}"
            ((errors++))
        else
            echo -e "${GREEN}✓ $name is set${NC}"
        fi
    }
    
    check_secret "KEYCLOAK_ADMIN_PASSWORD" "$KEYCLOAK_ADMIN_PASSWORD"
    check_secret "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
    check_secret "MONGO_INITDB_ROOT_PASSWORD" "$MONGO_INITDB_ROOT_PASSWORD"
    check_secret "AUTH_SECRET" "$AUTH_SECRET"
    check_secret "KEYCLOAK_CLIENT_SECRET" "$KEYCLOAK_CLIENT_SECRET"
    
    echo ""
    if [ $errors -gt 0 ]; then
        echo -e "${RED}Found $errors missing or placeholder secrets${NC}"
        exit 1
    else
        echo -e "${GREEN}All secrets are properly configured!${NC}"
    fi
}

# Export secrets to current shell
cmd_export() {
    if [ ! -f "$SECRETS_FILE" ]; then
        echo -e "${RED}Error: $SECRETS_FILE not found${NC}"
        echo "Run: ./scripts/setup-secrets.sh generate"
        exit 1
    fi
    
    echo -e "${YELLOW}Exporting secrets to environment...${NC}"
    echo ""
    echo "Run this command to export secrets to your current shell:"
    echo ""
    echo -e "${GREEN}  source $SECRETS_FILE${NC}"
    echo ""
    echo "Then you can run:"
    echo "  - terraform apply (picks up TF_VAR_* automatically)"
    echo "  - docker compose up (picks up exported vars)"
}

# Show usage
show_usage() {
    echo "DIVE V3 Secrets Setup"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  generate  Generate new random secrets"
    echo "  verify    Verify all required secrets are set"
    echo "  export    Show how to export secrets to shell"
    echo ""
    echo "Example workflow:"
    echo "  1. ./scripts/setup-secrets.sh generate"
    echo "  2. source .env.secrets"
    echo "  3. docker compose up -d"
    echo "  4. terraform apply"
}

# Main
case "${1:-}" in
    generate)
        cmd_generate
        ;;
    verify)
        cmd_verify
        ;;
    export)
        cmd_export
        ;;
    *)
        show_usage
        ;;
esac


