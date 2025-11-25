#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Unified Instance Deployment Script (Phase 1 Enhanced)
# =============================================================================
# Deploys a complete DIVE V3 instance (USA, FRA, DEU, GBR, CAN, etc.)
#
# Usage:
#   ./scripts/deploy-dive-instance.sh <INSTANCE_CODE> [OPTIONS]
#
# Examples:
#   ./scripts/deploy-dive-instance.sh USA              # Deploy USA instance
#   ./scripts/deploy-dive-instance.sh FRA              # Deploy FRA instance  
#   ./scripts/deploy-dive-instance.sh DEU --new        # Deploy new DEU instance
#   ./scripts/deploy-dive-instance.sh GBR --terraform-only  # Only apply Terraform
#   ./scripts/deploy-dive-instance.sh ESP --dry-run   # Validate without deploying
#   ./scripts/deploy-dive-instance.sh --help          # Show help
#
# Options:
#   --new           Create new instance (tunnel, docker-compose, terraform)
#   --terraform-only Only apply Terraform configuration
#   --docker-only   Only start Docker services
#   --tunnel-only   Only setup Cloudflare tunnel
#   --destroy       Destroy the instance
#   --force         Force recreation of existing resources
#   --dry-run       Validate configuration without deploying
#   --help          Show this help message
#
# Test Users (all passwords: DiveDemo2025!):
#   testuser-{code}-1  UNCLASSIFIED
#   testuser-{code}-2  CONFIDENTIAL
#   testuser-{code}-3  SECRET
#   testuser-{code}-4  TOP_SECRET
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# CONFIGURATION
# =============================================================================

# Instance name to full name mapping
declare -A INSTANCE_NAMES=(
    ["USA"]="United States"
    ["FRA"]="France"
    ["DEU"]="Germany"
    ["GBR"]="United Kingdom"
    ["CAN"]="Canada"
    ["ITA"]="Italy"
    ["ESP"]="Spain"
    ["NLD"]="Netherlands"
    ["POL"]="Poland"
    ["INDUSTRY"]="Industry Partners"
)

# Port assignments (base ports + offset)
# USA = base, each subsequent instance adds offset
declare -A PORT_OFFSETS=(
    ["USA"]=0
    ["FRA"]=1
    ["DEU"]=2
    ["GBR"]=3
    ["CAN"]=4
    ["ITA"]=5
    ["ESP"]=6
    ["NLD"]=7
    ["POL"]=8
    ["INDUSTRY"]=9
)

# Base ports (each instance adds offset to avoid collisions)
# Using larger gaps to prevent overlap between services
BASE_FRONTEND_PORT=3000          # 3000, 3001, 3002...
BASE_BACKEND_PORT=4000           # 4000, 4001, 4002...
BASE_KEYCLOAK_HTTPS_PORT=8443    # 8443, 8444, 8445...
BASE_KEYCLOAK_HTTP_PORT=8180     # 8180, 8181, 8182... (moved to avoid OPA conflict)
BASE_MONGO_PORT=27017            # 27017, 27018, 27019...
BASE_POSTGRES_PORT=5433          # 5433, 5434, 5435...
BASE_REDIS_PORT=6379             # 6379, 6380, 6381...
BASE_OPA_PORT=8281               # 8281, 8282, 8283... (moved to avoid Keycloak conflict)
BASE_KAS_PORT=8380               # 8380, 8381, 8382... (moved to unique range)
BASE_TUNNEL_METRICS_PORT=9126    # 9126, 9127, 9128...

# =============================================================================
# PROGRESS TRACKING
# =============================================================================

TOTAL_STEPS=6
CURRENT_STEP=0

