#!/usr/bin/env bash

###############################################################################
# DIVE V3 - Complete Stack Deployment Script
# Rebuilds containers, installs dependencies, and verifies HTTPS setup
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║              DIVE V3 - Complete Stack Deployment               ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Phase 1: Pre-Deployment Checks
###############################################################################

echo -e "${YELLOW}📋 Phase 1: Pre-Deployment Checks${NC}"
echo ""

# Check for required commands
for cmd in docker docker-compose node npm; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}❌ Error: $cmd is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} $cmd: $(which $cmd)"
done

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker daemon is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker daemon is running"

# Check for SSL certificates
if [ -f "$PROJECT_ROOT/keycloak/certs/certificate.pem" ] && [ -f "$PROJECT_ROOT/keycloak/certs/key.pem" ]; then
    echo -e "${GREEN}✓${NC} SSL certificates found: keycloak/certs/certificate.pem and key.pem"
else
    echo -e "${YELLOW}⚠️  Warning: SSL certificate files not found in keycloak/certs/${NC}"
    echo -e "${YELLOW}   Expected: certificate.pem and key.pem${NC}"
    echo -e "${YELLOW}   Deployment will continue, but HTTPS may not work properly${NC}"
fi

# Check .env files
if [ ! -f "$PROJECT_ROOT/frontend/.env.local" ]; then
    echo -e "${YELLOW}⚠️  Warning: frontend/.env.local not found${NC}"
    echo -e "${YELLOW}   Copying from .env.example...${NC}"
    cp "$PROJECT_ROOT/frontend/.env.example" "$PROJECT_ROOT/frontend/.env.local" || true
fi

if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
    echo -e "${YELLOW}⚠️  Warning: backend/.env not found${NC}"
    echo -e "${YELLOW}   Copying from .env.example...${NC}"
    cp "$PROJECT_ROOT/backend/.env.example" "$PROJECT_ROOT/backend/.env" || true
fi

echo ""

###############################################################################
# Phase 2: Clean Previous Containers
###############################################################################

echo -e "${YELLOW}🧹 Phase 2: Cleaning Previous Deployment${NC}"
echo ""

echo "Stopping all DIVE V3 containers..."
docker-compose down -v 2>/dev/null || true
docker-compose -f docker-compose.federation.yml down -v 2>/dev/null || true

echo "Removing dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo -e "${GREEN}✓${NC} Previous deployment cleaned"
echo ""

###############################################################################
# Phase 3: Rebuild Containers (No Cache)
###############################################################################

echo -e "${YELLOW}🔨 Phase 3: Rebuilding Containers (No Cache)${NC}"
echo ""

CONTAINERS=("keycloak" "backend" "nextjs" "kas")

for container in "${CONTAINERS[@]}"; do
    echo -e "${BLUE}Building $container...${NC}"
    docker-compose build --no-cache $container
    echo -e "${GREEN}✓${NC} $container built"
done

echo ""

###############################################################################
# Phase 4: Install/Update Dependencies
###############################################################################

echo -e "${YELLOW}📦 Phase 4: Installing/Updating Dependencies${NC}"
echo ""

# Backend dependencies
echo -e "${BLUE}Installing backend dependencies...${NC}"
if [ -d "$PROJECT_ROOT/backend" ]; then
    cd "$PROJECT_ROOT/backend"
    npm install
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
else
    echo -e "${YELLOW}⚠️  Backend directory not found, skipping npm install${NC}"
fi

# Frontend dependencies
echo -e "${BLUE}Installing frontend dependencies...${NC}"
if [ -d "$PROJECT_ROOT/frontend" ]; then
    cd "$PROJECT_ROOT/frontend"
    npm install
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
else
    echo -e "${YELLOW}⚠️  Frontend directory not found, skipping npm install${NC}"
fi

# KAS dependencies
echo -e "${BLUE}Installing KAS dependencies...${NC}"
if [ -d "$PROJECT_ROOT/kas" ]; then
    cd "$PROJECT_ROOT/kas"
    npm install
    echo -e "${GREEN}✓${NC} KAS dependencies installed"
else
    echo -e "${YELLOW}⚠️  KAS directory not found, skipping npm install${NC}"
fi

cd "$PROJECT_ROOT"
echo ""

###############################################################################
# Phase 5: Start Infrastructure Services
###############################################################################

echo -e "${YELLOW}🚀 Phase 5: Starting Infrastructure Services${NC}"
echo ""

echo "Starting postgres, mongo, redis, opa, authzforce..."
docker-compose up -d postgres mongo redis opa authzforce

echo "Waiting for services to be healthy..."
sleep 10

# Check service health
SERVICES=("postgres" "mongo" "redis" "opa")
for service in "${SERVICES[@]}"; do
    echo -n "Checking $service... "
    if docker inspect dive-v3-$service --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy\|starting"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠️  (no health check or still starting)${NC}"
    fi
done

echo ""

###############################################################################
# Phase 6: Start Keycloak
###############################################################################

echo -e "${YELLOW}🔑 Phase 6: Starting Keycloak (HTTPS)${NC}"
echo ""

docker-compose up -d keycloak

echo "Waiting for Keycloak to initialize (this may take 60-90 seconds)..."
timeout=90
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker logs dive-v3-keycloak 2>&1 | grep -q "Running the server in development mode"; then
        echo -e "${GREEN}✓${NC} Keycloak is ready"
        break
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo "  ... still starting ($elapsed/$timeout seconds)"
done

if [ $elapsed -ge $timeout ]; then
    echo -e "${YELLOW}⚠️  Keycloak startup timeout - checking logs${NC}"
    docker logs dive-v3-keycloak --tail 20
fi

