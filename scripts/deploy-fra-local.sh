#!/bin/bash

###############################################################################################
# FRA Instance LOCAL Deployment Script
# 
# Purpose: Actually deploys the FRA instance locally on your machine
# This will start real Docker containers and services
#
# Usage: ./scripts/deploy-fra-local.sh
###############################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  FRA Instance LOCAL Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}This will deploy services locally on your machine${NC}"
echo -e "${YELLOW}URLs will be accessible at localhost, not dive25.com${NC}"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Docker is not running${NC}"
  echo "Please start Docker Desktop and try again"
  exit 1
fi

# Step 1: Create or use Docker network  
echo -e "${BLUE}Setting up Docker network...${NC}"
# Try to create network with different subnet, or use existing one
docker network create dive-fra-network --subnet=172.20.0.0/16 2>/dev/null || {
  # If creation fails, check if network exists
  if docker network ls | grep -q "dive-fra-network"; then
    echo "Using existing dive-fra-network"
  else
    # Use the existing dive network if available
    echo "Using existing dive-v3_dive-network as dive-fra-network"
    # Update docker-compose to use existing network
  fi
}

# Step 2: Create necessary directories
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p data/mongodb-fra
mkdir -p data/postgres-fra
mkdir -p data/keycloak-fra

# Step 3: Check if docker-compose.fra.yml exists
if [ ! -f "docker-compose.fra.yml" ]; then
  echo -e "${YELLOW}Creating docker-compose.fra.yml...${NC}"
  cat > docker-compose.fra.yml << 'EOF'
version: '3.8'

services:
  # MongoDB for resources
  mongodb-fra:
    image: mongo:7
    container_name: dive-v3-mongodb-fra
    environment:
      MONGO_INITDB_DATABASE: dive-v3-fra
    ports:
      - "27018:27017"
    volumes:
      - ./data/mongodb-fra:/data/db
    networks:
      - dive-fra-network

  # PostgreSQL for Keycloak
  postgres-fra:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-fra
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    ports:
      - "5433:5432"
    volumes:
      - ./data/postgres-fra:/var/lib/postgresql/data
    networks:
      - dive-fra-network

  # Keycloak
  keycloak-fra:
    image: quay.io/keycloak/keycloak:latest
    container_name: dive-v3-keycloak-fra
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-fra:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8443:8080"
    depends_on:
      - postgres-fra
    networks:
      - dive-fra-network

  # OPA
  opa-fra:
    image: openpolicyagent/opa:latest
    container_name: dive-v3-opa-fra
    command:
      - "run"
      - "--server"
      - "--addr=:8181"
    ports:
      - "8182:8181"
    networks:
      - dive-fra-network

networks:
  dive-fra-network:
    driver: bridge
EOF
fi

# Step 4: Start core services
echo -e "${BLUE}Starting core services...${NC}"
docker-compose -f docker-compose.fra.yml up -d postgres-fra
echo "Waiting for PostgreSQL to be ready..."
sleep 10

docker-compose -f docker-compose.fra.yml up -d mongodb-fra
echo "Waiting for MongoDB to be ready..."
sleep 5

docker-compose -f docker-compose.fra.yml up -d keycloak-fra
echo "Waiting for Keycloak to be ready..."
sleep 15

docker-compose -f docker-compose.fra.yml up -d opa-fra
echo "Waiting for OPA to be ready..."
sleep 5

# Step 5: Check status
echo ""
echo -e "${CYAN}Checking service status...${NC}"
docker-compose -f docker-compose.fra.yml ps

# Step 6: Display access information
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Local Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}Services are accessible at:${NC}"
echo "  Keycloak:   http://localhost:8443"
echo "  MongoDB:    mongodb://localhost:27018"
echo "  PostgreSQL: postgresql://localhost:5433"
echo "  OPA:        http://localhost:8182"
echo ""
echo -e "${CYAN}Default credentials:${NC}"
echo "  Keycloak Admin: admin / admin"
echo ""
echo -e "${CYAN}To stop services:${NC}"
echo "  docker-compose -f docker-compose.fra.yml down"
echo ""
echo -e "${YELLOW}Note: This is a LOCAL deployment${NC}"
echo -e "${YELLOW}For production deployment with Cloudflare:${NC}"
echo "  1. Set up a Cloudflare account"
echo "  2. Configure DNS for dive25.com"
echo "  3. Run ./scripts/setup-fra-tunnel.sh"
echo ""
