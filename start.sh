#!/bin/bash
# =============================================================================
# DIVE V3 - Quick Start Script
# =============================================================================
# Single command to start DIVE V3 with secrets from GCP Secret Manager.
# NO .env files needed - all secrets fetched directly from GCP.
#
# Usage:
#   ./start.sh           # Start USA instance (default)
#   ./start.sh usa       # Start USA instance
#   ./start.sh fra       # Start FRA instance
#   ./start.sh gbr       # Start GBR instance
#   ./start.sh deu       # Start DEU instance
#   ./start.sh stop      # Stop all services
#   ./start.sh logs      # View logs
#
# Prerequisites:
#   - Docker Desktop running
#   - gcloud CLI authenticated (gcloud auth login)
#
# =============================================================================

set -e

INSTANCE="${1:-usa}"
GCP_PROJECT="dive25"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                    DIVE V3 Quick Start                     ║"
    echo "║          Secrets from GCP - No .env files needed           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Handle special commands
case "$INSTANCE" in
    stop)
        echo -e "${YELLOW}Stopping all DIVE V3 containers...${NC}"
        docker compose down
        docker ps -a --format "{{.Names}}" | grep dive-v3 | xargs -r docker stop
        docker ps -a --format "{{.Names}}" | grep dive-v3 | xargs -r docker rm
        echo -e "${GREEN}✅ All containers stopped${NC}"
        exit 0
        ;;
    logs)
        docker compose logs -f
        exit 0
        ;;
    nuke)
        echo -e "${RED}⚠️  NUKING everything - containers, volumes, images...${NC}"
        docker compose down -v --remove-orphans
        docker ps -a --format "{{.Names}}" | grep dive-v3 | xargs -r docker stop 2>/dev/null || true
        docker ps -a --format "{{.Names}}" | grep dive-v3 | xargs -r docker rm 2>/dev/null || true
        docker volume ls -q | grep dive | xargs -r docker volume rm 2>/dev/null || true
        echo -e "${GREEN}✅ Everything nuked${NC}"
        exit 0
        ;;
esac

print_header

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check Docker
if ! docker info &>/dev/null; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Check gcloud authentication
if ! gcloud auth print-access-token &>/dev/null; then
    echo -e "${RED}❌ Not authenticated with GCP. Run: gcloud auth login${NC}"
    exit 1
fi
echo -e "${GREEN}✅ GCP authenticated${NC}"

# =============================================================================
# Fetch secrets from GCP
# =============================================================================
echo ""
echo -e "${BLUE}🔐 Fetching secrets from GCP Secret Manager...${NC}"

INST_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

# Function to fetch secret with fallback
fetch_secret() {
    local secret_name=$1
    local fallback=$2
    local value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "$fallback"
    fi
}

# Fetch instance-specific secrets
export MONGO_PASSWORD=$(fetch_secret "dive-v3-mongodb-$INST_LOWER" "DivePilot2025!")
export POSTGRES_PASSWORD=$(fetch_secret "dive-v3-postgres-$INST_LOWER" "DivePilot2025!")
export KEYCLOAK_ADMIN_PASSWORD=$(fetch_secret "dive-v3-keycloak-$INST_LOWER" "DivePilot2025!SecureAdmin")
export AUTH_SECRET=$(fetch_secret "dive-v3-auth-secret-$INST_LOWER" "dive-v3-auth-secret")
export KEYCLOAK_CLIENT_SECRET=$(fetch_secret "dive-v3-keycloak-client-secret-$INST_LOWER" "dive-v3-client-secret")
export NEXTAUTH_SECRET=$(fetch_secret "dive-v3-nextauth-secret-$INST_LOWER" "$AUTH_SECRET")
export JWT_SECRET=$(fetch_secret "dive-v3-jwt-secret-$INST_LOWER" "dive-v3-jwt-secret")
export REDIS_PASSWORD=$(fetch_secret "dive-v3-redis-$INST_LOWER" "")

# Shared secrets
export BLACKLIST_REDIS_PASSWORD=$(fetch_secret "dive-v3-redis-blacklist" "")
export GRAFANA_ADMIN_PASSWORD=$(fetch_secret "dive-v3-grafana" "admin")

echo -e "${GREEN}✅ Secrets loaded from GCP${NC}"

# Export TF_VAR_ prefixed variables for Terraform
export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"

# Show which secrets were loaded (masked)
echo ""
echo "   Loaded secrets:"
echo "   - MONGO_PASSWORD=***${MONGO_PASSWORD: -4}"
echo "   - POSTGRES_PASSWORD=***${POSTGRES_PASSWORD: -4}"
echo "   - KEYCLOAK_ADMIN_PASSWORD=***${KEYCLOAK_ADMIN_PASSWORD: -4}"
echo "   - KEYCLOAK_CLIENT_SECRET=***${KEYCLOAK_CLIENT_SECRET: -4}"
echo "   - AUTH_SECRET=***${AUTH_SECRET: -4}"
echo "   - TF_VAR_keycloak_admin_password=***${TF_VAR_keycloak_admin_password: -4}"
echo "   - TF_VAR_client_secret=***${TF_VAR_client_secret: -4}"

# =============================================================================
# Start Docker Compose
# =============================================================================
echo ""
INST_UPPER_DISPLAY=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')
echo -e "${BLUE}🚀 Starting DIVE V3 (${INST_UPPER_DISPLAY} instance)...${NC}"

# Stop any existing containers first
docker compose down --remove-orphans 2>/dev/null || true

# Start fresh
docker compose up -d

echo ""
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"

# Wait for health checks
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    HEALTHY=$(docker ps --filter "name=dive-v3" --filter "health=healthy" --format "{{.Names}}" | wc -l | tr -d ' ')
    TOTAL=$(docker ps --filter "name=dive-v3" --format "{{.Names}}" | wc -l | tr -d ' ')
    
    echo -ne "\r   Health: $HEALTHY/$TOTAL containers healthy (${WAITED}s)"
    
    if [ "$HEALTHY" -ge "$((TOTAL - 1))" ]; then  # Allow 1 unhealthy (frontend takes longer)
        break
    fi
    
    sleep 5
    WAITED=$((WAITED + 5))
done

echo ""
echo ""

# =============================================================================
# Show status
# =============================================================================
echo -e "${BLUE}📊 Service Status:${NC}"
docker ps --filter "name=dive-v3" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -15

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DIVE V3 is running!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "   🌐 Access Points:"
echo "   • Frontend:      https://localhost:3000"
echo "   • Backend API:   https://localhost:4000"
echo "   • Keycloak:      https://localhost:8443/admin"
echo "   • OPA:           http://localhost:8181"
echo ""
echo "   📋 Commands:"
echo "   • View logs:     ./start.sh logs"
echo "   • Stop:          ./start.sh stop"
echo "   • Nuke all:      ./start.sh nuke"
echo ""
echo "   🔐 Keycloak Login:"
echo "   • Username: admin"
echo "   • Password: (from GCP Secret Manager)"
echo ""

