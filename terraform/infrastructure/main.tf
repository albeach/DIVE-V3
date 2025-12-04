# =============================================================================
# DIVE V3 Infrastructure - GKE Cluster & Supporting Resources
# =============================================================================
# This module provisions the Kubernetes cluster and supporting infrastructure
# for DIVE V3 production deployment.
#
# Resources Created:
#   - GKE Autopilot Cluster (managed Kubernetes)
#   - VPC Network & Subnets
#   - Cloud Router & NAT Gateway
#   - Firewall Rules
#   - Service Accounts
#   - IAM Bindings
#
# Usage:
#   terraform init
#   terraform plan
#   terraform apply
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# VPC NETWORK
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = var.network_name
  auto_create_subnetworks = false
  description             = "VPC network for DIVE V3"
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.subnet_name
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
  
  private_ip_google_access = true
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# =============================================================================
# CLOUD ROUTER & NAT GATEWAY (for private cluster internet access)
# =============================================================================

resource "google_compute_router" "router" {
  name    = "${var.cluster_name}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${var.cluster_name}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  
  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# =============================================================================
# FIREWALL RULES
# =============================================================================

resource "google_compute_firewall" "allow_internal" {
  name    = "${var.network_name}-allow-internal"
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "icmp"
  }
  
  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  
  source_ranges = [var.subnet_cidr]
  
  description = "Allow all internal traffic within VPC"
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.network_name}-allow-ssh"
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  
  source_ranges = ["0.0.0.0/0"]  # Restrict in production
  target_tags   = ["ssh"]
  
  description = "Allow SSH access (restrict source_ranges in production)"
}

# =============================================================================
# SERVICE ACCOUNTS
# =============================================================================

resource "google_service_account" "gke_nodes" {
  account_id   = "${var.cluster_name}-nodes"
  display_name = "GKE Nodes Service Account"
  description  = "Service account for GKE nodes"
}

resource "google_project_iam_member" "gke_nodes_secret_manager" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_storage" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# =============================================================================
# GKE CLUSTER (Autopilot Mode)
# =============================================================================

resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.region
  
  # Enable Autopilot (managed Kubernetes - no node management)
  enable_autopilot = true
  
  # Network configuration
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name
  
  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = var.enable_private_cluster
    enable_private_endpoint = false  # Allow public endpoint for GitHub Actions
    master_ipv4_cidr_block  = "10.3.0.0/28"
  }
  
  # IP allocation for pods and services
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  
  # Workload Identity (for GCP Secret Manager access)
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
  
  # Note: Network policies are automatically enabled in Autopilot mode
  # No need to configure network_policy block
  
  # Release channel (for automatic upgrades)
  release_channel {
    channel = "REGULAR"  # Options: UNSPECIFIED, RAPID, REGULAR, STABLE
  }
  
  # Maintenance window
  maintenance_policy {
    daily_maintenance_window {
      start_time = "03:00"  # 3 AM UTC
    }
  }
  
  # Logging and monitoring
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }
  
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }
  
  # Addons
  addons_config {
    http_load_balancing {
      disabled = false
    }
    
    horizontal_pod_autoscaling {
      disabled = false
    }
    
    # Network policy is automatically enabled in Autopilot mode
    # network_policy_config is not supported in Autopilot
  }
  
  # Resource deletion protection
  deletion_protection = true
  
  depends_on = [
    google_compute_router_nat.nat,
    google_service_account.gke_nodes
  ]
}


