#!/bin/bash

# ============================================
# DIVE V3 - Multi-Platform Compatibility Checker
# ============================================
# Verifies that all services are running with native architecture
# Usage: ./scripts/verify-platform-compatibility.sh

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DIVE V3 Multi-Platform Compatibility Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Detect host architecture
HOST_ARCH=$(uname -m)
echo -e "${BLUE}Host Architecture:${NC} ${HOST_ARCH}"

if [ "$HOST_ARCH" = "arm64" ] || [ "$HOST_ARCH" = "aarch64" ]; then
    EXPECTED_ARCH="aarch64"
    ARCH_NAME="ARM64"
elif [ "$HOST_ARCH" = "x86_64" ]; then
    EXPECTED_ARCH="x86_64"
    ARCH_NAME="AMD64"
else
    echo -e "${RED}❌ Unknown host architecture: ${HOST_ARCH}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Expected container architecture: ${ARCH_NAME} (${EXPECTED_ARCH})${NC}"
echo ""

# Check Docker version
echo -e "${BLUE}Checking Docker version...${NC}"
DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "Docker version: ${DOCKER_VERSION}"

DOCKER_MAJOR=$(echo ${DOCKER_VERSION} | cut -d. -f1)
if [ ${DOCKER_MAJOR} -lt 24 ]; then
    echo -e "${YELLOW}⚠️  Warning: Docker version ${DOCKER_VERSION} may not support all multi-platform features${NC}"
    echo -e "${YELLOW}   Recommended: Docker 24.0.0 or higher${NC}"
else
    echo -e "${GREEN}✅ Docker version is compatible${NC}"
fi
echo ""

# Check Docker Compose version
echo -e "${BLUE}Checking Docker Compose...${NC}"
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo -e "${GREEN}✅ Docker Compose V2 detected: ${COMPOSE_VERSION}${NC}"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo -e "${YELLOW}⚠️  Docker Compose V1 detected: ${COMPOSE_VERSION}${NC}"
    echo -e "${YELLOW}   Recommended: Upgrade to Docker Compose V2${NC}"
else
    echo -e "${RED}❌ Docker Compose not found${NC}"
    exit 1
fi
echo ""

# Check if services are running
echo -e "${BLUE}Checking running services...${NC}"
if ! docker compose ps --services --filter "status=running" &> /dev/null; then
    echo -e "${RED}❌ No services are running. Start with: docker compose up -d${NC}"
    exit 1
fi

RUNNING_SERVICES=$(docker compose ps --services --filter "status=running")
SERVICE_COUNT=$(echo "${RUNNING_SERVICES}" | wc -l)
echo -e "${GREEN}✅ ${SERVICE_COUNT} services running${NC}"
echo ""

# Verify each service's architecture
echo -e "${BLUE}Verifying service architectures...${NC}"
echo ""

EMULATION_DETECTED=0
ERRORS=0

for SERVICE in ${RUNNING_SERVICES}; do
    echo -e "${BLUE}Checking ${SERVICE}...${NC}"
    
    # Get container architecture
    CONTAINER_ARCH=$(docker compose exec -T ${SERVICE} uname -m 2>/dev/null || echo "ERROR")
    
    if [ "$CONTAINER_ARCH" = "ERROR" ]; then
        echo -e "${RED}  ❌ Could not check architecture (service may not support shell)${NC}"
        ERRORS=$((ERRORS + 1))
    elif [ "$CONTAINER_ARCH" = "$EXPECTED_ARCH" ]; then
        echo -e "${GREEN}  ✅ Native ${ARCH_NAME}: ${CONTAINER_ARCH}${NC}"
    else
        echo -e "${YELLOW}  ⚠️  Emulated: ${CONTAINER_ARCH} (expected ${EXPECTED_ARCH})${NC}"
        echo -e "${YELLOW}     This will cause slower performance!${NC}"
        EMULATION_DETECTED=1
    fi
done

echo ""

# Check for QEMU processes (indicates emulation)
echo -e "${BLUE}Checking for QEMU emulation...${NC}"
if docker compose logs 2>&1 | grep -q "qemu"; then
    echo -e "${YELLOW}⚠️  QEMU emulation detected in logs${NC}"
    echo -e "${YELLOW}   This indicates some containers are running with emulation${NC}"
    EMULATION_DETECTED=1
