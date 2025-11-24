#!/bin/bash

###############################################################################################
# Partner Instance Generator Script
# 
# Purpose: Generate a new partner instance configuration based on FRA template
#          Ready for DEU, CAN, GBR, or other coalition partners
#
# Usage: ./scripts/generate-partner-instance.sh --country DEU --clearance-map deu-clearance.json
#
# This script creates all necessary configuration files, scripts, and documentation
# for deploying a new partner instance based on the proven FRA architecture.
###############################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_SOURCE="$PROJECT_ROOT/docs/fra-rollout"

# Default values
COUNTRY_CODE=""
COUNTRY_NAME=""
CLEARANCE_MAP_FILE=""
DOMAIN="dive25.com"
START_PORT=3002  # Increment from FRA's 3001
OUTPUT_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --country)
      COUNTRY_CODE="$2"
      shift 2
      ;;
    --clearance-map)
      CLEARANCE_MAP_FILE="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --country CODE [--clearance-map FILE] [--domain DOMAIN] [--output DIR]"
      echo ""
      echo "Options:"
      echo "  --country CODE        ISO 3166-1 alpha-3 country code (e.g., DEU, CAN, GBR)"
      echo "  --clearance-map FILE  JSON file with clearance term mappings"
      echo "  --domain DOMAIN       Base domain (default: dive25.com)"
      echo "  --output DIR          Output directory (default: ./deployments/CODE-instance)"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate country code
if [ -z "$COUNTRY_CODE" ]; then
  echo -e "${RED}ERROR: --country is required${NC}"
  exit 1
fi

# Set country name based on code
case $COUNTRY_CODE in
  DEU)
    COUNTRY_NAME="Germany"
    DEFAULT_CLEARANCES='{"OFFEN": "UNCLASSIFIED", "VS-NUR_FÜR_DEN_DIENSTGEBRAUCH": "CONFIDENTIAL", "VS-VERTRAULICH": "SECRET", "STRENG_GEHEIM": "TOP_SECRET"}'
    DEFAULT_LANGUAGE="de"
    ;;
  CAN)
    COUNTRY_NAME="Canada"
    DEFAULT_CLEARANCES='{"UNCLASSIFIED": "UNCLASSIFIED", "PROTECTED": "CONFIDENTIAL", "SECRET": "SECRET", "TOP_SECRET": "TOP_SECRET"}'
    DEFAULT_LANGUAGE="en"
    ;;
  GBR)
    COUNTRY_NAME="United Kingdom"
    DEFAULT_CLEARANCES='{"OFFICIAL": "UNCLASSIFIED", "OFFICIAL-SENSITIVE": "CONFIDENTIAL", "SECRET": "SECRET", "TOP_SECRET": "TOP_SECRET"}'
    DEFAULT_LANGUAGE="en"
    ;;
  *)
    COUNTRY_NAME="$COUNTRY_CODE"
    DEFAULT_CLEARANCES='{"UNCLASSIFIED": "UNCLASSIFIED", "CONFIDENTIAL": "CONFIDENTIAL", "SECRET": "SECRET", "TOP_SECRET": "TOP_SECRET"}'
    DEFAULT_LANGUAGE="en"
    ;;
esac

# Convert to lowercase for URLs
COUNTRY_LOWER=$(echo "$COUNTRY_CODE" | tr '[:upper:]' '[:lower:]')

# Set output directory
if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="$PROJECT_ROOT/deployments/${COUNTRY_CODE}-instance"
fi

echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}  Partner Instance Generator${NC}"
echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo "  Country Code: $COUNTRY_CODE"
echo "  Country Name: $COUNTRY_NAME"
echo "  Domain: $DOMAIN"
echo "  Language: $DEFAULT_LANGUAGE"
echo "  Output: $OUTPUT_DIR"
echo ""

###############################################################################################
# Step 1: Create Directory Structure
###############################################################################################

echo -e "${BLUE}[1/8] Creating directory structure...${NC}"

mkdir -p "$OUTPUT_DIR"/{scripts,config,docker,terraform,policies,docs,tests}

echo -e "${GREEN}✓ Directory structure created${NC}"

###############################################################################################
# Step 2: Generate Environment Configuration
###############################################################################################

echo -e "${BLUE}[2/8] Generating environment configuration...${NC}"

