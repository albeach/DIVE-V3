#!/bin/bash
# =============================================================================
# DIVE V3 - Docker Compose Generator
# =============================================================================
# Purpose: Auto-generate docker-compose.yml files from federation-registry.json
# Usage: ./scripts/federation/generate-docker-compose.sh <instance_code>
# Example: ./scripts/federation/generate-docker-compose.sh usa
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
OUTPUT_DIR="$PROJECT_ROOT/instances"

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Validate registry first
validate_registry() {
    log_info "Validating federation registry..."
    
    if [ ! -f "$REGISTRY_FILE" ]; then
        log_error "Registry file not found: $REGISTRY_FILE"
        exit 1
    fi
    
    if ! jq empty "$REGISTRY_FILE" 2>/dev/null; then
        log_error "Invalid JSON in registry file"
        exit 1
    fi
    
    log_success "Registry validated"
}

# Generate docker-compose.yml for a single instance
generate_docker_compose() {
    local instance_code="$1"
    local instance_code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local instance_code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    
    log_info "Generating docker-compose.yml for $instance_code_upper..."
    
    # Check if instance exists
    if ! jq -e ".instances.$instance_code_lower" "$REGISTRY_FILE" > /dev/null 2>&1; then
        log_error "Instance '$instance_code' not found in registry"
        return 1
    fi
    
    # Extract instance data
    local instance_name=$(jq -r ".instances.$instance_code_lower.name" "$REGISTRY_FILE")
    local instance_type=$(jq -r ".instances.$instance_code_lower.type" "$REGISTRY_FILE")
    local app_url=$(jq -r ".instances.$instance_code_lower.urls.app" "$REGISTRY_FILE")
    local api_url=$(jq -r ".instances.$instance_code_lower.urls.api" "$REGISTRY_FILE")
    local idp_url=$(jq -r ".instances.$instance_code_lower.urls.idp" "$REGISTRY_FILE")
    
    # Extract ports
    local frontend_port=$(jq -r ".instances.$instance_code_lower.ports.frontend" "$REGISTRY_FILE")
    local backend_port=$(jq -r ".instances.$instance_code_lower.ports.backend" "$REGISTRY_FILE")
    local keycloak_port=$(jq -r ".instances.$instance_code_lower.ports.keycloak" "$REGISTRY_FILE")
    local keycloak_http_port=$(jq -r ".instances.$instance_code_lower.ports.keycloakHttp" "$REGISTRY_FILE")
    local keycloak_mgmt_port=$(jq -r ".instances.$instance_code_lower.ports.keycloakManagement" "$REGISTRY_FILE")
    local postgres_port=$(jq -r ".instances.$instance_code_lower.ports.postgres" "$REGISTRY_FILE")
    local mongodb_port=$(jq -r ".instances.$instance_code_lower.ports.mongodb" "$REGISTRY_FILE")
    local redis_port=$(jq -r ".instances.$instance_code_lower.ports.redis" "$REGISTRY_FILE")
    local opa_port=$(jq -r ".instances.$instance_code_lower.ports.opa" "$REGISTRY_FILE")
    local opa_metrics_port=$(jq -r ".instances.$instance_code_lower.ports.opaMetrics" "$REGISTRY_FILE")
    local kas_port=$(jq -r ".instances.$instance_code_lower.ports.kas" "$REGISTRY_FILE")
    
    # Extract database info
    local postgres_db=$(jq -r ".instances.$instance_code_lower.keycloak.database.name" "$REGISTRY_FILE")
    local postgres_user=$(jq -r ".instances.$instance_code_lower.keycloak.database.user" "$REGISTRY_FILE")
    local mongodb_db=$(jq -r ".instances.$instance_code_lower.mongodb.database" "$REGISTRY_FILE")
    local mongodb_user=$(jq -r ".instances.$instance_code_lower.mongodb.user" "$REGISTRY_FILE")
    local redis_password=$(jq -r ".instances.$instance_code_lower.redis.password" "$REGISTRY_FILE")
    local redis_maxmemory=$(jq -r ".instances.$instance_code_lower.redis.maxMemory" "$REGISTRY_FILE")
    local admin_password=$(jq -r ".defaults.adminPassword" "$REGISTRY_FILE")
    local theme=$(jq -r ".instances.$instance_code_lower.keycloak.theme" "$REGISTRY_FILE")
    
    # Create output directory
    local output_dir="$OUTPUT_DIR/$instance_code_lower"
    mkdir -p "$output_dir"
    
    # Create output file
    local output_file="$output_dir/docker-compose.yml"
    
    cat > "$output_file" <<EOF
# =============================================================================
# DIVE V3 - $instance_code_upper Instance ($instance_name)
# =============================================================================
# ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
# =============================================================================
# This file is automatically generated from config/federation-registry.json
# To make changes:
#   1. Edit config/federation-registry.json
#   2. Run: ./scripts/federation/generate-docker-compose.sh $instance_code_lower
#   3. Commit the registry change (this file is regenerated)
#
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Source: federation-registry.json v$(jq -r '.version' "$REGISTRY_FILE")
# =============================================================================

services:
  # PostgreSQL for $instance_code_upper Keycloak
  postgres-$instance_code_lower:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-$instance_code_lower
    environment:
      POSTGRES_DB: $postgres_db
      POSTGRES_USER: $postgres_user
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD_$instance_code_upper:-postgres}
    ports:
      - "$postgres_port:5432"
    volumes:
      - postgres_${instance_code_lower}_data:/var/lib/postgresql/data
    networks:
      - dive-${instance_code_lower}-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $postgres_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Keycloak $instance_code_upper Instance
  keycloak-$instance_code_lower:
    image: quay.io/keycloak/keycloak:latest
    platform: linux/amd64
    container_name: dive-v3-keycloak-$instance_code_lower
    command: start-dev --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true --features=scripts
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-$instance_code_lower:5432/$postgres_db
      KC_DB_USERNAME: $postgres_user
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD_$instance_code_upper:-postgres}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: $admin_password
      KC_HOSTNAME: $(echo "$idp_url" | sed 's|https://||')
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
      - "$keycloak_port:8443"
      - "$keycloak_http_port:8080"
      - "$keycloak_mgmt_port:9000"
    volumes:
      - ../../keycloak/certs:/opt/keycloak/certs:ro
      - ../../keycloak/themes:/opt/keycloak/themes:ro
    depends_on:
      postgres-$instance_code_lower:
        condition: service_healthy
    networks:
      - dive-${instance_code_lower}-network
    healthcheck:
      test: ["CMD-SHELL", "exec 3<>/dev/tcp/localhost/8080 && echo -e 'GET /realms/master HTTP/1.1\\\\r\\\\nHost: localhost\\\\r\\\\n\\\\r\\\\n' >&3 && head -1 <&3 | grep -q 'HTTP/1.1 200'"]
      interval: 30s
      timeout: 10s
      retries: 3

  # MongoDB $instance_code_upper Instance
  mongodb-$instance_code_lower:
    image: mongo:7
    container_name: dive-v3-mongodb-$instance_code_lower
    environment:
      MONGO_INITDB_DATABASE: $mongodb_db
      MONGO_INITDB_ROOT_USERNAME: $mongodb_user
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD_$instance_code_upper:-admin}
    ports:
      - "$mongodb_port:27017"
    volumes:
      - mongodb_${instance_code_lower}_data:/data/db
    networks:
      - dive-${instance_code_lower}-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis $instance_code_upper Instance
  redis-$instance_code_lower:
    image: redis:alpine
    container_name: dive-v3-redis-$instance_code_lower
    restart: unless-stopped
    command: >
      redis-server
      --requirepass $redis_password
      --appendonly yes
      --appendfsync everysec
      --save 300 10
      --maxmemory $redis_maxmemory
      --maxmemory-policy allkeys-lru
    ports:
      - "$redis_port:6379"
    volumes:
      - redis_${instance_code_lower}_data:/data
    networks:
      - dive-${instance_code_lower}-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "$redis_password", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # OPA $instance_code_upper Instance
  opa-$instance_code_lower:
    image: openpolicyagent/opa:latest
    platform: linux/amd64
    container_name: dive-v3-opa-$instance_code_lower
    restart: unless-stopped
    command:
      - "run"
      - "--server"
      - "--addr=0.0.0.0:8181"
      - "--log-level=info"
      - "/policies"
    ports:
      - "$opa_port:8181"
      - "$opa_metrics_port:9181"
    volumes:
      - ../../policies:/policies:ro
    networks:
      - dive-${instance_code_lower}-network
    healthcheck:
      test: ["CMD", "/opa", "version"]
      interval: 10s
      timeout: 5s
      retries: 3

  # KAS $instance_code_upper Instance
  kas-$instance_code_lower:
    image: node:20-alpine
    container_name: dive-v3-kas-$instance_code_lower
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 8080
      OPA_URL: http://opa-$instance_code_lower:8181
      KEYCLOAK_URL: https://keycloak-$instance_code_lower:8443
      KEYCLOAK_REALM: dive-v3-broker
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
    ports:
      - "$kas_port:8080"
    volumes:
      - ../../kas:/app:ro
    networks:
      - dive-${instance_code_lower}-network
    depends_on:
      - opa-$instance_code_lower
      - keycloak-$instance_code_lower
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Backend API $instance_code_upper Instance
  backend-$instance_code_lower:
    image: node:20-alpine
    container_name: dive-v3-backend-$instance_code_lower
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 4000
      MONGODB_URI: mongodb://$mongodb_user:\${MONGO_PASSWORD_$instance_code_upper:-admin}@mongodb-$instance_code_lower:27017/$mongodb_db?authSource=admin
      REDIS_HOST: redis-$instance_code_lower
      REDIS_PORT: 6379
      REDIS_PASSWORD: $redis_password
      OPA_URL: http://opa-$instance_code_lower:8181
      KAS_URL: http://kas-$instance_code_lower:8080
      KEYCLOAK_URL: https://keycloak-$instance_code_lower:8443
      KEYCLOAK_REALM: dive-v3-broker
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
    ports:
      - "$backend_port:4000"
    volumes:
      - ../../backend:/app
      - /app/node_modules
    networks:
      - dive-${instance_code_lower}-network
    depends_on:
      - mongodb-$instance_code_lower
      - redis-$instance_code_lower
      - opa-$instance_code_lower
      - keycloak-$instance_code_lower
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Frontend $instance_code_upper Instance
  frontend-$instance_code_lower:
    image: node:20-alpine
    container_name: dive-v3-frontend-$instance_code_lower
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: $api_url
      NEXT_PUBLIC_APP_URL: $app_url
      NEXTAUTH_URL: $app_url
      NEXTAUTH_SECRET: \${NEXTAUTH_SECRET_$instance_code_upper:-change-me-in-production}
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_CLIENT_SECRET: \${KEYCLOAK_CLIENT_SECRET_$instance_code_upper:-change-me}
      KEYCLOAK_ISSUER: $idp_url/realms/dive-v3-broker
    ports:
      - "$frontend_port:3000"
    volumes:
      - ../../frontend:/app
      - /app/node_modules
      - /app/.next
    networks:
      - dive-${instance_code_lower}-network
    depends_on:
      - backend-$instance_code_lower
      - keycloak-$instance_code_lower
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

