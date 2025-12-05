#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Commands Module
# =============================================================================
# Commands: init, generate-certs, register, status, sync, health, up, down, logs
# For distributed spoke deployments (disabled in pilot mode by default)
# =============================================================================
# Version: 2.0.0
# Date: 2025-12-05
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

SPOKE_CERT_ALGORITHM="${SPOKE_CERT_ALGORITHM:-rsa}"
SPOKE_CERT_BITS="${SPOKE_CERT_BITS:-4096}"
SPOKE_CERT_DAYS="${SPOKE_CERT_DAYS:-365}"

# =============================================================================
# SPOKE INITIALIZATION
# =============================================================================

spoke_init() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"
    
    if [ -z "$instance_code" ] || [ -z "$instance_name" ]; then
        log_error "Usage: ./dive spoke init <CODE> <NAME>"
        echo ""
        echo "Example: ./dive spoke init NZL 'New Zealand Defence Force'"
        echo ""
        echo "Arguments:"
        echo "  CODE    3-letter country code (ISO 3166-1 alpha-3)"
        echo "  NAME    Human-readable instance name"
        return 1
    fi
    
    # Validate code is 3 letters
    if [ ${#instance_code} -ne 3 ]; then
        log_error "Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        return 1
    fi
    
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    
    print_header
    echo -e "${BOLD}Initializing DIVE V3 Spoke Instance:${NC} $code_upper"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create spoke configuration for: $code_upper"
        log_dry "  Name: $instance_name"
        log_dry "  Code: $code_upper"
        log_dry ""
        log_dry "Would create:"
        log_dry "  - instances/${code_lower}/config.json"
        log_dry "  - instances/${code_lower}/docker-compose.yml"
        log_dry "  - instances/${code_lower}/.env.template"
        log_dry "  - instances/${code_lower}/certs/"
        log_dry "  - instances/${code_lower}/cache/"
        return 0
    fi
    
    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    # Check if already exists
    if [ -f "$spoke_dir/config.json" ]; then
        log_warn "Spoke instance already exists at: $spoke_dir"
        read -p "  Overwrite? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi
    
    # Create directory structure
    log_step "Creating instance directory structure"
    mkdir -p "$spoke_dir"
    mkdir -p "$spoke_dir/certs"
    mkdir -p "$spoke_dir/cache/policies"
    mkdir -p "$spoke_dir/cache/audit"
    mkdir -p "$spoke_dir/cloudflared"
    mkdir -p "$spoke_dir/logs"
    
    # Generate unique IDs
    local spoke_id="spoke-${code_lower}-$(openssl rand -hex 4)"
    local hub_url="${DIVE_HUB_URL:-https://hub.dive25.com}"
    
    # Create config.json (new format)
    log_step "Creating spoke configuration"
    cat > "$spoke_dir/config.json" << EOF
{
  "identity": {
    "spokeId": "$spoke_id",
    "instanceCode": "$code_upper",
    "name": "$instance_name",
    "description": "DIVE V3 Spoke Instance for $instance_name",
    "country": "$code_upper",
    "organizationType": "government",
    "contactEmail": ""
  },
  "endpoints": {
    "hubUrl": "$hub_url",
    "hubApiUrl": "${hub_url}/api",
    "hubOpalUrl": "${hub_url//:4000/:7002}",
    "baseUrl": "https://${code_lower}-app.dive25.com",
    "apiUrl": "https://${code_lower}-api.dive25.com",
    "idpUrl": "https://${code_lower}-idp.dive25.com",
    "kasUrl": "https://${code_lower}-kas.dive25.com"
  },
  "certificates": {
    "certificatePath": "$spoke_dir/certs/spoke.crt",
    "privateKeyPath": "$spoke_dir/certs/spoke.key",
    "csrPath": "$spoke_dir/certs/spoke.csr",
    "caBundlePath": "$spoke_dir/certs/hub-ca.crt"
  },
  "authentication": {},
  "federation": {
    "status": "unregistered",
    "requestedScopes": [
      "policy:base",
      "policy:${code_lower}",
      "data:federation_matrix",
      "data:trusted_issuers"
    ]
  },
  "operational": {
    "heartbeatIntervalMs": 30000,
    "tokenRefreshBufferMs": 300000,
    "offlineGracePeriodMs": 3600000,
    "policyCachePath": "$spoke_dir/cache/policies",
    "auditQueuePath": "$spoke_dir/cache/audit",
    "maxAuditQueueSize": 10000,
    "auditFlushIntervalMs": 60000
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "lastModified": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "configHash": ""
  }
}
EOF
    
    # Create docker-compose.yml from template
    log_step "Creating Docker Compose configuration"
    cat > "$spoke_dir/docker-compose.yml" << EOF
# =============================================================================
# DIVE V3 Spoke Instance: $code_upper ($instance_name)
# =============================================================================
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Spoke ID: $spoke_id
# =============================================================================

version: '3.8'

networks:
  dive-${code_lower}-network:
    driver: bridge

volumes:
  ${code_lower}_postgres_data:
  ${code_lower}_mongodb_data:
  ${code_lower}_redis_data:
  ${code_lower}_opal_cache:

services:
  # ==========================================================================
  # DATABASE SERVICES
  # ==========================================================================

  postgres-${code_lower}:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-${code_lower}
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: keycloak
    volumes:
      - ${code_lower}_postgres_data:/var/lib/postgresql/data
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  mongodb-${code_lower}:
    image: mongo:7-jammy
    container_name: dive-v3-mongodb-${code_lower}
    environment:
      MONGO_INITDB_DATABASE: dive-v3-${code_lower}
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD}
    volumes:
      - ${code_lower}_mongodb_data:/data/db
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis-${code_lower}:
    image: redis:alpine
    container_name: dive-v3-redis-${code_lower}
    volumes:
      - ${code_lower}_redis_data:/data
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ==========================================================================
  # IDENTITY & ACCESS MANAGEMENT
  # ==========================================================================

  keycloak-${code_lower}:
    image: quay.io/keycloak/keycloak:26.0.4
    container_name: dive-v3-keycloak-${code_lower}
    command: start-dev --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-${code_lower}:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD}
      KC_HOSTNAME: ${code_lower}-idp.dive25.com
      KC_HOSTNAME_STRICT: "false"
      KC_PROXY_HEADERS: xforwarded
      KC_HTTP_ENABLED: "true"
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_LOG_LEVEL: info
    ports:
      - "8443:8443"
      - "8080:8080"
    volumes:
      - ./certs:/opt/keycloak/certs:ro
    depends_on:
      postgres-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ==========================================================================
  # POLICY ENGINE
  # ==========================================================================

  opa-${code_lower}:
    image: openpolicyagent/opa:0.68.0
    platform: linux/amd64
    container_name: dive-v3-opa-${code_lower}
    command: run --server --addr :8181 /policies
    ports:
      - "8181:8181"
    volumes:
      - ../../policies:/policies:ro
      - ./cache/policies:/var/opa/cache
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  opal-client-${code_lower}:
    image: permitio/opal-client:latest
    container_name: dive-v3-opal-client-${code_lower}
    environment:
      OPAL_SERVER_URL: \${HUB_OPAL_URL:-https://hub.dive25.com:7002}
      OPAL_CLIENT_TOKEN: \${SPOKE_OPAL_TOKEN}
      OPAL_INLINE_OPA_ENABLED: "false"
      OPAL_OPA_URL: http://opa-${code_lower}:8181
      OPAL_SUBSCRIPTION_ID: $spoke_id
      OPAL_LOG_LEVEL: INFO
      # Resilience settings
      OPAL_KEEP_ALIVE_TIMEOUT: 60
      OPAL_RECONNECT_INTERVAL: 5
      OPAL_RECONNECT_MAX_INTERVAL: 300
      OPAL_POLICY_REFRESH_INTERVAL: 60
    volumes:
      - ${code_lower}_opal_cache:/var/opal/cache
      - ./certs:/var/opal/certs:ro
    depends_on:
      opa-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ==========================================================================
  # BACKEND API
  # ==========================================================================

  backend-${code_lower}:
    build:
      context: ../../backend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-backend-${code_lower}
    environment:
      NODE_ENV: development
      PORT: "4000"
      INSTANCE_CODE: $code_upper
      INSTANCE_NAME: "$instance_name"
      SPOKE_ID: $spoke_id
      SPOKE_MODE: "true"
      # Database
      MONGODB_URI: mongodb://admin:\${MONGO_PASSWORD}@mongodb-${code_lower}:27017/dive-v3-${code_lower}?authSource=admin
      REDIS_URL: redis://redis-${code_lower}:6379
      # Keycloak
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      # OPA
      OPA_URL: http://opa-${code_lower}:8181
      # Hub
      HUB_URL: \${HUB_URL:-https://hub.dive25.com}
      SPOKE_TOKEN: \${SPOKE_OPAL_TOKEN}
      # Paths
      SPOKE_CONFIG_PATH: /app/config/config.json
      DIVE_POLICY_CACHE_PATH: /app/cache/policies
      DIVE_AUDIT_QUEUE_PATH: /app/cache/audit
    ports:
      - "4000:4000"
    volumes:
      - ../../backend/src:/app/src:ro
      - ./certs:/app/certs:ro
      - ./config.json:/app/config/config.json:ro
      - ./cache:/app/cache
    depends_on:
      mongodb-${code_lower}:
        condition: service_healthy
      opa-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ==========================================================================
  # FRONTEND
  # ==========================================================================

  frontend-${code_lower}:
    build:
      context: ../../frontend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-frontend-${code_lower}
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_INSTANCE: $code_upper
      NEXT_PUBLIC_INSTANCE_NAME: "$instance_name"
      NEXT_PUBLIC_API_URL: https://${code_lower}-api.dive25.com
      NEXT_PUBLIC_KEYCLOAK_URL: https://${code_lower}-idp.dive25.com
      NEXTAUTH_URL: https://${code_lower}-app.dive25.com
      NEXTAUTH_SECRET: \${AUTH_SECRET}
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: \${KEYCLOAK_CLIENT_SECRET}
    ports:
      - "3000:3000"
    volumes:
      - ../../frontend/src:/app/src:ro
      - ../../frontend/public:/app/public:ro
    depends_on:
      backend-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
    restart: unless-stopped
EOF

    # Create .env template
    log_step "Creating environment template"
    cat > "$spoke_dir/.env.template" << EOF
# =============================================================================
# DIVE V3 Spoke Environment Configuration: $code_upper
# =============================================================================
# Copy this to .env and fill in the values
# For production, use GCP Secret Manager instead of .env files
# =============================================================================

# Database Passwords
POSTGRES_PASSWORD=
MONGO_PASSWORD=

# Keycloak Admin
KEYCLOAK_ADMIN_PASSWORD=

# Auth
AUTH_SECRET=
KEYCLOAK_CLIENT_SECRET=

# Hub Connection
HUB_URL=https://hub.dive25.com
HUB_OPAL_URL=https://hub.dive25.com:7002

# Spoke Token (received after registration approval)
# Do NOT commit this to git!
SPOKE_OPAL_TOKEN=

# Instance Configuration
INSTANCE_CODE=$code_upper
SPOKE_ID=$spoke_id
EOF

    echo ""
    log_success "Spoke instance initialized: $code_upper"
    echo ""
    echo -e "${BOLD}Instance Details:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $code_upper"
    echo "  Name:            $instance_name"
    echo "  Directory:       $spoke_dir"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Generate certificates:  ./dive spoke generate-certs"
    echo "  2. Fill in .env:           cp $spoke_dir/.env.template $spoke_dir/.env"
    echo "  3. Edit configuration:     Edit $spoke_dir/config.json (set contactEmail)"
    echo "  4. Register with hub:      ./dive spoke register"
    echo "  5. Wait for hub approval"
    echo "  6. Start services:         ./dive spoke up"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  - $spoke_dir/config.json"
    echo "  - $spoke_dir/docker-compose.yml"
    echo "  - $spoke_dir/.env.template"
    echo ""
}

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================

spoke_generate_certs() {
    local algorithm="${1:-$SPOKE_CERT_ALGORITHM}"
    local bits="${2:-$SPOKE_CERT_BITS}"
    
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"
    
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    # Load config to get spoke ID
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local instance_name=""
    
    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")
    fi
    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"
    
    print_header
    echo -e "${BOLD}Generating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""
    echo "  Algorithm:  $algorithm"
    echo "  Key Size:   $bits bits"
    echo "  Validity:   $SPOKE_CERT_DAYS days"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate certificates in: $certs_dir"
        log_dry "  - spoke.key (private key)"
        log_dry "  - spoke.crt (self-signed certificate)"
        log_dry "  - spoke.csr (CSR for hub signing)"
        return 0
    fi
    
    mkdir -p "$certs_dir"
    
    # Check if certificates already exist
    if [ -f "$certs_dir/spoke.key" ]; then
        log_warn "Certificates already exist in: $certs_dir"
        read -p "  Overwrite? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi
    
    # Generate private key
    log_step "Generating private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        return 1
    fi
    
    # Generate CSR
    log_step "Generating Certificate Signing Request (CSR)"
    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi
    
    # Generate self-signed certificate (for development)
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi
    
    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"
    
    # Calculate fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)
    
    echo ""
    log_success "Certificates generated successfully!"
    echo ""
    echo -e "${BOLD}Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  - $certs_dir/spoke.key (private key - keep secure!)"
    echo "  - $certs_dir/spoke.crt (self-signed certificate)"
    echo "  - $certs_dir/spoke.csr (CSR for Hub signing)"
    echo ""
    echo -e "${YELLOW}⚠️  For production:${NC}"
    echo "   Submit the CSR to the Hub for signing during registration."
    echo "   The Hub will return a properly signed certificate."
    echo ""
}

# =============================================================================
# SPOKE REGISTRATION
# =============================================================================

spoke_register() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"
    
    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    print_header
    echo -e "${BOLD}Registering Spoke with Hub${NC}"
    echo ""
    
    # Parse config (handle both old and new format)
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local contact_email=$(grep -o '"contactEmail"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    
    # Override hub URL from environment
    hub_url="${HUB_API_URL:-$hub_url}"
    hub_url="${hub_url:-https://hub.dive25.com}"
    
    echo "  Spoke ID:     $spoke_id"
    echo "  Instance:     $instance_code_config"
    echo "  Name:         $name"
    echo "  Hub URL:      $hub_url"
    echo ""
    
    # Validate contact email
    if [ -z "$contact_email" ]; then
        log_warn "Contact email not set in config.json"
        read -p "  Enter contact email: " contact_email
        if [ -z "$contact_email" ]; then
            log_error "Contact email is required for registration"
            return 1
        fi
    fi
    
    # Check for certificate
    local cert_pem=""
    if [ -f "$spoke_dir/certs/spoke.crt" ]; then
        cert_pem=$(cat "$spoke_dir/certs/spoke.crt" | sed 's/$/\\n/' | tr -d '\n')
        log_info "Certificate found: $spoke_dir/certs/spoke.crt"
    else
        log_warn "No certificate found. Run: ./dive spoke generate-certs"
        echo "  Registration will proceed without certificate (development mode)"
    fi
    
    # Build registration request
    local base_url=$(grep -o '"baseUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local api_url=$(grep -o '"apiUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local idp_url=$(grep -o '"idpUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    
    local request_body=$(cat << EOF
{
  "instanceCode": "$instance_code_config",
  "name": "$name",
  "description": "DIVE V3 Spoke for $name",
  "baseUrl": "$base_url",
  "apiUrl": "$api_url",
  "idpUrl": "$idp_url",
  "certificatePEM": "$cert_pem",
  "requestedScopes": ["policy:base", "policy:${code_lower}", "data:federation_matrix", "data:trusted_issuers"],
  "contactEmail": "$contact_email"
}
EOF
)
    
    log_step "Submitting registration to: $hub_url/api/federation/register"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/register"
        log_dry "Request body (truncated):"
        echo "$request_body" | head -20
        return 0
    fi
    
    local response=$(curl -s -X POST "$hub_url/api/federation/register" \
        -H "Content-Type: application/json" \
        -k \
        -d "$request_body" 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Registration request submitted!"
        echo ""
        
        local returned_spoke_id=$(echo "$response" | grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        echo -e "${BOLD}Registration Details:${NC}"
        echo "  Spoke ID:  $returned_spoke_id"
        echo "  Status:    $status"
        echo ""
        
        # Update local config with registered status
        if command -v jq &> /dev/null; then
            jq ".federation.status = \"pending\" | .federation.registeredAt = \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"" \
                "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
        fi
        
        echo -e "${YELLOW}⏳ Waiting for Hub admin approval...${NC}"
        echo "   You will receive notification at: $contact_email"
        echo ""
        echo "   Once approved:"
        echo "   1. You'll receive a spoke token"
        echo "   2. Add it to .env: SPOKE_OPAL_TOKEN=<token>"
        echo "   3. Start services: ./dive spoke up"
    else
        log_error "Registration failed"
        echo ""
        echo "Response:"
        echo "$response" | head -20
        return 1
    fi
}

# =============================================================================
# SPOKE STATUS & HEALTH
# =============================================================================

spoke_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"
    
    print_header
    echo -e "${BOLD}Spoke Federation Status:${NC} $(upper "$instance_code")"
    echo ""
    
    if [ ! -f "$config_file" ]; then
        echo -e "  Status: ${RED}Not Initialized${NC}"
        echo ""
        echo "  Run: ./dive spoke init <CODE> <NAME>"
        return 0
    fi
    
    # Parse config
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local created=$(grep -o '"createdAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    
    # Status color
    local status_color="$YELLOW"
    case "$status" in
        approved) status_color="$GREEN" ;;
        suspended|revoked) status_color="$RED" ;;
        pending) status_color="$YELLOW" ;;
    esac
    
    echo -e "${CYAN}Identity:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $instance_code_config"
    echo "  Name:            $name"
    echo "  Created:         $created"
    echo ""
    
    echo -e "${CYAN}Federation:${NC}"
    echo -e "  Status:          ${status_color}${status:-unregistered}${NC}"
    echo "  Hub URL:         $hub_url"
    
    # Check token
    if [ -f "$spoke_dir/.env" ] && grep -q "SPOKE_OPAL_TOKEN" "$spoke_dir/.env"; then
        local token_set=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" | cut -d= -f2)
        if [ -n "$token_set" ] && [ "$token_set" != "" ]; then
            echo -e "  Token:           ${GREEN}Configured${NC}"
        else
            echo -e "  Token:           ${YELLOW}Not Set${NC}"
        fi
    else
        echo -e "  Token:           ${YELLOW}Not Set${NC}"
    fi
    
    # Check certificates
    echo ""
    echo -e "${CYAN}Certificates:${NC}"
    if [ -f "$spoke_dir/certs/spoke.crt" ]; then
        local cert_expiry=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        local fingerprint=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | head -c 23)
        echo -e "  Certificate:     ${GREEN}Present${NC}"
        echo "  Expires:         $cert_expiry"
        echo "  Fingerprint:     ${fingerprint}..."
    else
        echo -e "  Certificate:     ${YELLOW}Not Generated${NC}"
        echo "  Run: ./dive spoke generate-certs"
    fi
    
    echo ""
}

