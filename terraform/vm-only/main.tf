# DIVE V3 VM-Only Provisioning
# Minimal terraform config to provision GCP VM without Keycloak configuration

terraform {
  required_version = ">= 1.5.0"

  backend "gcs" {
    bucket = "dive25-tfstate"
    prefix = "vm-only"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "vm" {
  source = "../modules/compute-vm"

  name         = var.vm_name
  project_id   = var.project_id
  zone         = var.zone
  machine_type = var.machine_type
  environment  = var.environment

  service_account_email = var.service_account_email

  create_firewall_rules = true
  allowed_ports         = ["22", "80", "443", "3000-3100", "4000-4100", "8000-9000"]
  allowed_source_ranges = ["0.0.0.0/0"] # Allow all for demo - restrict in production

  ssh_allowed_ranges = ["35.235.240.0/20"] # IAP IP range

  create_health_check = false
}
