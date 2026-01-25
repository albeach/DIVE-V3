#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Template Generation Module (Consolidated)
# =============================================================================
# Configuration template generation for Docker Compose and environment files
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Extracted from:
#   - spoke/pipeline/spoke-compose-generator.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_CONFIGURATION_TEMPLATES_LOADED" ] && return 0
export DIVE_CONFIGURATION_TEMPLATES_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIG_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CONFIG_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# TEMPLATE GENERATION
# =============================================================================

##
# Generate Docker Compose file from template
#
# Arguments:
#   $1 - Instance code
#   $2 - Output directory
#   $3 - Template file (optional, uses default)
##
generate_compose_file() {
    local instance_code="$1"
    local output_dir="$2"
    local template="${3:-}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Get ports
    local ports=$(get_instance_ports "$code_upper" 2>/dev/null || echo '{}')
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local be_port=$(echo "$ports" | jq -r '.backend // 4000')
    local fe_port=$(echo "$ports" | jq -r '.frontend // 3000')
    local pg_port=$(echo "$ports" | jq -r '.postgres // 5432')
    local mongo_port=$(echo "$ports" | jq -r '.mongodb // 27017')

    log_info "Generating docker-compose.yml for $code_upper..."

    mkdir -p "$output_dir"

    cat > "${output_dir}/docker-compose.yml" << EOF
# =============================================================================
# DIVE V3 - Spoke ${code_upper} Docker Compose
# =============================================================================
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Instance: ${code_upper}
# =============================================================================

version: '3.8'

name: dive-spoke-${code_lower}

services:
  postgres:
    image: postgres:15-alpine
    container_name: dive-spoke-${code_lower}-postgres
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${pg_port}:5432"
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  mongodb:
    image: mongo:7
    container_name: dive-spoke-${code_lower}-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: \${MONGODB_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    ports:
      - "${mongo_port}:27017"
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: dive-spoke-${code_lower}-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: dive-spoke-${code_lower}-keycloak
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD}
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD}
      KC_HOSTNAME: localhost
      KC_HOSTNAME_PORT: ${kc_port}
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HEALTH_ENABLED: true
      KC_METRICS_ENABLED: true
    command: start --optimized
    volumes:
      - ./certs:/opt/keycloak/certs:ro
    ports:
      - "${kc_port}:8443"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8080/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 120s

  backend:
    image: dive-backend:latest
    container_name: dive-spoke-${code_lower}-backend
    environment:
      NODE_ENV: production
      INSTANCE_CODE: ${code_upper}
      KEYCLOAK_URL: https://keycloak:8443
      KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      MONGODB_URL: mongodb://admin:\${MONGODB_PASSWORD}@mongodb:27017/dive?authSource=admin
      POSTGRES_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@postgres:5432/keycloak
      OPA_URL: http://opa:8181
      REDIS_URL: redis://redis:6379
    ports:
      - "${be_port}:4000"
    depends_on:
      keycloak:
        condition: service_healthy
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  frontend:
    image: dive-frontend:latest
    container_name: dive-spoke-${code_lower}-frontend
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_INSTANCE_CODE: ${code_upper}
      NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:${kc_port}
      NEXT_PUBLIC_KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      NEXT_PUBLIC_API_URL: http://localhost:${be_port}
      AUTH_SECRET: \${AUTH_SECRET}
    ports:
      - "${fe_port}:3000"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  opa:
    image: openpolicyagent/opa:0.68.0
    container_name: dive-spoke-${code_lower}-opa
    command: run --server --addr=0.0.0.0:8181
    networks:
      - dive-shared
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  opal-client:
    image: permitio/opal-client:latest
    container_name: dive-spoke-${code_lower}-opal-client
    environment:
      OPAL_SERVER_URL: http://dive-hub-opal-server:7002
      OPAL_CLIENT_TOKEN: \${OPAL_CLIENT_TOKEN:-}
      OPAL_INLINE_OPA_ENABLED: true
    depends_on:
      opa:
        condition: service_healthy
    networks:
      - dive-shared

