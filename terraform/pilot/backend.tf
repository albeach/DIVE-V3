# =============================================================================
# DIVE V3 Pilot - Terraform Backend Configuration
# =============================================================================
# Uses GCS backend for shared state management across team members.
# State is stored in gs://dive25-tfstate bucket with versioning enabled.
#
# Setup (one-time):
#   1. Create bucket: gsutil mb -p dive25 -l us-central1 gs://dive25-tfstate
#   2. Enable versioning: gsutil versioning set on gs://dive25-tfstate
#   3. Initialize: terraform init -reconfigure
# =============================================================================

terraform {
  # GCS Backend for Production/Team Use
  # Comment out and uncomment local backend below for isolated local development
  backend "gcs" {
    bucket = "dive25-tfstate"
    prefix = "pilot"
  }

  # Local Backend for Isolated Development (uncomment if needed)
  # backend "local" {
  #   path = "terraform.tfstate"
  # }

  required_version = ">= 1.5.0"
}
