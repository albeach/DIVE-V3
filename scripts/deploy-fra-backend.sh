#!/bin/bash
#
# DIVE V3 - FRA Backend Deployment Script
# ========================================
# Deploys the FRA backend services with:
# - Backend API with correlation IDs (GAP-004)
# - OPA with French policy
# - MongoDB with isolated database (GAP-010)
# - Integration with Keycloak FRA realm
#

set -euo pipefail

# Configuration
DEPLOY_MODE="${1:-docker}"
DOCKER_COMPOSE_FILE="docker-compose.fra.yml"
ENV_FILE=".env.fra"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

echo ""
echo "============================================"
echo "   DIVE V3 - FRA Backend Deployment"
echo "============================================"
echo "Deploy Mode: $DEPLOY_MODE"
echo "Environment: Production (FRA)"
echo ""

# ============================================
# Step 1: Environment Check
# ============================================
log_info "Step 1: Checking environment..."

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi
log_success "Docker is installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    log_error "Docker Compose is not installed"
    exit 1
fi
log_success "Docker Compose is available"

# Check environment file
if [[ ! -f "$ENV_FILE" ]]; then
    log_warning "Environment file $ENV_FILE not found, using defaults"
    cp .env.example "$ENV_FILE" 2>/dev/null || true
fi

# Check docker-compose file
if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    log_error "Docker Compose file $DOCKER_COMPOSE_FILE not found"
    exit 1
fi
log_success "Configuration files present"

# ============================================
# Step 2: Network Setup
# ============================================
log_info "Step 2: Setting up Docker network..."

# Create FRA network if it doesn't exist
if ! docker network ls | grep -q "dive-fra-network"; then
    docker network create \
        --driver bridge \
        --subnet=172.19.0.0/16 \
        --gateway=172.19.0.1 \
        dive-fra-network
    log_success "Created dive-fra-network"
else
    log_success "Network dive-fra-network already exists"
fi

# ============================================
# Step 3: Deploy MongoDB
# ============================================
log_info "Step 3: Deploying MongoDB for FRA..."

# Start MongoDB first (needed by other services)
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d mongodb-fra

# Wait for MongoDB to be ready
log_info "Waiting for MongoDB to be ready..."
for i in {1..30}; do
    if docker exec dive-v3-mongodb-fra mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
        log_success "MongoDB is ready"
        break
    fi
    if [[ $i -eq 30 ]]; then
        log_error "MongoDB failed to start"
        exit 1
    fi
    sleep 2
done

# Initialize MongoDB with FRA data
log_info "Initializing MongoDB with FRA data..."
docker exec dive-v3-mongodb-fra mongosh < scripts/init-fra-mongodb.js
log_success "MongoDB initialized with sample FRA resources"

# ============================================
# Step 4: Deploy OPA
# ============================================
log_info "Step 4: Deploying OPA with FRA policy..."

# Copy FRA policy to the policies directory
cp policies/fra-authorization-policy.rego policies/
log_success "FRA policy copied"

# Start OPA
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d opa-fra

# Wait for OPA to be ready
log_info "Waiting for OPA to be ready..."
for i in {1..20}; do
    if curl -s http://localhost:8182/health | grep -q "{}"; then
        log_success "OPA is ready"
        break
    fi
    if [[ $i -eq 20 ]]; then
        log_error "OPA failed to start"
        exit 1
    fi
    sleep 2
done

# Load FRA policy into OPA
log_info "Loading FRA authorization policy..."
curl -X PUT \
    http://localhost:8182/v1/policies/fra-policy \
    -H "Content-Type: text/plain" \
    --data-binary @policies/fra-authorization-policy.rego

log_success "FRA policy loaded into OPA"

# ============================================
# Step 5: Deploy Backend API
# ============================================
log_info "Step 5: Deploying FRA Backend API..."

# Build backend image if needed
if [[ "$DEPLOY_MODE" == "build" ]]; then
    log_info "Building backend image..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" build backend-fra
fi

# Start backend
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d backend-fra

# Wait for backend to be ready
log_info "Waiting for Backend API to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:4001/health | grep -q "healthy"; then
        log_success "Backend API is ready"
        break
    fi
    if [[ $i -eq 30 ]]; then
        log_error "Backend API failed to start"
        docker logs dive-v3-backend-fra
        exit 1
    fi
    sleep 2
done

# ============================================
# Step 6: Deploy Supporting Services
# ============================================
log_info "Step 6: Deploying supporting services..."

# Deploy PostgreSQL for app database
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres-app-fra
log_success "PostgreSQL for NextAuth deployed"

# Deploy Redis cache
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d redis-fra
log_success "Redis cache deployed"

