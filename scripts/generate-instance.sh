#!/usr/bin/env bash

# =============================================================================
# DIVE V3 - Instance Generator
# =============================================================================
# Generates isolated instance configurations from instance.json
#
# Usage:
#   ./scripts/generate-instance.sh <INSTANCE_CODE>
#   ./scripts/generate-instance.sh USA
#   ./scripts/generate-instance.sh FRA
#   ./scripts/generate-instance.sh --all
#
# This script generates:
#   - instances/{code}/docker-compose.yml
#   - instances/{code}/.env
#   - instances/{code}/certs/ (certificates)
#   - instances/{code}/cloudflared/config.yml
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_usage() {
    cat << EOF
Usage: $0 <INSTANCE_CODE> [OPTIONS]

Generate isolated instance configuration from instance.json

Arguments:
  INSTANCE_CODE    ISO 3166-1 alpha-3 country code (USA, FRA, DEU, etc.)
                   Use --all to generate all instances

Options:
  --dry-run        Show what would be generated without creating files
  --force          Overwrite existing files
  --help           Show this help message

Examples:
  $0 USA              Generate USA instance
  $0 FRA --force      Regenerate FRA instance, overwriting existing
  $0 --all            Generate all instances
EOF
}

# Parse arguments
INSTANCE_CODE=""
DRY_RUN=false
FORCE=false
GENERATE_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --all)
            GENERATE_ALL=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            if [[ -z "$INSTANCE_CODE" ]]; then
                INSTANCE_CODE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            else
                log_error "Unknown argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate
