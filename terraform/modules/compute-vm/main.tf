# =============================================================================
# DIVE V3 - Compute VM Module
# =============================================================================
# Provisions a GCP Compute Engine VM with Docker and required tools for
# running the DIVE V3 stack.
#
# Usage:
#   module "pilot_vm" {
#     source = "../modules/compute-vm"
#     
#     name         = "dive-v3-pilot"
#     project_id   = "dive25"
#     zone         = "us-east4-c"
#     machine_type = "e2-standard-4"
#   }
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0.0"
    }
  }
}

# =============================================================================
# DATA SOURCES
# =============================================================================

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2204-lts"
  project = "ubuntu-os-cloud"
}

# =============================================================================
# COMPUTE INSTANCE
# =============================================================================

resource "google_compute_instance" "vm" {
  name         = var.name
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  tags = var.network_tags

  labels = merge(
    {
      "managed-by"  = "terraform"
      "application" = "dive-v3"
      "environment" = var.environment
    },
    var.labels
  )

  boot_disk {
    initialize_params {
      image = data.google_compute_image.ubuntu.self_link
      size  = var.disk_size_gb
      type  = var.disk_type
    }
  }

  network_interface {
    network    = var.network
    subnetwork = var.subnetwork

    access_config {
      # Ephemeral external IP
      nat_ip = var.static_ip
    }
  }

  metadata = {
    ssh-keys                  = var.ssh_public_key != "" ? "${var.ssh_user}:${var.ssh_public_key}" : null
    enable-oslogin            = var.enable_os_login ? "TRUE" : "FALSE"
    google-logging-enabled    = "true"
    google-monitoring-enabled = "true"
  }

  metadata_startup_script = var.custom_startup_script != "" ? var.custom_startup_script : file("${path.module}/startup-script.sh")

  service_account {
    email  = var.service_account_email
    scopes = var.service_account_scopes
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [
      metadata["ssh-keys"],
    ]
  }
}

# =============================================================================
# FIREWALL RULES
# =============================================================================

resource "google_compute_firewall" "dive_services" {
  count = var.create_firewall_rules ? 1 : 0

  name    = "${var.name}-allow-services"
  network = var.network
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = var.allowed_ports
  }

  source_ranges = var.allowed_source_ranges
  target_tags   = var.network_tags

  description = "Allow access to DIVE V3 services"
}

resource "google_compute_firewall" "dive_ssh" {
  count = var.create_firewall_rules ? 1 : 0

  name    = "${var.name}-allow-ssh"
  network = var.network
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_allowed_ranges
  target_tags   = var.network_tags

  description = "Allow SSH access via IAP"
}

# =============================================================================
# HEALTH CHECK (Optional)
# =============================================================================

resource "google_compute_health_check" "vm_health" {
  count = var.create_health_check ? 1 : 0

  name    = "${var.name}-health-check"
  project = var.project_id

  timeout_sec        = 10
  check_interval_sec = 30

  http_health_check {
    port         = var.health_check_port
    request_path = var.health_check_path
  }
}

