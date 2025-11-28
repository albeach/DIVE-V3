#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Apply Federation Configuration to All Instances
# =============================================================================
# Purpose: Applies Terraform configuration to all federated instances
# Usage: ./scripts/federation/apply-all.sh [--plan]
# =============================================================================
# Applies Terraform configuration to all federated instances in the correct order.
# This ensures federation is configured consistently across all instances.
#
# Usage:
#   ./scripts/federation/apply-all.sh              # Apply to all
#   ./scripts/federation/apply-all.sh --plan       # Plan only, don't apply
#   ./scripts/federation/apply-all.sh usa fra      # Apply to specific instances
#
# Prerequisites:
#   1. Terraform installed
#   2. Keycloak instances running
#   3. tfvars files generated (run generate-tfvars.sh first)
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
TF_DIR="$PROJECT_ROOT/terraform/instances"
LOG_DIR="$PROJECT_ROOT/logs/terraform"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
PLAN_ONLY=false
TARGET_INSTANCES=()

for arg in "$@"; do
    case "$arg" in
        --plan) PLAN_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--plan] [instance1] [instance2] ..."
            echo ""
            echo "Options:"
            echo "  --plan       Plan only, don't apply changes"
            echo "  instance     Specific instances to apply (default: all)"
            exit 0
            ;;
        *) TARGET_INSTANCES+=("$arg") ;;
    esac
done

mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Check dependencies
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: terraform is required but not installed${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    exit 1
fi

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DIVE V3 Federation Apply${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Get instances from registry
ALL_INSTANCES=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")

# Use target instances or all
if [[ ${#TARGET_INSTANCES[@]} -eq 0 ]]; then
    INSTANCES=($ALL_INSTANCES)
else
    INSTANCES=("${TARGET_INSTANCES[@]}")
fi

echo -e "Instances: ${BLUE}${INSTANCES[*]}${NC}"
echo -e "Mode: ${BLUE}$(if $PLAN_ONLY; then echo "Plan Only"; else echo "Plan + Apply"; fi)${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW}Pre-flight checks...${NC}"
for instance in "${INSTANCES[@]}"; do
    tfvars_file="$TF_DIR/$instance.tfvars"
    if [[ ! -f "$tfvars_file" ]]; then
        echo -e "${RED}✗ Missing: $tfvars_file${NC}"
        echo "Run: ./scripts/federation/generate-tfvars.sh"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Found: $tfvars_file"
done
echo ""

# Validate Keycloak connectivity
echo -e "${YELLOW}Validating Keycloak connectivity...${NC}"
for instance in "${INSTANCES[@]}"; do
    idp_url=$(jq -r ".instances.$instance.urls.idp" "$REGISTRY_FILE")
    if curl -sk "$idp_url/realms/master" --max-time 5 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $instance: $idp_url (reachable)"
    else
        echo -e "${RED}✗${NC} $instance: $idp_url (unreachable)"
        echo -e "${YELLOW}Warning: Keycloak may not be running for $instance${NC}"
    fi
done
echo ""

# Change to terraform directory
cd "$TF_DIR"

# Initialize if needed
if [[ ! -d ".terraform" ]]; then
    echo -e "${YELLOW}Initializing Terraform...${NC}"
    terraform init
    echo ""
fi

# Apply to each instance
SUCCESS_COUNT=0
FAIL_COUNT=0
RESULTS=()

for instance in "${INSTANCES[@]}"; do
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Instance: ${instance^^}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    LOG_FILE="$LOG_DIR/${instance}-$TIMESTAMP.log"
    
    # Select workspace
    terraform workspace select "$instance" 2>/dev/null || terraform workspace new "$instance"
    
    # Plan
    echo -e "${BLUE}Planning...${NC}"
    if terraform plan -var-file="$instance.tfvars" -out="${instance}.tfplan" 2>&1 | tee -a "$LOG_FILE"; then
        echo -e "${GREEN}✓ Plan successful${NC}"
        
        if [[ "$PLAN_ONLY" == "false" ]]; then
            # Apply
            echo -e "${BLUE}Applying...${NC}"
            if terraform apply -auto-approve "${instance}.tfplan" 2>&1 | tee -a "$LOG_FILE"; then
                echo -e "${GREEN}✓ Apply successful${NC}"
                RESULTS+=("$instance: ✓ SUCCESS")
                ((SUCCESS_COUNT++))
            else
                echo -e "${RED}✗ Apply failed${NC}"
                RESULTS+=("$instance: ✗ FAILED (apply)")
                ((FAIL_COUNT++))
            fi
        else
            RESULTS+=("$instance: ✓ PLAN OK")
            ((SUCCESS_COUNT++))
        fi
    else
        echo -e "${RED}✗ Plan failed${NC}"
        RESULTS+=("$instance: ✗ FAILED (plan)")
        ((FAIL_COUNT++))
    fi
    
    echo ""
done

# Summary
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📊 Summary${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
for result in "${RESULTS[@]}"; do
    if [[ "$result" == *"SUCCESS"* || "$result" == *"PLAN OK"* ]]; then
        echo -e "${GREEN}$result${NC}"
    else
        echo -e "${RED}$result${NC}"
    fi
done
echo ""
echo -e "Success: ${GREEN}$SUCCESS_COUNT${NC}"
echo -e "Failed:  ${RED}$FAIL_COUNT${NC}"
echo ""
echo -e "Logs saved to: $LOG_DIR/"

if [[ $FAIL_COUNT -gt 0 ]]; then
    exit 1
fi


