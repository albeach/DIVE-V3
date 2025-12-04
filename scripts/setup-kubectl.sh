#!/bin/bash
# =============================================================================
# DIVE V3 - Setup kubectl for GKE Access
# =============================================================================
# Installs gke-gcloud-auth-plugin and configures kubectl for GKE cluster
# =============================================================================

set -e

PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
CLUSTER_NAME="${CLUSTER_NAME:-dive-v3-cluster}"
REGION="${REGION:-us-east4}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 - kubectl Setup for GKE                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check if plugin is installed
check_plugin() {
    if command -v gke-gcloud-auth-plugin &> /dev/null; then
        echo -e "${GREEN}✅ gke-gcloud-auth-plugin is installed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  gke-gcloud-auth-plugin not found${NC}"
        return 1
    fi
}

# Install plugin
install_plugin() {
    echo -e "${BLUE}📦 Installing gke-gcloud-auth-plugin...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - use gcloud components
        echo "Installing via gcloud components..."
        gcloud components install gke-gcloud-auth-plugin --quiet
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        gcloud components install gke-gcloud-auth-plugin
    else
        echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
        echo "Please install manually: https://cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl#install_plugin"
        exit 1
    fi
    
    if check_plugin; then
        echo -e "${GREEN}✅ Plugin installed successfully${NC}"
    else
        echo -e "${RED}❌ Installation failed${NC}"
        exit 1
    fi
}

# Configure kubectl
configure_kubectl() {
    echo -e "${BLUE}🔧 Configuring kubectl for cluster...${NC}"
    
    gcloud container clusters get-credentials "${CLUSTER_NAME}" \
        --region "${REGION}" \
        --project "${PROJECT_ID}"
    
    echo -e "${GREEN}✅ kubectl configured${NC}"
}

# Verify access
verify_access() {
    echo -e "${BLUE}🔍 Verifying cluster access...${NC}"
    
    if kubectl cluster-info &> /dev/null; then
        echo -e "${GREEN}✅ Successfully connected to cluster${NC}"
        echo ""
        echo "Cluster info:"
        kubectl cluster-info | head -3
        return 0
    else
        echo -e "${RED}❌ Cannot access cluster${NC}"
        return 1
    fi
}

# Main execution
main() {
    print_header
    
    echo "Project: ${PROJECT_ID}"
    echo "Cluster: ${CLUSTER_NAME}"
    echo "Region: ${REGION}"
    echo ""
    
    # Check plugin
    if ! check_plugin; then
        install_plugin
    fi
    
    # Configure kubectl
    configure_kubectl
    
    # Verify
    if verify_access; then
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║          ✅ kubectl Setup Complete                        ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "You can now use kubectl:"
        echo "  kubectl get pods -n dive-v3"
        echo "  kubectl get services -n dive-v3"
    else
        echo -e "${RED}❌ Setup incomplete. Please check errors above.${NC}"
        exit 1
    fi
}

main

