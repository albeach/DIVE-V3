#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Fix AMR Claims Issue
# ============================================
# This script diagnoses and fixes AMR (Authentication Methods Reference) claims
# that are not being properly set in Keycloak tokens.
#
# Issues addressed:
# 1. AMR claim showing as N/A in frontend
# 2. Backend rejecting tokens due to missing AMR
# 3. Classification unknown errors
# 4. Inconsistent jsonType.label configuration (String vs JSON)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# Configuration
# ============================================
KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.dive-v3.mil}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

log_info "Starting AMR Claims Diagnostic and Fix..."
log_info "Keycloak URL: ${KEYCLOAK_URL}"

# ============================================
# Step 1: Get Admin Token
# ============================================
log_info "Step 1: Authenticating to Keycloak..."

TOKEN_RESPONSE=$(curl -sk -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" 2>/dev/null)

if [ $? -ne 0 ]; then
    log_error "Failed to authenticate to Keycloak"
    exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    log_error "Failed to get access token"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

log_success "Successfully authenticated to Keycloak"

# ============================================
# Step 2: List Realms
# ============================================
log_info "Step 2: Fetching realms..."

REALMS=$(curl -sk -X GET \
  "${KEYCLOAK_URL}/admin/realms" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.[].realm')

log_success "Found realms: $(echo $REALMS | tr '\n' ' ')"

# ============================================
# Step 3: Check AMR Mappers for Each Realm
# ============================================
log_info "Step 3: Checking AMR mappers configuration..."

for REALM in $REALMS; do
    log_info "Checking realm: ${REALM}"
    
    # Get clients for this realm
    CLIENTS=$(curl -sk -X GET \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json")
    
    # Find clients with AMR mappers
    CLIENT_COUNT=$(echo "$CLIENTS" | jq -r 'length')
    log_info "  Found ${CLIENT_COUNT} clients"
    
    # Check each client for AMR mappers
    echo "$CLIENTS" | jq -c '.[]' | while read -r CLIENT; do
        CLIENT_ID=$(echo "$CLIENT" | jq -r '.id')
        CLIENT_NAME=$(echo "$CLIENT" | jq -r '.clientId')
        
        # Get protocol mappers for this client
        MAPPERS=$(curl -sk -X GET \
          "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}/protocol-mappers/models" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json")
        
        # Find AMR mapper
        AMR_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | test("amr"; "i"))')
        
        if [ -n "$AMR_MAPPER" ] && [ "$AMR_MAPPER" != "null" ]; then
            MAPPER_ID=$(echo "$AMR_MAPPER" | jq -r '.id')
            MAPPER_NAME=$(echo "$AMR_MAPPER" | jq -r '.name')
            JSON_TYPE=$(echo "$AMR_MAPPER" | jq -r '.config."jsonType.label" // "NOT_SET"')
            PROTOCOL_MAPPER=$(echo "$AMR_MAPPER" | jq -r '.protocolMapper')
            SESSION_NOTE=$(echo "$AMR_MAPPER" | jq -r '.config."user.session.note" // "NOT_SET"')
            ID_TOKEN=$(echo "$AMR_MAPPER" | jq -r '.config."id.token.claim" // "false"')
            ACCESS_TOKEN_CLAIM=$(echo "$AMR_MAPPER" | jq -r '.config."access.token.claim" // "false"')
            
            log_info "  Client: ${CLIENT_NAME}"
            log_info "    Mapper: ${MAPPER_NAME}"
            log_info "    Type: ${PROTOCOL_MAPPER}"
            log_info "    Session Note: ${SESSION_NOTE}"
            log_info "    JSON Type: ${JSON_TYPE}"
            log_info "    ID Token: ${ID_TOKEN}"
            log_info "    Access Token: ${ACCESS_TOKEN_CLAIM}"
            
            # Check for issues
            if [ "$JSON_TYPE" != "JSON" ]; then
                log_warning "    ⚠️  jsonType.label should be 'JSON' but is '${JSON_TYPE}'"
                log_info "    Fixing mapper..."
                
                # Update the mapper to use JSON type
                UPDATED_CONFIG=$(echo "$AMR_MAPPER" | jq '.config."jsonType.label" = "JSON"')
                
                curl -sk -X PUT \
                  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}/protocol-mappers/models/${MAPPER_ID}" \
                  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
                  -H "Content-Type: application/json" \
                  -d "$UPDATED_CONFIG" > /dev/null
                
                if [ $? -eq 0 ]; then
                    log_success "    ✓ Updated jsonType.label to JSON"
                else
                    log_error "    ✗ Failed to update mapper"
                fi
            else
                log_success "    ✓ jsonType.label is correctly set to JSON"
            fi
            
            if [ "$SESSION_NOTE" != "AUTH_METHODS_REF" ]; then
                log_warning "    ⚠️  Session note should be 'AUTH_METHODS_REF' but is '${SESSION_NOTE}'"
            fi
            
            if [ "$PROTOCOL_MAPPER" != "oidc-usersessionmodel-note-mapper" ]; then
                log_warning "    ⚠️  Protocol mapper should be 'oidc-usersessionmodel-note-mapper' but is '${PROTOCOL_MAPPER}'"
            fi
        fi
    done
done

# ============================================
# Step 4: Check Authentication Flows
# ============================================
log_info "Step 4: Checking authentication flows for ACR/AMR configuration..."

for REALM in $REALMS; do
    # Skip master realm
    if [ "$REALM" == "master" ]; then
        continue
    fi
    
    log_info "Checking authentication flows for realm: ${REALM}"
    
    # Get authentication flows
    FLOWS=$(curl -sk -X GET \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/flows" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json")
    
    # Look for browser flow or classified browser flow
    BROWSER_FLOW=$(echo "$FLOWS" | jq -r '.[] | select(.alias | test("browser"; "i")) | .alias' | head -1)
    
    if [ -n "$BROWSER_FLOW" ] && [ "$BROWSER_FLOW" != "null" ]; then
        log_info "  Found browser flow: ${BROWSER_FLOW}"
        
        # Get executions for this flow
        EXECUTIONS=$(curl -sk -X GET \
          "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/flows/${BROWSER_FLOW}/executions" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json")
        
        # Check for ACR/AMR configurations
        echo "$EXECUTIONS" | jq -c '.[]' | while read -r EXECUTION; do
            DISPLAY_NAME=$(echo "$EXECUTION" | jq -r '.displayName')
            AUTHENTICATOR=$(echo "$EXECUTION" | jq -r '.providerId')
            CONFIG_ID=$(echo "$EXECUTION" | jq -r '.authenticationConfig')
            
            if [ "$CONFIG_ID" != "null" ] && [ -n "$CONFIG_ID" ]; then
                # Get configuration
                CONFIG=$(curl -sk -X GET \
                  "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/config/${CONFIG_ID}" \
                  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
                  -H "Content-Type: application/json")
                
                ACR_LEVEL=$(echo "$CONFIG" | jq -r '.config.acr_level // "NOT_SET"')
                AMR_REFERENCE=$(echo "$CONFIG" | jq -r '.config.reference // "NOT_SET"')
                
                if [ "$ACR_LEVEL" != "NOT_SET" ] || [ "$AMR_REFERENCE" != "NOT_SET" ]; then
                    log_info "    Execution: ${DISPLAY_NAME}"
                    log_info "      Authenticator: ${AUTHENTICATOR}"
                    if [ "$ACR_LEVEL" != "NOT_SET" ]; then
                        log_info "      ACR Level: ${ACR_LEVEL}"
                    fi
                    if [ "$AMR_REFERENCE" != "NOT_SET" ]; then
                        log_info "      AMR Reference: ${AMR_REFERENCE}"
                    fi
                fi
            fi
        done
    fi
done

# ============================================
# Step 5: Test Token Generation
# ============================================
log_info "Step 5: Testing token generation..."

# Test with USA realm if it exists
if echo "$REALMS" | grep -q "dive-v3-usa"; then
    log_info "Testing token from dive-v3-usa realm..."
    
    # Get test user credentials from Terraform outputs or environment
    TEST_USER="${TEST_USER_USA:-testuser-us}"
    TEST_PASS="${TEST_PASSWORD_USA:-Password123!}"
    
    # Try to get a token
    TEST_TOKEN_RESPONSE=$(curl -sk -X POST \
      "${KEYCLOAK_URL}/realms/dive-v3-usa/protocol/openid-connect/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "username=${TEST_USER}" \
      -d "password=${TEST_PASS}" \
      -d "grant_type=password" \
      -d "client_id=dive-v3-app" \
      -d "client_secret=${CLIENT_SECRET:-}" 2>/dev/null || true)
    
    if [ -n "$TEST_TOKEN_RESPONSE" ]; then
        ID_TOKEN=$(echo "$TEST_TOKEN_RESPONSE" | jq -r '.id_token // empty')
        
        if [ -n "$ID_TOKEN" ]; then
            log_success "Successfully obtained ID token"
            
            # Decode and check for AMR
            TOKEN_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || true)
            
            if [ -n "$TOKEN_PAYLOAD" ]; then
                AMR_CLAIM=$(echo "$TOKEN_PAYLOAD" | jq -r '.amr // "NOT_PRESENT"')
                ACR_CLAIM=$(echo "$TOKEN_PAYLOAD" | jq -r '.acr // "NOT_PRESENT"')
                CLEARANCE=$(echo "$TOKEN_PAYLOAD" | jq -r '.clearance // "NOT_PRESENT"')
                
                log_info "Token Claims:"
                log_info "  clearance: ${CLEARANCE}"
                log_info "  acr: ${ACR_CLAIM}"
                log_info "  amr: ${AMR_CLAIM}"
                
                if [ "$AMR_CLAIM" == "NOT_PRESENT" ] || [ "$AMR_CLAIM" == "null" ]; then
                    log_error "  ✗ AMR claim is MISSING from token!"
                    log_warning "  This is the root cause of your issue."
                else
                    log_success "  ✓ AMR claim is present in token"
                fi
                
                if [ "$ACR_CLAIM" == "NOT_PRESENT" ] || [ "$ACR_CLAIM" == "null" ]; then
                    log_warning "  ⚠️  ACR claim is missing from token"
                fi
            fi
        else
            log_warning "Could not obtain ID token (may need client secret or different credentials)"
        fi
    fi
fi

# ============================================
# Step 6: Recommendations
# ============================================
log_info ""
log_info "============================================"
log_info "RECOMMENDATIONS:"
log_info "============================================"
log_info ""
log_info "1. Ensure jsonType.label is set to 'JSON' for AMR mappers (not 'String')"
log_info "2. Verify authentication flows have ACR/AMR configurations set"
log_info "3. Check that authentication executions are setting session notes:"
log_info "   - AUTH_CONTEXT_CLASS_REF (for ACR)"
log_info "   - AUTH_METHODS_REF (for AMR)"
log_info "4. If using federation (broker realm), ensure IdP brokers map AMR claims"
log_info "5. Clear user sessions after making changes:"
log_info "   ${KEYCLOAK_URL}/admin/<realm>/authentication/sessions"
log_info ""
log_info "To apply Terraform fixes:"
log_info "  cd ${PROJECT_ROOT}/terraform"
log_info "  terraform plan -target=keycloak_generic_protocol_mapper.broker_amr"
log_info "  terraform apply -target=keycloak_generic_protocol_mapper.broker_amr"
log_info ""
log_info "To restart services and clear caches:"
log_info "  docker-compose restart keycloak"
log_info "  docker-compose restart backend"
log_info ""

log_success "AMR diagnostic complete!"