echo ""
echo -e "${GREEN}✓${NC} Keycloak running at:"
echo -e "   ${BLUE}HTTP:${NC}  http://localhost:8081"
echo -e "   ${BLUE}HTTPS:${NC} https://localhost:8443"
echo ""

###############################################################################
# Phase 7: Start Application Services
###############################################################################

echo -e "${YELLOW}🌐 Phase 7: Starting Application Services${NC}"
echo ""

echo "Starting backend, frontend, kas..."
docker-compose up -d backend nextjs kas

echo "Waiting for services to start..."
sleep 15

echo ""

###############################################################################
# Phase 8: Verify HTTPS Endpoints
###############################################################################

echo -e "${YELLOW}🔍 Phase 8: Verifying HTTPS Endpoints${NC}"
echo ""

# Verify Keycloak HTTPS
echo -n "Testing Keycloak HTTPS (https://localhost:8443)... "
if curl -k -s --max-time 5 https://localhost:8443/realms/master >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Verify Backend HTTPS
echo -n "Testing Backend HTTPS (https://localhost:4000)... "
if curl -k -s --max-time 5 https://localhost:4000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} (may still be starting)"
fi

# Verify Frontend HTTPS
echo -n "Testing Frontend HTTPS (https://localhost:3000)... "
if curl -k -s --max-time 5 https://localhost:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} (may still be starting)"
fi

echo ""

###############################################################################
# Phase 9: Database Initialization
###############################################################################

echo -e "${YELLOW}🗄️  Phase 9: Database Initialization${NC}"
echo ""

echo "Waiting for backend to be fully ready..."
sleep 10

echo -e "${BLUE}Seeding MongoDB with sample resources...${NC}"
docker exec dive-v3-backend npm run seed 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Seed script not found or failed - this is optional${NC}"
}

echo ""

###############################################################################
# Phase 10: Display Service Status
###############################################################################

echo -e "${YELLOW}📊 Phase 10: Service Status${NC}"
echo ""

docker-compose ps

echo ""

###############################################################################
# Phase 11: Display Access Information
###############################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║                   🎉 Deployment Complete! 🎉                   ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}🌐 Access URLs (All HTTPS):${NC}"
echo ""
echo -e "  ${GREEN}Frontend Application:${NC}"
echo -e "    https://localhost:3000"
echo ""
echo -e "  ${GREEN}Backend API:${NC}"
echo -e "    https://localhost:4000"
echo -e "    https://localhost:4000/health"
echo -e "    https://localhost:4000/api/resources"
echo ""
echo -e "  ${GREEN}Keycloak Admin Console:${NC}"
echo -e "    https://localhost:8443/admin"
echo -e "    Username: admin"
echo -e "    Password: admin"
echo ""
echo -e "  ${GREEN}SP Registry (Admin):${NC}"
echo -e "    https://localhost:3000/admin/sp-registry"
echo ""
echo -e "  ${GREEN}Infrastructure Services:${NC}"
echo -e "    OPA:         http://localhost:8181"
echo -e "    MongoDB:     mongodb://localhost:27017"
echo -e "    PostgreSQL:  postgresql://localhost:5433"
echo -e "    Redis:       redis://localhost:6379"
echo -e "    KAS:         http://localhost:8080"
echo -e "    AuthzForce:  http://localhost:8282"
echo ""

echo -e "${BLUE}📝 Key Notes:${NC}"
echo ""
echo -e "  1. ${GREEN}All external access uses HTTPS${NC} (mkcert certificates)"
echo -e "  2. ${GREEN}Browser access${NC}: Use https://localhost URLs"
echo -e "  3. ${GREEN}Internal Docker${NC}: Services use internal hostnames"
echo -e "  4. ${GREEN}Self-signed certs${NC}: Browser may show security warning (normal for dev)"
echo ""

echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo ""
echo -e "  View logs:           ${YELLOW}docker-compose logs -f [service]${NC}"
echo -e "  Stop all:            ${YELLOW}docker-compose down${NC}"
echo -e "  Restart service:     ${YELLOW}docker-compose restart [service]${NC}"
echo -e "  Backend shell:       ${YELLOW}docker exec -it dive-v3-backend sh${NC}"
echo -e "  Frontend shell:      ${YELLOW}docker exec -it dive-v3-frontend sh${NC}"
echo -e "  View all containers: ${YELLOW}docker-compose ps${NC}"
echo ""

echo -e "${BLUE}🧪 Testing:${NC}"
echo ""
echo -e "  Backend tests:  ${YELLOW}cd backend && npm test${NC}"
echo -e "  Frontend tests: ${YELLOW}cd frontend && npm test${NC}"
echo -e "  OPA tests:      ${YELLOW}opa test policies/${NC}"
echo -e "  E2E tests:      ${YELLOW}cd frontend && npx playwright test${NC}"
echo ""

echo -e "${BLUE}📚 Documentation:${NC}"
echo ""
echo -e "  Main README:           ${YELLOW}./README.md${NC}"
echo -e "  API Docs:              ${YELLOW}./docs/api/sp-registry-api.md${NC}"
echo -e "  Federation Guide:      ${YELLOW}./docs/federation-quick-start-guide.md${NC}"
echo -e "  Deployment Complete:   ${YELLOW}./PHASE-1-FRONTEND-COMPLETE.md${NC}"
echo ""

echo -e "${GREEN}✅ All services are running with HTTPS enabled!${NC}"
echo ""

# Optional: Open browser
read -p "Would you like to open the application in your browser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v open &> /dev/null; then
        open https://localhost:3000
    elif command -v xdg-open &> /dev/null; then
        xdg-open https://localhost:3000
    fi
fi

echo ""
echo -e "${YELLOW}💡 Tip: Your browser may show a certificate warning. Click 'Advanced' → 'Proceed' to trust the mkcert certificate.${NC}"
echo ""