cat > "$OUTPUT_DIR/config/.env.$COUNTRY_LOWER" << EOF
# ============================================
# $COUNTRY_NAME ($COUNTRY_CODE) Instance Configuration
# Generated: $(date +%Y-%m-%d)
# ============================================

# Instance Identification
INSTANCE_REALM=$COUNTRY_CODE
INSTANCE_COUNTRY=$COUNTRY_CODE
INSTANCE_LANGUAGE=$DEFAULT_LANGUAGE

# Cloudflare Configuration
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_TUNNEL_NAME=dive-v3-$COUNTRY_LOWER
CLOUDFLARE_TUNNEL_ID=
CLOUDFLARE_TUNNEL_SECRET=

# Public URLs
NEXT_PUBLIC_APP_URL=https://${COUNTRY_LOWER}-app.$DOMAIN
NEXT_PUBLIC_API_URL=https://${COUNTRY_LOWER}-api.$DOMAIN
NEXT_PUBLIC_IDP_URL=https://${COUNTRY_LOWER}-idp.$DOMAIN
NEXT_PUBLIC_KAS_URL=https://${COUNTRY_LOWER}-kas.$DOMAIN

# Keycloak Configuration
KEYCLOAK_URL=https://${COUNTRY_LOWER}-idp.$DOMAIN
KEYCLOAK_REALM=dive-v3-broker-$COUNTRY_LOWER
KEYCLOAK_CLIENT_ID=dive-v3-client
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# Backend Configuration
BACKEND_PORT=$((START_PORT + 1000))
BACKEND_URL=http://backend-$COUNTRY_LOWER:4000
JWT_SECRET=
CORS_ORIGINS=https://${COUNTRY_LOWER}-app.$DOMAIN,http://localhost:$START_PORT

# Frontend Configuration
FRONTEND_PORT=$START_PORT
NEXTAUTH_URL=https://${COUNTRY_LOWER}-app.$DOMAIN
NEXTAUTH_SECRET=

# Database Configuration
MONGODB_URI=mongodb://mongodb-$COUNTRY_LOWER:27017/dive-v3-$COUNTRY_LOWER
MONGODB_PORT=$((27017 + START_PORT - 3000))
POSTGRES_HOST=postgres-$COUNTRY_LOWER
POSTGRES_PORT=$((5432 + START_PORT - 3000))
POSTGRES_DB=keycloak
POSTGRES_USER=keycloak
POSTGRES_PASSWORD=keycloak

# OPA Configuration
OPA_URL=http://opa-$COUNTRY_LOWER:8181
OPA_PORT=$((8181 + START_PORT - 3000))

# KAS Configuration
KAS_URL=http://kas-$COUNTRY_LOWER:8080
KAS_PORT=$((8080 + START_PORT - 3000))
KAS_JWT_SECRET=
KAS_KEY_NAMESPACE=${COUNTRY_CODE}-

# Federation Configuration
USA_FEDERATION_ENDPOINT=https://dev-api.$DOMAIN/federation
FRA_FEDERATION_ENDPOINT=https://fra-api.$DOMAIN/federation
FEDERATION_JWT_SECRET=
FEDERATION_SYNC_INTERVAL=300
FEDERATION_ENABLED=true

# Feature Flags
ENABLE_WEBAUTHN=true
ENABLE_FEDERATION=true
ENABLE_KAS=true
ENABLE_AUDIT=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
EOF

echo -e "${GREEN}✓ Environment configuration generated${NC}"

###############################################################################################
# Step 3: Generate Docker Compose Configuration
###############################################################################################

echo -e "${BLUE}[3/8] Generating Docker Compose configuration...${NC}"

cat > "$OUTPUT_DIR/docker/docker-compose.$COUNTRY_LOWER.yml" << EOF
# Docker Compose for $COUNTRY_NAME ($COUNTRY_CODE) Instance
# Generated from FRA template

version: '3.8'

