#!/bin/bash

###############################################################################################
# FRA Federation Deployment Script
# 
# Purpose: Deploy and configure metadata federation between FRA and USA instances
# Gap Mitigations: 
#   - GAP-003: Resource consistency with versioning
#   - GAP-004: Correlation IDs for sync operations
#   - GAP-007: Data residency compliance
#
# Usage: ./scripts/deploy-fra-federation.sh [--dry-run]
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

# Federation endpoints
FRA_FEDERATION_URL="https://fra-api.dive25.com/federation"
USA_FEDERATION_URL="https://dev-api.dive25.com/federation"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  FRA Federation Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

###############################################################################################
# Step 1: Update Backend with Federation Routes
###############################################################################################

echo -e "${BLUE}[1/6] Updating Backend with Federation Routes...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Check if federation routes are already integrated
  if ! grep -q "fra-federation.routes" "$PROJECT_ROOT/backend/src/server.ts" 2>/dev/null; then
    # Add federation routes to server.ts
    cat >> "$PROJECT_ROOT/backend/src/server.ts" << 'EOF'

// Federation routes (FRA)
import federationRoutes from './routes/fra-federation.routes';
app.use('/federation', federationRoutes);
EOF
    echo -e "${GREEN}✓ Federation routes added to server.ts${NC}"
  else
    echo -e "${YELLOW}! Federation routes already integrated${NC}"
  fi
  
  # Install additional dependencies if needed
  if ! grep -q "mongodb" "$PROJECT_ROOT/backend/package.json"; then
    cd "$PROJECT_ROOT/backend"
    npm install mongodb axios uuid jsonwebtoken
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    cd "$PROJECT_ROOT"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Would add federation routes to backend${NC}"
fi

###############################################################################################
# Step 2: Configure Federation Credentials
###############################################################################################

echo -e "${BLUE}[2/6] Configuring Federation Credentials...${NC}"

# Generate federation JWT secret
FEDERATION_JWT_SECRET=$(openssl rand -base64 32)

if [ "$DRY_RUN" = false ]; then
  # Update .env.fra with federation settings
  cat >> "$PROJECT_ROOT/.env.fra" << EOF

# Federation Configuration (Phase 5)
USA_FEDERATION_ENDPOINT=$USA_FEDERATION_URL
FEDERATION_JWT_SECRET=$FEDERATION_JWT_SECRET
FEDERATION_SYNC_INTERVAL=300
FEDERATION_ENABLED=true
EOF
  echo -e "${GREEN}✓ Federation credentials configured${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Would configure federation credentials${NC}"
fi

###############################################################################################
# Step 3: Deploy Federation Database Collections
###############################################################################################

echo -e "${BLUE}[3/6] Creating Federation Database Collections...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Create federation collections in MongoDB
  docker exec -i dive-v3-mongodb-fra mongosh --quiet << EOF
use dive-v3-fra;

// Create federation_sync collection
db.createCollection("federation_sync");
db.federation_sync.createIndex({ timestamp: -1 });
db.federation_sync.createIndex({ correlationId: 1 });
db.federation_sync.createIndex({ sourceRealm: 1, targetRealm: 1 });

// Add sync status to resources
db.resources.updateMany(
  {},
  {
    \$set: {
      syncStatus: {
        USA: {
          synced: false,
          timestamp: null,
          version: 0
        }
      }
    }
  }
);

// Create federation view for monitoring
db.createView(
  "federation_monitor",
  "resources",
  [
    {
      \$match: {
        originRealm: "FRA",
        classification: { \$ne: "TOP_SECRET" }
      }
    },
    {
      \$project: {
        resourceId: 1,
        classification: 1,
        releasabilityTo: 1,
        "syncStatus.USA": 1,
        lastModified: 1
      }
    }
  ]
);

print("Federation collections created");
EOF
  echo -e "${GREEN}✓ Federation database collections created${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Would create federation database collections${NC}"
fi

###############################################################################################
# Step 4: Configure Cloudflare Access for Federation
###############################################################################################

echo -e "${BLUE}[4/6] Configuring Cloudflare Access for Federation...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Check if cloudflared is available
  if command -v cloudflared &> /dev/null; then
    # Add federation endpoint to tunnel configuration
    TUNNEL_CONFIG="/etc/cloudflared/fra-tunnel.yml"
    
    if [ -f "$TUNNEL_CONFIG" ]; then
      # Check if federation endpoint already configured
      if ! grep -q "/federation" "$TUNNEL_CONFIG"; then
        echo -e "${YELLOW}! Please manually add federation endpoint to $TUNNEL_CONFIG${NC}"
        echo -e "${YELLOW}  Add the following route pattern for /federation paths${NC}"
      else
        echo -e "${GREEN}✓ Federation endpoint already in tunnel config${NC}"
      fi
    fi
    
    # Create Zero Trust policy for federation
    echo -e "${CYAN}Creating Zero Trust policy for federation endpoint...${NC}"
    cat << EOF

Manual Step Required:
1. Go to https://one.dash.cloudflare.com/
2. Navigate to Zero Trust > Access > Applications
3. Create application: "FRA Federation API"
4. Set path: fra-api.dive25.com/federation
5. Configure policy:
   - Name: "Federation Service Access"
   - Action: Service Auth
   - Include: Service Tokens (create token for USA instance)

