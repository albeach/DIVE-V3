# =============================================================================
# DIVE V3 Spoke - Terraform Backend Configuration
# =============================================================================
# Uses GCS backend for shared state management across team members.
# State is stored per-workspace in gs://dive25-tfstate bucket.
#
# Setup (one-time):
#   1. Create bucket: gsutil mb -p dive25 -l us-central1 gs://dive25-tfstate
#   2. Enable versioning: gsutil versioning set on gs://dive25-tfstate
#   3. Initialize: terraform init -reconfigure
#   4. Create workspace: terraform workspace new <country_code>
#
# Workspace Usage:
#   terraform workspace new pol
#   terraform workspace select pol
#   terraform plan -var-file=../countries/pol.tfvars
# =============================================================================

terraform {
  # GCS Backend for Production/Team Use
  # Each workspace stores state at: gs://dive25-tfstate/spoke/<workspace>/default.tfstate
  # backend "gcs" {
  #   bucket = "dive25-tfstate"
  #   prefix = "spoke"
  # }

  # Local Backend for Isolated Development (enabled for local docker deployments)
  backend "local" {
    path = "terraform.tfstate"
  }

  required_version = ">= 1.5.0"
}