services:
  # Keycloak Identity Provider
  keycloak-$COUNTRY_LOWER:
    image: quay.io/keycloak/keycloak:latest
    container_name: dive-v3-keycloak-$COUNTRY_LOWER
    hostname: keycloak-$COUNTRY_LOWER
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-$COUNTRY_LOWER:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_HOSTNAME: ${COUNTRY_LOWER}-idp.$DOMAIN
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/cert.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
    ports:
      - "$((8443 + START_PORT - 3000)):8443"
    depends_on:
      - postgres-$COUNTRY_LOWER
    volumes:
      - ../keycloak/realms/$COUNTRY_LOWER-realm.json:/opt/keycloak/data/import/$COUNTRY_LOWER-realm.json
      - ../keycloak/themes/dive-v3-$COUNTRY_LOWER:/opt/keycloak/themes/dive-v3-$COUNTRY_LOWER
      - keycloak_${COUNTRY_LOWER}_data:/opt/keycloak/data
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.10
    restart: unless-stopped

  # PostgreSQL for Keycloak
  postgres-$COUNTRY_LOWER:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-$COUNTRY_LOWER
    hostname: postgres-$COUNTRY_LOWER
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    ports:
      - "$((5433 + START_PORT - 3000)):5432"
    volumes:
      - postgres_${COUNTRY_LOWER}_data:/var/lib/postgresql/data
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.11
    restart: unless-stopped

  # MongoDB for Resources
  mongodb-$COUNTRY_LOWER:
    image: mongo:7
    container_name: dive-v3-mongodb-$COUNTRY_LOWER
    hostname: mongodb-$COUNTRY_LOWER
    environment:
      MONGO_INITDB_DATABASE: dive-v3-$COUNTRY_LOWER
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
    ports:
      - "$((27018 + START_PORT - 3000)):27017"
    volumes:
      - mongodb_${COUNTRY_LOWER}_data:/data/db
      - ../scripts/init-$COUNTRY_LOWER-mongodb.js:/docker-entrypoint-initdb.d/init.js:ro
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.12
    restart: unless-stopped

  # OPA Policy Engine
  opa-$COUNTRY_LOWER:
    image: openpolicyagent/opa:latest
    container_name: dive-v3-opa-$COUNTRY_LOWER
    hostname: opa-$COUNTRY_LOWER
    command:
      - "run"
      - "--server"
      - "--addr=:8181"
      - "/policies"
    ports:
      - "$((8182 + START_PORT - 3000)):8181"
    volumes:
      - ../policies:/policies:ro
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.13
    restart: unless-stopped

  # Backend API
  backend-$COUNTRY_LOWER:
    build:
      context: ../../backend
      dockerfile: Dockerfile
    container_name: dive-v3-backend-$COUNTRY_LOWER
    hostname: backend-$COUNTRY_LOWER
    environment:
      NODE_ENV: production
      PORT: 4000
      INSTANCE_REALM: $COUNTRY_CODE
    env_file:
      - ../config/.env.$COUNTRY_LOWER
    ports:
      - "$((START_PORT + 1000)):4000"
    depends_on:
      - mongodb-$COUNTRY_LOWER
      - opa-$COUNTRY_LOWER
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.14
    restart: unless-stopped

  # KAS Service
  kas-$COUNTRY_LOWER:
    build:
      context: ../../kas
      dockerfile: Dockerfile.$COUNTRY_LOWER
    container_name: dive-v3-kas-$COUNTRY_LOWER
    hostname: kas-$COUNTRY_LOWER
    environment:
      NODE_ENV: production
      PORT: 8080
      INSTANCE_REALM: $COUNTRY_CODE
    env_file:
      - ../config/.env.$COUNTRY_LOWER
    ports:
      - "$((8081 + START_PORT - 3000)):8080"
    depends_on:
      - backend-$COUNTRY_LOWER
      - opa-$COUNTRY_LOWER
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.15
    restart: unless-stopped

  # Frontend Application
  frontend-$COUNTRY_LOWER:
    build:
      context: ../../frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_KEYCLOAK_URL: https://${COUNTRY_LOWER}-idp.$DOMAIN
        NEXT_PUBLIC_KEYCLOAK_REALM: dive-v3-broker-$COUNTRY_LOWER
        NEXT_PUBLIC_APP_URL: https://${COUNTRY_LOWER}-app.$DOMAIN
    container_name: dive-v3-frontend-$COUNTRY_LOWER
    hostname: frontend-$COUNTRY_LOWER
    environment:
      NODE_ENV: production
      PORT: 3000
    env_file:
      - ../config/.env.$COUNTRY_LOWER
    ports:
      - "$START_PORT:3000"
    depends_on:
      - backend-$COUNTRY_LOWER
      - keycloak-$COUNTRY_LOWER
    networks:
      dive-${COUNTRY_LOWER}-network:
        ipv4_address: 172.$((19 + START_PORT - 3000)).0.16
    restart: unless-stopped