volumes:
  postgres_data:
  mongodb_data:
  redis_data:

networks:
  dive-shared:
    external: true
EOF

    log_success "Generated docker-compose.yml for $code_upper"
    return 0
}

##
# Generate .env file from template
#
# Arguments:
#   $1 - Instance code
#   $2 - Output directory
##
generate_env_file() {
    local instance_code="$1"
    local output_dir="$2"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_info "Generating .env for $code_upper..."

    mkdir -p "$output_dir"

    # Try to load secrets from GCP, fallback to generated
    local postgres_pass=""
    local mongodb_pass=""
    local keycloak_pass=""
    local auth_secret=""

    if type get_postgres_password &>/dev/null; then
        postgres_pass=$(get_postgres_password "$code_upper" 2>/dev/null)
        mongodb_pass=$(get_mongodb_password "$code_upper" 2>/dev/null)
        keycloak_pass=$(get_keycloak_admin_password "$code_upper" 2>/dev/null)
        auth_secret=$(get_auth_secret "$code_upper" 2>/dev/null)
    fi

    # Generate if not from GCP
    [ -z "$postgres_pass" ] && postgres_pass=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)
    [ -z "$mongodb_pass" ] && mongodb_pass=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)
    [ -z "$keycloak_pass" ] && keycloak_pass=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)
    [ -z "$auth_secret" ] && auth_secret=$(openssl rand -base64 32)

    cat > "${output_dir}/.env" << EOF
# =============================================================================
# DIVE V3 - Spoke ${code_upper} Environment
# =============================================================================
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Instance: ${code_upper}
# =============================================================================

# Instance configuration
INSTANCE_CODE=${code_upper}
COMPOSE_PROJECT_NAME=dive-spoke-${code_lower}

# Database credentials
POSTGRES_PASSWORD=${postgres_pass}
MONGODB_PASSWORD=${mongodb_pass}

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=${keycloak_pass}

# NextAuth
AUTH_SECRET=${auth_secret}

# Hub connection
HUB_URL=https://localhost:8443

# Feature flags
OPAL_ENABLED=true
KAS_ENABLED=false
EOF

    chmod 600 "${output_dir}/.env"
    log_success "Generated .env for $code_upper"
    return 0
}

##
# Generate instance configuration file
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
#   $3 - Output directory
##
generate_config_file() {
    local instance_code="$1"
    local instance_name="${2:-$instance_code Instance}"
    local output_dir="$3"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    local ports=$(get_instance_ports "$code_upper" 2>/dev/null || echo '{}')

    log_info "Generating config.json for $code_upper..."

    mkdir -p "$output_dir"

    cat > "${output_dir}/config.json" << EOF
{
  "instance_code": "${code_upper}",
  "instance_name": "${instance_name}",
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "5.0.0",
  "ports": $(echo "$ports" | jq -c '.'),
  "realm": "dive-v3-broker-${code_lower}",
  "hub_url": "https://localhost:8443",
  "federation": {
    "enabled": true,
    "hub_registered": false
  }
}
EOF

    log_success "Generated config.json for $code_upper"
    return 0
}

##
# Generate all configuration files for a spoke
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
##
generate_all_configs() {
    local instance_code="$1"
    local instance_name="${2:-}"
    local code_lower=$(lower "$instance_code")

    local output_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Generating all configuration files for $instance_code..."

    mkdir -p "${output_dir}/certs"
    mkdir -p "${output_dir}/config"

    generate_config_file "$instance_code" "$instance_name" "$output_dir"
    generate_env_file "$instance_code" "$output_dir"
    generate_compose_file "$instance_code" "$output_dir"

    log_success "All configuration files generated for $instance_code"
    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f generate_compose_file
export -f generate_env_file
export -f generate_config_file
export -f generate_all_configs

log_verbose "Templates module loaded"
