#!/bin/bash
# Setup Auth0 Demo Mode
# 
# This script configures DIVE V3 for Auth0 integration demo/testing
# Uses mock responses instead of real Auth0 MCP Server

set -e

echo "🔧 Setting up Auth0 Demo Mode for DIVE V3..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Backend configuration
echo -e "${BLUE}📦 Configuring Backend...${NC}"
BACKEND_ENV="backend/.env"

# Check if .env exists
if [ ! -f "$BACKEND_ENV" ]; then
    echo -e "${YELLOW}⚠️  backend/.env not found, creating from template...${NC}"
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example "$BACKEND_ENV"
        echo "✅ Created backend/.env from template"
    else
        touch "$BACKEND_ENV"
        echo "✅ Created empty backend/.env"
    fi
fi

# Add or update Auth0 variables
if grep -q "AUTH0_DOMAIN" "$BACKEND_ENV"; then
    echo "⚡ Updating existing AUTH0_DOMAIN..."
    sed -i.bak 's|^AUTH0_DOMAIN=.*|AUTH0_DOMAIN=demo.auth0.com|' "$BACKEND_ENV"
else
    echo "" >> "$BACKEND_ENV"
    echo "# Auth0 MCP Integration (Demo Mode)" >> "$BACKEND_ENV"
    echo "AUTH0_DOMAIN=demo.auth0.com" >> "$BACKEND_ENV"
fi

if grep -q "AUTH0_MCP_ENABLED" "$BACKEND_ENV"; then
    echo "⚡ Updating existing AUTH0_MCP_ENABLED..."
    sed -i.bak 's|^AUTH0_MCP_ENABLED=.*|AUTH0_MCP_ENABLED=true|' "$BACKEND_ENV"
else
    echo "AUTH0_MCP_ENABLED=true" >> "$BACKEND_ENV"
fi

echo -e "${GREEN}✅ Backend configured${NC}"
echo ""

# Frontend configuration
echo -e "${BLUE}📦 Configuring Frontend...${NC}"
FRONTEND_ENV="frontend/.env.local"

# Check if .env.local exists
if [ ! -f "$FRONTEND_ENV" ]; then
    echo -e "${YELLOW}⚠️  frontend/.env.local not found, creating...${NC}"
    touch "$FRONTEND_ENV"
fi

# Add or update Auth0 variables
if grep -q "NEXT_PUBLIC_AUTH0_DOMAIN" "$FRONTEND_ENV"; then
    echo "⚡ Updating existing NEXT_PUBLIC_AUTH0_DOMAIN..."
    sed -i.bak 's|^NEXT_PUBLIC_AUTH0_DOMAIN=.*|NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com|' "$FRONTEND_ENV"
else
    echo "" >> "$FRONTEND_ENV"
    echo "# Auth0 MCP Integration (Demo Mode)" >> "$FRONTEND_ENV"
    echo "NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com" >> "$FRONTEND_ENV"
fi

if grep -q "NEXT_PUBLIC_AUTH0_MCP_ENABLED" "$FRONTEND_ENV"; then
    echo "⚡ Updating existing NEXT_PUBLIC_AUTH0_MCP_ENABLED..."
    sed -i.bak 's|^NEXT_PUBLIC_AUTH0_MCP_ENABLED=.*|NEXT_PUBLIC_AUTH0_MCP_ENABLED=true|' "$FRONTEND_ENV"
else
    echo "NEXT_PUBLIC_AUTH0_MCP_ENABLED=true" >> "$FRONTEND_ENV"
fi

echo -e "${GREEN}✅ Frontend configured${NC}"
echo ""

# Cleanup backup files
rm -f backend/.env.bak frontend/.env.local.bak 2>/dev/null || true

echo -e "${GREEN}🎉 Auth0 Demo Mode Setup Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Configuration Summary:${NC}"
echo "  Backend:  backend/.env"
echo "    - AUTH0_DOMAIN=demo.auth0.com"
echo "    - AUTH0_MCP_ENABLED=true"
echo ""
echo "  Frontend: frontend/.env.local"
echo "    - NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com"
echo "    - NEXT_PUBLIC_AUTH0_MCP_ENABLED=true"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Restart services for changes to take effect${NC}"
echo ""
echo "Run:"
echo "  docker-compose restart backend frontend"
echo ""
echo "Or full restart:"
echo "  docker-compose down && docker-compose up -d"
echo ""
echo -e "${BLUE}ℹ️  Demo Mode uses mock Auth0 responses${NC}"
echo "  - Mock client_id and client_secret will be generated"
echo "  - No real Auth0 API calls are made"
echo "  - Perfect for testing and demonstration"
echo ""
echo "To use real Auth0 MCP Server:"
echo "  1. Update AUTH0_DOMAIN with your real tenant"
echo "  2. Ensure Auth0 MCP Server is connected"
echo "  3. Replace mock code in admin.controller.ts (line 731)"
echo ""
echo -e "${GREEN}✅ Ready to test Auth0 integration!${NC}"