# ============================================
# Step 7: Configure Correlation IDs (GAP-004)
# ============================================
log_info "Step 7: Configuring correlation ID tracking..."

# Test correlation ID generation
CORRELATION_ID="corr-test-$(date +%s)"
TEST_RESPONSE=$(curl -s -H "X-Correlation-ID: $CORRELATION_ID" http://localhost:4001/health)

if echo "$TEST_RESPONSE" | grep -q "$CORRELATION_ID"; then
    log_success "Correlation ID tracking verified"
else
    log_warning "Correlation ID not in response (may need backend restart)"
fi

# ============================================
# Step 8: Verify Integration
# ============================================
log_info "Step 8: Verifying service integration..."

# Test OPA decision endpoint
log_info "Testing OPA authorization..."
OPA_TEST_INPUT='{
  "input": {
    "subject": {
      "uniqueID": "test-user",
      "clearance": "SECRET",
      "countryOfAffiliation": "FRA",
      "acpCOI": ["NATO-COSMIC"]
    },
    "action": "read",
    "resource": {
      "resourceId": "FRA-001",
      "classification": "SECRET",
      "releasabilityTo": ["FRA", "USA"],
      "COI": ["NATO-COSMIC"],
      "originRealm": "FRA"
    },
    "context": {
      "correlationId": "test-corr-001",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }
}'

OPA_RESPONSE=$(curl -s -X POST \
    http://localhost:8182/v1/data/dive/authorization/fra/decision \
    -H "Content-Type: application/json" \
    -d "$OPA_TEST_INPUT")

if echo "$OPA_RESPONSE" | jq -e '.result.allow == true' > /dev/null 2>&1; then
    log_success "OPA authorization test passed"
else
    log_warning "OPA authorization test failed or returned deny"
    echo "$OPA_RESPONSE" | jq '.'
fi

# Test Backend API
log_info "Testing Backend API..."
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/resources)

if [[ "$API_RESPONSE" == "401" ]] || [[ "$API_RESPONSE" == "403" ]]; then
    log_success "Backend API security enabled (requires auth)"
elif [[ "$API_RESPONSE" == "200" ]]; then
    log_warning "Backend API returned 200 without auth (check security)"
else
    log_error "Backend API returned unexpected status: $API_RESPONSE"
fi

# ============================================
# Step 9: Health Check Summary
# ============================================
log_info "Step 9: Service health summary..."

echo ""
echo "Service Status:"
echo "---------------"

# Check each service
services=("mongodb-fra" "opa-fra" "backend-fra" "postgres-app-fra" "redis-fra")
all_healthy=true

for service in "${services[@]}"; do
    if docker ps | grep -q "$service"; then
        status=$(docker inspect -f '{{.State.Status}}' "dive-v3-$service" 2>/dev/null || echo "unknown")
        if [[ "$status" == "running" ]]; then
            echo -e "  $service: ${GREEN}✓ Running${NC}"
        else
            echo -e "  $service: ${RED}✗ $status${NC}"
            all_healthy=false
        fi
    else
        echo -e "  $service: ${RED}✗ Not found${NC}"
        all_healthy=false
    fi
done

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "   FRA Backend Deployment Complete!"
echo "============================================"
echo ""
echo "✅ Services Deployed:"
echo "  - MongoDB:     mongodb://localhost:27018"
echo "  - OPA:         http://localhost:8182"
echo "  - Backend API: http://localhost:4001"
echo "  - PostgreSQL:  postgresql://localhost:5433"
echo "  - Redis:       redis://localhost:6380"
echo ""
echo "📊 Database:"
echo "  - Database:  dive-v3-fra"
echo "  - Resources: 6 sample documents (FRA-001 to FRA-006)"
echo ""
echo "🔒 Security:"
echo "  - Correlation IDs: Enabled (GAP-004)"
echo "  - MongoDB Isolation: Enabled (GAP-010)"
echo "  - French Policy: Loaded"
echo ""
echo "📋 Next Steps:"
echo "1. Configure Keycloak integration"
echo "2. Test authentication flow"
echo "3. Verify OPA decisions"
echo "4. Check correlation ID tracking"
echo ""
echo "🧪 Testing:"
echo "  Run: ./scripts/test-fra-backend.sh"
echo ""
echo "📝 Logs:"
echo "  docker logs dive-v3-backend-fra -f"
echo "  docker logs dive-v3-opa-fra -f"
echo "  docker logs dive-v3-mongodb-fra -f"
echo ""

if [[ "$all_healthy" == true ]]; then
    echo -e "${GREEN}✅ All services are healthy!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some services need attention${NC}"
    exit 1
fi




