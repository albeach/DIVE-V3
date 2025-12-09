# =============================================================================
# TERRAFORM PROVIDERS
# =============================================================================
# Provider configuration for policy engine infrastructure.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = ">= 3.0.0"
    }
    local = {
      source  = "hashicorp/local"
      version = ">= 2.0.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0.0"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.9.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Google Cloud Provider
# -----------------------------------------------------------------------------
# Used for GCP Secret Manager integration.

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# -----------------------------------------------------------------------------
# Docker Provider
# -----------------------------------------------------------------------------
# Used for container management.
# Note: For remote Docker hosts, configure the host parameter.

provider "docker" {
  # Default: Uses local Docker socket
  # For remote: host = "tcp://docker-host:2376"
}