spoke_health() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    print_header
    echo -e "${BOLD}Spoke Service Health:${NC} $(upper "$instance_code")"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check health of all spoke services"
        return 0
    fi
    
    # Define services to check
    local services=("OPA:8181/health" "OPAL-Client:7000/health" "Backend:4000/health" "Keycloak:8080/health")
    local all_healthy=true
    
    echo -e "${CYAN}Services:${NC}"
    
    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local endpoint="${svc#*:}"
        local url="http://localhost:${endpoint}"
        
        local status_code=$(curl -s -o /dev/null -w '%{http_code}' "$url" --max-time 3 2>/dev/null || echo "000")
        
        if [ "$status_code" = "200" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
        else
            printf "  %-14s ${RED}✗ Unhealthy${NC} (HTTP $status_code)\n" "$name:"
            all_healthy=false
        fi
    done
    
    # Check MongoDB
    printf "  %-14s " "MongoDB:"
    if docker exec dive-v3-mongodb-${code_lower} mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi
    
    # Check Redis
    printf "  %-14s " "Redis:"
    if docker exec dive-v3-redis-${code_lower} redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi
    
    echo ""
    
    # Overall status
    if [ "$all_healthy" = true ]; then
        echo -e "${GREEN}✓ All services healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Some services unhealthy${NC}"
    fi
    echo ""
}