volumes:
  keycloak_${COUNTRY_LOWER}_data:
  postgres_${COUNTRY_LOWER}_data:
  mongodb_${COUNTRY_LOWER}_data:

networks:
  dive-${COUNTRY_LOWER}-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.$((19 + START_PORT - 3000)).0.0/16
EOF

echo -e "${GREEN}✓ Docker Compose configuration generated${NC}"

###############################################################################################
# Step 4: Generate Cloudflare Tunnel Script
###############################################################################################

echo -e "${BLUE}[4/8] Generating Cloudflare tunnel setup script...${NC}"

cat > "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh" << 'EOF'
#!/bin/bash

# Cloudflare Tunnel Setup for COUNTRY_NAME (COUNTRY_CODE)
# Based on FRA template

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
COUNTRY_CODE="COUNTRY_CODE_PLACEHOLDER"
COUNTRY_LOWER="COUNTRY_LOWER_PLACEHOLDER"
DOMAIN="DOMAIN_PLACEHOLDER"
TUNNEL_NAME="dive-v3-$COUNTRY_LOWER"
TUNNEL_NAME_STANDBY="dive-v3-$COUNTRY_LOWER-standby"

echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Cloudflare Tunnel Setup - $COUNTRY_CODE${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

# Check prerequisites
if ! command -v cloudflared &> /dev/null; then
  echo -e "${RED}ERROR: cloudflared not installed${NC}"
  exit 1
fi

# Login to Cloudflare
echo -e "${BLUE}[1/5] Authenticating with Cloudflare...${NC}"
cloudflared tunnel login

# Create primary tunnel
echo -e "${BLUE}[2/5] Creating primary tunnel...${NC}"
cloudflared tunnel create $TUNNEL_NAME || echo "Tunnel may already exist"
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
echo "Primary tunnel ID: $TUNNEL_ID"

# Create standby tunnel
echo -e "${BLUE}[3/5] Creating standby tunnel...${NC}"
cloudflared tunnel create $TUNNEL_NAME_STANDBY || echo "Tunnel may already exist"
STANDBY_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME_STANDBY | awk '{print $1}')
echo "Standby tunnel ID: $STANDBY_ID"

# Create DNS records
echo -e "${BLUE}[4/5] Creating DNS records...${NC}"
cloudflared tunnel route dns $TUNNEL_NAME ${COUNTRY_LOWER}-app.$DOMAIN
cloudflared tunnel route dns $TUNNEL_NAME ${COUNTRY_LOWER}-api.$DOMAIN
cloudflared tunnel route dns $TUNNEL_NAME ${COUNTRY_LOWER}-idp.$DOMAIN
cloudflared tunnel route dns $TUNNEL_NAME ${COUNTRY_LOWER}-kas.$DOMAIN

# Generate tunnel configuration
echo -e "${BLUE}[5/5] Generating tunnel configuration...${NC}"

cat > /etc/cloudflared/$COUNTRY_LOWER-tunnel.yml << EOTUNNEL
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  # Frontend
  - hostname: ${COUNTRY_LOWER}-app.$DOMAIN
    service: https://localhost:PORT_PLACEHOLDER
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # API
  - hostname: ${COUNTRY_LOWER}-api.$DOMAIN
    service: https://localhost:$((PORT_PLACEHOLDER + 1000))
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Keycloak
  - hostname: ${COUNTRY_LOWER}-idp.$DOMAIN
    service: https://localhost:$((8443 + PORT_PLACEHOLDER - 3000))
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # KAS
  - hostname: ${COUNTRY_LOWER}-kas.$DOMAIN
    service: http://localhost:$((8081 + PORT_PLACEHOLDER - 3000))
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
  
  # Catch-all
  - service: http_status:404
EOTUNNEL

