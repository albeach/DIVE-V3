#!/bin/bash
# =============================================================================
# DIVE V3 CLI - SP Client Commands Module
# =============================================================================
# Commands: register, status, list, credentials
# For OAuth/OIDC partner registration (SP Client mode)
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SP CLIENT COMMANDS
# =============================================================================

sp_register() {
    print_header
    echo -e "${BOLD}SP Client Registration${NC}"
    echo ""
    echo "This wizard will help you register your application as an"
    echo "OAuth/OIDC client of the DIVE V3 federation hub."
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would collect registration info and POST to hub API"
        return 0
    fi
    
    ensure_dive_root
    local sp_dir="${DIVE_ROOT}/sp-clients"
    mkdir -p "$sp_dir"
    
    # Collect registration information
    echo -e "${CYAN}Organization Information:${NC}"
    echo ""
    
    read -p "  Organization Name: " org_name
    if [ -z "$org_name" ]; then
        log_error "Organization name is required"
        return 1
    fi
    
    read -p "  Country Code (ISO 3166-1 alpha-3, e.g., NZL): " country_code
    if [ -z "$country_code" ] || [ ${#country_code} -ne 3 ]; then
        log_error "Country code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        return 1
    fi
    country_code=$(upper "$country_code")
    
    read -p "  Organization Type (government/military/defense_contractor/research): " org_type
    org_type=${org_type:-government}
    
    read -p "  Technical Contact Email: " contact_email
    if [ -z "$contact_email" ]; then
        log_error "Technical contact email is required"
        return 1
    fi
    
    echo ""
    echo -e "${CYAN}OAuth Client Configuration:${NC}"
    echo ""
    
    read -p "  Application Name: " app_name
    app_name=${app_name:-$org_name}
    
    read -p "  Client Type (confidential/public) [confidential]: " client_type
    client_type=${client_type:-confidential}
    
    read -p "  Redirect URI (HTTPS required): " redirect_uri
    if [ -z "$redirect_uri" ]; then
        log_error "Redirect URI is required"
        return 1
    fi
    
    # Validate HTTPS
    if [[ ! "$redirect_uri" =~ ^https:// ]] && [[ ! "$redirect_uri" =~ localhost ]]; then
        log_error "Redirect URI must use HTTPS (except localhost for development)"
        return 1
    fi
    
    read -p "  JWKS URI (optional, for private_key_jwt auth): " jwks_uri
    
    read -p "  Require PKCE? (yes/no) [yes]: " require_pkce
    require_pkce=${require_pkce:-yes}
    
    echo ""
    echo -e "${CYAN}Requested Scopes:${NC}"
    echo "  Available: openid, profile, email, resource:read, resource:write"
    read -p "  Requested Scopes (comma-separated) [openid,profile,email,resource:read]: " scopes
    scopes=${scopes:-openid,profile,email,resource:read}
    
    echo ""
    echo -e "${CYAN}Classification Level:${NC}"
    echo "  Available: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET"
    read -p "  Maximum Classification [UNCLASSIFIED]: " max_classification
    max_classification=${max_classification:-UNCLASSIFIED}
    
    # Generate client ID
    local client_id="sp-${country_code,,}-$(date +%s)"
    
    # Build registration request
    local request_file="$sp_dir/${client_id}-request.json"
    cat > "$request_file" << EOF
{
  "name": "$app_name",
  "description": "OAuth client for $org_name",
  "organizationType": "$org_type",
  "country": "$country_code",
  "technicalContact": {
    "name": "$org_name Admin",
    "email": "$contact_email"
  },
  "clientType": "$client_type",
  "redirectUris": ["$redirect_uri"],
  "jwksUri": $([ -n "$jwks_uri" ] && echo "\"$jwks_uri\"" || echo "null"),
  "tokenEndpointAuthMethod": "$([ "$client_type" = "public" ] && echo "none" || echo "client_secret_basic")",
  "requirePKCE": $([ "$require_pkce" = "yes" ] && echo "true" || echo "false"),
  "allowedScopes": [$(echo "$scopes" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')],
  "allowedGrantTypes": ["authorization_code", "refresh_token"],
  "maxClassification": "$max_classification"
}
EOF
    
    echo ""
    echo -e "${CYAN}Registration Summary:${NC}"
    echo ""
    echo "  Organization:        $org_name"
    echo "  Country:             $country_code"
    echo "  Application:         $app_name"
    echo "  Client ID:           $client_id"
    echo "  Client Type:         $client_type"
    echo "  Redirect URI:        $redirect_uri"
    echo "  Scopes:              $scopes"
    echo "  Max Classification:  $max_classification"
    echo ""
    
    read -p "Submit registration? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warn "Registration cancelled"
        return 1
    fi
    
    # Submit to hub API
    log_step "Submitting registration to hub..."
    
    local response=$(curl -s -X POST "$HUB_API_URL/api/federation/sp/register" \
        -H "Content-Type: application/json" \
        -d @"$request_file" 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true\|"spId"'; then
        log_success "Registration submitted successfully!"
        echo ""
        
        local sp_id=$(echo "$response" | grep -o '"spId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "$client_id")
        local client_secret=$(echo "$response" | grep -o '"clientSecret"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "PENDING")
        
        # Save credentials
        local creds_file="$sp_dir/${client_id}-credentials.json"
        cat > "$creds_file" << EOF
{
  "spId": "$sp_id",
  "clientId": "$client_id",
  "clientSecret": "$client_secret",
  "status": "$status",
  "registeredAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "hubUrl": "$HUB_API_URL"
}
EOF
        chmod 600 "$creds_file"
        
        echo -e "${BOLD}Registration Details:${NC}"
        echo ""
        echo "  SP ID:          $sp_id"
        echo "  Client ID:      $client_id"
        echo "  Status:         $status"
        if [ -n "$client_secret" ]; then
            echo "  Client Secret:  $client_secret"
            echo ""
            echo -e "${RED}⚠️  IMPORTANT: Save this client secret securely!${NC}"
            echo "   It will not be shown again."
        fi
        echo ""
        echo "  Credentials saved to: $creds_file"
        
        if [ "$status" = "PENDING" ]; then
            echo ""
            echo -e "${YELLOW}Your registration is pending admin approval.${NC}"
            echo "You will receive an email at $contact_email when approved."
        fi
        
    else
        log_error "Registration failed"
        echo ""
        echo "Response: $response"
        echo ""
        echo "If the hub API is not available, the request has been saved to:"
        echo "  $request_file"
        return 1
    fi
}

sp_status() {
    local sp_id="${1:-}"
    
    ensure_dive_root
    
    if [ -z "$sp_id" ]; then
        # Try to find most recent registration
        local creds_file=$(ls -t ${DIVE_ROOT}/sp-clients/*-credentials.json 2>/dev/null | head -1)
        if [ -z "$creds_file" ]; then
            log_error "No SP registration found. Provide SP ID or run 'sp register' first."
            return 1
        fi
        sp_id=$(cat "$creds_file" | grep -o '"spId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    fi
    
    echo -e "${BOLD}SP Client Status:${NC} $sp_id"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: $HUB_API_URL/api/federation/sp/$sp_id"
        return 0
    fi
    
    local response=$(curl -s "$HUB_API_URL/api/federation/sp/$sp_id" 2>&1)
    
    if echo "$response" | grep -q '"spId"'; then
        local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local name=$(echo "$response" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        echo "  Name:    $name"
        echo "  Status:  $status"
        echo ""
        
        case "$status" in
            PENDING)
                echo -e "${YELLOW}⏳ Awaiting admin approval${NC}"
                ;;
            ACTIVE)
                echo -e "${GREEN}✓ Active and ready to use${NC}"
                ;;
            SUSPENDED)
                echo -e "${RED}⚠️  Suspended - contact hub administrator${NC}"
                ;;
            REVOKED)
                echo -e "${RED}✗ Revoked - registration is permanently disabled${NC}"
                ;;
        esac
    else
        log_error "SP not found or API error"
        echo "Response: $response"
    fi
}

sp_list() {
    echo -e "${BOLD}Registered SP Clients:${NC}"
    echo ""
    
    ensure_dive_root
    local sp_dir="${DIVE_ROOT}/sp-clients"
    
    if [ ! -d "$sp_dir" ] || [ -z "$(ls -A "$sp_dir" 2>/dev/null)" ]; then
        echo "  No SP registrations found locally."
        echo ""
        echo "  Run './dive sp register' to register an SP client."
        return 0
    fi
    
    for creds_file in "$sp_dir"/*-credentials.json; do
        if [ -f "$creds_file" ]; then
            local sp_id=$(cat "$creds_file" | grep -o '"spId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            local client_id=$(cat "$creds_file" | grep -o '"clientId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            local status=$(cat "$creds_file" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            local registered=$(cat "$creds_file" | grep -o '"registeredAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            
            echo "  SP ID:       $sp_id"
            echo "  Client ID:   $client_id"
            echo "  Status:      $status"
            echo "  Registered:  $registered"
            echo "  ---"
        fi
    done
}

sp_credentials() {
    local sp_id="${1:-}"
    
    if [ -z "$sp_id" ]; then
        log_error "SP ID required. Usage: ./dive sp credentials <sp-id>"
        return 1
    fi
    
    ensure_dive_root
    local creds_file="${DIVE_ROOT}/sp-clients/${sp_id}-credentials.json"
    
    if [ ! -f "$creds_file" ]; then
        # Try to find by partial match
        creds_file=$(ls ${DIVE_ROOT}/sp-clients/*"$sp_id"*-credentials.json 2>/dev/null | head -1)
    fi
    
    if [ -f "$creds_file" ]; then
        echo -e "${BOLD}SP Client Credentials:${NC}"
        echo ""
        cat "$creds_file" | grep -v "clientSecret"
        echo ""
        echo -e "${YELLOW}Client secret is stored in: $creds_file${NC}"
        echo "Use with caution - do not share or commit to git."
    else
        log_error "Credentials file not found for SP: $sp_id"
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_sp() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        register)    sp_register "$@" ;;
        status)      sp_status "$@" ;;
        list)        sp_list ;;
        credentials) sp_credentials "$@" ;;
        *)           module_sp_help ;;
    esac
}

module_sp_help() {
    echo -e "${BOLD}SP Client Commands (OAuth/OIDC partner registration):${NC}"
    echo ""
    echo "  register              Register as an SP Client with the hub"
    echo "  status [client-id]    Show SP registration status"
    echo "  list                  List all registered SP Clients"
    echo "  credentials [sp-id]   Show or regenerate SP credentials"
    echo ""
    echo -e "${CYAN}SP Client Mode:${NC}"
    echo "  Partners register their applications as OAuth/OIDC clients"
    echo "  of the DIVE hub. They receive client credentials to:"
    echo "    - Authenticate users via DIVE's federated IdPs"
    echo "    - Request authorization decisions from OPA"
    echo "    - Access coalition resources based on ABAC policies"
    echo ""
    echo "Examples:"
    echo "  ./dive sp register"
    echo "  ./dive sp status sp-nzl-1234"
    echo "  ./dive sp credentials sp-nzl-1234"
}







