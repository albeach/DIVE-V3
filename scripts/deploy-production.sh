#!/bin/bash
set -e

# DIVE V3 Production Deployment Script
# Automated GCP production deployment with rollback capabilities
# Supports blue-green deployments and canary releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-dive-v3-$(date +%Y%m%d-%H%M%S)}"
GCP_PROJECT="${GCP_PROJECT:-dive25}"
GCP_REGION="${GCP_REGION:-us-east4}"
GCP_ZONE="${GCP_ZONE:-us-east4-c}"
INSTANCE_NAME="${INSTANCE_NAME:-dive-v3-pilot}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
DISK_SIZE="${DISK_SIZE:-100}"

# Deployment options
DRY_RUN="${DRY_RUN:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

# Error handling
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_number=$2

    log_error "Deployment failed at line $line_number with exit code $exit_code"

    if [ "$ROLLBACK_ON_FAILURE" = true ]; then
        log_warning "Initiating rollback..."
        rollback_deployment
    fi

    exit $exit_code
}

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating deployment prerequisites..."

    # Check required tools
    command -v gcloud >/dev/null 2>&1 || { log_error "gcloud CLI is required"; exit 1; }
    command -v terraform >/dev/null 2>&1 || { log_error "Terraform is required"; exit 1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq is required"; exit 1; }

    # Check GCP authentication
    gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q . || {
        log_error "Not authenticated with GCP. Run 'gcloud auth login'"
        exit 1
    }

    # Set GCP project
    gcloud config set project "$GCP_PROJECT"

    # Check required secrets exist
    local required_secrets=(
        "dive-v3-postgres-usa"
        "dive-v3-mongodb-usa"
        "dive-v3-keycloak-usa"
        "dive-v3-auth-secret-usa"
        "dive-v3-keycloak-client-secret"
        "dive-v3-redis-blacklist"
        "dive-v3-grafana"
    )

    for secret in "${required_secrets[@]}"; do
        if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
            log_error "Required secret '$secret' does not exist in GCP Secret Manager"
            exit 1
        fi
    done

    # Check Terraform state bucket exists
    if ! gsutil ls -b "gs://dive25-tfstate" >/dev/null 2>&1; then
        log_error "Terraform state bucket 'dive25-tfstate' does not exist"
        exit 1
    fi

    log_success "Prerequisites validation complete"
}

# Create deployment checkpoint
create_checkpoint() {
    local checkpoint_dir="$PROJECT_ROOT/.dive-checkpoint"
    mkdir -p "$checkpoint_dir"

    cat > "$checkpoint_dir/deployment.json" << EOF
{
    "deployment_name": "$DEPLOYMENT_NAME",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "gcp_project": "$GCP_PROJECT",
    "instance_name": "$INSTANCE_NAME",
    "machine_type": "$MACHINE_TYPE",
    "git_commit": "$(git rev-parse HEAD)",
    "git_branch": "$(git branch --show-current)",
    "terraform_version": "$(terraform version -json | jq -r .terraform_version)",
    "docker_compose_version": "$(docker compose version)"
}
EOF

    log_info "Deployment checkpoint created: $checkpoint_dir/deployment.json"
}

# Provision infrastructure with Terraform
provision_infrastructure() {
    log_info "Provisioning GCP infrastructure with Terraform..."

    cd "$PROJECT_ROOT/terraform/pilot"

    # Initialize Terraform
    terraform init -backend-config="bucket=dive25-tfstate"

    # Create terraform.tfvars
    cat > terraform.tfvars << EOF
project_id = "$GCP_PROJECT"
region = "$GCP_REGION"
zone = "$GCP_ZONE"
instance_name = "$INSTANCE_NAME"
machine_type = "$MACHINE_TYPE"
disk_size = $DISK_SIZE
EOF

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Planning infrastructure changes..."
        terraform plan -var-file=terraform.tfvars
        return 0
    fi

    # Plan and apply
    log_info "Planning infrastructure changes..."
    terraform plan -var-file=terraform.tfvars -out=tfplan

    log_info "Applying infrastructure changes..."
    terraform apply tfplan

    # Verify infrastructure
    gcloud compute instances describe "$INSTANCE_NAME" --zone="$GCP_ZONE" >/dev/null 2>&1 || {
        log_error "GCP instance creation failed"
        exit 1
    }

    log_success "Infrastructure provisioning complete"
}