echo -e "${GREEN}✓ Cloudflare tunnel setup complete${NC}"
echo ""
echo "Next steps:"
echo "1. Start tunnel: cloudflared tunnel run $TUNNEL_NAME"
echo "2. Configure Zero Trust policies in Cloudflare dashboard"
echo "3. Test endpoints"
EOF

# Replace placeholders
sed -i.bak "s/COUNTRY_CODE_PLACEHOLDER/$COUNTRY_CODE/g" "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh"
sed -i.bak "s/COUNTRY_LOWER_PLACEHOLDER/$COUNTRY_LOWER/g" "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh"
sed -i.bak "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh"
sed -i.bak "s/PORT_PLACEHOLDER/$START_PORT/g" "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh"
rm "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh.bak"
chmod +x "$OUTPUT_DIR/scripts/setup-$COUNTRY_LOWER-tunnel.sh"

echo -e "${GREEN}✓ Cloudflare tunnel script generated${NC}"

###############################################################################################
# Step 5: Generate OPA Policy
###############################################################################################

echo -e "${BLUE}[5/8] Generating OPA authorization policy...${NC}"

# Load clearance mappings
if [ -n "$CLEARANCE_MAP_FILE" ] && [ -f "$CLEARANCE_MAP_FILE" ]; then
  CLEARANCE_MAPPINGS=$(cat "$CLEARANCE_MAP_FILE")
else
  CLEARANCE_MAPPINGS="$DEFAULT_CLEARANCES"
fi

cat > "$OUTPUT_DIR/policies/$COUNTRY_LOWER-authorization-policy.rego" << 'EOF'
# Authorization Policy for COUNTRY_NAME (COUNTRY_CODE)
# Generated from FRA template

package dive.authorization

import rego.v1

# Default deny
default allow := false

# Clearance mappings for COUNTRY_CODE
clearance_map := CLEARANCE_MAP_PLACEHOLDER

# Clearance hierarchy
clearance_levels := {
    "UNCLASSIFIED": 0,
    "CONFIDENTIAL": 1,
    "SECRET": 2,
    "TOP_SECRET": 3
}

# Normalize clearance
normalized_clearance(clearance) := normalized if {
    normalized := clearance_map[clearance]
} else := clearance

# Main authorization rule
allow if {
    # Subject must be authenticated
    input.subject.authenticated == true
    
    # Normalize clearances
    subject_clearance := normalized_clearance(input.subject.clearance)
    resource_classification := normalized_clearance(input.resource.classification)
    
    # Check clearance level
    clearance_levels[subject_clearance] >= clearance_levels[resource_classification]
    
    # Check releasability
    input.subject.countryOfAffiliation in input.resource.releasabilityTo
    
    # Check COI if present
    check_coi
}

# COI check
check_coi if {
    count(input.resource.COI) == 0
} else if {
    count(input.subject.acpCOI) > 0
    some subject_coi in input.subject.acpCOI
    some resource_coi in input.resource.COI
    subject_coi == resource_coi
}

# Decision output
decision := {
    "allow": allow,
    "reason": reason,
    "correlationId": input.context.correlationId,
    "timestamp": input.context.currentTime,
    "subject": input.subject.uniqueID,
    "resource": input.resource.resourceId,
    "realm": "COUNTRY_CODE"
}

reason := "Access granted" if allow
reason := "Access denied" if not allow
EOF

# Replace placeholders
sed -i.bak "s/COUNTRY_NAME/$COUNTRY_NAME/g" "$OUTPUT_DIR/policies/$COUNTRY_LOWER-authorization-policy.rego"
sed -i.bak "s/COUNTRY_CODE/$COUNTRY_CODE/g" "$OUTPUT_DIR/policies/$COUNTRY_LOWER-authorization-policy.rego"
sed -i.bak "s/CLEARANCE_MAP_PLACEHOLDER/$CLEARANCE_MAPPINGS/g" "$OUTPUT_DIR/policies/$COUNTRY_LOWER-authorization-policy.rego"
rm "$OUTPUT_DIR/policies/$COUNTRY_LOWER-authorization-policy.rego.bak"

echo -e "${GREEN}✓ OPA policy generated${NC}"

###############################################################################################
# Step 6: Generate Deployment Script
###############################################################################################

echo -e "${BLUE}[6/8] Generating deployment script...${NC}"

