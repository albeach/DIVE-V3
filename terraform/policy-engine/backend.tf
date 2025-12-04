# =============================================================================
# TERRAFORM REMOTE BACKEND - GCS
# =============================================================================
# Stores Terraform state for policy engine infrastructure in GCS.
#
# Features:
#   - Team collaboration via shared state
#   - State locking to prevent concurrent modifications
#   - Version history for rollback capability
#   - Encryption at rest via GCS default encryption
#
# IMPORTANT: After adding this file, run:
#   terraform init
#
# To migrate existing local state:
#   terraform init -migrate-state
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "dive25-terraform-state"
    prefix = "dive-v3/policy-engine"

    # State files are organized by workspace:
    #   dive-v3/policy-engine/dev/default.tfstate
    #   dive-v3/policy-engine/staging/default.tfstate
    #   dive-v3/policy-engine/prod/default.tfstate
    #
    # Workspace selection:
    #   terraform workspace select dev
    #   terraform workspace select staging
    #   terraform workspace select prod
  }
}