# =============================================================================
# CERTIFICATE ROTATION
# =============================================================================

spoke_rotate_certs() {
    local algorithm="${1:-rsa}"
    local bits="${2:-4096}"
    
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"
    
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    # Load config to get spoke ID and status
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local status=""
    
    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "")
    fi
    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"
    
    print_header
    echo -e "${BOLD}Rotating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""
    
    # Check if spoke is registered
    if [ "$status" = "approved" ] || [ "$status" = "pending" ]; then
        log_warn "Spoke is currently registered with status: $status"
        echo ""
        echo "  Certificate rotation will:"
        echo "  1. Generate new private key and CSR"
        echo "  2. Backup existing certificates"
        echo "  3. Submit new CSR to Hub for signing"
        echo ""
        read -p "  Continue with rotation? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would rotate certificates:"
        log_dry "  1. Backup existing certs to: $certs_dir/backup-$(date +%Y%m%d)"
        log_dry "  2. Generate new private key ($algorithm, $bits bits)"
        log_dry "  3. Generate new CSR"
        log_dry "  4. Generate new self-signed cert (development)"
        return 0
    fi
    
    # Backup existing certificates
    local backup_dir="$certs_dir/backup-$(date +%Y%m%d-%H%M%S)"
    if [ -f "$certs_dir/spoke.key" ]; then
        log_step "Backing up existing certificates"
        mkdir -p "$backup_dir"
        cp -p "$certs_dir/spoke.key" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.crt" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.csr" "$backup_dir/" 2>/dev/null || true
        echo "         ✓ Backed up to: $backup_dir"
    fi
    
    # Generate new private key
    log_step "Generating new private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        # Restore from backup
        if [ -d "$backup_dir" ]; then
            cp -p "$backup_dir/"* "$certs_dir/" 2>/dev/null
        fi
        return 1
    fi
    
    # Generate new CSR
    log_step "Generating new Certificate Signing Request"
    local instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")
    
    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi
    
    # Generate self-signed certificate for development
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null
    
    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi
    
    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"
    
    # Calculate new fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)
    
    echo ""
    log_success "Certificate rotation complete!"
    echo ""
    echo -e "${BOLD}New Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Backup Location:${NC}"
    echo "  $backup_dir"
    echo ""
    
    # If spoke is registered, prompt to submit CSR to Hub
    if [ "$status" = "approved" ]; then
        echo -e "${YELLOW}⚠️  Important:${NC}"
        echo "   Your spoke is registered. To complete rotation:"
        echo "   1. Submit the new CSR to Hub for signing"
        echo "   2. Replace spoke.crt with Hub-signed certificate"
        echo "   3. Restart spoke services: ./dive spoke down && ./dive spoke up"
        echo ""
    fi
}