cat > "$OUTPUT_DIR/scripts/deploy-$COUNTRY_LOWER-instance.sh" << EOF
#!/bin/bash

# Deployment Script for $COUNTRY_NAME ($COUNTRY_CODE) Instance
# Generated from FRA template

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\${CYAN}════════════════════════════════════════════════\${NC}"
echo -e "\${CYAN}  Deploying $COUNTRY_CODE Instance\${NC}"
echo -e "\${CYAN}════════════════════════════════════════════════\${NC}"
echo ""

# Load environment
source config/.env.$COUNTRY_LOWER

# Phase 1: Infrastructure
echo -e "\${BLUE}Phase 1: Infrastructure Setup\${NC}"
./scripts/setup-$COUNTRY_LOWER-tunnel.sh
docker network create dive-${COUNTRY_LOWER}-network --subnet=172.$((19 + $START_PORT - 3000)).0.0/16

# Phase 2: Core Services
echo -e "\${BLUE}Phase 2: Core Services\${NC}"
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d postgres-$COUNTRY_LOWER mongodb-$COUNTRY_LOWER
sleep 10

# Phase 3: Identity Provider
echo -e "\${BLUE}Phase 3: Keycloak Setup\${NC}"
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d keycloak-$COUNTRY_LOWER
./scripts/setup-$COUNTRY_LOWER-keycloak.sh

# Phase 4: Authorization
echo -e "\${BLUE}Phase 4: OPA Setup\${NC}"
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d opa-$COUNTRY_LOWER

# Phase 5: Application Services
echo -e "\${BLUE}Phase 5: Application Services\${NC}"
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d backend-$COUNTRY_LOWER
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d kas-$COUNTRY_LOWER
docker-compose -f docker/docker-compose.$COUNTRY_LOWER.yml up -d frontend-$COUNTRY_LOWER

# Phase 6: Federation
echo -e "\${BLUE}Phase 6: Federation Setup\${NC}"
./scripts/setup-$COUNTRY_LOWER-federation.sh

# Phase 7: Validation
echo -e "\${BLUE}Phase 7: Validation\${NC}"
./tests/test-$COUNTRY_LOWER-instance.sh

echo -e "\${GREEN}════════════════════════════════════════════════\${NC}"
echo -e "\${GREEN}  $COUNTRY_CODE Instance Deployed Successfully!\${NC}"
echo -e "\${GREEN}════════════════════════════════════════════════\${NC}"
echo ""
echo "Access Points:"
echo "  Frontend: https://${COUNTRY_LOWER}-app.$DOMAIN"
echo "  API: https://${COUNTRY_LOWER}-api.$DOMAIN"
echo "  IdP: https://${COUNTRY_LOWER}-idp.$DOMAIN"
echo "  KAS: https://${COUNTRY_LOWER}-kas.$DOMAIN"
EOF

chmod +x "$OUTPUT_DIR/scripts/deploy-$COUNTRY_LOWER-instance.sh"

echo -e "${GREEN}✓ Deployment script generated${NC}"

###############################################################################################
# Step 7: Generate Test Suite
###############################################################################################

echo -e "${BLUE}[7/8] Generating test suite...${NC}"

cat > "$OUTPUT_DIR/tests/test-$COUNTRY_LOWER-instance.sh" << EOF
#!/bin/bash

# Test Suite for $COUNTRY_NAME ($COUNTRY_CODE) Instance
# Based on FRA validation tests

set -e

echo "Testing $COUNTRY_CODE Instance..."

# Test health endpoints
echo "Testing health endpoints..."
curl -f http://localhost:$START_PORT/api/health || exit 1
curl -f http://localhost:$((START_PORT + 1000))/health || exit 1
curl -f http://localhost:$((8081 + START_PORT - 3000))/health || exit 1

# Test Keycloak
echo "Testing Keycloak..."
curl -f https://${COUNTRY_LOWER}-idp.$DOMAIN/realms/dive-v3-broker-$COUNTRY_LOWER || exit 1

# Test OPA
echo "Testing OPA..."
curl -f http://localhost:$((8182 + START_PORT - 3000))/health || exit 1

echo "All tests passed!"
EOF

chmod +x "$OUTPUT_DIR/tests/test-$COUNTRY_LOWER-instance.sh"

echo -e "${GREEN}✓ Test suite generated${NC}"

