#!/bin/bash
# =============================================================================
# DIVE V3 - Terraform GCS Backend Setup Script
# =============================================================================
# This script configures GCS as the Terraform backend for shared state.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Appropriate GCP project permissions
#
# Usage:
#   ./scripts/setup-terraform-gcs-backend.sh [--init]
#
# Options:
#   --init    Also run terraform init to migrate existing state
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
GCP_PROJECT="${GCP_PROJECT:-dive25}"
GCS_BUCKET="${GCS_BUCKET:-dive25-terraform-state}"
GCS_LOCATION="${GCS_LOCATION:-us-central1}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-terraform@${GCP_PROJECT}.iam.gserviceaccount.com}"

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log_info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "${CYAN}==>${NC} $*"; }

# Parse arguments
INIT_TERRAFORM=false
for arg in "$@"; do
    case "$arg" in
        --init) INIT_TERRAFORM=true ;;
    esac
done

echo ""
echo "=============================================="
echo " DIVE V3 - Terraform GCS Backend Setup"
echo "=============================================="
echo ""
echo "Configuration:"
echo "  GCP Project:      ${GCP_PROJECT}"
echo "  GCS Bucket:       gs://${GCS_BUCKET}"
echo "  Location:         ${GCS_LOCATION}"
echo "  Service Account:  ${SERVICE_ACCOUNT}"
echo ""

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI not found. Please install it first."
    exit 1
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    log_error "Not authenticated to gcloud. Run: gcloud auth login"
    exit 1
fi

# Set project
log_step "Setting GCP project to ${GCP_PROJECT}..."
gcloud config set project "$GCP_PROJECT"

# Create bucket if it doesn't exist
log_step "Checking GCS bucket..."
if gsutil ls -b "gs://${GCS_BUCKET}" &> /dev/null; then
    log_info "Bucket gs://${GCS_BUCKET} already exists"
else
    log_step "Creating GCS bucket..."
    gsutil mb -p "$GCP_PROJECT" -l "$GCS_LOCATION" "gs://${GCS_BUCKET}"
    log_success "Created bucket gs://${GCS_BUCKET}"
fi

# Enable versioning
log_step "Enabling versioning on bucket..."
gsutil versioning set on "gs://${GCS_BUCKET}"
log_success "Versioning enabled"

# Set lifecycle policy (keep 30 versions)
log_step "Setting lifecycle policy (keep 30 versions)..."
cat > /tmp/lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"numNewerVersions": 30}
      }
    ]
  }
}
EOF
gsutil lifecycle set /tmp/lifecycle.json "gs://${GCS_BUCKET}"
rm /tmp/lifecycle.json
log_success "Lifecycle policy applied"

# Grant access to service account (if it exists)
log_step "Checking service account permissions..."
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$GCP_PROJECT" &> /dev/null; then
    gsutil iam ch "serviceAccount:${SERVICE_ACCOUNT}:objectAdmin" "gs://${GCS_BUCKET}" 2>/dev/null || true
    log_success "Service account permissions configured"
else
    log_warn "Service account ${SERVICE_ACCOUNT} not found - skipping permissions"
    log_info "You may need to configure permissions manually"
fi

# Enable GCS backend in Terraform configurations
log_step "Updating Terraform backend configurations..."

# Update pilot backend.tf
PILOT_BACKEND="${DIVE_ROOT}/terraform/pilot/backend.tf"
if [ -f "$PILOT_BACKEND" ]; then
    cat > "$PILOT_BACKEND" << EOF
# =============================================================================
# DIVE V3 Pilot - Terraform Backend Configuration
# =============================================================================
# Using GCS backend for shared state management.
# To switch back to local: replace backend "gcs" with backend "local" {}
# =============================================================================

terraform {
  backend "gcs" {
    bucket  = "${GCS_BUCKET}"
    prefix  = "dive-v3/pilot"
  }
}
EOF
    log_success "Updated pilot backend.tf to use GCS"
fi

# Update spoke backend.tf
SPOKE_BACKEND="${DIVE_ROOT}/terraform/spoke/backend.tf"
if [ -f "$SPOKE_BACKEND" ]; then
    cat > "$SPOKE_BACKEND" << EOF
# =============================================================================
# DIVE V3 Spoke - Terraform Backend Configuration
# =============================================================================
# Using GCS backend for shared state management with workspaces.
#
# Usage:
#   terraform workspace new pol
#   terraform workspace select pol
#   terraform plan -var-file=../countries/pol.tfvars
#
# State is stored at: gs://${GCS_BUCKET}/dive-v3/spokes/<workspace>/
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "${GCS_BUCKET}"
    prefix = "dive-v3/spokes"
  }
}
EOF
    log_success "Updated spoke backend.tf to use GCS"
fi

# Update hub backend.tf
HUB_BACKEND="${DIVE_ROOT}/terraform/hub/backend.tf"
if [ -f "$HUB_BACKEND" ]; then
    cat > "$HUB_BACKEND" << EOF
# =============================================================================
# DIVE V3 Hub - Terraform Backend Configuration
# =============================================================================
# Using GCS backend for shared state management.
# =============================================================================

terraform {
  backend "gcs" {
    bucket  = "${GCS_BUCKET}"
    prefix  = "dive-v3/hub"
  }
}
EOF
    log_success "Updated hub backend.tf to use GCS"
fi

echo ""
log_success "GCS backend setup complete!"
echo ""

# Initialize Terraform if requested
if [ "$INIT_TERRAFORM" = true ]; then
    log_step "Initializing Terraform with new backend..."
    
    echo ""
    log_warn "This will migrate existing state to GCS."
    log_warn "Make sure you have backed up any important state."
    echo ""
    read -r -p "Continue with terraform init? (y/N) " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        # Initialize pilot
        if [ -d "${DIVE_ROOT}/terraform/pilot" ]; then
            log_step "Initializing pilot terraform..."
            (cd "${DIVE_ROOT}/terraform/pilot" && terraform init -migrate-state -input=false)
            log_success "Pilot initialized"
        fi
        
        # Initialize spoke
        if [ -d "${DIVE_ROOT}/terraform/spoke" ]; then
            log_step "Initializing spoke terraform..."
            (cd "${DIVE_ROOT}/terraform/spoke" && terraform init -migrate-state -input=false)
            log_success "Spoke initialized"
        fi
        
        # Initialize hub
        if [ -d "${DIVE_ROOT}/terraform/hub" ]; then
            log_step "Initializing hub terraform..."
            (cd "${DIVE_ROOT}/terraform/hub" && terraform init -migrate-state -input=false)
            log_success "Hub initialized"
        fi
        
        echo ""
        log_success "Terraform state migration complete!"
    else
        log_info "Skipping terraform init"
    fi
fi

echo ""
echo "=============================================="
echo " Next Steps"
echo "=============================================="
echo ""
echo "1. If you haven't already, run terraform init to migrate state:"
echo "   cd terraform/pilot && terraform init -migrate-state"
echo "   cd terraform/spoke && terraform init -migrate-state"
echo ""
echo "2. Verify state is stored in GCS:"
echo "   gsutil ls gs://${GCS_BUCKET}/dive-v3/"
echo ""
echo "3. To use the new backend, run:"
echo "   ./dive tf pilot plan"
echo "   ./dive tf pilot apply"
echo ""