networks:
  dive-${instance_code_lower}-network:
    driver: bridge
    name: dive-v3-${instance_code_lower}-network

volumes:
  postgres_${instance_code_lower}_data:
    name: dive-v3-postgres-${instance_code_lower}-data
  mongodb_${instance_code_lower}_data:
    name: dive-v3-mongodb-${instance_code_lower}-data
  redis_${instance_code_lower}_data:
    name: dive-v3-redis-${instance_code_lower}-data
EOF
    
    log_success "Generated: $output_file"
    return 0
}

# Main execution
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  DIVE V3 Docker Compose Generator"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    if [ $# -eq 0 ]; then
        log_error "Usage: $0 <instance_code>"
        log_error "Example: $0 usa"
        echo ""
        log_info "Available instances:"
        jq -r '.instances | keys[] | "  - \(.)"' "$REGISTRY_FILE"
        echo ""
        exit 1
    fi
    
    # Validate registry
    validate_registry
    
    # Generate for specified instance
    local instance_code=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    generate_docker_compose "$instance_code"
    
    echo ""
    log_success "Docker Compose generation complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Review generated file in $OUTPUT_DIR/$instance_code/"
    echo "  2. Run: cd $OUTPUT_DIR/$instance_code"
    echo "  3. Run: docker-compose up -d"
    echo ""
}

# Run main function
main "$@"

