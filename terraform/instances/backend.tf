# =============================================================================
# TERRAFORM REMOTE BACKEND - GCS
# =============================================================================
# Best Practice: Store Terraform state remotely for:
#   - Team collaboration (shared state)
#   - State locking (prevent concurrent modifications)
#   - State versioning (rollback capability)
#   - Encryption at rest (KMS-encrypted bucket)
#
# IMPORTANT: After adding this file, run:
#   terraform init -migrate-state
#
# This will migrate your local state to GCS.
# =============================================================================

terraform {
  backend "gcs" {
    bucket = "dive25-terraform-state"
    prefix = "dive-v3/keycloak"

    # Each workspace gets its own state file:
    #   dive-v3/keycloak/usa/default.tfstate
    #   dive-v3/keycloak/fra/default.tfstate
    #   dive-v3/keycloak/gbr/default.tfstate
    #   dive-v3/keycloak/deu/default.tfstate
  }
}











