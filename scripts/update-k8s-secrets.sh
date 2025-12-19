#!/bin/bash
# =============================================================================
# DIVE V3 - Update Kubernetes Secrets from GCP Secret Manager
# =============================================================================
# Fetches secrets from GCP Secret Manager and updates Kubernetes secrets
# This ensures secrets are always in sync with GCP Secret Manager
#
# Usage:
#   ./scripts/update-k8s-secrets.sh [instance]
#
# Instance: usa (default), fra, gbr, deu
# =============================================================================

set -e

INSTANCE="${1:-usa}"
# Map instance codes to namespaces
case "${INSTANCE}" in
    usa)
        NAMESPACE="dive-v3"
        ;;
    fra)
        NAMESPACE="dive-v3-fra"
        ;;
    gbr)
        NAMESPACE="dive-v3-gbr"
        ;;
    deu)
        NAMESPACE="dive-v3-deu"
        ;;
    *)
        echo "Unknown instance: ${INSTANCE}"
        echo "Valid instances: usa, fra, gbr, deu"
        exit 1
        ;;
esac

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
    echo "║     DIVE V3 - Update Kubernetes Secrets                   ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Instance: ${INSTANCE}"
    echo "Namespace: ${NAMESPACE}"
    echo ""
}

# Check kubectl access
check_kubectl() {
    if ! kubectl cluster-info > /dev/null 2>&1; then
        echo -e "${RED}❌ Cannot access Kubernetes cluster${NC}"
        echo "Configure kubectl:"
        echo "  gcloud container clusters get-credentials dive-v3-cluster --region us-east4 --project dive25"
        exit 1
    fi
}

# Fetch secret from GCP Secret Manager
fetch_secret() {
    local secret_name=$1
    local project=${2:-dive25}
    
    gcloud secrets versions access latest \
        --secret="${secret_name}" \
        --project="${project}" 2>/dev/null || echo ""
}

# Update database credentials secret
update_database_secrets() {
    echo -e "${BLUE}🔐 Updating database credentials...${NC}"
    
    # Fetch secrets from GCP
    POSTGRES_PASSWORD=$(fetch_secret "dive-v3-postgres-${INSTANCE}")
    MONGO_PASSWORD=$(fetch_secret "dive-v3-mongodb-${INSTANCE}")
    
    if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$MONGO_PASSWORD" ]; then
        echo -e "${YELLOW}⚠️  Some secrets not found in GCP Secret Manager${NC}"
        echo "Using placeholder values. Update manually if needed."
        POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-CHANGE_ME}"
        MONGO_PASSWORD="${MONGO_PASSWORD:-CHANGE_ME}"
    fi
    
    # Database URLs - use base service names (postgres, mongo, redis) for all instances
    case "${INSTANCE}" in
        usa)
            POSTGRES_DB="keycloak_db"
            MONGO_DB="dive-v3"
            ;;
        fra|gbr|deu)
            POSTGRES_DB="keycloak"
            MONGO_DB="dive-v3-${INSTANCE}"
            ;;
    esac
    
    POSTGRES_SVC="postgres"
    MONGO_SVC="mongo"
    REDIS_SVC="redis"
    
    POSTGRES_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${POSTGRES_SVC}.${NAMESPACE}.svc.cluster.local:5432/${POSTGRES_DB}"
    MONGO_URL="mongodb://admin:${MONGO_PASSWORD}@${MONGO_SVC}.${NAMESPACE}.svc.cluster.local:27017/${MONGO_DB}?authSource=admin"
    REDIS_URL="redis://${REDIS_SVC}.${NAMESPACE}.svc.cluster.local:6379"
    
    # Create/update secret
    # NOTE: MongoDB deployment expects 'password' key to be MongoDB password, not PostgreSQL
    kubectl create secret generic database-credentials \
        --from-literal=url="${POSTGRES_URL}" \
        --from-literal=mongodb_url="${MONGO_URL}" \
        --from-literal=redis_url="${REDIS_URL}" \
        --from-literal=password="${MONGO_PASSWORD}" \
        --namespace="${NAMESPACE}" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    echo -e "${GREEN}✅ Database credentials updated${NC}"
}

# Update auth secrets
update_auth_secrets() {
    echo -e "${BLUE}🔐 Updating auth secrets...${NC}"
    
    # Fetch secrets from GCP
    NEXTAUTH_SECRET=$(fetch_secret "dive-v3-auth-secret-${INSTANCE}")
    KEYCLOAK_CLIENT_SECRET=$(fetch_secret "dive-v3-keycloak-client-secret-${INSTANCE}")
    
    if [ -z "$NEXTAUTH_SECRET" ]; then
        echo -e "${YELLOW}⚠️  NextAuth secret not found, generating random...${NC}"
        NEXTAUTH_SECRET=$(openssl rand -base64 32)
    fi
    
    if [ -z "$KEYCLOAK_CLIENT_SECRET" ]; then
        echo -e "${YELLOW}⚠️  Keycloak client secret not found${NC}"
        KEYCLOAK_CLIENT_SECRET="CHANGE_ME"
    fi
    
    # Create/update secret
    kubectl create secret generic auth-secrets \
        --from-literal=nextauth_secret="${NEXTAUTH_SECRET}" \
        --from-literal=keycloak_client_secret="${KEYCLOAK_CLIENT_SECRET}" \
        --namespace="${NAMESPACE}" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    echo -e "${GREEN}✅ Auth secrets updated${NC}"
}

# Verify secrets
verify_secrets() {
    echo -e "${BLUE}🔍 Verifying secrets...${NC}"
    
    echo "Secrets in namespace ${NAMESPACE}:"
    kubectl get secrets -n "${NAMESPACE}" | grep -E "database-credentials|auth-secrets" || echo "  (none found)"
}

# Main execution
main() {
    print_header
    
    check_kubectl
    update_database_secrets
    update_auth_secrets
    verify_secrets
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✅ Secrets Updated Successfully                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Secrets are now synced with GCP Secret Manager!"
}

main