progress() {
    ((CURRENT_STEP++))
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Step ${CURRENT_STEP}/${TOTAL_STEPS}: $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# FUNCTIONS
# =============================================================================

usage() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║             DIVE V3 - Unified Instance Deployment                 ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 <INSTANCE_CODE> [OPTIONS]"
    echo ""
    echo -e "${GREEN}Instance Codes:${NC}"
    echo "  USA, FRA, DEU, GBR, CAN, ITA, ESP, NLD, POL, INDUSTRY"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo "  --new              Create new instance from scratch"
    echo "  --terraform-only   Only apply Terraform configuration"
    echo "  --docker-only      Only start/restart Docker services"
    echo "  --tunnel-only      Only setup Cloudflare tunnel"
    echo "  --destroy          Destroy the instance"
    echo "  --force            Force recreation of existing resources"
    echo "  --dry-run          Validate configuration without deploying"
    echo "  --help             Show this help message"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  $0 USA                    # Deploy/update USA instance"
    echo "  $0 FRA --new              # Create new FRA instance"
    echo "  $0 DEU --terraform-only   # Only apply Terraform for DEU"
    echo "  $0 ESP --dry-run          # Validate ESP config"
    echo ""
    echo -e "${GREEN}Test Users (Password: DiveDemo2025!):${NC}"
    echo "  testuser-{code}-1  →  UNCLASSIFIED"
    echo "  testuser-{code}-2  →  CONFIDENTIAL"
    echo "  testuser-{code}-3  →  SECRET"
    echo "  testuser-{code}-4  →  TOP_SECRET"
    echo ""
    echo -e "${YELLOW}Tip: Higher number = Higher clearance${NC}"
    exit 0
}

# Pre-flight checks
preflight_checks() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  PRE-FLIGHT CHECKS${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    local failed=false
    
    # Check Docker
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker is running"
    else
        echo -e "  ${RED}✗${NC} Docker is not running"
        failed=true
    fi
    
    # Check docker-compose
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} docker-compose is available"
    else
        echo -e "  ${RED}✗${NC} docker-compose is not available"
        failed=true
    fi
    
    # Check cloudflared
    if command -v cloudflared &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} cloudflared is installed"
    else
        echo -e "  ${YELLOW}⚠${NC} cloudflared is not installed (tunnel features disabled)"
    fi
    
    # Check terraform
    if command -v terraform &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} terraform is installed"
    else
        echo -e "  ${YELLOW}⚠${NC} terraform is not installed (IaC features disabled)"
    fi
    
    # Check mkcert
    if command -v mkcert &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} mkcert is installed"
    else
        echo -e "  ${YELLOW}⚠${NC} mkcert is not installed (certificate generation limited)"
    fi
    
    # Check if instance already exists
    if [ "$NEW_INSTANCE" = true ]; then
        local instance_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
        if [ "$instance_lower" != "usa" ] && [ -f "$PROJECT_ROOT/docker-compose.${instance_lower}.yml" ]; then
            if [ "$FORCE" != true ]; then
                echo -e "  ${RED}✗${NC} Instance ${INSTANCE} already exists (use --force to recreate)"
                failed=true
            else
                echo -e "  ${YELLOW}⚠${NC} Instance ${INSTANCE} exists, will be recreated (--force)"
            fi
        fi
    fi
    
    echo ""
    
    if [ "$failed" = true ]; then
        log_error "Pre-flight checks failed. Please fix the issues above."
        exit 1
    fi
    
    log_success "All pre-flight checks passed"
}

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

# Calculate ports for an instance
calculate_ports() {
    local instance=$1
    local offset=${PORT_OFFSETS[$instance]:-0}
    
    FRONTEND_PORT=$((BASE_FRONTEND_PORT + offset))
    BACKEND_PORT=$((BASE_BACKEND_PORT + offset))
    KEYCLOAK_HTTPS_PORT=$((BASE_KEYCLOAK_HTTPS_PORT + offset))
    KEYCLOAK_HTTP_PORT=$((BASE_KEYCLOAK_HTTP_PORT + offset))
    MONGO_PORT=$((BASE_MONGO_PORT + offset))
    POSTGRES_PORT=$((BASE_POSTGRES_PORT + offset))
    REDIS_PORT=$((BASE_REDIS_PORT + offset))
    OPA_PORT=$((BASE_OPA_PORT + offset))
    KAS_PORT=$((BASE_KAS_PORT + offset))
    TUNNEL_METRICS_PORT=$((BASE_TUNNEL_METRICS_PORT + offset))
}

# Generate docker-compose file for an instance
generate_docker_compose() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local instance_name="${INSTANCE_NAMES[$instance]}"
    local compose_file="$PROJECT_ROOT/docker-compose.${instance_lower}.yml"
    
    calculate_ports "$instance"
    
    log_info "Generating docker-compose for $instance ($instance_name)..."
    
    # For USA, use the main docker-compose.yml
    if [ "$instance" == "USA" ]; then
        log_info "USA uses main docker-compose.yml"
        return 0
    fi
    
    cat > "$compose_file" << EOF