# =============================================================================
# SPOKE SYNC & HEARTBEAT
# =============================================================================

spoke_sync() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    
    log_step "Forcing policy sync from Hub..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies"
        return 0
    fi
    
    # Try OPAL client first
    if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
        log_success "Policy refresh triggered via OPAL client"
    else
        # Try backend API
        if curl -s -X POST "http://localhost:4000/api/spoke/sync" --max-time 5 2>/dev/null | grep -q "success"; then
            log_success "Policy sync triggered via backend API"
        else
            log_warn "Could not trigger sync. Ensure services are running."
        fi
    fi
}

spoke_heartbeat() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"
    
    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized"
        return 1
    fi
    
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    hub_url="${hub_url:-https://hub.dive25.com}"
    
    log_step "Sending heartbeat to Hub: $hub_url"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/heartbeat"
        return 0
    fi
    
    # Check local services
    local opa_healthy=$(curl -s http://localhost:8181/health --max-time 2 >/dev/null && echo "true" || echo "false")
    local opal_healthy=$(curl -s http://localhost:7000/health --max-time 2 >/dev/null && echo "true" || echo "false")
    
    # Get token from environment or .env
    local token="${SPOKE_OPAL_TOKEN:-}"
    if [ -z "$token" ] && [ -f "$spoke_dir/.env" ]; then
        token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
    fi
    
    if [ -z "$token" ]; then
        log_warn "No spoke token configured. Heartbeat may fail."
    fi
    
    local response=$(curl -s -X POST "$hub_url/api/federation/heartbeat" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        -k \
        -d "{
            \"spokeId\": \"$spoke_id\",
            \"instanceCode\": \"$(upper "$instance_code")\",
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
            \"opaHealthy\": $opa_healthy,
            \"opalClientConnected\": $opal_healthy
        }" 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Heartbeat sent successfully"
        local sync_status=$(echo "$response" | grep -o '"syncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo "  Sync Status: $sync_status"
    else
        log_error "Heartbeat failed"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# SPOKE SERVICE MANAGEMENT
# =============================================================================

spoke_up() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    print_header
    echo -e "${BOLD}Starting Spoke Services:${NC} $(upper "$instance_code")"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml up -d"
        return 0
    fi
    
    # Check for .env
    if [ ! -f "$spoke_dir/.env" ]; then
        log_warn "No .env file found. Copy and configure .env.template first."
        echo "  cp $spoke_dir/.env.template $spoke_dir/.env"
        return 1
    fi
    
    cd "$spoke_dir"
    docker compose up -d
    
    if [ $? -eq 0 ]; then
        echo ""
        log_success "Spoke services started"
        echo ""
        echo "  View logs:    ./dive spoke logs"
        echo "  Check health: ./dive spoke health"
    else
        log_error "Failed to start spoke services"
        return 1
    fi
}

spoke_down() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi
    
    log_step "Stopping spoke services: $(upper "$instance_code")"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml down"
        return 0
    fi
    
    cd "$spoke_dir"
    docker compose down
    
    log_success "Spoke services stopped"
}

spoke_logs() {
    local service="${1:-}"
    
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi
    
    cd "$spoke_dir"
    
    if [ -n "$service" ]; then
        docker compose logs -f "$service-${code_lower}" 2>/dev/null || docker compose logs -f "$service"
    else
        docker compose logs -f
    fi
}

# =============================================================================
# FAILOVER MANAGEMENT (Phase 5)
# =============================================================================

spoke_failover() {
    local subcommand="${1:-status}"
    shift || true
    
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    
    print_header
    echo -e "${BOLD}Spoke Failover Status:${NC} $(upper "$instance_code")"
    echo ""
    
    case "$subcommand" in
        status)
            spoke_failover_status
            ;;
        force-open)
            spoke_failover_force "open"
            ;;
        force-closed)
            spoke_failover_force "closed"
            ;;
        reset)
            spoke_failover_reset
            ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke failover [status|force-open|force-closed|reset]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status        Show current circuit breaker state and metrics"
            echo "  force-open    Force circuit breaker to OPEN state (stop Hub connections)"
            echo "  force-closed  Force circuit breaker to CLOSED state (resume normal operation)"
            echo "  reset         Reset circuit breaker metrics and return to CLOSED state"
            echo ""
            ;;
    esac
}

