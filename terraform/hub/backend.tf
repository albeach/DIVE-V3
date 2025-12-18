# =============================================================================
# DIVE V3 Hub - Terraform Backend Configuration
# =============================================================================
# Uses local state for hub management. Separate from pilot/spoke states.
# =============================================================================

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}

