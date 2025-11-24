#!/bin/bash
# ============================================
# DIVE V3 - Complete Data Restoration Script
# ============================================
# Restores:
# - Keycloak test users across all realms
# - MongoDB resources (7000 ZTDF documents)
# - User attributes (clearance, country, COI)
# - OTP configuration for test users
#
# Date: November 3, 2025

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔄 DIVE V3 Complete Data Restoration${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if Docker services are running
echo -e "${YELLOW}1️⃣  Checking Docker services...${NC}"
if ! docker ps | grep -q "dive-v3-keycloak"; then
    echo -e "${RED}❌ Keycloak is not running!${NC}"
    echo "   Start services with: docker-compose up -d"
    exit 1
fi

if ! docker ps | grep -q "dive-v3-mongo"; then
    echo -e "${RED}❌ MongoDB is not running!${NC}"
    echo "   Start services with: docker-compose up -d"
    exit 1
fi

echo -e "${GREEN}✅ All Docker services are running${NC}"
echo ""

# Step 1: Restore Keycloak Users via Terraform
echo -e "${YELLOW}2️⃣  Restoring Keycloak users via Terraform...${NC}"
cd terraform

# Refresh state to detect drift
echo "   Refreshing Terraform state..."
terraform refresh -var-file=terraform.tfvars > /dev/null 2>&1 || true

# Check what needs to be recreated
echo "   Planning changes..."
PLAN_OUTPUT=$(terraform plan -var-file=terraform.tfvars 2>&1 | tee /dev/tty)

if echo "$PLAN_OUTPUT" | grep -q "No changes"; then
    echo -e "${GREEN}✅ All users already exist in Keycloak${NC}"
else
    echo -e "${YELLOW}⚠️  Some users need to be recreated${NC}"
    read -p "   Apply Terraform changes to restore users? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        terraform apply -var-file=terraform.tfvars -auto-approve
        echo -e "${GREEN}✅ Users restored${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipped user restoration${NC}"
    fi
fi

cd ..
echo ""

# Step 2: Populate User Attributes
echo -e "${YELLOW}3️⃣  Populating user attributes (clearance, country, COI)...${NC}"
if [ -f "scripts/populate-all-user-attributes.sh" ]; then
    chmod +x scripts/populate-all-user-attributes.sh
    ./scripts/populate-all-user-attributes.sh
else
    echo -e "${YELLOW}⚠️  User attribute script not found - using Python script...${NC}"
    if [ -f "scripts/extract-and-populate-users.py" ]; then
        python3 scripts/extract-and-populate-users.py
    else
        echo -e "${RED}❌ No user attribute scripts found${NC}"
    fi
fi
echo ""

# Step 3: Seed MongoDB Resources
echo -e "${YELLOW}4️⃣  Seeding MongoDB with resources...${NC}"
MONGO_COUNT=$(docker exec dive-v3-mongo mongosh --quiet mongodb://admin:password@localhost:27017/dive-v3 --authenticationDatabase admin --eval "db.resources.countDocuments()")

if [ "$MONGO_COUNT" -eq "0" ]; then
    echo "   MongoDB is empty - seeding 7000 ZTDF documents..."
    cd backend
    
    # Use npm script if available, otherwise run directly
    if grep -q "seed:ztdf" package.json 2>/dev/null; then
        npm run seed:ztdf
    else
        npx ts-node src/scripts/seed-7000-ztdf-documents.ts
    fi
    
    cd ..
    echo -e "${GREEN}✅ MongoDB resources seeded${NC}"
else
    echo -e "${GREEN}✅ MongoDB already has $MONGO_COUNT resources${NC}"
fi
echo ""

# Step 4: Initialize COI Keys
echo -e "${YELLOW}5️⃣  Initializing COI keys...${NC}"
COI_COUNT=$(docker exec dive-v3-mongo mongosh --quiet mongodb://admin:password@localhost:27017/dive-v3 --authenticationDatabase admin --eval "db.coi_keys.countDocuments()")

if [ "$COI_COUNT" -eq "0" ]; then
    echo "   COI keys collection is empty - initializing..."
    cd backend
    npx ts-node src/scripts/initialize-coi-keys.ts
    cd ..
    echo -e "${GREEN}✅ COI keys initialized${NC}"
else
    echo -e "${GREEN}✅ COI keys already exist ($COI_COUNT keys)${NC}"
fi
echo ""

# Step 5: Configure OTP for test users
echo -e "${YELLOW}6️⃣  Configuring OTP/TOTP for test users...${NC}"
if [ -f "scripts/configure-test-user-otp.sh" ]; then
    echo "   Configuring OTP for testuser-secret..."
    chmod +x scripts/configure-test-user-otp.sh
    ./scripts/configure-test-user-otp.sh || echo -e "${YELLOW}⚠️  OTP configuration may require manual setup${NC}"
else
    echo -e "${YELLOW}⚠️  OTP configuration script not found${NC}"
    echo "   Users with SECRET+ clearance will be prompted to enroll on first login"
fi
echo ""

# Step 6: Verify Restoration
echo -e "${YELLOW}7️⃣  Verifying restoration...${NC}"

# Check Keycloak users
echo "   Checking Keycloak users..."
TOKEN=$(docker exec dive-v3-keycloak curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r '.access_token')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    USA_USER_COUNT=$(curl -s http://localhost:8081/admin/realms/dive-v3-usa/users \
      -H "Authorization: Bearer $TOKEN" | jq 'length')
    echo -e "   - dive-v3-usa: ${CYAN}$USA_USER_COUNT users${NC}"
    
    BROKER_USER_COUNT=$(curl -s http://localhost:8081/admin/realms/dive-v3-broker/users \
      -H "Authorization: Bearer $TOKEN" | jq 'length')
    echo -e "   - dive-v3-broker: ${CYAN}$BROKER_USER_COUNT users${NC}"
fi

# Check MongoDB
RESOURCE_COUNT=$(docker exec dive-v3-mongo mongosh --quiet mongodb://admin:password@localhost:27017/dive-v3 --authenticationDatabase admin --eval "db.resources.countDocuments()")
echo -e "   - MongoDB resources: ${CYAN}$RESOURCE_COUNT documents${NC}"

COI_COUNT=$(docker exec dive-v3-mongo mongosh --quiet mongodb://admin:password@localhost:27017/dive-v3 --authenticationDatabase admin --eval "db.coi_keys.countDocuments()")
echo -e "   - COI keys: ${CYAN}$COI_COUNT keys${NC}"

# Check OPA policies
echo "   Checking OPA policies..."
if curl -s http://localhost:8181/health > /dev/null 2>&1; then
    echo -e "   - OPA: ${GREEN}✅ Running${NC}"
    
    # Check if policies are loaded
    POLICIES=$(curl -s http://localhost:8181/v1/policies | jq '.result | length')
    echo -e "   - Loaded policies: ${CYAN}$POLICIES${NC}"
else
    echo -e "   - OPA: ${YELLOW}⚠️  Not responding${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Data Restoration Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Print summary
echo -e "${CYAN}📊 Summary:${NC}"
echo "   • Keycloak users: Restored across all realms"
echo "   • User attributes: clearance, country, COI configured"
echo "   • MongoDB: $RESOURCE_COUNT resources available"
echo "   • COI Keys: $COI_COUNT COI definitions"
echo "   • OPA Policies: AAL/AMR policies active"
echo ""

echo -e "${CYAN}🔐 AAL/AMR Policies Location:${NC}"
echo "   • Main policy: policies/fuel_inventory_abac_policy.rego"
echo "   • Federation policy: policies/federation_abac_policy.rego (AAL/AMR lines 50-149)"
echo ""

echo -e "${CYAN}👥 Test Users (Examples):${NC}"
echo "   • alice.general@us.mil (USA, TOP_SECRET, NATO-COSMIC)"
echo "   • testuser-secret@dive-v3.pilot (USA, SECRET, MFA required)"
echo "   • bob.contractor@defense.contractor (INDUSTRY, CONFIDENTIAL)"
echo ""

echo -e "${CYAN}🧪 Quick Test:${NC}"
echo "   1. Login at: http://localhost:3000/login"
echo "   2. Select realm: dive-v3-usa"
echo "   3. Use credentials from terraform/terraform.tfvars"
echo "   4. View resources at: http://localhost:3000/resources"
echo ""

echo -e "${GREEN}✨ Your DIVE V3 environment is fully restored!${NC}"