# =============================================================================
# DIVE V3 - ${instance} Instance (${instance_name})
# Auto-generated by deploy-dive-instance.sh
# =============================================================================

services:
  # PostgreSQL for ${instance} Keycloak
  postgres-${instance_lower}:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-${instance_lower}
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - postgres_${instance_lower}_data:/var/lib/postgresql/data
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Keycloak ${instance} Instance
  keycloak-${instance_lower}:
    image: quay.io/keycloak/keycloak:latest
    platform: linux/amd64
    container_name: dive-v3-keycloak-${instance_lower}
    command: start-dev --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true --features=scripts
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-${instance_lower}:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_HOSTNAME: ${instance_lower}-idp.dive25.com
      KC_HOSTNAME_STRICT: false
      KC_PROXY_HEADERS: xforwarded
      KC_HTTP_ENABLED: true
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HTTPS_PORT: 8443
      KC_LOG_LEVEL: info
      KC_METRICS_ENABLED: true
      KC_HEALTH_ENABLED: true
      KC_FEATURES: scripts
    ports:
      - "${KEYCLOAK_HTTPS_PORT}:8443"
      - "${KEYCLOAK_HTTP_PORT}:8080"
    volumes:
      - ./keycloak/certs:/opt/keycloak/certs:ro
      - ./keycloak/themes:/opt/keycloak/themes:ro
    depends_on:
      postgres-${instance_lower}:
        condition: service_healthy
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # MongoDB ${instance} Instance
  mongodb-${instance_lower}:
    image: mongo:7
    container_name: dive-v3-mongodb-${instance_lower}
    environment:
      MONGO_INITDB_DATABASE: dive-v3-${instance_lower}
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
    ports:
      - "${MONGO_PORT}:27017"
    volumes:
      - mongodb_${instance_lower}_data:/data/db
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis ${instance} Instance
  redis-${instance_lower}:
    image: redis:alpine
    container_name: dive-v3-redis-${instance_lower}
    ports:
      - "${REDIS_PORT}:6379"
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # OPA ${instance} Instance
  opa-${instance_lower}:
    image: openpolicyagent/opa:latest
    platform: linux/amd64
    container_name: dive-v3-opa-${instance_lower}
    command:
      - "run"
      - "--server"
      - "--addr=0.0.0.0:8181"
      - "--log-level=info"
      - "/policies"
    ports:
      - "${OPA_PORT}:8181"
    volumes:
      - ./policies:/policies:ro
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # KAS ${instance} Instance
  kas-${instance_lower}:
    image: node:20-alpine
    container_name: dive-v3-kas-${instance_lower}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 8080
      OPA_URL: http://opa-${instance_lower}:8181
      KEYCLOAK_URL: https://keycloak-${instance_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
      BACKEND_URL: http://backend-${instance_lower}:4000
      MONGODB_URI: mongodb://admin:admin@mongodb-${instance_lower}:27017
      JWT_SECRET: ${instance_lower}-kas-secret-change-in-production
    ports:
      - "${KAS_PORT}:8080"
    volumes:
      - ./kas:/app
    depends_on:
      - opa-${instance_lower}
      - mongodb-${instance_lower}
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Backend ${instance} Instance
  backend-${instance_lower}:
    image: node:20-alpine
    container_name: dive-v3-backend-${instance_lower}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 4000
      INSTANCE_REALM: ${instance}
      MONGODB_URI: mongodb://admin:admin@mongodb-${instance_lower}:27017/dive-v3-${instance_lower}?authSource=admin
      REDIS_HOST: redis-${instance_lower}
      REDIS_PORT: 6379
      REDIS_URL: redis://redis-${instance_lower}:6379
      JWT_SECRET: ${instance_lower}-backend-secret-change-in-production
      OPA_URL: http://opa-${instance_lower}:8181
      KEYCLOAK_URL: https://keycloak-${instance_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: \${${instance}_CLIENT_SECRET:-placeholder}
      KEYCLOAK_ADMIN_USER: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KAS_URL: http://kas-${instance_lower}:8080
      FEDERATION_ALLOWED_ORIGINS: https://${instance_lower}-app.dive25.com,https://localhost:${FRONTEND_PORT}
      NEXT_PUBLIC_BASE_URL: https://${instance_lower}-app.dive25.com
    ports:
      - "${BACKEND_PORT}:4000"
    volumes:
      - ./backend:/app
      - ./keycloak/certs:/opt/keycloak/certs:ro
      - ./backend/certs:/app/certs:ro
    depends_on:
      mongodb-${instance_lower}:
        condition: service_healthy
      redis-${instance_lower}:
        condition: service_healthy
      opa-${instance_lower}:
        condition: service_healthy
      keycloak-${instance_lower}:
        condition: service_healthy
      kas-${instance_lower}:
        condition: service_healthy
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend ${instance} Instance
  frontend-${instance_lower}:
    image: node:20-alpine
    container_name: dive-v3-frontend-${instance_lower}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 3000
      NEXT_PUBLIC_API_URL: https://${instance_lower}-api.dive25.com
      NEXT_PUBLIC_BACKEND_URL: https://${instance_lower}-api.dive25.com
      NEXT_PUBLIC_KEYCLOAK_URL: https://${instance_lower}-idp.dive25.com
      NEXT_PUBLIC_KEYCLOAK_REALM: dive-v3-broker
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      NEXT_PUBLIC_APP_NAME: "DIVE V3 - ${instance_name}"
      NEXT_PUBLIC_INSTANCE: ${instance}
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: \${${instance}_CLIENT_SECRET:-placeholder}
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_URL: https://keycloak-${instance_lower}:8443
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
      NEXTAUTH_URL: https://${instance_lower}-app.dive25.com
      NEXTAUTH_SECRET: ${instance_lower}-frontend-secret-change-in-production
    ports:
      - "${FRONTEND_PORT}:3000"
    volumes:
      - ./frontend:/app
      - ./certs:/opt/app/certs:ro
      - ./frontend/.env.${instance_lower}:/app/.env.local:ro
      # CRITICAL: Instance-specific volumes for build isolation
      - frontend_${instance_lower}_node_modules:/app/node_modules
      - frontend_${instance_lower}_next:/app/.next
    depends_on:
      - backend-${instance_lower}
      - keycloak-${instance_lower}
    networks:
      - dive-${instance_lower}-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Cloudflare Tunnel ${instance}
  cloudflared-${instance_lower}:
    image: cloudflare/cloudflared:latest
    container_name: dive-v3-tunnel-${instance_lower}
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared/config-${instance_lower}.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared/${instance_lower}-tunnel-credentials.json:/etc/cloudflared/tunnel-credentials.json:ro
    networks:
      - dive-${instance_lower}-network
    depends_on:
      - frontend-${instance_lower}
      - backend-${instance_lower}
      - keycloak-${instance_lower}
      - kas-${instance_lower}
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    ports:
      - "${TUNNEL_METRICS_PORT}:9126"

