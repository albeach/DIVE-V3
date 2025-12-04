# =============================================================================
# DIVE V3 Infrastructure - Terraform Backend Configuration
# =============================================================================
# Uses local backend for initial deployment
# TODO: Migrate to GCS backend after cluster creation
# =============================================================================

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}

