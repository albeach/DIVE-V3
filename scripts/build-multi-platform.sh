#!/bin/bash
# =============================================================================
# Multi-Platform Docker Build Script
# =============================================================================
# Builds Docker images for both AMD64 and ARM64 architectures
# This eliminates infrastructure divergence between local (Mac ARM64) and GKE
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REGISTRY="us-east4-docker.pkg.dev/dive25/dive-v3-repo"
VERSION="${1:-latest}"
PLATFORMS="linux/amd64,linux/arm64"

echo -e "${BLUE}=== Multi-Platform Docker Build ==="
echo -e "Registry: ${REGISTRY}"
echo -e "Version: ${VERSION}"
echo -e "Platforms: ${PLATFORMS}${NC}"
echo ""

# Check if buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo -e "${RED}Error: docker buildx not available${NC}"
    echo "Install Docker Desktop or enable buildx plugin"
    exit 1
fi

# Create buildx builder if it doesn't exist
if ! docker buildx ls | grep -q multiarch; then
    echo -e "${YELLOW}Creating buildx builder 'multiarch'...${NC}"
    docker buildx create --name multiarch --use
    docker buildx inspect --bootstrap
else
    echo -e "${GREEN}Using existing buildx builder 'multiarch'${NC}"
    docker buildx use multiarch
fi

# Function to build and push multi-platform image
build_and_push() {
    local SERVICE=$1
    local DOCKERFILE_PATH=$2
    local IMAGE="${REGISTRY}/dive-v3-${SERVICE}:${VERSION}"
    
    echo -e "${BLUE}Building ${SERVICE} for ${PLATFORMS}...${NC}"
    
    docker buildx build \
        --platform ${PLATFORMS} \
        --tag ${IMAGE} \
        --push \
        --file ${DOCKERFILE_PATH} \
        ${DOCKERFILE_PATH%/*} || {
        echo -e "${RED}Failed to build ${SERVICE}${NC}"
        exit 1
    }
    
    echo -e "${GREEN}✅ ${SERVICE} built and pushed${NC}"
    echo ""
}

# Build all services
echo -e "${BLUE}Building services...${NC}"
echo ""

build_and_push "backend" "./backend/Dockerfile"
build_and_push "frontend" "./frontend/Dockerfile"
build_and_push "keycloak" "./keycloak/Dockerfile"

# Verify images
echo -e "${BLUE}Verifying multi-platform images...${NC}"
for SERVICE in backend frontend keycloak; do
    IMAGE="${REGISTRY}/dive-v3-${SERVICE}:${VERSION}"
    echo -e "${YELLOW}Checking ${SERVICE}...${NC}"
    docker buildx imagetools inspect ${IMAGE} | grep -E "Platform|OS/Arch" || true
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗"
echo -e "║     ✅ Multi-Platform Build Complete                              ║"
echo -e "╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Images support both ${PLATFORMS}"
echo -e "Kubernetes will automatically select the correct architecture"
echo ""