volumes:
  postgres_${instance_lower}_data:
  mongodb_${instance_lower}_data:
  # Instance-specific frontend volumes for build isolation
  frontend_${instance_lower}_node_modules:
  frontend_${instance_lower}_next:

networks:
  dive-${instance_lower}-network:
    driver: bridge
EOF

    log_success "Generated $compose_file"
}

# Generate Cloudflare tunnel config for an instance
generate_tunnel_config() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local tunnel_id=$2
    local config_file="$PROJECT_ROOT/cloudflared/config-${instance_lower}.yml"
    
    log_info "Generating Cloudflare tunnel config for $instance..."
    
    cat > "$config_file" << EOF
# Cloudflare Tunnel Configuration for DIVE V3 - ${instance} Instance
# Auto-generated by deploy-dive-instance.sh

tunnel: ${tunnel_id}
credentials-file: /etc/cloudflared/tunnel-credentials.json

metrics: 0.0.0.0:9126

ingress:
  - hostname: ${instance_lower}-app.dive25.com
    service: https://frontend-${instance_lower}:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: ${instance_lower}-api.dive25.com
    service: https://backend-${instance_lower}:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: ${instance_lower}-idp.dive25.com
    service: https://keycloak-${instance_lower}:8443
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: ${instance_lower}-kas.dive25.com
    service: http://kas-${instance_lower}:8080
    originRequest:
      connectTimeout: 30s

  - service: http_status:404
EOF

    log_success "Generated $config_file"
}

# Generate Terraform tfvars for an instance
generate_tfvars() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local tfvars_file="$PROJECT_ROOT/terraform/instances/${instance_lower}.tfvars"
    
    calculate_ports "$instance"
    
    log_info "Generating Terraform tfvars for $instance..."
    
    cat > "$tfvars_file" << EOF
