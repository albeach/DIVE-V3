#!/bin/bash
#
# DIVE V3 - Unified Multi-Instance Deployment Script
#
# Deploys a DIVE V3 instance for any country using ISO 3166-1 alpha-3 codes.
# Handles certificates, Cloudflare tunnels, Docker services, and Keycloak sync.
#
# Usage:
#   ./scripts/deploy-instance.sh <COUNTRY_CODE> [OPTIONS]
#
# Examples:
#   ./scripts/deploy-instance.sh usa              # Deploy USA (primary) instance
#   ./scripts/deploy-instance.sh fra              # Deploy France instance
#   ./scripts/deploy-instance.sh deu --skip-sync  # Deploy Germany without Keycloak sync
#
# Options:
#   --skip-tunnel    Skip Cloudflare tunnel setup
#   --skip-sync      Skip Keycloak realm sync (use for primary instance)
#   --skip-certs     Skip certificate generation
#   --primary        Mark this as the primary instance (applies Terraform)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
COUNTRY_CODE=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')
shift || true

SKIP_TUNNEL=false
SKIP_SYNC=false
SKIP_CERTS=false
IS_PRIMARY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-tunnel) SKIP_TUNNEL=true ;;
    --skip-sync) SKIP_SYNC=true ;;
    --skip-certs) SKIP_CERTS=true ;;
    --primary) IS_PRIMARY=true ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

# Validate country code
if [[ -z "$COUNTRY_CODE" ]]; then
  echo -e "${RED}Error: Country code required${NC}"
  echo "Usage: $0 <COUNTRY_CODE> [OPTIONS]"
  echo "Example: $0 usa --primary"
  exit 1
fi

# Country code must be 3 letters
if [[ ! "$COUNTRY_CODE" =~ ^[a-z]{3}$ ]]; then
  echo -e "${RED}Error: Country code must be 3 lowercase letters (ISO 3166-1 alpha-3)${NC}"
  exit 1
fi

# Configuration based on country code
COUNTRY_UPPER=$(echo "$COUNTRY_CODE" | tr '[:lower:]' '[:upper:]')
INSTANCE_NAME="dive-v3-${COUNTRY_CODE}"

