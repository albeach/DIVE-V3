#!/usr/bin/env bash

# =============================================================================
# DIVE V3 - Deploy Isolated Instance
# =============================================================================
# Deploys an instance using the new isolated architecture.
# Each instance is fully self-contained in instances/{code}/
#
# Usage:
#   ./scripts/deploy-isolated-instance.sh <INSTANCE_CODE> [OPTIONS]
#   ./scripts/deploy-isolated-instance.sh USA
#   ./scripts/deploy-isolated-instance.sh FRA --terraform
#   ./scripts/deploy-isolated-instance.sh --all
#
# Options:
#   --terraform    Also apply Terraform configuration
#   --build        Force rebuild of images
#   --down         Stop the instance instead of starting
#   --logs         Show logs after starting
#   --all          Deploy all instances
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

show_usage() {
    cat << EOF
Usage: $0 <INSTANCE_CODE> [OPTIONS]

Deploy a DIVE V3 instance using the isolated architecture.

Arguments:
  INSTANCE_CODE    ISO 3166-1 alpha-3 country code (USA, FRA, DEU, etc.)
                   Use --all to deploy all configured instances

Options:
  --terraform      Also apply Terraform configuration to Keycloak
  --build          Force rebuild of Docker images
  --down           Stop the instance (instead of starting)
  --logs           Tail logs after deployment
  --status         Show instance status only
  --help           Show this help message

Examples:
  $0 USA                      # Deploy USA instance
  $0 FRA --terraform          # Deploy FRA with Terraform
  $0 DEU --down               # Stop DEU instance
  $0 --all                    # Deploy all instances
  $0 USA --status             # Check USA status
EOF
}

# Parse arguments
INSTANCE_CODE=""
APPLY_TERRAFORM=false
FORCE_BUILD=false
STOP_INSTANCE=false
SHOW_LOGS=false
STATUS_ONLY=false
DEPLOY_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --terraform|-t)
            APPLY_TERRAFORM=true
            shift
            ;;
        --build|-b)
            FORCE_BUILD=true
            shift
            ;;
        --down|-d)
            STOP_INSTANCE=true
            shift
            ;;
        --logs|-l)
            SHOW_LOGS=true
            shift
            ;;
        --status|-s)
            STATUS_ONLY=true
            shift
            ;;
        --all|-a)
            DEPLOY_ALL=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            if [[ -z "$INSTANCE_CODE" ]]; then
                INSTANCE_CODE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            else
                log_error "Unknown argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# Determine instances to deploy
if [[ "$DEPLOY_ALL" == "true" ]]; then
    INSTANCES=()
    for dir in "$PROJECT_ROOT/instances"/*; do
        if [[ -d "$dir" && -f "$dir/docker-compose.yml" ]]; then
            INSTANCES+=("$(basename "$dir" | tr '[:lower:]' '[:upper:]')")
        fi
    done
elif [[ -n "$INSTANCE_CODE" ]]; then
    INSTANCES=("$INSTANCE_CODE")
else
    log_error "Instance code required. Use --help for usage."
    exit 1
fi

# Show instance status
show_status() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    
    if [[ ! -d "$instance_dir" ]]; then
        log_error "Instance directory not found: $instance_dir"
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Instance: $code${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Get config info
    local config_file="$instance_dir/instance.json"
    if [[ -f "$config_file" ]]; then
        local hostname_app=$(jq -r '.hostnames.app' "$config_file")
        local hostname_idp=$(jq -r '.hostnames.idp' "$config_file")
        local port_frontend=$(jq -r '.ports.frontend' "$config_file")
        
        echo "  App URL:      https://$hostname_app"
        echo "  IdP URL:      https://$hostname_idp"
        echo "  Local Port:   $port_frontend"
    fi
    
    # Check container status
    echo ""
    echo "  Container Status:"
    cd "$instance_dir"
    docker-compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | tail -n +2 | while read line; do
        echo "    $line"
    done
    
    return 0
}

# Deploy instance
deploy_instance() {
    local code="$1"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local instance_dir="$PROJECT_ROOT/instances/$code_lower"
    
    if [[ ! -d "$instance_dir" ]]; then
        log_error "Instance directory not found: $instance_dir"
        log_info "Run: ./scripts/generate-instance.sh $code"
        return 1
    fi
    
    if [[ ! -f "$instance_dir/docker-compose.yml" ]]; then
        log_error "docker-compose.yml not found in $instance_dir"
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Deploying: $code                                                      ${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    cd "$instance_dir"
    
    # Ensure certificates exist
    if [[ ! -f "certs/certificate.pem" ]]; then
        log_warn "Certificates not found. Generating..."
        "$SCRIPT_DIR/generate-instance.sh" "$code" --force 2>/dev/null || true
    fi
    
    # Build options
    local compose_opts=""
    if [[ "$FORCE_BUILD" == "true" ]]; then
        compose_opts="--build"
    fi
    
    # Stop if requested
    if [[ "$STOP_INSTANCE" == "true" ]]; then
        log_step "Stopping $code instance..."
        docker-compose down
        log_success "$code instance stopped"
        return 0
    fi
    
    # Deploy
    log_step "Starting $code instance..."
    docker-compose up -d $compose_opts
    
    # Wait for health
    log_step "Waiting for services to be healthy..."
    sleep 5
    
    # Apply Terraform if requested
    if [[ "$APPLY_TERRAFORM" == "true" ]]; then
        log_step "Applying Terraform configuration..."
        
        cd "$PROJECT_ROOT/terraform/instances"
        
        # Create workspace if needed
        terraform workspace select "$code_lower" 2>/dev/null || terraform workspace new "$code_lower"
        
        # Get Keycloak URL from instance config
        local config_file="$instance_dir/instance.json"
        local port_kc_https=$(jq -r '.ports.keycloak_https' "$config_file")
        
        # Apply with instance-specific vars
        if [[ -f "${code_lower}.tfvars" ]]; then
            terraform apply -var-file="${code_lower}.tfvars" -auto-approve \
                -var="keycloak_url=https://localhost:$port_kc_https" \
                2>&1 | tail -20
        else
            log_warn "No ${code_lower}.tfvars found. Skipping Terraform."
        fi
        
        cd "$instance_dir"
    fi
    
    # Show status
    show_status "$code"
    
    log_success "$code instance deployed successfully!"
    
    # Show logs if requested
    if [[ "$SHOW_LOGS" == "true" ]]; then
        log_info "Tailing logs (Ctrl+C to stop)..."
        docker-compose logs -f
    fi
    
    return 0
}

# Main execution
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           DIVE V3 - Isolated Instance Deployment                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

for code in "${INSTANCES[@]}"; do
    if [[ "$STATUS_ONLY" == "true" ]]; then
        show_status "$code"
    else
        deploy_instance "$code"
    fi
done

echo ""
log_success "Deployment complete!"
echo ""
echo "Quick commands:"
echo "  Status:  $0 <CODE> --status"
echo "  Logs:    cd instances/<code> && docker-compose logs -f"
echo "  Stop:    $0 <CODE> --down"
echo ""

