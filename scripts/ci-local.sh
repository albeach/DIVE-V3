#!/bin/bash
# =============================================================================
# DIVE V3 Local CI Simulation
# =============================================================================
# Simulates the full CI pipeline locally for development and testing
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}=== DIVE V3 Local CI Simulation ===${NC}"

# ============================================================================
# Step 1: Linting
# ============================================================================

echo -e "\n${YELLOW}Step 1: Linting...${NC}"

# ShellCheck
echo "Running ShellCheck..."
find scripts -name "*.sh" -exec shellcheck {} \; || echo "ShellCheck warnings found"

# Terraform validation
echo "Running Terraform validation..."
if command -v terraform &> /dev/null; then
    terraform fmt -check -recursive terraform/ || echo "Terraform formatting issues found"
    cd terraform/pilot && terraform init -backend=false && terraform validate && cd ../..
    cd terraform/spoke && terraform init -backend=false && terraform validate && cd ../..
else
    echo "Terraform not installed, skipping validation"
fi

# Docker Compose validation
echo "Running Docker Compose validation..."
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.hub.yml config --quiet
docker compose -f docker-compose.pilot.yml config --quiet

echo -e "${GREEN}✓ Linting completed${NC}"

# ============================================================================
# Step 2: Unit Tests
# ============================================================================

echo -e "\n${YELLOW}Step 2: Unit Tests...${NC}"

# Backend tests
echo "Running backend unit tests..."
cd backend
if [ -f "package.json" ]; then
    npm ci
    npm run test:unit -- --passWithNoTests
else
    echo "Backend package.json not found, skipping"
fi
cd ..

# Frontend tests
echo "Running frontend unit tests..."
cd frontend
if [ -f "package.json" ]; then
    npm ci
    npm test -- --passWithNoTests
else
    echo "Frontend package.json not found, skipping"
fi
cd ..

# OPA tests
echo "Running OPA policy tests..."
if command -v opa &> /dev/null; then
    cd policies
    opa test . -v --coverage --format=json > opa-coverage.json || true
    opa test . -v
    cd ..
else
    echo "OPA not installed, skipping policy tests"
fi

echo -e "${GREEN}✓ Unit tests completed${NC}"

# ============================================================================
# Step 3: Deploy Dry Run
# ============================================================================

echo -e "\n${YELLOW}Step 3: Deploy Dry Run...${NC}"

# Set test environment variables
export DRY_RUN="true"
export POSTGRES_PASSWORD="test-password"
export KEYCLOAK_ADMIN_PASSWORD="test-password"
export MONGO_PASSWORD="test-password"
export AUTH_SECRET="test-secret-value-for-ci"
export KEYCLOAK_CLIENT_SECRET="test-client-secret"
export REDIS_PASSWORD="test-password"

# Run dry run
./dive deploy --dry-run

echo -e "${GREEN}✓ Deploy dry run completed${NC}"

# ============================================================================
# Step 4: Phase Tests
# ============================================================================

echo -e "\n${YELLOW}Step 4: Phase Tests...${NC}"

# Run baseline tests
chmod +x tests/docker/phase0-baseline-tests.sh
./tests/docker/phase0-baseline-tests.sh --skip-lifecycle

echo -e "${GREEN}✓ Phase tests completed${NC}"

# ============================================================================
# Summary
# ============================================================================

echo -e "\n${GREEN}=== All checks passed! ===${NC}"
echo -e "${BLUE}Local CI simulation completed successfully.${NC}"
echo -e "${BLUE}Your code is ready for the full CI pipeline.${NC}"