# Port mapping (USA is base, others offset)
case "$COUNTRY_CODE" in
  usa)
    FRONTEND_PORT=3000
    BACKEND_PORT=4000
    KEYCLOAK_HTTPS_PORT=8443
    KEYCLOAK_HTTP_PORT=8081
    KAS_PORT=8080
    MONGO_PORT=27017
    POSTGRES_PORT=5433
    REDIS_PORT=6379
    OPA_PORT=8181
    IS_PRIMARY=true  # USA is always primary
    SKIP_SYNC=true   # Primary doesn't sync from itself
    ;;
  fra)
    FRONTEND_PORT=3001
    BACKEND_PORT=4001
    KEYCLOAK_HTTPS_PORT=8444
    KEYCLOAK_HTTP_PORT=8082
    KAS_PORT=8083
    MONGO_PORT=27018
    POSTGRES_PORT=5434
    REDIS_PORT=6380
    OPA_PORT=8182
    ;;
  deu)
    FRONTEND_PORT=3002
    BACKEND_PORT=4002
    KEYCLOAK_HTTPS_PORT=8445
    KEYCLOAK_HTTP_PORT=8084
    KAS_PORT=8085
    MONGO_PORT=27019
    POSTGRES_PORT=5435
    REDIS_PORT=6381
    OPA_PORT=8183
    ;;
  gbr)
    FRONTEND_PORT=3003
    BACKEND_PORT=4003
    KEYCLOAK_HTTPS_PORT=8446
    KEYCLOAK_HTTP_PORT=8086
    KAS_PORT=8087
    MONGO_PORT=27020
    POSTGRES_PORT=5436
    REDIS_PORT=6382
    OPA_PORT=8184
    ;;
  *)
    # Dynamic port assignment for other countries
    # Hash the country code to get a consistent offset (1-99)
    OFFSET=$(echo -n "$COUNTRY_CODE" | md5sum | tr -d -c '0-9' | cut -c1-2)
    OFFSET=$((10#$OFFSET % 90 + 10))  # Range 10-99
    FRONTEND_PORT=$((3000 + OFFSET))
    BACKEND_PORT=$((4000 + OFFSET))
    KEYCLOAK_HTTPS_PORT=$((8443 + OFFSET))
    KEYCLOAK_HTTP_PORT=$((8080 + OFFSET))
    KAS_PORT=$((8080 + OFFSET + 1))
    MONGO_PORT=$((27017 + OFFSET))
    POSTGRES_PORT=$((5432 + OFFSET))
    REDIS_PORT=$((6379 + OFFSET))
    OPA_PORT=$((8181 + OFFSET))
    ;;
esac

# Cloudflare hostnames
APP_HOSTNAME="${COUNTRY_CODE}-app.dive25.com"
API_HOSTNAME="${COUNTRY_CODE}-api.dive25.com"
IDP_HOSTNAME="${COUNTRY_CODE}-idp.dive25.com"
KAS_HOSTNAME="${COUNTRY_CODE}-kas.dive25.com"

# Primary instance settings (for sync source)
PRIMARY_CODE="usa"
PRIMARY_KEYCLOAK_PORT=8443

echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}  DIVE V3 - Unified Instance Deployment${NC}"
echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Instance Configuration:${NC}"
echo "  Country Code:    ${COUNTRY_UPPER}"
echo "  Instance Name:   ${INSTANCE_NAME}"
echo "  Is Primary:      ${IS_PRIMARY}"
echo ""
echo -e "${CYAN}Ports:${NC}"
echo "  Frontend:        ${FRONTEND_PORT}"
echo "  Backend:         ${BACKEND_PORT}"
echo "  Keycloak HTTPS:  ${KEYCLOAK_HTTPS_PORT}"
echo "  KAS:             ${KAS_PORT}"
echo ""
echo -e "${CYAN}Cloudflare Hostnames:${NC}"
echo "  App:             ${APP_HOSTNAME}"
echo "  API:             ${API_HOSTNAME}"
echo "  IdP:             ${IDP_HOSTNAME}"
echo ""

# Step counter
STEP=0
TOTAL_STEPS=9

# ============================================================================
# Step 1: Generate Certificates
# ============================================================================
((STEP++))
if [[ "$SKIP_CERTS" == "false" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Generating SSL certificates...${NC}"
  if [[ -f "$SCRIPT_DIR/generate-dev-certs.sh" ]]; then
    "$SCRIPT_DIR/generate-dev-certs.sh" "$APP_HOSTNAME" "$API_HOSTNAME" "$IDP_HOSTNAME" "$KAS_HOSTNAME" > /dev/null 2>&1
    echo -e "${GREEN}✓ Certificates generated${NC}"
  else
    echo -e "${YELLOW}⚠ Certificate generator not found, using existing certs${NC}"
  fi
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping certificate generation${NC}"
fi

# ============================================================================
# Step 2: Setup Cloudflare Tunnel
# ============================================================================
((STEP++))
if [[ "$SKIP_TUNNEL" == "false" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Setting up Cloudflare tunnel...${NC}"
  
  TUNNEL_NAME="dive-v3-${COUNTRY_CODE}"
  TUNNEL_CONFIG="$HOME/.cloudflared/${TUNNEL_NAME}-config.yml"
  
  # Check if tunnel exists
  if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
    TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
    echo -e "${YELLOW}✓ Tunnel '${TUNNEL_NAME}' already exists (${TUNNEL_ID})${NC}"
  else
    echo "  Creating tunnel '${TUNNEL_NAME}'..."
    TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
    TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
    
    if [[ -z "$TUNNEL_ID" ]]; then
      echo -e "${RED}✗ Failed to create tunnel${NC}"
      echo "$TUNNEL_OUTPUT"
    else
      echo -e "${GREEN}✓ Created tunnel: ${TUNNEL_ID}${NC}"
    fi
  fi
  
  # Add DNS routes
  if [[ -n "$TUNNEL_ID" ]]; then
    echo "  Adding DNS routes..."
    cloudflared tunnel route dns "$TUNNEL_NAME" "$APP_HOSTNAME" 2>/dev/null || true
    cloudflared tunnel route dns "$TUNNEL_NAME" "$API_HOSTNAME" 2>/dev/null || true
    cloudflared tunnel route dns "$TUNNEL_NAME" "$IDP_HOSTNAME" 2>/dev/null || true
    cloudflared tunnel route dns "$TUNNEL_NAME" "$KAS_HOSTNAME" 2>/dev/null || true
    
    # Create tunnel config
    mkdir -p "$HOME/.cloudflared"
    cat > "$TUNNEL_CONFIG" << EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${HOME}/.cloudflared/${TUNNEL_ID}.json

ingress:
  # ${COUNTRY_UPPER} Frontend
  - hostname: ${APP_HOSTNAME}
    service: https://localhost:${FRONTEND_PORT}
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # ${COUNTRY_UPPER} Backend API
  - hostname: ${API_HOSTNAME}
    service: https://localhost:${BACKEND_PORT}
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # ${COUNTRY_UPPER} Keycloak IdP
  - hostname: ${IDP_HOSTNAME}
    service: https://localhost:${KEYCLOAK_HTTPS_PORT}
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # ${COUNTRY_UPPER} KAS
  - hostname: ${KAS_HOSTNAME}
    service: http://localhost:${KAS_PORT}
    originRequest:
      connectTimeout: 30s
  
  # Catch-all
  - service: http_status:404
EOF
    echo -e "${GREEN}✓ Tunnel configuration created${NC}"
  fi
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping Cloudflare tunnel setup${NC}"
fi

# ============================================================================
# Step 3: Generate Docker Compose Override
# ============================================================================
((STEP++))
echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Generating Docker Compose configuration...${NC}"

COMPOSE_FILE="$PROJECT_ROOT/docker-compose.${COUNTRY_CODE}.yml"

# For USA, use the main docker-compose.yml
if [[ "$COUNTRY_CODE" == "usa" ]]; then
  COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
  echo -e "${GREEN}✓ Using main docker-compose.yml for USA${NC}"
else
  # Generate instance-specific docker-compose
  cat > "$COMPOSE_FILE" << EOF
# DIVE V3 - ${COUNTRY_UPPER} Instance
# Auto-generated by deploy-instance.sh
# DO NOT EDIT MANUALLY - regenerate with: ./scripts/deploy-instance.sh ${COUNTRY_CODE}

version: '3.8'

services:
  postgres-${COUNTRY_CODE}:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-${COUNTRY_CODE}
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - postgres_${COUNTRY_CODE}_data:/var/lib/postgresql/data
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb-${COUNTRY_CODE}:
    image: mongo:7
    container_name: dive-v3-mongodb-${COUNTRY_CODE}
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
    ports:
      - "${MONGO_PORT}:27017"
    volumes:
      - mongodb_${COUNTRY_CODE}_data:/data/db
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-${COUNTRY_CODE}:
    image: redis:alpine
    container_name: dive-v3-redis-${COUNTRY_CODE}
    ports:
      - "${REDIS_PORT}:6379"
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  keycloak-${COUNTRY_CODE}:
    image: quay.io/keycloak/keycloak:latest
    container_name: dive-v3-keycloak-${COUNTRY_CODE}
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-${COUNTRY_CODE}:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_HOSTNAME: ${IDP_HOSTNAME}
      KC_HOSTNAME_STRICT: false
      KC_PROXY_HEADERS: xforwarded
      KC_HTTP_ENABLED: true
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HTTPS_PORT: 8443
    ports:
      - "${KEYCLOAK_HTTPS_PORT}:8443"
      - "${KEYCLOAK_HTTP_PORT}:8080"
    volumes:
      - ./keycloak/certs:/opt/keycloak/certs:ro
    depends_on:
      postgres-${COUNTRY_CODE}:
        condition: service_healthy
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  opa-${COUNTRY_CODE}:
    image: openpolicyagent/opa:latest
    container_name: dive-v3-opa-${COUNTRY_CODE}
    command: run --server --addr :8181 /policies
    ports:
      - "${OPA_PORT}:8181"
    volumes:
      - ./policies:/policies:ro
    networks:
      - dive-${COUNTRY_CODE}-network

  backend-${COUNTRY_CODE}:
    image: node:20-alpine
    container_name: dive-v3-backend-${COUNTRY_CODE}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 4000
      INSTANCE_REALM: ${COUNTRY_UPPER}
      MONGODB_URI: mongodb://admin:admin@mongodb-${COUNTRY_CODE}:27017/dive-v3-${COUNTRY_CODE}?authSource=admin
      REDIS_URL: redis://redis-${COUNTRY_CODE}:6379
      OPA_URL: http://opa-${COUNTRY_CODE}:8181
      KEYCLOAK_URL: https://keycloak-${COUNTRY_CODE}:8443
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_ADMIN_USER: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
      FEDERATION_ALLOWED_ORIGINS: https://${APP_HOSTNAME},https://localhost:${FRONTEND_PORT}
    ports:
      - "${BACKEND_PORT}:4000"
    volumes:
      - ./backend:/app
      - ./keycloak/certs:/opt/keycloak/certs:ro
    depends_on:
      - mongodb-${COUNTRY_CODE}
      - redis-${COUNTRY_CODE}
      - opa-${COUNTRY_CODE}
      - keycloak-${COUNTRY_CODE}
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend-${COUNTRY_CODE}:
    image: node:20-alpine
    container_name: dive-v3-frontend-${COUNTRY_CODE}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: https://${API_HOSTNAME}
      NEXT_PUBLIC_BACKEND_URL: https://${API_HOSTNAME}
      NEXT_PUBLIC_KEYCLOAK_URL: https://${IDP_HOSTNAME}
      NEXT_PUBLIC_KEYCLOAK_REALM: dive-v3-broker
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      NEXT_PUBLIC_INSTANCE: ${COUNTRY_UPPER}
      NEXTAUTH_URL: https://${APP_HOSTNAME}
      NEXTAUTH_SECRET: ${COUNTRY_CODE}-frontend-secret-change-in-production
      KEYCLOAK_CLIENT_ID: dive-v3-client-broker
      KEYCLOAK_REALM: dive-v3-broker
      KEYCLOAK_URL: https://keycloak-${COUNTRY_CODE}:8443
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
      # NextAuth.js Database Adapter - CRITICAL for session persistence
      DATABASE_URL: postgresql://keycloak:keycloak@postgres-${COUNTRY_CODE}:5432/dive_v3_app
    ports:
      - "${FRONTEND_PORT}:3000"
    volumes:
      - ./frontend:/app
      - ./keycloak/certs:/opt/app/certs:ro
    depends_on:
      postgres-${COUNTRY_CODE}:
        condition: service_healthy
      backend-${COUNTRY_CODE}:
        condition: service_started
    networks:
      - dive-${COUNTRY_CODE}-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  kas-${COUNTRY_CODE}:
    image: node:20-alpine
    container_name: dive-v3-kas-${COUNTRY_CODE}
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    environment:
      NODE_ENV: development
      PORT: 8080
      KEYCLOAK_URL: https://keycloak-${COUNTRY_CODE}:8443
      KEYCLOAK_REALM: dive-v3-broker
      OPA_URL: http://opa-${COUNTRY_CODE}:8181
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
    ports:
      - "${KAS_PORT}:8080"
    volumes:
      - ./kas:/app
    depends_on:
      - keycloak-${COUNTRY_CODE}
      - opa-${COUNTRY_CODE}
    networks:
      - dive-${COUNTRY_CODE}-network

networks:
  dive-${COUNTRY_CODE}-network:
    name: dive-${COUNTRY_CODE}-network
    driver: bridge

volumes:
  postgres_${COUNTRY_CODE}_data:
  mongodb_${COUNTRY_CODE}_data:
EOF
  echo -e "${GREEN}✓ Generated ${COMPOSE_FILE}${NC}"
fi

# ============================================================================
# Step 4: Apply Terraform (Primary only)
# ============================================================================
((STEP++))
if [[ "$IS_PRIMARY" == "true" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Applying Terraform (primary instance)...${NC}"
  cd "$PROJECT_ROOT/terraform"
  
  # Update tfvars with correct URLs
  cat > terraform.tfvars << EOF
# DIVE V3 Terraform Configuration
# ${COUNTRY_UPPER} Instance (Primary)
# Auto-generated by deploy-instance.sh

keycloak_url            = "https://localhost:${KEYCLOAK_HTTPS_PORT}"
keycloak_admin_username = "admin"
keycloak_admin_password = "admin"
keycloak_public_url     = "https://${IDP_HOSTNAME}"

realm_name = "dive-v3-broker"
client_id  = "dive-v3-client-broker"
app_url    = "https://localhost:${FRONTEND_PORT}"

cloudflare_app_url = "https://${APP_HOSTNAME}"
cloudflare_api_url = "https://${API_HOSTNAME}"
cloudflare_idp_url = "https://${IDP_HOSTNAME}"

create_test_users = true
EOF
  
  terraform init -upgrade > /dev/null 2>&1
  terraform apply -auto-approve > /dev/null 2>&1 && \
    echo -e "${GREEN}✓ Terraform applied${NC}" || \
    echo -e "${YELLOW}⚠ Terraform apply had warnings${NC}"
  cd "$PROJECT_ROOT"
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping Terraform (non-primary instance)${NC}"
fi

# ============================================================================
# Step 5: Start Docker Services
# ============================================================================
((STEP++))
echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Starting Docker services...${NC}"

cd "$PROJECT_ROOT"

if [[ "$COUNTRY_CODE" == "usa" ]]; then
  docker-compose up -d
else
  docker-compose -p "$COUNTRY_CODE" -f "$COMPOSE_FILE" up -d
fi

echo "  Waiting for services to start..."
sleep 30
echo -e "${GREEN}✓ Docker services started${NC}"

# ============================================================================
# Step 5b: Initialize NextAuth Database Schema
# ============================================================================
echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Initializing NextAuth database schema...${NC}"

POSTGRES_CONTAINER="dive-v3-postgres-${COUNTRY_CODE}"

# Wait for PostgreSQL to be ready
echo "  Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U keycloak > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Create the NextAuth app database (separate from Keycloak's database)
echo "  Creating NextAuth application database..."
docker exec "$POSTGRES_CONTAINER" psql -U keycloak -c "CREATE DATABASE dive_v3_app;" 2>/dev/null || echo "    (database may already exist)"

# Create NextAuth schema tables
echo "  Creating NextAuth schema tables..."
docker exec "$POSTGRES_CONTAINER" psql -U keycloak -d dive_v3_app << 'ENDSQL' 2>/dev/null
-- NextAuth.js Drizzle Adapter Schema
-- Required for session persistence and account linking

CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT,
    "emailVerified" TIMESTAMP,
    image TEXT
);

CREATE TABLE IF NOT EXISTS account (
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS session (
    "sessionToken" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    PRIMARY KEY (identifier, token)
);
ENDSQL

# Verify tables were created
TABLE_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U keycloak -d dive_v3_app -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
if [[ "$TABLE_COUNT" -ge 4 ]]; then
  echo -e "${GREEN}✓ NextAuth database schema initialized (${TABLE_COUNT} tables)${NC}"
else
  echo -e "${YELLOW}⚠ NextAuth schema may be incomplete (${TABLE_COUNT} tables found)${NC}"
fi

# ============================================================================
# Step 6: Sync Keycloak Realm (Non-primary only)
# ============================================================================
((STEP++))
if [[ "$SKIP_SYNC" == "false" && "$IS_PRIMARY" == "false" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Syncing Keycloak realm from primary...${NC}"
  
  # Wait for Keycloak to be ready
  echo "  Waiting for Keycloak to be ready..."
  for i in {1..30}; do
    if curl -sk "https://localhost:${KEYCLOAK_HTTPS_PORT}/realms/master" > /dev/null 2>&1; then
      break
    fi
    sleep 5
  done
  
  # Run sync script
  if [[ -f "$SCRIPT_DIR/sync-keycloak-realm.sh" ]]; then
    "$SCRIPT_DIR/sync-keycloak-realm.sh" "$PRIMARY_CODE" "$COUNTRY_CODE"
    echo -e "${GREEN}✓ Keycloak realm synced${NC}"
  else
    echo -e "${YELLOW}⚠ Sync script not found, manual sync required${NC}"
  fi
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping Keycloak sync${NC}"
fi

# ============================================================================
# Step 7: Start Cloudflare Tunnel
# ============================================================================
((STEP++))
if [[ "$SKIP_TUNNEL" == "false" && -f "$TUNNEL_CONFIG" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Starting Cloudflare tunnel...${NC}"
  
  # Kill existing tunnel for this instance
  pkill -f "${TUNNEL_NAME}-config" 2>/dev/null || true
  sleep 2
  
  # Start tunnel
  nohup cloudflared tunnel --config "$TUNNEL_CONFIG" run "$TUNNEL_NAME" > "/tmp/${TUNNEL_NAME}.log" 2>&1 &
  sleep 3
  
  if ps aux | grep -q "[c]loudflared.*${TUNNEL_NAME}"; then
    echo -e "${GREEN}✓ Tunnel started${NC}"
  else
    echo -e "${YELLOW}⚠ Tunnel may not have started, check /tmp/${TUNNEL_NAME}.log${NC}"
  fi
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping tunnel start${NC}"
fi

# ============================================================================
# Step 8: Synchronize Federation Client Secrets
# ============================================================================
((STEP++))
if [[ "$SKIP_SYNC" == "false" && "$IS_PRIMARY" == "false" ]]; then
  echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}] Synchronizing federation client secrets...${NC}"
  
  # Get admin token for this instance
  LOCAL_TOKEN=$(curl -sk -X POST "https://localhost:${KEYCLOAK_HTTPS_PORT}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=admin" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
  
  if [[ -n "$LOCAL_TOKEN" && "$LOCAL_TOKEN" != "null" ]]; then
    echo "  ✓ Got local admin token"
    
    # Create incoming federation clients for other instances to connect to this one
    for PARTNER in usa fra deu gbr; do
      if [[ "$PARTNER" != "$COUNTRY_CODE" ]]; then
        PARTNER_UPPER=$(echo "$PARTNER" | tr '[:lower:]' '[:upper:]')
        CLIENT_ID="dive-v3-${PARTNER}-federation"
        
        # Check if client already exists
        CLIENT_EXISTS=$(curl -sk "https://localhost:${KEYCLOAK_HTTPS_PORT}/admin/realms/dive-v3-broker/clients?clientId=${CLIENT_ID}" \
          -H "Authorization: Bearer $LOCAL_TOKEN" 2>/dev/null | grep -c "\"id\"")
        
        if [[ "$CLIENT_EXISTS" -eq 0 ]]; then
          echo "  Creating federation client for ${PARTNER_UPPER}..."
          
          # Determine partner's IdP URL
          case "$PARTNER" in
            usa) PARTNER_IDP="https://usa-idp.dive25.com" ;;
            fra) PARTNER_IDP="https://fra-idp.dive25.com" ;;
            deu) PARTNER_IDP="https://deu-idp.prosecurity.biz" ;;
            gbr) PARTNER_IDP="https://gbr-idp.dive25.com" ;;
          esac
          
          CLIENT_JSON="{
            \"clientId\": \"${CLIENT_ID}\",
            \"name\": \"Federation Client - ${PARTNER_UPPER}\",
            \"enabled\": true,
            \"protocol\": \"openid-connect\",
            \"publicClient\": false,
            \"standardFlowEnabled\": true,
            \"implicitFlowEnabled\": false,
            \"directAccessGrantsEnabled\": false,
            \"serviceAccountsEnabled\": false,
            \"redirectUris\": [
              \"${PARTNER_IDP}/realms/dive-v3-broker/broker/${COUNTRY_CODE}-federation/endpoint\",
              \"${PARTNER_IDP}/realms/dive-v3-broker/broker/${COUNTRY_CODE}-federation/endpoint/*\"
            ],
            \"webOrigins\": [\"${PARTNER_IDP}\"],
            \"attributes\": {
              \"access.token.lifespan\": \"300\"
            }
          }"
          
          HTTP_CODE=$(curl -sk -w "%{http_code}" -o /dev/null -X POST \
            "https://localhost:${KEYCLOAK_HTTPS_PORT}/admin/realms/dive-v3-broker/clients" \
            -H "Authorization: Bearer $LOCAL_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$CLIENT_JSON" 2>/dev/null)
          
          if [[ "$HTTP_CODE" == "201" ]]; then
            echo -e "    ${GREEN}✓ Created ${CLIENT_ID}${NC}"
          else
            echo -e "    ${YELLOW}⚠ Failed to create ${CLIENT_ID} (HTTP ${HTTP_CODE})${NC}"
          fi
        else
          echo "  ✓ Federation client for ${PARTNER_UPPER} already exists"
        fi
      fi
    done
    
    echo -e "${GREEN}✓ Federation clients configured${NC}"
    echo -e "${YELLOW}⚠ Note: You must manually sync client secrets with partner instances${NC}"
    echo "  Run: ./scripts/sync-federation-secrets.sh ${COUNTRY_CODE}"
  else
    echo -e "${YELLOW}⚠ Could not get admin token, skipping federation setup${NC}"
  fi
else
  echo -e "${YELLOW}[${STEP}/${TOTAL_STEPS}] Skipping federation client setup (primary instance)${NC}"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ ${COUNTRY_UPPER} Instance Deployed Successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Local URLs:${NC}"
echo "  Frontend:  https://localhost:${FRONTEND_PORT}"
echo "  Backend:   https://localhost:${BACKEND_PORT}"
echo "  Keycloak:  https://localhost:${KEYCLOAK_HTTPS_PORT}"
echo ""
echo -e "${CYAN}Cloudflare URLs:${NC}"
echo "  Frontend:  https://${APP_HOSTNAME}"
echo "  Backend:   https://${API_HOSTNAME}"
echo "  Keycloak:  https://${IDP_HOSTNAME}"
echo ""
echo -e "${CYAN}Commands:${NC}"
if [[ "$COUNTRY_CODE" == "usa" ]]; then
  echo "  Logs:      docker-compose logs -f"
  echo "  Stop:      docker-compose down"
  echo "  Restart:   docker-compose restart"
else
  echo "  Logs:      docker-compose -p ${COUNTRY_CODE} -f docker-compose.${COUNTRY_CODE}.yml logs -f"
  echo "  Stop:      docker-compose -p ${COUNTRY_CODE} -f docker-compose.${COUNTRY_CODE}.yml down"
  echo "  Restart:   docker-compose -p ${COUNTRY_CODE} -f docker-compose.${COUNTRY_CODE}.yml restart"
fi
echo ""

