#!/bin/bash
# ============================================
# Deploy Keycloak Extensions (AAL/MFA Implementation)
# ============================================
# Purpose: Build, deploy, and verify Keycloak custom SPIs
# Usage: ./scripts/deploy-keycloak-extensions.sh
#
# What this script does:
# 1. Builds the custom SPI JAR using Maven (in Docker)
# 2. Copies JAR to providers directory (picked up by volume mount)
# 3. Restarts Keycloak to load new providers
# 4. Verifies Event Listener is loaded
# 5. Displays next steps for Terraform configuration
#
# Reference: AAL-MFA-DEBUGGING-REPORT.md

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Deploying Keycloak Custom Extensions${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# Step 1: Build Extension JAR
# ============================================
echo -e "${YELLOW}[1/6] Building extension JAR with Maven...${NC}"
echo ""

cd "$PROJECT_ROOT/keycloak/extensions"

# Check if pom.xml exists
if [ ! -f "pom.xml" ]; then
  echo -e "${RED}❌ ERROR: pom.xml not found in keycloak/extensions${NC}"
  exit 1
fi

# Build using Maven Docker container (no local Maven required)
echo "Running: mvn clean package -DskipTests"
docker run --rm \
  -v "$PROJECT_ROOT/keycloak/extensions:/app" \
  -w /app \
  maven:3.9-eclipse-temurin-17 \
  mvn clean package -DskipTests

# Verify JAR was created
if [ ! -f "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" ]; then
  echo -e "${RED}❌ ERROR: JAR file not created${NC}"
  exit 1
fi

JAR_SIZE=$(ls -lh "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" | awk '{print $5}')
echo -e "${GREEN}✅ JAR built successfully${NC}"
echo "   Size: $JAR_SIZE"
echo "   Path: keycloak/extensions/target/dive-keycloak-extensions.jar"
echo ""

# ============================================
# Step 2: Verify JAR Contents
# ============================================
echo -e "${YELLOW}[2/6] Verifying JAR contains AMR Event Listener...${NC}"
echo ""

# Check for AMR Event Listener classes
if unzip -l "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" | grep -q "AMREnrichmentEventListener"; then
  echo -e "${GREEN}✅ AMREnrichmentEventListener.class found${NC}"
else
  echo -e "${RED}❌ ERROR: AMREnrichmentEventListener.class NOT found in JAR${NC}"
  exit 1
fi

# Check for service provider registration
if unzip -p "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" \
    META-INF/services/org.keycloak.events.EventListenerProviderFactory 2>/dev/null | grep -q "AMREnrichmentEventListenerFactory"; then
  echo -e "${GREEN}✅ EventListenerProviderFactory registration found${NC}"
else
  echo -e "${RED}❌ ERROR: EventListenerProviderFactory service registration NOT found${NC}"
  exit 1
fi

echo ""

# ============================================
# Step 3: Deploy JAR to Providers Directory
# ============================================
echo -e "${YELLOW}[3/6] Deploying JAR to providers directory...${NC}"
echo ""

# Copy to providers directory (used by Dockerfile COPY and docker-compose volume mount)
cp "$PROJECT_ROOT/keycloak/extensions/target/dive-keycloak-extensions.jar" \
   "$PROJECT_ROOT/keycloak/providers/dive-keycloak-extensions.jar"

echo -e "${GREEN}✅ JAR copied to keycloak/providers/${NC}"
echo "   This directory is mounted as a volume in docker-compose.yml"
echo "   Keycloak will automatically load providers from this directory"
echo ""

# ============================================
# Step 4: Restart Keycloak
# ============================================
echo -e "${YELLOW}[4/6] Restarting Keycloak container...${NC}"
echo ""

cd "$PROJECT_ROOT"

# Check if Keycloak is running
if ! docker ps | grep -q dive-v3-keycloak; then
  echo -e "${RED}❌ ERROR: Keycloak container is not running${NC}"
  echo "   Start the stack first: docker-compose up -d"
  exit 1
fi

# Restart Keycloak (picks up new JAR from volume mount)
echo "Stopping Keycloak..."
docker-compose stop keycloak

echo "Starting Keycloak..."
docker-compose up -d keycloak

echo -e "${GREEN}✅ Keycloak restarted${NC}"
echo ""

# ============================================
# Step 5: Wait for Keycloak to be Healthy
# ============================================
echo -e "${YELLOW}[5/6] Waiting for Keycloak to be healthy...${NC}"
echo ""

MAX_WAIT=120
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  if docker-compose exec -T keycloak curl -s -f http://localhost:8080/health/ready > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Keycloak is healthy and ready${NC}"
    break
  fi
  echo -n "."
  sleep 2
  WAIT_COUNT=$((WAIT_COUNT + 2))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
  echo ""
  echo -e "${RED}❌ ERROR: Keycloak health check timeout after ${MAX_WAIT}s${NC}"
  echo "   Check logs: docker-compose logs keycloak"
  exit 1
fi

echo ""

# ============================================
# Step 6: Verify Event Listener Loaded
# ============================================
echo -e "${YELLOW}[6/6] Verifying Event Listener is loaded...${NC}"
echo ""

# Wait a few seconds for providers to initialize
sleep 5

# Check logs for AMR Event Listener initialization
if docker logs dive-v3-keycloak 2>&1 | grep -q "DIVE AMR.*initialized"; then
  echo -e "${GREEN}✅ AMR Enrichment Event Listener initialized${NC}"
  echo "   Found in logs: [DIVE AMR] AMR Enrichment Event Listener initialized"
else
  echo -e "${YELLOW}⚠️  WARNING: Event Listener initialization message not found in logs${NC}"
  echo "   This may be normal if the listener doesn't log during initialization"
  echo "   The listener will be loaded when events are enabled in realm configuration"
fi

# Check for provider warnings
if docker logs dive-v3-keycloak 2>&1 | tail -100 | grep -q "dive-amr-enrichment"; then
  echo -e "${GREEN}✅ Provider 'dive-amr-enrichment' registered${NC}"
else
  echo -e "${YELLOW}⚠️  Note: Provider may not be visible until enabled in realm configuration${NC}"
fi

echo ""

# ============================================
# Summary & Next Steps
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}What was deployed:${NC}"
echo "  • AMR Enrichment Event Listener SPI"
echo "  • Direct Grant OTP Setup Authenticator"
echo "  • Configure OTP Required Action"
echo ""
echo -e "${BLUE}JAR Details:${NC}"
echo "  • File: keycloak/providers/dive-keycloak-extensions.jar"
echo "  • Size: $JAR_SIZE"
echo "  • Location: Mounted as volume in docker-compose.yml"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Next Steps Required${NC}"
echo ""
echo -e "${BLUE}Step 1: Enable Event Listener in Realms${NC}"
echo "  The Event Listener must be enabled in each realm's configuration."
echo ""
echo "  ${GREEN}Option A: Terraform (Recommended)${NC}"
echo "  cd terraform"
echo "  terraform plan   # Review changes"
echo "  terraform apply  # Apply to all 11 realms"
echo ""
echo "  ${GREEN}Option B: Manual (Quick Test)${NC}"
echo "  1. Login to Keycloak Admin Console: https://localhost:8443/admin"
echo "  2. Select realm (e.g., dive-v3-broker)"
echo "  3. Navigate: Realm Settings → Events → Event Listeners"
echo "  4. Add: 'dive-amr-enrichment'"
echo "  5. Click Save"
echo "  6. Repeat for all 11 realms"
echo ""
echo -e "${BLUE}Step 2: Test MFA Flow${NC}"
echo "  1. Login as user with SECRET clearance"
echo "  2. Enroll in OTP via Account page"
echo "  3. Logout and login again (with OTP)"
echo "  4. Verify JWT contains: amr: [\"pwd\", \"otp\"]"
echo "  5. Access SECRET resource (should be allowed)"
echo ""
echo -e "${BLUE}Verification Commands:${NC}"
echo "  # Check logs for LOGIN events"
echo "  docker logs -f dive-v3-keycloak | grep \"DIVE AMR\""
echo ""
echo "  # Monitor backend AAL validation"
echo "  docker logs -f dive-v3-backend | grep \"AAL validation\""
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  • AAL-MFA-DEBUGGING-REPORT.md (Root cause analysis)"
echo "  • terraform/modules/realm-mfa/event-listeners.tf (New configuration)"
echo "  • keycloak/extensions/src/main/java/com/dive/keycloak/event/ (Source code)"
echo ""
echo -e "${GREEN}Deployment script complete!${NC}"
echo ""











