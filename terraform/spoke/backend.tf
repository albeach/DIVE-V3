# =============================================================================
# DIVE V3 Spoke - Terraform Backend Configuration
# =============================================================================
# Uses local state per workspace. In production, use GCS backend.
#
# Usage with workspaces:
#   ./dive tf workspace new pol
#   ./dive tf spoke plan POL
#   ./dive tf spoke apply POL
#
# State files are stored in terraform.tfstate.d/<workspace>/
# =============================================================================

terraform {
  backend "local" {}

  # For production, use GCS backend:
  # backend "gcs" {
  #   bucket = "dive25-terraform-state"
  #   prefix = "dive-v3/spokes"
  # }
}