###############################################################################################
# Step 8: Generate Documentation
###############################################################################################

echo -e "${BLUE}[8/8] Generating documentation...${NC}"

cat > "$OUTPUT_DIR/docs/README-$COUNTRY_CODE.md" << EOF
# $COUNTRY_NAME ($COUNTRY_CODE) Instance Deployment

## Overview
This is the $COUNTRY_NAME instance of DIVE V3, generated from the proven FRA template.

## Quick Start

1. **Configure Environment**
   \`\`\`bash
   cd deployments/${COUNTRY_CODE}-instance
   vim config/.env.$COUNTRY_LOWER  # Set your specific values
   \`\`\`

2. **Deploy Instance**
   \`\`\`bash
   ./scripts/deploy-$COUNTRY_LOWER-instance.sh
   \`\`\`

3. **Validate Deployment**
   \`\`\`bash
   ./tests/test-$COUNTRY_LOWER-instance.sh
   \`\`\`

## Architecture

### Network Topology
- Frontend: https://${COUNTRY_LOWER}-app.$DOMAIN
- API: https://${COUNTRY_LOWER}-api.$DOMAIN
- IdP: https://${COUNTRY_LOWER}-idp.$DOMAIN
- KAS: https://${COUNTRY_LOWER}-kas.$DOMAIN

### Port Allocations
- Frontend: $START_PORT
- Backend: $((START_PORT + 1000))
- Keycloak: $((8443 + START_PORT - 3000))
- MongoDB: $((27018 + START_PORT - 3000))
- OPA: $((8182 + START_PORT - 3000))
- KAS: $((8081 + START_PORT - 3000))

### Docker Network
- Subnet: 172.$((19 + START_PORT - 3000)).0.0/16

## Clearance Mappings

$COUNTRY_CODE uses the following clearance mappings:

\`\`\`json
$CLEARANCE_MAPPINGS
\`\`\`

## Federation

This instance is configured to federate with:
- USA instance: https://dev-api.$DOMAIN
- FRA instance: https://fra-api.$DOMAIN

## Customization

### Adding Test Users
Edit \`scripts/setup-$COUNTRY_LOWER-keycloak.sh\` to add country-specific test users.

### Modifying Policies
Edit \`policies/$COUNTRY_LOWER-authorization-policy.rego\` to adjust authorization rules.

### Updating Federation
Configure federation endpoints in \`config/.env.$COUNTRY_LOWER\`.

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports $START_PORT-$((START_PORT + 2000)) are available
2. **DNS issues**: Verify Cloudflare DNS records are created
3. **Federation failures**: Check JWT secrets match between instances

### Support
Based on FRA instance documentation at \`docs/fra-rollout/\`

---
*Generated: $(date +%Y-%m-%d)*
*Template Version: 1.0*
EOF

echo -e "${GREEN}✓ Documentation generated${NC}"

###############################################################################################
# Summary
###############################################################################################

echo ""
echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}  Instance Generation Complete!${NC}"
echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✓ Generated $COUNTRY_NAME ($COUNTRY_CODE) instance${NC}"
echo ""
echo -e "${CYAN}Output Directory Structure:${NC}"
echo "$OUTPUT_DIR/"
echo "├── config/           # Environment configuration"
echo "├── docker/           # Docker Compose files"
echo "├── policies/         # OPA policies"
echo "├── scripts/          # Deployment scripts"
echo "├── terraform/        # IaC (ready for expansion)"
echo "├── tests/            # Test suites"
echo "└── docs/             # Documentation"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo "1. Review and customize configuration:"
echo "   cd $OUTPUT_DIR"
echo "   vim config/.env.$COUNTRY_LOWER"
echo ""
echo "2. Deploy the instance:"
echo "   ./scripts/deploy-$COUNTRY_LOWER-instance.sh"
echo ""
echo "3. Validate deployment:"
echo "   ./tests/test-$COUNTRY_LOWER-instance.sh"
echo ""
echo -e "${YELLOW}Note: Remember to:${NC}"
echo "- Set Cloudflare credentials"
echo "- Generate secure JWT secrets"
echo "- Configure federation tokens"
echo "- Adjust clearance mappings if needed"
echo ""
echo -e "${GREEN}Happy deploying!${NC}"