# ${instance} Instance Configuration
# Auto-generated by deploy-dive-instance.sh

# Keycloak Connection
keycloak_url            = "https://localhost:${KEYCLOAK_HTTPS_PORT}"
keycloak_admin_username = "admin"
keycloak_admin_password = "admin"

# Public URLs (Cloudflare tunnel)
app_url = "https://${instance_lower}-app.dive25.com"
api_url = "https://${instance_lower}-api.dive25.com"
idp_url = "https://${instance_lower}-idp.dive25.com"

# Test users
create_test_users = true
EOF

    log_success "Generated $tfvars_file"
}

# Generate frontend .env file for an instance
generate_frontend_env() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local instance_name="${INSTANCE_NAMES[$instance]}"
    local env_file="$PROJECT_ROOT/frontend/.env.${instance_lower}"
    
    log_info "Generating frontend .env for $instance..."
    
    cat > "$env_file" << EOF
# ${instance} Instance Environment Variables
# Auto-generated by deploy-dive-instance.sh

NEXT_PUBLIC_API_URL=https://${instance_lower}-api.dive25.com
NEXT_PUBLIC_BACKEND_URL=https://${instance_lower}-api.dive25.com
NEXT_PUBLIC_KEYCLOAK_URL=https://${instance_lower}-idp.dive25.com
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker
NEXT_PUBLIC_APP_NAME="DIVE V3 - ${instance_name}"
NEXT_PUBLIC_INSTANCE=${instance}
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=placeholder-update-after-terraform
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_URL=https://keycloak-${instance_lower}:8443
NODE_TLS_REJECT_UNAUTHORIZED=0
NEXTAUTH_URL=https://${instance_lower}-app.dive25.com
NEXTAUTH_SECRET=${instance_lower}-frontend-secret-change-in-production
EOF

    log_success "Generated $env_file"
}

# Setup Cloudflare tunnel for an instance
setup_cloudflare_tunnel() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local tunnel_name="dive-v3-${instance_lower}"
    
    log_info "Setting up Cloudflare tunnel for $instance..."
    
    # Check if tunnel exists
    existing_tunnel=$(cloudflared tunnel list --output json 2>/dev/null | jq -r ".[] | select(.name==\"$tunnel_name\") | .id" || echo "")
    
    if [ -n "$existing_tunnel" ]; then
        log_info "Tunnel $tunnel_name already exists (ID: $existing_tunnel)"
        TUNNEL_ID="$existing_tunnel"
    else
        log_info "Creating new tunnel: $tunnel_name"
        cloudflared tunnel create "$tunnel_name"
        TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")
    fi
    
    # Copy credentials
    if [ -f "$HOME/.cloudflared/${TUNNEL_ID}.json" ]; then
        cp "$HOME/.cloudflared/${TUNNEL_ID}.json" "$PROJECT_ROOT/cloudflared/${instance_lower}-tunnel-credentials.json"
        chmod 600 "$PROJECT_ROOT/cloudflared/${instance_lower}-tunnel-credentials.json"
        log_success "Copied tunnel credentials"
    else
        log_error "Tunnel credentials not found at $HOME/.cloudflared/${TUNNEL_ID}.json"
        return 1
    fi
    
    # Generate tunnel config
    generate_tunnel_config "$instance" "$TUNNEL_ID"
    
    # Setup DNS routes (use --overwrite-dns to ensure correct tunnel)
    log_info "Setting up DNS routes..."
    cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "${instance_lower}-app.dive25.com" 2>/dev/null || true
    cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "${instance_lower}-api.dive25.com" 2>/dev/null || true
    cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "${instance_lower}-idp.dive25.com" 2>/dev/null || true
    cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "${instance_lower}-kas.dive25.com" 2>/dev/null || true
    
    log_success "Cloudflare tunnel setup complete"
}

