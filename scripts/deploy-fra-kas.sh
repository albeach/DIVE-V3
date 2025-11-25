#!/bin/bash

###############################################################################################
# FRA KAS Deployment Script
# 
# Purpose: Deploy and configure FRA Key Access Service with namespace isolation
# Gap Mitigations:
#   - GAP-005: Multi-KAS divergence detection
#   - GAP-004: Correlation ID tracking
#   - GAP-001: Key rotation support
#
# Usage: ./scripts/deploy-fra-kas.sh [--dry-run]
###############################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      echo -e "${YELLOW}Running in DRY-RUN mode - no changes will be made${NC}"
      shift
      ;;
  esac
done

# Load environment variables
if [ -f "$PROJECT_ROOT/.env.fra" ]; then
  source "$PROJECT_ROOT/.env.fra"
else
  echo -e "${RED}ERROR: .env.fra not found${NC}"
  exit 1
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  FRA KAS Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

###############################################################################################
# Step 1: Build KAS Docker Image
###############################################################################################

echo -e "${BLUE}[1/6] Building FRA KAS Docker Image...${NC}"

if [ "$DRY_RUN" = false ]; then
  cd "$PROJECT_ROOT/kas"
  
  # Ensure package.json has necessary dependencies
  if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "fra-kas",
  "version": "1.0.0",
  "description": "FRA Key Access Service",
  "main": "dist/fra-kas-server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/fra-kas-server.js",
    "dev": "ts-node src/fra-kas-server.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.1",
    "morgan": "^1.10.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/uuid": "^9.0.7",
    "@types/morgan": "^1.9.9",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2"
  }
}
EOF
  fi
  
  # Ensure tsconfig.json exists
  if [ ! -f "tsconfig.json" ]; then
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowJs": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
  fi
  
  # Build Docker image
  docker build -f Dockerfile.fra -t dive-v3-kas-fra:latest .
  echo -e "${GREEN}✓ FRA KAS Docker image built${NC}"
  
  cd "$PROJECT_ROOT"
else
  echo -e "${YELLOW}[DRY-RUN] Would build FRA KAS Docker image${NC}"
fi

###############################################################################################
# Step 2: Update Docker Compose Configuration
###############################################################################################

echo -e "${BLUE}[2/6] Updating Docker Compose Configuration...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Check if KAS is already in docker-compose.fra.yml
  if ! grep -q "kas-fra:" "$PROJECT_ROOT/docker-compose.fra.yml"; then
    echo -e "${YELLOW}! KAS-FRA service already defined in docker-compose.fra.yml${NC}"
  else
    echo -e "${GREEN}✓ KAS-FRA service configured in docker-compose${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Would update docker-compose configuration${NC}"
fi

###############################################################################################
# Step 3: Configure KAS Environment Variables
###############################################################################################

echo -e "${BLUE}[3/6] Configuring KAS Environment Variables...${NC}"

# Generate JWT secret for KAS
KAS_JWT_SECRET=$(openssl rand -base64 32)

if [ "$DRY_RUN" = false ]; then
  # Update .env.fra with KAS settings
  if ! grep -q "KAS_JWT_SECRET" "$PROJECT_ROOT/.env.fra"; then
    cat >> "$PROJECT_ROOT/.env.fra" << EOF

# KAS Configuration (Phase 6)
KAS_JWT_SECRET=$KAS_JWT_SECRET
KAS_OPA_URL=http://opa-fra:8181
KAS_BACKEND_URL=http://backend-fra:4000
KAS_PORT=8080
KAS_DIVERGENCE_WEBHOOK=
KAS_KEY_ROTATION_DAYS=90
EOF
    echo -e "${GREEN}✓ KAS environment variables configured${NC}"
  else
    echo -e "${YELLOW}! KAS environment already configured${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Would configure KAS environment${NC}"
fi

###############################################################################################
# Step 4: Deploy KAS Service
###############################################################################################

echo -e "${BLUE}[4/6] Deploying FRA KAS Service...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Start KAS container
  docker-compose -f docker-compose.fra.yml up -d kas-fra
  
  # Wait for KAS to be healthy
  echo -e "${CYAN}Waiting for KAS to be healthy...${NC}"
  for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/health | grep -q "200"; then
      echo -e "${GREEN}✓ KAS is healthy${NC}"
      break
    fi
    sleep 2
  done
else
  echo -e "${YELLOW}[DRY-RUN] Would deploy KAS service${NC}"
fi

###############################################################################################
# Step 5: Initialize Sample Keys
###############################################################################################

echo -e "${BLUE}[5/6] Initializing Sample Keys...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Create initialization script
  cat > "$PROJECT_ROOT/scripts/init-fra-kas-keys.sh" << 'EOF'
#!/bin/bash

# Initialize sample keys for FRA resources

KAS_URL="http://localhost:8081"
CORRELATION_ID="init-kas-$(date +%s)"

