#!/bin/bash

set -e

echo "🚀 Starting DIVE V3 Development Environment"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites met${NC}"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠️  .env.local not found. Copying from .env.example...${NC}"
    cp .env.example .env.local
    
    # Generate AUTH_SECRET if needed
    echo -e "${BLUE}🔐 Generating AUTH_SECRET...${NC}"
    AUTH_SECRET=$(openssl rand -base64 32)
    
    # Update .env.local with generated secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env.local
    else
        # Linux
        sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env.local
    fi
    
    echo -e "${GREEN}✅ .env.local created with generated secrets${NC}"
fi

# Source environment variables
export $(grep -v '^#' .env.local | xargs)

# Start Docker services (infrastructure only for faster dev)
echo -e "${BLUE}🐳 Starting Docker services (infrastructure)...${NC}"
docker-compose -f docker-compose.dev.yml up -d

# Wait for Keycloak to be ready
echo -e "${YELLOW}⏳ Waiting for Keycloak to be ready...${NC}"
MAX_ATTEMPTS=60
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:8081/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Keycloak is ready${NC}"
        break
    fi
    echo -n "."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}❌ Keycloak failed to start. Check logs: docker-compose logs keycloak${NC}"
    exit 1
fi

# Wait for MongoDB
echo -e "${YELLOW}⏳ Waiting for MongoDB to be ready...${NC}"
ATTEMPT=0
while [ $ATTEMPT -lt 30 ]; do
    if docker exec dive-v3-mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MongoDB is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
done

# Wait for OPA
echo -e "${YELLOW}⏳ Waiting for OPA to be ready...${NC}"
ATTEMPT=0
while [ $ATTEMPT -lt 30 ]; do
    if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OPA is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
done

# Run Terraform to configure Keycloak
echo -e "${BLUE}🔧 Configuring Keycloak with Terraform...${NC}"
cd terraform

# Initialize Terraform if needed
if [ ! -d ".terraform" ]; then
    echo -e "${YELLOW}📦 Initializing Terraform...${NC}"
    terraform init -upgrade > /dev/null 2>&1
fi

# Apply Terraform configuration
terraform apply -auto-approve

# Get client secret and update .env.local
echo -e "${BLUE}🔐 Updating client secret in .env.local...${NC}"
CLIENT_SECRET=$(terraform output -raw client_secret)

cd ..

# Update .env.local with the new client secret
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/KEYCLOAK_CLIENT_SECRET=.*/KEYCLOAK_CLIENT_SECRET=${CLIENT_SECRET}/" .env.local
else
    # Linux
    sed -i "s/KEYCLOAK_CLIENT_SECRET=.*/KEYCLOAK_CLIENT_SECRET=${CLIENT_SECRET}/" .env.local
fi

echo -e "${GREEN}✅ Keycloak configured${NC}"

# Seed MongoDB database
echo -e "${BLUE}📊 Seeding MongoDB with sample resources...${NC}"
if [ -d "backend/node_modules" ]; then
    cd backend
    npm run seed-database
    cd ..
else
    echo -e "${YELLOW}⚠️  Backend dependencies not installed. Run 'cd backend && npm install' first, then run seed manually: npm run seed-database${NC}"
fi

echo ""
echo -e "${GREEN}✅ DIVE V3 Development Environment Ready!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}🌐 Services:${NC}"
echo "  Keycloak Admin:  http://localhost:8081/admin (admin/admin)"
echo "  Next.js App:     http://localhost:3000"
echo "  Backend API:     http://localhost:4000"
echo "  OPA Server:      http://localhost:8181"
echo "  KAS Service:     http://localhost:8080 (Week 4)"
echo "  MongoDB:         mongodb://localhost:27017"
echo ""
echo -e "${BLUE}👤 Test Users (U.S. IdP):${NC}"
echo "  testuser-us         Password123!  (SECRET clearance)"
echo "  testuser-us-confid  Password123!  (CONFIDENTIAL clearance)"
echo "  testuser-us-unclass Password123!  (UNCLASSIFIED)"
echo ""
echo -e "${BLUE}🧪 Next Steps:${NC}"
echo "  1. Install dependencies:"
echo "     cd frontend && npm install"
echo "     cd ../backend && npm install"
echo ""
echo "  2. Start development servers:"
echo "     cd frontend && npm run dev"
echo "     cd backend && npm run dev"
echo ""
echo "  3. Or use Docker dev mode (already running)"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "  Implementation Plan: dive-v3-implementation-plan.md"
echo "  Architecture:        (see Section 2 of implementation plan)"
echo "  Test Scenarios:      (see Section 10 of implementation plan)"
echo ""
echo -e "${YELLOW}📝 Important: Frontend and Backend NOT running yet!${NC}"
echo -e "${YELLOW}   Infrastructure services only (Keycloak, MongoDB, OPA).${NC}"
echo ""
echo -e "${BLUE}To run frontend and backend:${NC}"
echo "  Terminal 1: cd frontend && npm install && npm run dev"
echo "  Terminal 2: cd backend && npm install && npm run dev"
echo ""
echo -e "${BLUE}Or use full Docker mode:${NC}"
echo "  docker-compose up -d  (builds and runs all services)"
echo ""

