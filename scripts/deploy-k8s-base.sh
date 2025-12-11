#!/bin/bash
# =============================================================================
# DIVE V3 - Deploy Base Kubernetes Manifests
# =============================================================================
# Deploys base Kubernetes manifests to the GKE cluster
# Creates namespace, secrets, and base deployments
#
# Usage:
#   ./scripts/deploy-k8s-base.sh
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load Terraform auth if available
if [ -f "$PROJECT_ROOT/.terraform-keys/terraform-deployer.json" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$PROJECT_ROOT/.terraform-keys/terraform-deployer.json"
fi

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 - Kubernetes Base Deployment                  ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check kubectl access
check_kubectl() {
    echo -e "${BLUE}🔍 Checking kubectl access...${NC}"
    if ! kubectl cluster-info > /dev/null 2>&1; then
        echo -e "${RED}❌ Cannot access Kubernetes cluster${NC}"
        echo "Configure kubectl:"
        echo "  cd terraform/infrastructure"
        echo "  terraform output -raw kubectl_command | bash"
        exit 1
    fi
    echo -e "${GREEN}✅ kubectl configured${NC}"
}

# Create namespace
create_namespace() {
    echo -e "${BLUE}📦 Creating namespace...${NC}"
    kubectl apply -f "$PROJECT_ROOT/k8s/base/namespace.yaml"
    echo -e "${GREEN}✅ Namespace created${NC}"
}

# Create secrets (using GCP Secret Manager values or defaults)
create_secrets() {
    echo -e "${BLUE}🔐 Creating Kubernetes secrets...${NC}"
    
    # Check if secrets already exist
    if kubectl get secret database-credentials -n dive-v3 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Secrets already exist, skipping...${NC}"
        return
    fi
    
    # Database credentials (placeholder - should use GCP Secret Manager)
    kubectl create secret generic database-credentials \
        --from-literal=url="postgresql://postgres:CHANGE_ME@postgres:5432/dive_v3_app" \
        --from-literal=mongodb_url="mongodb://admin:CHANGE_ME@mongo:27017/dive-v3?authSource=admin" \
        --from-literal=redis_url="redis://redis:6379" \
        --namespace=dive-v3 \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Auth secrets (placeholder - should use GCP Secret Manager)
    kubectl create secret generic auth-secrets \
        --from-literal=nextauth_secret="$(openssl rand -base64 32)" \
        --from-literal=keycloak_client_secret="CHANGE_ME" \
        --namespace=dive-v3 \
        --dry-run=client -o yaml | kubectl apply -f -
    
    echo -e "${YELLOW}⚠️  Using placeholder secrets - update with real values from GCP Secret Manager${NC}"
    echo -e "${GREEN}✅ Secrets created${NC}"
}

# Deploy base manifests
deploy_manifests() {
    echo -e "${BLUE}🚀 Deploying base Kubernetes manifests...${NC}"
    
    # Apply ServiceAccounts first
    kubectl apply -f "$PROJECT_ROOT/k8s/base/frontend/serviceaccount.yaml" 2>/dev/null || true
    kubectl apply -f "$PROJECT_ROOT/k8s/base/backend/serviceaccount.yaml" 2>/dev/null || true
    
    # Apply ConfigMaps
    kubectl apply -f "$PROJECT_ROOT/k8s/base/frontend/configmap.yaml"
    kubectl apply -f "$PROJECT_ROOT/k8s/base/backend/configmap.yaml"
    
    # Apply Services
    kubectl apply -f "$PROJECT_ROOT/k8s/base/frontend/service.yaml"
    kubectl apply -f "$PROJECT_ROOT/k8s/base/backend/service.yaml"
    
    # Apply Deployments (will fail if images don't exist yet, that's OK)
    kubectl apply -f "$PROJECT_ROOT/k8s/base/frontend/deployment.yaml" || echo "⚠️  Frontend deployment may fail until images are built"
    kubectl apply -f "$PROJECT_ROOT/k8s/base/backend/deployment.yaml" || echo "⚠️  Backend deployment may fail until images are built"
    
    echo -e "${GREEN}✅ Base manifests deployed${NC}"
}

# Verify deployment
verify_deployment() {
    echo -e "${BLUE}🔍 Verifying deployment...${NC}"
    
    echo "Namespaces:"
    kubectl get namespaces | grep dive-v3 || echo "  (none)"
    
    echo ""
    echo "Secrets:"
    kubectl get secrets -n dive-v3 || echo "  (none)"
    
    echo ""
    echo "ConfigMaps:"
    kubectl get configmaps -n dive-v3 || echo "  (none)"
    
    echo ""
    echo "Services:"
    kubectl get services -n dive-v3 || echo "  (none)"
    
    echo ""
    echo "Deployments:"
    kubectl get deployments -n dive-v3 || echo "  (none)"
    
    echo ""
    echo "Pods:"
    kubectl get pods -n dive-v3 || echo "  (none)"
}

# Main execution
main() {
    print_header
    
    check_kubectl
    create_namespace
    create_secrets
    deploy_manifests
    verify_deployment
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✅ Base Deployment Complete                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Build and push container images (GitHub Actions or manual)"
    echo "  2. Update secrets with real values from GCP Secret Manager"
    echo "  3. Deploy remaining services (Keycloak, OPA, databases)"
    echo "  4. Run database migrations"
}

main








