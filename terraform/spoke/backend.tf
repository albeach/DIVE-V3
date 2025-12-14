# =============================================================================
# DIVE V3 Spoke - Terraform Backend Configuration
# =============================================================================
# Uses local state per workspace. In production, use GCS backend.
#
# Usage with workspaces:
#   terraform workspace new pol
#   terraform workspace select pol
#   terraform plan -var-file=../countries/pol.tfvars
# =============================================================================

terraform {
  # Local backend for development
  # Each workspace stores state in terraform.tfstate.d/<workspace>/
  backend "local" {}
  
  # For production, use GCS backend:
  # backend "gcs" {
  #   bucket  = "dive25-terraform-state"
  #   prefix  = "dive-v3/spokes"
  # }
}