else
    echo -e "${GREEN}✅ No QEMU emulation detected${NC}"
fi
echo ""

# Check docker-compose.yml for hardcoded platforms
echo -e "${BLUE}Checking docker-compose.yml for platform specifications...${NC}"
if grep -q "platform:" docker-compose.yml; then
    echo -e "${YELLOW}⚠️  Platform specifications found in docker-compose.yml:${NC}"
    grep -n "platform:" docker-compose.yml | while read line; do
        echo -e "${YELLOW}     ${line}${NC}"
    done
    echo -e "${YELLOW}   Consider removing these to enable native execution on all platforms${NC}"
else
    echo -e "${GREEN}✅ No hardcoded platform specifications${NC}"
fi
echo ""

# Check Dockerfiles for platform-specific code
echo -e "${BLUE}Checking Dockerfiles for multi-platform support...${NC}"
DOCKERFILE_COUNT=$(find . -name "Dockerfile*" -not -path "*/node_modules/*" | wc -l)
TARGETARCH_COUNT=$(find . -name "Dockerfile*" -not -path "*/node_modules/*" -exec grep -l "TARGETARCH" {} \; | wc -l)

echo "Total Dockerfiles: ${DOCKERFILE_COUNT}"
echo "Dockerfiles with TARGETARCH: ${TARGETARCH_COUNT}"

if [ ${TARGETARCH_COUNT} -gt 0 ]; then
    echo -e "${GREEN}✅ Found ${TARGETARCH_COUNT} Dockerfile(s) with multi-platform support${NC}"
else
    echo -e "${YELLOW}⚠️  No Dockerfiles use TARGETARCH for multi-platform builds${NC}"
    echo -e "${YELLOW}   This may cause issues if platform-specific binaries are needed${NC}"
fi
echo ""

# Test API endpoints
echo -e "${BLUE}Testing service health endpoints...${NC}"

test_endpoint() {
    local NAME=$1
    local URL=$2
    local EXPECTED_CODE=${3:-200}
    
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" ${URL} 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "$EXPECTED_CODE" ]; then
        echo -e "${GREEN}  ✅ ${NAME}: ${HTTP_CODE}${NC}"
    else
        echo -e "${RED}  ❌ ${NAME}: ${HTTP_CODE} (expected ${EXPECTED_CODE})${NC}"
        ERRORS=$((ERRORS + 1))
    fi
}

test_endpoint "Backend API" "https://localhost:4000/health" 200
test_endpoint "Frontend" "https://localhost:3000" 200
test_endpoint "OPA" "http://localhost:8181/health" 200
test_endpoint "Keycloak HTTP" "http://localhost:8081/health/ready" 200
test_endpoint "Keycloak HTTPS" "https://localhost:8443/health/ready" 200
test_endpoint "Redis" "http://localhost:6379" 000  # Redis doesn't have HTTP, connection refused is expected

echo ""

# Performance warning
if [ ${EMULATION_DETECTED} -eq 1 ]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}⚠️  EMULATION DETECTED${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Some services are running with emulation, which can be 2-5x slower.${NC}"
    echo ""
    echo -e "${YELLOW}To fix:${NC}"
    echo "1. Remove 'platform:' specifications from docker-compose.yml"
    echo "2. Rebuild images: docker compose build --no-cache"
    echo "3. Restart services: docker compose down && docker compose up -d"
    echo ""
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Host Architecture: ${ARCH_NAME} (${EXPECTED_ARCH})"
echo "Running Services: ${SERVICE_COUNT}"
echo "Emulation Detected: $([ ${EMULATION_DETECTED} -eq 1 ] && echo 'Yes ⚠️' || echo 'No ✅')"
echo "Errors: ${ERRORS}"
echo ""

if [ ${EMULATION_DETECTED} -eq 0 ] && [ ${ERRORS} -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo -e "${GREEN}✅ DIVE V3 is running with native ${ARCH_NAME} architecture${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
elif [ ${EMULATION_DETECTED} -eq 1 ]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}⚠️  Warnings detected (emulation)${NC}"
    echo -e "${YELLOW}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Errors detected${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi

