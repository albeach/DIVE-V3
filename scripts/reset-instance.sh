#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Instance Full Reset Script
# =============================================================================
# Performs a complete nuke-and-recreate of a DIVE V3 instance:
#   1. Stops all containers
#   2. Removes containers, volumes, networks
#   3. Rebuilds and starts containers
#   4. Waits for health checks
#   5. Applies Terraform configuration
#   6. Seeds MongoDB with documents
#
# Usage:
#   ./scripts/reset-instance.sh GBR              # Full reset of GBR instance
#   ./scripts/reset-instance.sh FRA --no-seed    # Reset without seeding
#   ./scripts/reset-instance.sh USA --seed=5000  # Reset with 5000 documents
#   ./scripts/reset-instance.sh DEU --skip-tf    # Reset without Terraform
#
# Options:
#   --no-seed       Skip MongoDB seeding
#   --seed=N        Seed N documents (default: 1000)
#   --skip-tf       Skip Terraform apply
#   --help          Show this help message
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default options
INSTANCE=""
SEED_COUNT=1000
SKIP_SEED=false
SKIP_TF=false

# =============================================================================
# Parse Arguments
# =============================================================================
print_usage() {
    echo "Usage: $0 <INSTANCE> [OPTIONS]"
    echo ""
    echo "Instances: USA, FRA, GBR, DEU"
    echo ""
    echo "Options:"
    echo "  --no-seed       Skip MongoDB seeding"
    echo "  --seed=N        Seed N documents (default: 1000)"
    echo "  --skip-tf       Skip Terraform apply"
    echo "  --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 GBR                    # Full reset of GBR"
    echo "  $0 FRA --seed=5000        # Reset FRA with 5000 docs"
    echo "  $0 USA --no-seed          # Reset USA without seeding"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        USA|usa|FRA|fra|GBR|gbr|DEU|deu)
            INSTANCE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            shift
            ;;
        --no-seed)
            SKIP_SEED=true
            shift
            ;;
        --seed=*)
            SEED_COUNT="${1#*=}"
            shift
            ;;
        --skip-tf)
            SKIP_TF=true
            shift
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

if [[ -z "$INSTANCE" ]]; then
    echo -e "${RED}[ERROR]${NC} Instance is required"
    print_usage
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

# Determine compose file
case $INSTANCE in
    USA) COMPOSE_FILE="docker-compose.yml" ;;
    FRA) COMPOSE_FILE="docker-compose.fra.yml" ;;
    GBR) COMPOSE_FILE="docker-compose.gbr.yml" ;;
    DEU) COMPOSE_FILE="docker-compose.deu.yml" ;;
esac

TFVARS_FILE="${INSTANCE_LOWER}.tfvars"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           DIVE V3 - FULL INSTANCE RESET                          ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Instance:    ${YELLOW}${INSTANCE}${CYAN}                                               ║${NC}"
echo -e "${CYAN}║  Compose:     ${NC}${COMPOSE_FILE}${CYAN}                               ║${NC}"
echo -e "${CYAN}║  Seed Count:  ${NC}${SEED_COUNT}${CYAN}                                            ║${NC}"
echo -e "${CYAN}║  Skip Seed:   ${NC}${SKIP_SEED}${CYAN}                                           ║${NC}"
echo -e "${CYAN}║  Skip TF:     ${NC}${SKIP_TF}${CYAN}                                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# =============================================================================
# Step 1: Load GCP Secrets
# =============================================================================
echo -e "${BLUE}[1/6]${NC} Loading GCP secrets for ${INSTANCE}..."
source ./scripts/sync-gcp-secrets.sh "$INSTANCE_LOWER"

# =============================================================================
# Step 2: Stop and Remove Existing Stack
# =============================================================================
echo ""
echo -e "${BLUE}[2/6]${NC} Stopping and removing existing ${INSTANCE} stack..."

# Stop compose stack
docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true

# Force remove any lingering containers
docker ps -a --filter "name=${INSTANCE_LOWER}" --format "{{.Names}}" | xargs -r docker rm -f 2>/dev/null || true

# Remove orphaned volumes
docker volume ls --filter "name=${INSTANCE_LOWER}" --format "{{.Name}}" | xargs -r docker volume rm 2>/dev/null || true

echo -e "${GREEN}✓${NC} Stack cleaned up"

# =============================================================================
# Step 3: Rebuild and Start Stack
# =============================================================================
echo ""
echo -e "${BLUE}[3/6]${NC} Building and starting ${INSTANCE} stack..."

docker-compose -f "$COMPOSE_FILE" up -d --build --force-recreate

echo -e "${GREEN}✓${NC} Stack started"