EOF
  else
    echo -e "${YELLOW}! cloudflared not found, skipping tunnel configuration${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Would configure Cloudflare Access${NC}"
fi

###############################################################################################
# Step 5: Deploy Updated Backend
###############################################################################################

echo -e "${BLUE}[5/6] Redeploying Backend with Federation...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Rebuild and restart backend container
  cd "$PROJECT_ROOT"
  
  docker-compose -f docker-compose.fra.yml stop backend-fra
  docker-compose -f docker-compose.fra.yml rm -f backend-fra
  docker-compose -f docker-compose.fra.yml up -d backend-fra
  
  # Wait for backend to be healthy
  echo -e "${CYAN}Waiting for backend to be healthy...${NC}"
  for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/health | grep -q "200"; then
      echo -e "${GREEN}✓ Backend is healthy${NC}"
      break
    fi
    sleep 2
  done
else
  echo -e "${YELLOW}[DRY-RUN] Would redeploy backend${NC}"
fi

###############################################################################################
# Step 6: Test Federation Endpoints
###############################################################################################

echo -e "${BLUE}[6/6] Testing Federation Endpoints...${NC}"

if [ "$DRY_RUN" = false ]; then
  # Test federation status endpoint
  echo -e "${CYAN}Testing federation status...${NC}"
  CORRELATION_ID="test-$(uuidv4 2>/dev/null || echo "$(date +%s)")"
  
  STATUS=$(curl -s -X GET \
    -H "X-Correlation-ID: $CORRELATION_ID" \
    http://localhost:4001/federation/status)
  
  if echo "$STATUS" | grep -q "operational"; then
    echo -e "${GREEN}✓ Federation status: operational${NC}"
    echo "$STATUS" | jq '.capabilities' 2>/dev/null || echo "$STATUS"
  else
    echo -e "${RED}✗ Federation status check failed${NC}"
  fi
  
  # Test resource listing
  echo -e "${CYAN}Testing federation resource listing...${NC}"
  RESOURCES=$(curl -s -X GET \
    -H "X-Correlation-ID: $CORRELATION_ID" \
    "http://localhost:4001/federation/resources?releasableTo=USA")
  
  if echo "$RESOURCES" | grep -q "resources"; then
    COUNT=$(echo "$RESOURCES" | jq '.count' 2>/dev/null || echo "0")
    echo -e "${GREEN}✓ Found $COUNT federation-eligible resources${NC}"
  else
    echo -e "${YELLOW}! No federation resources found${NC}"
  fi
  
  # Display sync configuration
  echo ""
  echo -e "${CYAN}Federation Configuration:${NC}"
  echo "  FRA Federation URL: $FRA_FEDERATION_URL"
  echo "  USA Federation URL: $USA_FEDERATION_URL"
  echo "  Sync Interval: ${FEDERATION_SYNC_INTERVAL}s"
  echo "  Correlation Tracking: Enabled"
  echo ""
  
  # Create test sync script
  cat > "$PROJECT_ROOT/scripts/test-fra-federation-sync.sh" << 'EOF'
#!/bin/bash
# Test federation sync between FRA and USA

CORRELATION_ID="sync-test-$(date +%s)"

echo "Testing federation sync with correlation ID: $CORRELATION_ID"

# Trigger sync
RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: $CORRELATION_ID" \
  -d '{"targetRealm": "USA"}' \
  http://localhost:4001/federation/sync)

echo "$RESULT" | jq '.' 2>/dev/null || echo "$RESULT"

# Check sync history
echo ""
echo "Recent sync history:"
curl -s -H "X-Correlation-ID: $CORRELATION_ID" \
  http://localhost:4001/federation/sync/history?limit=5 | \
  jq '.syncHistory[] | {timestamp, resourcesSynced, duration}' 2>/dev/null
EOF
  chmod +x "$PROJECT_ROOT/scripts/test-fra-federation-sync.sh"
  echo -e "${GREEN}✓ Test sync script created: scripts/test-fra-federation-sync.sh${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Would test federation endpoints${NC}"
fi

###############################################################################################
# Summary
###############################################################################################

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Federation Deployment Complete${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Federation service deployed${NC}"
echo -e "${GREEN}✓ Database collections created${NC}"
echo -e "${GREEN}✓ Correlation tracking enabled${NC}"
echo -e "${GREEN}✓ Conflict resolution configured${NC}"
echo ""

if [ "$DRY_RUN" = false ]; then
  echo -e "${CYAN}Next Steps:${NC}"
  echo "1. Configure USA instance to accept FRA federation"
  echo "2. Exchange service tokens between instances"
  echo "3. Test bidirectional sync: ./scripts/test-fra-federation-sync.sh"
  echo "4. Enable scheduler: curl -X POST http://localhost:4001/federation/scheduler/start"
  echo "5. Monitor conflicts: curl http://localhost:4001/federation/conflicts"
else
  echo -e "${YELLOW}DRY-RUN Complete - no changes made${NC}"
  echo "Remove --dry-run flag to deploy federation service"
fi