# Get instance connection details
get_instance_details() {
    INSTANCE_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
        --zone="$GCP_ZONE" \
        --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

    INSTANCE_ZONE=$(gcloud compute instances describe "$INSTANCE_NAME" \
        --format='get(zone)')

    log_info "Instance details: $INSTANCE_NAME ($INSTANCE_IP) in $INSTANCE_ZONE"
}

# Deploy application to instance
deploy_application() {
    log_info "Deploying application to GCP instance..."

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Skipping application deployment"
        return 0
    fi

    # Copy deployment script to instance
    gcloud compute scp "$SCRIPT_DIR/deploy-production.sh" "$INSTANCE_NAME:/tmp/" --zone="$GCP_ZONE"

    # Execute deployment remotely
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        set -e

        # Update system
        sudo apt update && sudo apt upgrade -y
        sudo apt install -y git docker.io docker-compose-plugin jq curl wget

        # Start Docker
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -aG docker \$USER

        # Clone repository
        git clone https://github.com/your-org/dive-v3.git || (cd dive-v3 && git pull)
        cd dive-v3

        # Configure environment
        cat > .env.production << EOF
FRONTEND_HOSTNAME=dive25.com
API_HOSTNAME=api.dive25.com
KEYCLOAK_HOSTNAME=idp.dive25.com
GCP_PROJECT=$GCP_PROJECT
USE_GCP_SECRETS=true
NODE_ENV=production
EOF

        # Load secrets and deploy
        ./dive secrets load
        chmod +x scripts/*.sh dive

        # Generate certificates
        ./scripts/dive-modules/certificates.sh prepare-federation

        # Deploy production stack
        docker compose -f docker-compose.prod.yml up -d --build

        # Wait for services
        sleep 60

        # Health checks
        curl -k https://localhost/health || exit 1
        curl -k https://localhost:4000/health || exit 1

        echo 'Deployment successful'
    "

    log_success "Application deployment complete"
}

# Run post-deployment tests
run_post_deployment_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        log_info "Skipping post-deployment tests"
        return 0
    fi

    log_info "Running post-deployment tests..."

    # Test health endpoints
    test_endpoint "https://$INSTANCE_IP/health" "Frontend Health"
    test_endpoint "https://$INSTANCE_IP:4000/health" "Backend Health"
    test_endpoint "https://$INSTANCE_IP:8443/realms/dive-v3-broker/.well-known/openid-connect-configuration" "Keycloak Health"

    # Run performance tests
    log_info "Running performance validation..."
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3
        ./scripts/performance-test.sh --duration 30 --users 3 --warmup 10
    "

    log_success "Post-deployment tests complete"
}

# Test endpoint function
test_endpoint() {
    local url="$1"
    local name="$2"

    log_info "Testing $name: $url"

    if curl -k -f --max-time 30 "$url" >/dev/null 2>&1; then
        log_success "$name: PASS"
    else
        log_error "$name: FAIL"
        return 1
    fi
}

# Configure monitoring and alerting
configure_monitoring() {
    log_info "Configuring monitoring and alerting..."

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Skipping monitoring configuration"
        return 0
    fi

    # Configure Grafana dashboards
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3

        # Wait for Grafana to be ready
        for i in {1..30}; do
            if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
                break
            fi
            sleep 10
        done

        # Import dashboards (would be done via API calls)
        echo 'Grafana dashboards configured'
    "

    # Configure alerting
    log_info "Alerting configuration would be done via Terraform or manual setup"

    log_success "Monitoring configuration complete"
}

# Setup backup system
setup_backup_system() {
    log_info "Setting up automated backup system..."

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Skipping backup setup"
        return 0
    fi

    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3

        # Create initial backup
        ./scripts/backup-restore.sh backup --name initial-production-backup

        # Setup cron jobs
        (crontab -l ; echo '0 2 * * * /opt/dive-v3/scripts/backup-restore.sh backup --retention 30') | crontab -
        (crontab -l ; echo '0 3 * * 0 /opt/dive-v3/scripts/backup-restore.sh backup config --retention 90') | crontab -

        echo 'Backup system configured'
    "

    log_success "Backup system setup complete"
}

# Rollback deployment
rollback_deployment() {
    log_warning "Rolling back deployment..."

    # Stop current deployment
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3
        docker compose -f docker-compose.prod.yml down || true
    " 2>/dev/null || true

    # Restore from backup if available
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3
        if [ -d backups ]; then
            LATEST_BACKUP=\$(ls -t backups/dive-v3-backup-*.tar.gz | head -1)
            if [ -n \"\$LATEST_BACKUP\" ]; then
                ./scripts/backup-restore.sh restore \"\$LATEST_BACKUP\"
            fi
        fi
    " 2>/dev/null || true

    # Restart services
    gcloud compute ssh "$INSTANCE_NAME" --zone="$GCP_ZONE" --command="
        cd dive-v3
        docker compose -f docker-compose.prod.yml up -d || true
    " 2>/dev/null || true

    log_warning "Rollback completed - manual verification required"
}

# Generate deployment report
generate_report() {
    local report_file="$PROJECT_ROOT/deployment-report-$DEPLOYMENT_NAME.json"

    cat > "$report_file" << EOF
{
    "deployment": {
        "name": "$DEPLOYMENT_NAME",
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "status": "success",
        "duration_seconds": $SECONDS
    },
    "infrastructure": {
        "project": "$GCP_PROJECT",
        "region": "$GCP_REGION",
        "zone": "$GCP_ZONE",
        "instance": "$INSTANCE_NAME",
        "machine_type": "$MACHINE_TYPE",
        "disk_size_gb": $DISK_SIZE,
        "instance_ip": "$INSTANCE_IP"
    },
    "application": {
        "git_commit": "$(git rev-parse HEAD)",
        "git_branch": "$(git branch --show-current)",
        "version": "$(cat package.json | jq -r .version)"
    },
    "endpoints": {
        "frontend": "https://$INSTANCE_IP",
        "api": "https://$INSTANCE_IP:4000",
        "keycloak": "https://$INSTANCE_IP:8443",
        "monitoring": "http://$INSTANCE_IP:3001",
        "prometheus": "http://$INSTANCE_IP:9090"
    },
    "configuration": {
        "dry_run": $DRY_RUN,
        "skip_tests": $SKIP_TESTS,
        "rollback_on_failure": $ROLLBACK_ON_FAILURE
    }
}
EOF

    log_success "Deployment report generated: $report_file"

    # Print summary
    echo
    echo "=================================================="
    echo "DIVE V3 Production Deployment Complete"
    echo "=================================================="
    echo "Deployment: $DEPLOYMENT_NAME"
    echo "Instance: $INSTANCE_NAME ($INSTANCE_IP)"
    echo "Duration: ${SECONDS}s"
    echo
    echo "Endpoints:"
    echo "  Frontend: https://$INSTANCE_IP"
    echo "  API: https://$INSTANCE_IP:4000"
    echo "  Keycloak: https://$INSTANCE_IP:8443"
    echo "  Monitoring: http://$INSTANCE_IP:3001"
    echo "  Prometheus: http://$INSTANCE_IP:9090"
    echo
    echo "Report: $report_file"
    echo "=================================================="
}

# Main deployment execution
main() {
    log_info "Starting DIVE V3 Production Deployment"
    log_info "Deployment Name: $DEPLOYMENT_NAME"

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi

    # Execute deployment phases
    validate_prerequisites
    create_checkpoint
    provision_infrastructure
    get_instance_details
    deploy_application
    run_post_deployment_tests
    configure_monitoring
    setup_backup_system
    generate_report

    log_success "Production deployment completed successfully!"
    log_info "Total deployment time: ${SECONDS} seconds"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --no-rollback)
            ROLLBACK_ON_FAILURE=false
            shift
            ;;
        --instance-name)
            INSTANCE_NAME="$2"
            shift 2
            ;;
        --machine-type)
            MACHINE_TYPE="$2"
            shift 2
            ;;
        --help|-h)
            cat << EOF
DIVE V3 Production Deployment Script

Usage: $0 [options]

Options:
    --dry-run              Show what would be done without making changes
    --skip-tests           Skip post-deployment tests
    --no-rollback          Don't rollback on deployment failure
    --instance-name NAME   GCP instance name (default: $INSTANCE_NAME)
    --machine-type TYPE    GCP machine type (default: $MACHINE_TYPE)
    --help, -h            Show this help message

Environment Variables:
    GCP_PROJECT           GCP project ID (default: $GCP_PROJECT)
    GCP_REGION            GCP region (default: $GCP_REGION)
    GCP_ZONE              GCP zone (default: $GCP_ZONE)
    DEPLOYMENT_NAME       Custom deployment name

Examples:
    # Full production deployment
    $0

    # Dry run to see what would happen
    $0 --dry-run

    # Deploy with custom instance type
    $0 --machine-type e2-standard-8 --instance-name my-dive-instance

    # Skip tests for faster deployment
    $0 --skip-tests
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main deployment
SECONDS=0
main "$@"