spoke_failover_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for failover status"
        return 0
    fi
    
    # Query backend API for failover status
    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve failover status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi
    
    # Parse JSON response (handle both direct values and nested objects)
    local state=$(echo "$response" | grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local hub_healthy=$(echo "$response" | grep -o '"hubHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local opal_healthy=$(echo "$response" | grep -o '"opalHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local consecutive_failures=$(echo "$response" | grep -o '"consecutiveFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failures=$(echo "$response" | grep -o '"totalFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_recoveries=$(echo "$response" | grep -o '"totalRecoveries"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local uptime=$(echo "$response" | grep -o '"uptimePercentage"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    
    # State color and icon
    local state_color="$GREEN"
    local state_icon="✓"
    case "$state" in
        CLOSED)
            state_color="$GREEN"
            state_icon="✓"
            ;;
        OPEN)
            state_color="$RED"
            state_icon="✗"
            ;;
        HALF_OPEN)
            state_color="$YELLOW"
            state_icon="⚠"
            ;;
    esac
    
    echo -e "${CYAN}Circuit Breaker State:${NC}"
    echo -e "  State:             ${state_color}${state_icon} ${state:-UNKNOWN}${NC}"
    
    if [ "$maintenance" = "true" ]; then
        echo -e "  Maintenance Mode:  ${YELLOW}ENABLED${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Connection Health:${NC}"
    if [ "$hub_healthy" = "true" ]; then
        echo -e "  Hub Connection:    ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  Hub Connection:    ${RED}✗ Unhealthy${NC}"
    fi
    
    if [ "$opal_healthy" = "true" ]; then
        echo -e "  OPAL Connection:   ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  OPAL Connection:   ${RED}✗ Unhealthy${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Metrics:${NC}"
    echo "  Consecutive Failures:  ${consecutive_failures:-0}"
    echo "  Total Failures:        ${total_failures:-0}"
    echo "  Total Recoveries:      ${total_recoveries:-0}"
    echo "  Uptime:                ${uptime:-0}%"
    echo ""
    
    # Recommendations based on state
    if [ "$state" = "OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is OPEN${NC}"
        echo "   The spoke is operating in offline mode."
        echo "   Policy decisions use cached policies."
        echo "   Audit logs are queued for later sync."
        echo ""
        echo "   To force recovery: ./dive spoke failover force-closed"
        echo ""
    elif [ "$state" = "HALF_OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is testing recovery${NC}"
        echo "   The spoke is testing Hub connectivity."
        echo "   If successful, will transition to CLOSED."
        echo ""
    fi
}

spoke_failover_force() {
    local target_state="$1"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would force circuit breaker to: $target_state"
        return 0
    fi
    
    log_step "Forcing circuit breaker to: $(upper "$target_state")"
    
    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/force" \
        -H "Content-Type: application/json" \
        -d "{\"state\": \"$(upper "$target_state")\"}" \
        --max-time 5 2>/dev/null)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker state changed to: $(upper "$target_state")"
    else
        log_error "Failed to change circuit breaker state"
        echo "  Response: $response"
        return 1
    fi
}

spoke_failover_reset() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset circuit breaker metrics"
        return 0
    fi
    
    log_step "Resetting circuit breaker metrics"
    
    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/reset" \
        --max-time 5 2>/dev/null)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker metrics reset"
        echo ""
        spoke_failover_status
    else
        log_error "Failed to reset circuit breaker"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# MAINTENANCE MODE (Phase 5)
# =============================================================================

spoke_maintenance() {
    local subcommand="${1:-status}"
    shift || true
    
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    
    print_header
    echo -e "${BOLD}Spoke Maintenance Mode:${NC} $(upper "$instance_code")"
    echo ""
    
    case "$subcommand" in
        status)
            spoke_maintenance_status
            ;;
        enter|start|on)
            spoke_maintenance_enter "$@"
            ;;
        exit|stop|off)
            spoke_maintenance_exit
            ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke maintenance [status|enter|exit]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status              Show current maintenance mode status"
            echo "  enter [reason]      Enter maintenance mode (stops Hub sync)"
            echo "  exit                Exit maintenance mode (resume normal operation)"
            echo ""
            echo -e "${CYAN}Examples:${NC}"
            echo "  ./dive spoke maintenance enter 'Scheduled upgrade'"
            echo "  ./dive spoke maintenance exit"
            echo ""
            ;;
    esac
}