if [[ "$GENERATE_ALL" == "true" ]]; then
    # Find all instances with instance.json
    INSTANCES=()
    for dir in "$PROJECT_ROOT/instances"/*; do
        if [[ -f "$dir/instance.json" ]]; then
            INSTANCES+=("$(basename "$dir" | tr '[:lower:]' '[:upper:]')")
        fi
    done
    if [[ ${#INSTANCES[@]} -eq 0 ]]; then
        log_error "No instance.json files found in instances/"
        exit 1
    fi
elif [[ -z "$INSTANCE_CODE" ]]; then
    log_error "Instance code required"
    show_usage
    exit 1
else
    INSTANCES=("$INSTANCE_CODE")
fi

# JSON helper using jq
get_json() {
    local file="$1"
    local key="$2"
    jq -r "$key" "$file" 2>/dev/null || echo ""
}

# Generate docker-compose.yml for an instance
generate_docker_compose() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    local config_file="$instance_dir/instance.json"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "Instance config not found: $config_file"
        return 1
    fi
    
    # Read configuration
    local instance_name=$(get_json "$config_file" '.instance_name')
    local hostname_app=$(get_json "$config_file" '.hostnames.app')
    local hostname_api=$(get_json "$config_file" '.hostnames.api')
    local hostname_idp=$(get_json "$config_file" '.hostnames.idp')
    local hostname_kas=$(get_json "$config_file" '.hostnames.kas')
    
    local port_frontend=$(get_json "$config_file" '.ports.frontend')
    local port_backend=$(get_json "$config_file" '.ports.backend')
    local port_kc_http=$(get_json "$config_file" '.ports.keycloak_http')
    local port_kc_https=$(get_json "$config_file" '.ports.keycloak_https')
    local port_mongodb=$(get_json "$config_file" '.ports.mongodb')
    local port_redis=$(get_json "$config_file" '.ports.redis')
    local port_opa=$(get_json "$config_file" '.ports.opa')
    local port_kas=$(get_json "$config_file" '.ports.kas')
    local port_postgres=$(get_json "$config_file" '.ports.postgres')
    local port_cloudflared=$(get_json "$config_file" '.ports.cloudflared_metrics')
    
    local keycloak_theme=$(get_json "$config_file" '.theme.keycloak_theme')
    local tunnel_id=$(get_json "$config_file" '.cloudflare.tunnel_id')
    
    local network_name="dive-${code_lower}-network"
    local compose_file="$instance_dir/docker-compose.yml"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would generate: $compose_file"
        return 0
    fi
    
    log_info "Generating docker-compose.yml for $code..."
    
    cat > "$compose_file" << EOF
# =============================================================================
# DIVE V3 - ${code} Instance (${instance_name})
# =============================================================================
# Generated by generate-instance.sh - Do not edit manually
# Regenerate with: ./scripts/generate-instance.sh ${code}
# =============================================================================

version: '3.8'

networks:
  ${network_name}:
    driver: bridge

volumes:
  ${code_lower}_postgres_data:
  ${code_lower}_mongodb_data:
  ${code_lower}_redis_data:
  ${code_lower}_frontend_modules:
  ${code_lower}_frontend_next:

services:
  # ============================================================================
  # DATABASE SERVICES
  # ============================================================================
  
  postgres-${code_lower}:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-${code_lower}
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    ports:
      - "${port_postgres}:5432"
    volumes:
      - ${code_lower}_postgres_data:/var/lib/postgresql/data
    networks:
      - ${network_name}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb-${code_lower}:
    image: mongo:7
    container_name: dive-v3-mongodb-${code_lower}
    environment:
      MONGO_INITDB_DATABASE: dive-v3-${code_lower}
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
    ports:
      - "${port_mongodb}:27017"
    volumes:
      - ${code_lower}_mongodb_data:/data/db
    networks:
      - ${network_name}
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  redis-${code_lower}:
    image: redis:alpine
    container_name: dive-v3-redis-${code_lower}
    ports:
      - "${port_redis}:6379"
    volumes:
      - ${code_lower}_redis_data:/data
    networks:
      - ${network_name}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============================================================================
  # IDENTITY & ACCESS MANAGEMENT
  # ============================================================================
  
  keycloak-${code_lower}:
    build:
      context: ../../keycloak
      dockerfile: Dockerfile
    container_name: dive-v3-keycloak-${code_lower}
    command: start-dev --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true --features=scripts
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-${code_lower}:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_HOSTNAME: ${hostname_idp}
      KC_HOSTNAME_STRICT: "false"
      KC_PROXY_HEADERS: xforwarded
      KC_HTTP_ENABLED: "true"
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HTTPS_PORT: "8443"
      KC_LOG_LEVEL: info
      KC_METRICS_ENABLED: "true"
      KC_HEALTH_ENABLED: "true"
      KC_FEATURES: scripts
    ports:
      - "${port_kc_https}:8443"
      - "${port_kc_http}:8080"
    volumes:
      - ./certs:/opt/keycloak/certs:ro
      - ../../keycloak/themes:/opt/keycloak/themes:ro
    depends_on:
      postgres-${code_lower}:
        condition: service_healthy
    networks:
      - ${network_name}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================================================
  # AUTHORIZATION
  # ============================================================================
  
  opa-${code_lower}:
    image: openpolicyagent/opa:latest
    platform: linux/amd64
    container_name: dive-v3-opa-${code_lower}
    command: run --server --addr :8181 /policies
    ports:
      - "${port_opa}:8181"
    volumes:
      - ../../policies:/policies:ro
    networks:
      - ${network_name}
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # ============================================================================
  # KEY ACCESS SERVICE
  # ============================================================================
  
  kas-${code_lower}:
    build:
      context: ../../kas
      dockerfile: Dockerfile
    container_name: dive-v3-kas-${code_lower}
    environment:
      NODE_ENV: development
      PORT: "8080"
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      OPA_URL: http://opa-${code_lower}:8181
      INSTANCE_CODE: ${code}
    ports:
      - "${port_kas}:8080"
    volumes:
      - ./certs:/app/certs:ro
    depends_on:
      keycloak-${code_lower}:
        condition: service_healthy
      opa-${code_lower}:
        condition: service_healthy
    networks:
      - ${network_name}

  # ============================================================================
  # BACKEND API
  # ============================================================================
  
  backend-${code_lower}:
    build:
      context: ../../backend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-backend-${code_lower}
    environment:
      NODE_ENV: development
      PORT: "4000"
      INSTANCE_CODE: ${code}
      INSTANCE_NAME: "${instance_name}"
      # Database
      MONGODB_URI: mongodb://admin:admin@mongodb-${code_lower}:27017/dive-v3-${code_lower}?authSource=admin
      MONGODB_URL: mongodb://admin:admin@mongodb-${code_lower}:27017/dive-v3-${code_lower}?authSource=admin
      REDIS_URL: redis://redis-${code_lower}:6379
      # Keycloak
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_ADMIN_USER: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      # OPA
      OPA_URL: http://opa-${code_lower}:8181
      # CORS
      FEDERATION_ALLOWED_ORIGINS: https://${hostname_app},https://localhost:${port_frontend}
      CORS_ALLOWED_ORIGINS: https://${hostname_app},https://${hostname_api}
    ports:
      - "${port_backend}:4000"
    volumes:
      - ../../backend/src:/app/src:ro
      - ./certs:/app/certs:ro
    depends_on:
      mongodb-${code_lower}:
        condition: service_healthy
      redis-${code_lower}:
        condition: service_healthy
      keycloak-${code_lower}:
        condition: service_healthy
    networks:
      - ${network_name}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================================================
  # FRONTEND
  # ============================================================================
  
  frontend-${code_lower}:
    build:
      context: ../../frontend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-frontend-${code_lower}
    environment:
      NODE_ENV: development
      # Instance identity
      NEXT_PUBLIC_INSTANCE: ${code}
      NEXT_PUBLIC_INSTANCE_NAME: "${instance_name}"
      # URLs
      NEXT_PUBLIC_API_URL: https://${hostname_api}
      NEXT_PUBLIC_BACKEND_URL: https://${hostname_api}
      NEXT_PUBLIC_BASE_URL: https://${hostname_app}
      NEXT_PUBLIC_KEYCLOAK_URL: https://${hostname_idp}
      # NextAuth
      NEXTAUTH_URL: https://${hostname_app}
      NEXTAUTH_SECRET: dive-v3-${code_lower}-secret-key-change-in-production
      # Keycloak client (server-side)
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: \${KEYCLOAK_CLIENT_SECRET:-replace-with-actual-secret}
      # Theme customization
      NEXT_PUBLIC_THEME_PRIMARY: "$(get_json "$config_file" '.theme.primary_color')"
      NEXT_PUBLIC_THEME_SECONDARY: "$(get_json "$config_file" '.theme.secondary_color')"
      NEXT_PUBLIC_THEME_ACCENT: "$(get_json "$config_file" '.theme.accent_color')"
      # Analytics
      NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS: "true"
    ports:
      - "${port_frontend}:3000"
    volumes:
      - ../../frontend/src:/app/src:ro
      - ../../frontend/public:/app/public:ro
      - ${code_lower}_frontend_modules:/app/node_modules
      - ${code_lower}_frontend_next:/app/.next
      - ./certs:/app/certs:ro
    depends_on:
      backend-${code_lower}:
        condition: service_healthy
    networks:
      - ${network_name}

  # ============================================================================
  # CLOUDFLARE TUNNEL
  # ============================================================================
  
  cloudflared-${code_lower}:
    image: cloudflare/cloudflared:latest
    container_name: dive-v3-cloudflared-${code_lower}
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    networks:
      - ${network_name}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

    log_success "Generated: $compose_file"
}

# Generate .env file for an instance
generate_env_file() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    local config_file="$instance_dir/instance.json"
    local env_file="$instance_dir/.env"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would generate: $env_file"
        return 0
    fi
    
    log_info "Generating .env for $code..."
    
    local hostname_app=$(get_json "$config_file" '.hostnames.app')
    local hostname_api=$(get_json "$config_file" '.hostnames.api')
    local hostname_idp=$(get_json "$config_file" '.hostnames.idp')
    local port_frontend=$(get_json "$config_file" '.ports.frontend')
    
    cat > "$env_file" << EOF
# =============================================================================
# DIVE V3 - ${code} Instance Environment Variables
# =============================================================================
# Generated by generate-instance.sh - Do not edit manually
# Regenerate with: ./scripts/generate-instance.sh ${code}
# =============================================================================

# Instance Identity
INSTANCE_CODE=${code}
INSTANCE_NAME=$(get_json "$config_file" '.instance_name')
INSTANCE_LOCALE=$(get_json "$config_file" '.locale')

# Hostnames
HOSTNAME_APP=${hostname_app}
HOSTNAME_API=${hostname_api}
HOSTNAME_IDP=${hostname_idp}
HOSTNAME_KAS=$(get_json "$config_file" '.hostnames.kas')

# Ports
PORT_FRONTEND=${port_frontend}
PORT_BACKEND=$(get_json "$config_file" '.ports.backend')
PORT_KC_HTTPS=$(get_json "$config_file" '.ports.keycloak_https')
PORT_KC_HTTP=$(get_json "$config_file" '.ports.keycloak_http')
PORT_MONGODB=$(get_json "$config_file" '.ports.mongodb')
PORT_REDIS=$(get_json "$config_file" '.ports.redis')
PORT_OPA=$(get_json "$config_file" '.ports.opa')
PORT_KAS=$(get_json "$config_file" '.ports.kas')
PORT_POSTGRES=$(get_json "$config_file" '.ports.postgres')

# Theme
THEME_PRIMARY=$(get_json "$config_file" '.theme.primary_color')
THEME_SECONDARY=$(get_json "$config_file" '.theme.secondary_color')
THEME_ACCENT=$(get_json "$config_file" '.theme.accent_color')
KEYCLOAK_THEME=$(get_json "$config_file" '.theme.keycloak_theme')

# Cloudflare
CLOUDFLARE_TUNNEL_ID=$(get_json "$config_file" '.cloudflare.tunnel_id')
CLOUDFLARE_TUNNEL_NAME=$(get_json "$config_file" '.cloudflare.tunnel_name')

# Secrets (replace these!)
KEYCLOAK_CLIENT_SECRET=replace-with-actual-secret
NEXTAUTH_SECRET=dive-v3-${code_lower}-secret-$(openssl rand -hex 8)
EOF

    log_success "Generated: $env_file"
}

# Generate cloudflared config for an instance
generate_cloudflared_config() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    local config_file="$instance_dir/instance.json"
    local cf_dir="$instance_dir/cloudflared"
    local cf_config="$cf_dir/config.yml"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would generate: $cf_config"
        return 0
    fi
    
    mkdir -p "$cf_dir"
    
    log_info "Generating cloudflared config for $code..."
    
    local tunnel_id=$(get_json "$config_file" '.cloudflare.tunnel_id')
    local hostname_app=$(get_json "$config_file" '.hostnames.app')
    local hostname_api=$(get_json "$config_file" '.hostnames.api')
    local hostname_idp=$(get_json "$config_file" '.hostnames.idp')
    local hostname_kas=$(get_json "$config_file" '.hostnames.kas')
    
    cat > "$cf_config" << EOF
# =============================================================================
# DIVE V3 - ${code} Instance Cloudflare Tunnel Configuration
# =============================================================================
# Generated by generate-instance.sh - Do not edit manually
# Regenerate with: ./scripts/generate-instance.sh ${code}
# =============================================================================

tunnel: ${tunnel_id}
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Frontend
  - hostname: ${hostname_app}
    service: https://frontend-${code_lower}:3000
    originRequest:
      noTLSVerify: true
      http2Origin: true

  # Backend API
  - hostname: ${hostname_api}
    service: https://backend-${code_lower}:4000
    originRequest:
      noTLSVerify: true

  # Keycloak IdP
  - hostname: ${hostname_idp}
    service: https://keycloak-${code_lower}:8443
    originRequest:
      noTLSVerify: true

  # KAS
  - hostname: ${hostname_kas}
    service: https://kas-${code_lower}:8080
    originRequest:
      noTLSVerify: true

  # Catch-all
  - service: http_status:404
EOF

    log_success "Generated: $cf_config"
}

# Generate certificates for an instance
generate_certificates() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    local config_file="$instance_dir/instance.json"
    local cert_dir="$instance_dir/certs"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would generate certificates in: $cert_dir"
        return 0
    fi
    
    mkdir -p "$cert_dir"
    
    log_info "Generating certificates for $code..."
    
    local hostname_app=$(get_json "$config_file" '.hostnames.app')
    local hostname_api=$(get_json "$config_file" '.hostnames.api')
    local hostname_idp=$(get_json "$config_file" '.hostnames.idp')
    local hostname_kas=$(get_json "$config_file" '.hostnames.kas')
    
    # Check for mkcert
    if ! command -v mkcert &> /dev/null; then
        log_warn "mkcert not found. Copying shared certificates."
        cp "$PROJECT_ROOT/keycloak/certs/certificate.pem" "$cert_dir/" 2>/dev/null || true
        cp "$PROJECT_ROOT/keycloak/certs/key.pem" "$cert_dir/" 2>/dev/null || true
        return 0
    fi
    
    # Generate instance-specific certificates
    cd "$cert_dir"
    mkcert -cert-file certificate.pem -key-file key.pem \
        localhost \
        "keycloak-${code_lower}" \
        "backend-${code_lower}" \
        "frontend-${code_lower}" \
        "kas-${code_lower}" \
        "$hostname_app" \
        "$hostname_api" \
        "$hostname_idp" \
        "$hostname_kas" \
        "*.dive25.com" \
        2>/dev/null
    
    log_success "Generated certificates in: $cert_dir"
}

# Main execution
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           DIVE V3 - Instance Generator                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

for code in "${INSTANCES[@]}"; do
    code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    instance_dir="$PROJECT_ROOT/instances/$code_lower"
    config_file="$instance_dir/instance.json"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "Instance config not found: $config_file"
        continue
    fi
    
    echo ""
    log_info "Processing instance: $code"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check for existing files
    compose_exists=false
    if [[ -f "$instance_dir/docker-compose.yml" ]]; then
        compose_exists=true
        if [[ "$FORCE" != "true" && "$DRY_RUN" != "true" ]]; then
            log_warn "docker-compose.yml already exists. Use --force to overwrite."
        fi
    fi
    
    # Generate files
    if [[ "$compose_exists" != "true" || "$FORCE" == "true" || "$DRY_RUN" == "true" ]]; then
        generate_docker_compose "$code"
        generate_env_file "$code"
        generate_cloudflared_config "$code"
        generate_certificates "$code"
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Instance Generation Complete                                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "Dry-run complete. No files were created."
else
    log_info "To deploy an instance:"
    echo ""
    echo "  cd instances/{code}"
    echo "  docker-compose up -d"
    echo ""
fi


