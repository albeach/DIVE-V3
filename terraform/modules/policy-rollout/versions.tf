# =============================================================================
# Policy Rollout Module - Terraform Version Requirements
# =============================================================================
# This module manages canary deployments for OPA policies in DIVE V3.
#
# Features:
#   - Blue/Green deployment strategy
#   - Canary traffic shifting
#   - Automated rollback
#   - Deployment validation
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0.0"
    }
    local = {
      source  = "hashicorp/local"
      version = ">= 2.0.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.9.0"
    }
  }
}