spoke_maintenance_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for maintenance status"
        return 0
    fi
    
    # Query backend API
    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        return 1
    fi
    
    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local reason=$(echo "$response" | grep -o '"maintenanceReason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local entered=$(echo "$response" | grep -o '"maintenanceEnteredAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ "$maintenance" = "true" ]; then
        echo -e "  Status:            ${YELLOW}⚠️  MAINTENANCE MODE${NC}"
        if [ -n "$reason" ]; then
            echo "  Reason:            $reason"
        fi
        if [ -n "$entered" ]; then
            echo "  Entered At:        $entered"
        fi
        echo ""
        echo -e "${CYAN}During Maintenance:${NC}"
        echo "  • Hub heartbeats are paused"
        echo "  • Policy updates are suspended"
        echo "  • Local authorization continues with cached policies"
        echo "  • Audit logs are queued"
        echo ""
        echo "  Exit maintenance: ./dive spoke maintenance exit"
    else
        echo -e "  Status:            ${GREEN}✓ Normal Operation${NC}"
        echo ""
        echo "  Enter maintenance: ./dive spoke maintenance enter 'reason'"
    fi
    echo ""
}

spoke_maintenance_enter() {
    local reason="${*:-Manual maintenance}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would enter maintenance mode with reason: $reason"
        return 0
    fi
    
    log_step "Entering maintenance mode..."
    
    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/enter" \
        -H "Content-Type: application/json" \
        -d "{\"reason\": \"$reason\"}" \
        --max-time 5 2>/dev/null)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Entered maintenance mode"
        echo ""
        echo -e "${YELLOW}⚠️  Maintenance mode is now active${NC}"
        echo "   Reason: $reason"
        echo ""
        echo "   Hub sync is paused. Local operations continue."
        echo "   Exit when ready: ./dive spoke maintenance exit"
    else
        log_error "Failed to enter maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

spoke_maintenance_exit() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would exit maintenance mode"
        return 0
    fi
    
    log_step "Exiting maintenance mode..."
    
    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/exit" \
        --max-time 5 2>/dev/null)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Exited maintenance mode"
        echo ""
        echo -e "${GREEN}✓ Normal operation resumed${NC}"
        echo ""
        echo "   Hub sync will resume automatically."
        echo "   Queued audit logs will be synced."
    else
        log_error "Failed to exit maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# AUDIT QUEUE STATUS (Phase 5)
# =============================================================================

spoke_audit_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    
    print_header
    echo -e "${BOLD}Spoke Audit Queue Status:${NC} $(upper "$instance_code")"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for audit queue status"
        return 0
    fi
    
    # Query backend API for audit queue status
    local response=$(curl -s "http://localhost:4000/api/spoke/audit/status" --max-time 5 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve audit status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi
    
    # Parse response
    local queue_size=$(echo "$response" | grep -o '"queueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local queue_size_bytes=$(echo "$response" | grep -o '"queueSizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_synced=$(echo "$response" | grep -o '"totalSynced"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failed=$(echo "$response" | grep -o '"totalFailed"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local last_sync=$(echo "$response" | grep -o '"lastSyncAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local last_sync_status=$(echo "$response" | grep -o '"lastSyncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local max_size=$(echo "$response" | grep -o '"maxQueueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    
    # Calculate human-readable size
    local size_display="$queue_size_bytes bytes"
    if [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1048576 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1048576" | bc 2>/dev/null || echo "$queue_size_bytes") MB"
    elif [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1024 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1024" | bc 2>/dev/null || echo "$queue_size_bytes") KB"
    fi
    
    echo -e "${CYAN}Queue Status:${NC}"
    echo "  Pending Entries:   ${queue_size:-0}"
    echo "  Queue Size:        ${size_display}"
    echo "  Max Queue Size:    ${max_size:-10000} entries"
    echo ""
    
    # Queue health indicator
    local queue_percent=0
    if [ -n "$queue_size" ] && [ -n "$max_size" ] && [ "$max_size" -gt 0 ]; then
        queue_percent=$((queue_size * 100 / max_size))
    fi
    
    if [ "$queue_percent" -lt 50 ]; then
        echo -e "  Queue Health:      ${GREEN}✓ Healthy (${queue_percent}% full)${NC}"
    elif [ "$queue_percent" -lt 80 ]; then
        echo -e "  Queue Health:      ${YELLOW}⚠ Warning (${queue_percent}% full)${NC}"
    else
        echo -e "  Queue Health:      ${RED}✗ Critical (${queue_percent}% full)${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Sync Statistics:${NC}"
    echo "  Total Synced:      ${total_synced:-0}"
    echo "  Total Failed:      ${total_failed:-0}"
    
    if [ -n "$last_sync" ]; then
        echo "  Last Sync:         $last_sync"
    fi
    
    if [ -n "$last_sync_status" ]; then
        if [ "$last_sync_status" = "success" ]; then
            echo -e "  Last Status:       ${GREEN}✓ Success${NC}"
        else
            echo -e "  Last Status:       ${RED}✗ $last_sync_status${NC}"
        fi
    fi
    
    echo ""
    
    # Show commands if queue has items
    if [ -n "$queue_size" ] && [ "$queue_size" -gt 0 ]; then
        echo -e "${CYAN}Commands:${NC}"
        echo "  Force sync:        curl -X POST localhost:4000/api/spoke/audit/sync"
        echo "  Clear queue:       curl -X POST localhost:4000/api/spoke/audit/clear"
        echo ""
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_spoke() {
    local action="${1:-help}"
    shift || true
    
    # Check if pilot mode is enabled - some spoke commands are disabled
    local pilot_disabled_actions="init generate-certs up down"
    if [ "$PILOT_MODE" = true ]; then
        for disabled in $pilot_disabled_actions; do
            if [ "$action" = "$disabled" ]; then
                log_error "Spoke deployment command '$action' is disabled in pilot mode"
                echo ""
                echo -e "${YELLOW}In pilot mode, partners register as SP Clients, not full Spokes.${NC}"
                echo ""
                echo "To register as an SP Client (OAuth/OIDC), use:"
                echo "  ./dive sp register"
                echo ""
                echo "To disable pilot mode (for full spoke deployment):"
                echo "  export DIVE_PILOT_MODE=false"
                echo "  ./dive spoke $action $@"
                return 1
            fi
        done
    fi
    
    case "$action" in
        init)           spoke_init "$@" ;;
        generate-certs) spoke_generate_certs "$@" ;;
        gen-certs)      spoke_generate_certs "$@" ;;
        rotate-certs)   spoke_rotate_certs "$@" ;;
        register)       spoke_register "$@" ;;
        status)         spoke_status ;;
        health)         spoke_health ;;
        sync)           spoke_sync ;;
        heartbeat)      spoke_heartbeat ;;
        up|start)       spoke_up ;;
        down|stop)      spoke_down ;;
        logs)           spoke_logs "$@" ;;
        failover)       spoke_failover "$@" ;;
        maintenance)    spoke_maintenance "$@" ;;
        audit-status)   spoke_audit_status ;;
        *)              module_spoke_help ;;
    esac
}