# Apply Terraform for an instance
apply_terraform() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    log_info "Applying Terraform for $instance..."
    
    cd "$PROJECT_ROOT/terraform/instances"
    
    # Select or create workspace
    terraform workspace select "$instance_lower" 2>/dev/null || terraform workspace new "$instance_lower"
    
    # Initialize
    terraform init -upgrade
    
    # Plan and apply
    terraform plan -var-file="${instance_lower}.tfvars" -out="${instance_lower}.tfplan"
    terraform apply "${instance_lower}.tfplan"
    
    # Get client secret and update configs
    CLIENT_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")
    
    if [ -n "$CLIENT_SECRET" ]; then
        log_info "Updating client secret in docker-compose and .env files..."
        
        if [ "$instance" != "USA" ]; then
            local compose_file="$PROJECT_ROOT/docker-compose.${instance_lower}.yml"
            sed -i '' "s/KEYCLOAK_CLIENT_SECRET: .*/KEYCLOAK_CLIENT_SECRET: $CLIENT_SECRET/" "$compose_file" 2>/dev/null || true
        fi
        
        local env_file="$PROJECT_ROOT/frontend/.env.${instance_lower}"
        sed -i '' "s/KEYCLOAK_CLIENT_SECRET=.*/KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET/" "$env_file" 2>/dev/null || true
        
        log_success "Updated client secret"
    fi
    
    cd "$PROJECT_ROOT"
    log_success "Terraform applied for $instance"
}

# Start Docker services for an instance
start_docker_services() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    log_info "Starting Docker services for $instance..."
    
    if [ "$instance" == "USA" ]; then
        docker-compose up -d
    else
        docker-compose -f "docker-compose.${instance_lower}.yml" up -d
    fi
    
    log_success "Docker services started for $instance"
}

# Deploy a new instance from scratch
deploy_new_instance() {
    local instance=$1
    
    TOTAL_STEPS=6
    
    # Step 1: Generate all config files
    progress "Generating configuration files"
    generate_docker_compose "$instance"
    generate_tfvars "$instance"
    generate_frontend_env "$instance"
    log_success "Configuration files generated"
    
    # Step 2: Setup Cloudflare tunnel
    progress "Setting up Cloudflare tunnel"
    setup_cloudflare_tunnel "$instance"
    
    # Step 3: Start Docker services
    progress "Starting Docker services"
    start_docker_services "$instance"
    
    # Step 4: Wait for Keycloak to be healthy
    progress "Waiting for Keycloak to initialize"
    log_info "This may take 30-60 seconds..."
    local max_wait=120
    local waited=0
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    while [ $waited -lt $max_wait ]; do
        if curl -sf "https://localhost:${KEYCLOAK_HTTPS_PORT}/health/ready" --insecure >/dev/null 2>&1; then
            log_success "Keycloak is ready"
            break
        fi
        sleep 5
        waited=$((waited + 5))
        echo -n "."
    done
    echo ""
    
    if [ $waited -ge $max_wait ]; then
        log_warning "Keycloak health check timed out, continuing anyway..."
    fi
    
    # Step 5: Apply Terraform
    progress "Applying Terraform configuration"
    apply_terraform "$instance"
    
    # Step 6: Restart services with correct secrets
    progress "Restarting services with credentials"
    start_docker_services "$instance"
    
    log_success "Instance $instance deployed successfully!"
}

# Deploy/update an existing instance
deploy_instance() {
    local instance=$1
    
    log_info "Deploying/updating instance: $instance"
    
    # Start Docker services
    start_docker_services "$instance"
    
    # Apply Terraform
    apply_terraform "$instance"
    
    # Restart services with correct secrets
    start_docker_services "$instance"
    
    log_success "Instance $instance updated successfully!"
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
INSTANCE=""
NEW_INSTANCE=false
TERRAFORM_ONLY=false
DOCKER_ONLY=false
TUNNEL_ONLY=false
DESTROY=false
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --new)
            NEW_INSTANCE=true
            shift
            ;;
        --terraform-only)
            TERRAFORM_ONLY=true
            shift
            ;;
        --docker-only)
            DOCKER_ONLY=true
            shift
            ;;
        --tunnel-only)
            TUNNEL_ONLY=true
            shift
            ;;
        --destroy)
            DESTROY=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [ -z "$INSTANCE" ]; then
                INSTANCE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            else
                log_error "Unknown argument: $1"
                usage
            fi
            shift
            ;;
    esac
done

# Validate instance
if [ -z "$INSTANCE" ]; then
    log_error "Instance code is required"
    echo ""
    usage
fi

if [ -z "${INSTANCE_NAMES[$INSTANCE]}" ]; then
    log_error "Unknown instance code: $INSTANCE"
    log_info "Valid codes: ${!INSTANCE_NAMES[*]}"
    exit 1
