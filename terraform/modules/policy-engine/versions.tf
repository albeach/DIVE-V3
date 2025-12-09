# =============================================================================
# Policy Engine Module - Terraform Version Requirements
# =============================================================================
# This module deploys OPA + OPAL infrastructure for DIVE V3 policy management.
#
# Compatible with:
#   - Terraform >= 1.5.0
#   - Docker Provider >= 3.0
#   - Google Provider >= 5.0 (for GCP Secret Manager)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = ">= 3.0.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0.0"
    }
  }
}








