#!/bin/bash
# ============================================
# DIVE V3 - Super Admin User Deployment
# ============================================
# This script creates the super admin user in the broker realm
# Username: admin-dive / Password: DiveAdmin2025!

set -e

echo "🔧 DIVE V3 - Deploying Super Admin User to Broker Realm"
echo "========================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the project root
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: Must run this script from the DIVE-V3 project root${NC}"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo -e "${YELLOW}⚠️  Terraform not found. Installing Terraform...${NC}"
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install terraform
        else
            echo -e "${RED}❌ Homebrew not found. Please install Terraform manually.${NC}"
            echo "   Visit: https://developer.hashicorp.com/terraform/downloads"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
        echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
        sudo apt update && sudo apt install terraform
    else
        echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
        exit 1
    fi
fi

# Check if Keycloak is running
echo -e "${YELLOW}🔍 Checking if Keycloak is running...${NC}"
if ! curl -s http://localhost:8081/health > /dev/null; then
    echo -e "${RED}❌ Keycloak is not running!${NC}"
    echo "   Start services with: ./scripts/dev-start.sh"
    exit 1
fi
echo -e "${GREEN}✅ Keycloak is running${NC}"

# Navigate to Terraform directory
cd terraform

# Initialize Terraform (if not already done)
if [ ! -d ".terraform" ]; then
    echo -e "${YELLOW}🔧 Initializing Terraform...${NC}"
    terraform init
fi

# Check if broker-realm.tf has the super admin user
if ! grep -q "keycloak_user.broker_super_admin" broker-realm.tf; then
    echo -e "${RED}❌ Error: broker-realm.tf does not contain super admin user configuration${NC}"
    echo "   Make sure you've applied the changes from this PR"
    exit 1
fi
echo -e "${GREEN}✅ Super admin user configuration found in broker-realm.tf${NC}"

# Plan the changes
echo ""
echo -e "${YELLOW}📋 Planning Terraform changes...${NC}"
terraform plan -out=tfplan

# Ask for confirmation
echo ""
echo -e "${YELLOW}⚠️  This will create the following super admin user:${NC}"
echo "   Realm:    dive-v3-broker"
echo "   Username: admin-dive"
echo "   Password: DiveAdmin2025!"
echo "   Role:     super_admin"
echo ""
read -p "Continue with deployment? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment cancelled${NC}"
    rm -f tfplan
    exit 1
fi

# Apply the changes
echo ""
echo -e "${GREEN}🚀 Applying Terraform changes...${NC}"
terraform apply tfplan

# Clean up plan file
rm -f tfplan

# Return to project root
cd ..

# Verify the user was created
echo ""
echo -e "${YELLOW}🔍 Verifying super admin user creation...${NC}"

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=admin" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Failed to get Keycloak admin token${NC}"
    exit 1
fi

# Check if user exists
USER_EXISTS=$(curl -s -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users?username=admin-dive&exact=true" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq 'length')

if [ "$USER_EXISTS" -eq 1 ]; then
    echo -e "${GREEN}✅ Super admin user 'admin-dive' created successfully!${NC}"
else
    echo -e "${RED}❌ Failed to verify user creation${NC}"
    exit 1
fi

# Success summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Super Admin User Deployment Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Super Admin Credentials:${NC}"
echo "   Realm:    dive-v3-broker"
echo "   Username: admin-dive"
echo "   Password: DiveAdmin2025!"
echo "   Role:     super_admin"
echo ""
echo -e "${YELLOW}🔗 Next Steps:${NC}"
echo "   1. Visit: http://localhost:3000"
echo "   2. Click: 'Login as Super Administrator'"
echo "   3. Use credentials above to login"
echo "   4. Access admin console: http://localhost:3000/admin/dashboard"
echo ""
echo -e "${YELLOW}📖 Documentation:${NC}"
echo "   - Super Admin Guide: SUPER_ADMIN_GUIDE.md"
echo "   - README: README.md (Test Credentials section)"
echo ""
echo -e "${GREEN}🎉 You can now login as super administrator!${NC}"
echo ""