fi

# Calculate ports for display
calculate_ports "$INSTANCE"
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

# Execute
cd "$PROJECT_ROOT"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║             DIVE V3 Instance Deployment                           ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Instance:  ${GREEN}${INSTANCE}${CYAN} (${INSTANCE_NAMES[$INSTANCE]})${NC}"
if [ "$DRY_RUN" = true ]; then
echo -e "${CYAN}║  Mode:      ${YELLOW}DRY RUN (validation only)${NC}"
fi
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"

# Run pre-flight checks
preflight_checks

# Dry run mode - just validate and exit
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  DRY RUN SUMMARY${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}Configuration validated for ${INSTANCE} (${INSTANCE_NAMES[$INSTANCE]})${NC}"
    echo ""
    echo -e "${BLUE}Planned URLs:${NC}"
    echo -e "  Frontend:  https://${INSTANCE_LOWER}-app.dive25.com"
    echo -e "  API:       https://${INSTANCE_LOWER}-api.dive25.com"
    echo -e "  Keycloak:  https://${INSTANCE_LOWER}-idp.dive25.com"
    echo -e "  KAS:       https://${INSTANCE_LOWER}-kas.dive25.com"
    echo ""
    echo -e "${BLUE}Planned Ports:${NC}"
    echo -e "  Frontend:  ${FRONTEND_PORT}"
    echo -e "  Backend:   ${BACKEND_PORT}"
    echo -e "  Keycloak:  ${KEYCLOAK_HTTPS_PORT} (HTTPS), ${KEYCLOAK_HTTP_PORT} (HTTP)"
    echo -e "  MongoDB:   ${MONGO_PORT}"
    echo -e "  Redis:     ${REDIS_PORT}"
    echo -e "  OPA:       ${OPA_PORT}"
    echo -e "  KAS:       ${KAS_PORT}"
    echo ""
    echo -e "${YELLOW}To deploy, run without --dry-run flag${NC}"
    exit 0
fi

# Execute deployment
if [ "$TERRAFORM_ONLY" = true ]; then
    TOTAL_STEPS=1
    progress "Applying Terraform"
    apply_terraform "$INSTANCE"
elif [ "$DOCKER_ONLY" = true ]; then
    TOTAL_STEPS=1
    progress "Starting Docker services"
    start_docker_services "$INSTANCE"
elif [ "$TUNNEL_ONLY" = true ]; then
    TOTAL_STEPS=1
    progress "Setting up Cloudflare tunnel"
    setup_cloudflare_tunnel "$INSTANCE"
elif [ "$NEW_INSTANCE" = true ]; then
    deploy_new_instance "$INSTANCE"
else
    TOTAL_STEPS=3
    progress "Starting Docker services"
    start_docker_services "$INSTANCE"
    progress "Applying Terraform"
    apply_terraform "$INSTANCE"
    progress "Restarting services with secrets"
    start_docker_services "$INSTANCE"
fi

# Display success summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    DEPLOYMENT SUCCESSFUL                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Instance: ${INSTANCE} (${INSTANCE_NAMES[$INSTANCE]})${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                         ACCESS URLS                               ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Frontend:  https://${INSTANCE_LOWER}-app.dive25.com${NC}"
echo -e "${GREEN}║  API:       https://${INSTANCE_LOWER}-api.dive25.com${NC}"
echo -e "${GREEN}║  Keycloak:  https://${INSTANCE_LOWER}-idp.dive25.com${NC}"
echo -e "${GREEN}║  KAS:       https://${INSTANCE_LOWER}-kas.dive25.com${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                       TEST USERS                                  ║${NC}"
echo -e "${GREEN}║              Password for all: DiveDemo2025!                      ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  testuser-${INSTANCE_LOWER}-1  UNCLASSIFIED   (Level 1)${NC}"
echo -e "${GREEN}║  testuser-${INSTANCE_LOWER}-2  CONFIDENTIAL   (Level 2)${NC}"
echo -e "${GREEN}║  testuser-${INSTANCE_LOWER}-3  SECRET         (Level 3)${NC}"
echo -e "${GREEN}║  testuser-${INSTANCE_LOWER}-4  TOP_SECRET     (Level 4)${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Tip: Higher number = Higher clearance${NC}"
echo ""