# =============================================================================
# Step 4: Wait for Health Checks
# =============================================================================
echo ""
echo -e "${BLUE}[4/6]${NC} Waiting for services to become healthy..."

MAX_WAIT=300
WAIT_INTERVAL=10
ELAPSED=0

while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    UNHEALTHY=$(docker ps --filter "name=${INSTANCE_LOWER}" --format "{{.Names}} {{.Status}}" | grep -v healthy | grep -v "Up" || true)
    
    if [[ -z "$UNHEALTHY" ]]; then
        # Check if Keycloak specifically is healthy
        KC_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "dive-v3-keycloak-${INSTANCE_LOWER}" 2>/dev/null || echo "unknown")
        if [[ "$KC_STATUS" == "healthy" ]]; then
            echo -e "${GREEN}✓${NC} All services healthy!"
            break
        fi
    fi
    
    echo -e "  Waiting... (${ELAPSED}s / ${MAX_WAIT}s)"
    sleep $WAIT_INTERVAL
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo -e "${YELLOW}[WARN]${NC} Timeout waiting for services. Proceeding anyway..."
fi

# Show status
echo ""
docker ps --filter "name=${INSTANCE_LOWER}" --format "table {{.Names}}\t{{.Status}}"

# =============================================================================
# Step 5: Apply Terraform
# =============================================================================
if [[ "$SKIP_TF" == "false" ]]; then
    echo ""
    echo -e "${BLUE}[5/6]${NC} Applying Terraform configuration..."
    
    # Set TF variables based on instance
    case $INSTANCE in
        USA)
            export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD_USA"
            export TF_VAR_keycloak_client_secret="$KEYCLOAK_CLIENT_SECRET_USA"
            ;;
        FRA)
            export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD_FRA"
            export TF_VAR_keycloak_client_secret="$KEYCLOAK_CLIENT_SECRET_FRA"
            ;;
        GBR)
            export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD_GBR"
            export TF_VAR_keycloak_client_secret="$KEYCLOAK_CLIENT_SECRET_GBR"
            ;;
        DEU)
            export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD_DEU"
            export TF_VAR_keycloak_client_secret="$KEYCLOAK_CLIENT_SECRET_DEU"
            ;;
    esac
    
    # Initialize and apply
    terraform -chdir=terraform/instances init -reconfigure
    terraform -chdir=terraform/instances apply -var-file="$TFVARS_FILE" -auto-approve
    
    echo -e "${GREEN}✓${NC} Terraform applied"
else
    echo ""
    echo -e "${YELLOW}[5/6]${NC} Skipping Terraform (--skip-tf)"
fi

# =============================================================================
# Step 6: Seed MongoDB
# =============================================================================
if [[ "$SKIP_SEED" == "false" ]]; then
    echo ""
    echo -e "${BLUE}[6/6]${NC} Seeding MongoDB with ${SEED_COUNT} documents..."
    
    ./scripts/seed-instance-resources.sh "$INSTANCE" --replace --count="$SEED_COUNT"
    
    echo -e "${GREEN}✓${NC} MongoDB seeded"
else
    echo ""
    echo -e "${YELLOW}[6/6]${NC} Skipping seed (--no-seed)"
fi

# =============================================================================
# Complete
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    RESET COMPLETE                                 ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Instance ${INSTANCE} has been fully reset and configured!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show access URLs
case $INSTANCE in
    USA)
        echo -e "  Frontend:  ${CYAN}https://usa-app.dive25.com${NC}"
        echo -e "  API:       ${CYAN}https://usa-api.dive25.com${NC}"
        echo -e "  Keycloak:  ${CYAN}https://usa-idp.dive25.com${NC}"
        ;;
    FRA)
        echo -e "  Frontend:  ${CYAN}https://fra-app.dive25.com${NC}"
        echo -e "  API:       ${CYAN}https://fra-api.dive25.com${NC}"
        echo -e "  Keycloak:  ${CYAN}https://fra-idp.dive25.com${NC}"
        ;;
    GBR)
        echo -e "  Frontend:  ${CYAN}https://gbr-app.dive25.com${NC}"
        echo -e "  API:       ${CYAN}https://gbr-api.dive25.com${NC}"
        echo -e "  Keycloak:  ${CYAN}https://gbr-idp.dive25.com${NC}"
        ;;
    DEU)
        echo -e "  Frontend:  ${CYAN}https://deu-app.prosecurity.biz${NC}"
        echo -e "  API:       ${CYAN}https://deu-api.prosecurity.biz${NC}"
        echo -e "  Keycloak:  ${CYAN}https://deu-idp.prosecurity.biz${NC}"
        ;;
esac
echo ""

