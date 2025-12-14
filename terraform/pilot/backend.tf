# =============================================================================
# DIVE V3 Pilot - Terraform Backend Configuration
# =============================================================================
# Uses local state for development. In production, use GCS backend.
# =============================================================================

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }

  # For production, use GCS backend:
  # backend "gcs" {
  #   bucket  = "dive25-terraform-state"
  #   prefix  = "dive-v3/pilot"
  # }
}