module_spoke_help() {
    print_header
    echo -e "${BOLD}Spoke Commands (for distributed federation):${NC}"
    echo ""
    
    if [ "$PILOT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  Pilot mode is enabled. Some spoke commands are disabled.${NC}"
        echo "   Use './dive sp register' to register as an SP Client instead."
        echo "   Set DIVE_PILOT_MODE=false to enable full spoke deployment."
        echo ""
    fi
    
    echo -e "${CYAN}Initialization:${NC}"
    echo "  init <code> <name>     Initialize a new spoke instance"
    echo "  generate-certs         Generate X.509 certificates for mTLS"
    echo "  rotate-certs           Rotate existing certificates (with backup)"
    echo ""
    
    echo -e "${CYAN}Registration:${NC}"
    echo "  register               Register this spoke with the Hub"
    echo "  status                 Show spoke federation status"
    echo ""
    
    echo -e "${CYAN}Operations:${NC}"
    echo "  up                     Start spoke services"
    echo "  down                   Stop spoke services"
    echo "  logs [service]         View service logs"
    echo "  health                 Check service health"
    echo ""
    
    echo -e "${CYAN}Federation:${NC}"
    echo "  sync                   Force policy sync from Hub"
    echo "  heartbeat              Send manual heartbeat to Hub"
    echo ""
    
    echo -e "${CYAN}Resilience (Phase 5):${NC}"
    echo "  failover [subcmd]      Circuit breaker management"
    echo "    status               Show failover state and metrics"
    echo "    force-open           Force circuit to OPEN (offline mode)"
    echo "    force-closed         Force circuit to CLOSED (normal mode)"
    echo "    reset                Reset metrics and return to CLOSED"
    echo ""
    echo "  maintenance [subcmd]   Maintenance mode control"
    echo "    status               Show maintenance status"
    echo "    enter [reason]       Enter maintenance mode"
    echo "    exit                 Exit maintenance mode"
    echo ""
    echo "  audit-status           Show audit queue status and metrics"
    echo ""
    
    echo -e "${BOLD}Quick Start:${NC}"
    echo "  1. ./dive spoke init NZL 'New Zealand Defence'"
    echo "  2. ./dive spoke generate-certs"
    echo "  3. Edit instances/nzl/config.json (set contactEmail)"
    echo "  4. cp instances/nzl/.env.template instances/nzl/.env"
    echo "  5. Edit instances/nzl/.env (set passwords)"
    echo "  6. ./dive spoke register"
    echo "  7. Wait for Hub admin approval"
    echo "  8. Add SPOKE_OPAL_TOKEN to .env"
    echo "  9. ./dive spoke up"
    echo ""
    
    echo -e "${BOLD}Resilience Examples:${NC}"
    echo "  ./dive spoke failover status"
    echo "  ./dive spoke maintenance enter 'Scheduled upgrade'"
    echo "  ./dive spoke audit-status"
    echo ""
    
    echo -e "${BOLD}Environment Variables:${NC}"
    echo "  DIVE_PILOT_MODE        Set to 'false' to enable spoke deployment"
    echo "  DIVE_HUB_URL           Override Hub URL for registration"
    echo "  DIVE_INSTANCE          Set default instance code"
    echo ""
}