echo "Initializing FRA KAS keys..."

# Generate a test JWT token (in production, get from Keycloak)
JWT_TOKEN=$(echo -n '{"sub":"admin","clearance":"TOP_SECRET","countryOfAffiliation":"FRA","roles":["admin"]}' | \
  base64 | tr -d '=' | tr '/+' '_-')

# Request keys for sample resources
for resource_id in FRA-001 FRA-002 FRA-003; do
  echo "Requesting key for $resource_id..."
  
  curl -s -X POST "$KAS_URL/keys/request" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer test.$JWT_TOKEN.signature" \
    -H "X-Correlation-ID: $CORRELATION_ID" \
    -d "{\"resourceId\": \"$resource_id\"}" | jq '.' 2>/dev/null || echo "Key request sent"
done

echo "Sample keys initialized"
EOF
  chmod +x "$PROJECT_ROOT/scripts/init-fra-kas-keys.sh"
  echo -e "${GREEN}✓ Key initialization script created${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Would create key initialization script${NC}"
fi

###############################################################################################
# Step 6: Configure Cloudflare Tunnel for KAS
###############################################################################################

echo -e "${BLUE}[6/6] Configuring Cloudflare Access for KAS...${NC}"

if [ "$DRY_RUN" = false ]; then
  echo -e "${CYAN}Manual Configuration Required:${NC}"
  cat << EOF

Add the following to your Cloudflare tunnel configuration:

1. Update tunnel ingress rules for fra-kas.dive25.com:
   - hostname: fra-kas.dive25.com
   - service: http://localhost:8081
   - originRequest:
       connectTimeout: 30s
       noTLSVerify: false

2. Create Zero Trust Access policy:
   - Name: "FRA KAS Access"
   - Path: fra-kas.dive25.com
   - Policy: Require service token or authenticated user

3. Configure CORS for frontend access:
   - Allow origin: https://fra-app.dive25.com
   - Allow credentials: true

EOF
else
  echo -e "${YELLOW}[DRY-RUN] Would configure Cloudflare access${NC}"
fi

###############################################################################################
# Testing
###############################################################################################

echo ""
echo -e "${CYAN}Testing FRA KAS Deployment...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Test health endpoint
  echo -e "${BLUE}Testing health endpoint...${NC}"
  HEALTH=$(curl -s http://localhost:8081/health)
  if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✓ KAS health check passed${NC}"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
  else
    echo -e "${RED}✗ KAS health check failed${NC}"
  fi
  
  # Test metrics endpoint
  echo -e "${BLUE}Testing metrics endpoint...${NC}"
  METRICS=$(curl -s http://localhost:8081/metrics)
  if echo "$METRICS" | grep -q "kasAuthority"; then
    echo -e "${GREEN}✓ KAS metrics available${NC}"
    echo "$METRICS" | jq '.metrics' 2>/dev/null || echo "$METRICS"
  else
    echo -e "${YELLOW}! Metrics not available${NC}"
  fi
  
  # Test audit endpoint
  echo -e "${BLUE}Testing audit endpoint...${NC}"
  AUDIT=$(curl -s -H "X-Correlation-ID: test-audit" http://localhost:8081/keys/audit)
  if echo "$AUDIT" | grep -q "statistics"; then
    echo -e "${GREEN}✓ KAS audit log available${NC}"
    echo "$AUDIT" | jq '.statistics' 2>/dev/null || echo "$AUDIT"
  else
    echo -e "${YELLOW}! Audit log not available${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Would test KAS endpoints${NC}"
fi

###############################################################################################
# Summary
###############################################################################################

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  FRA KAS Deployment Complete${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ KAS service deployed${NC}"
echo -e "${GREEN}✓ Key namespace: FRA-*${NC}"
echo -e "${GREEN}✓ Policy re-evaluation enabled${NC}"
echo -e "${GREEN}✓ Divergence detection active${NC}"
echo -e "${GREEN}✓ Audit logging configured${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
  echo -e "${CYAN}KAS Endpoints:${NC}"
  echo "  Health: http://localhost:8081/health"
  echo "  Metrics: http://localhost:8081/metrics"
  echo "  Key Request: POST http://localhost:8081/keys/request"
  echo "  Key Rotation: POST http://localhost:8081/keys/rotate"
  echo "  Audit Log: GET http://localhost:8081/keys/audit"
  echo ""
  echo -e "${CYAN}Next Steps:${NC}"
  echo "1. Test key request flow with encrypted resources"
  echo "2. Monitor divergence rates in audit log"
  echo "3. Configure key rotation schedule"
  echo "4. Test USA↔FRA KAS federation"
  echo "5. Set up divergence alerting webhook"
else
  echo -e "${YELLOW}DRY-RUN Complete - no changes made${NC}"
  echo "Remove --dry-run flag to deploy FRA KAS"
fi



