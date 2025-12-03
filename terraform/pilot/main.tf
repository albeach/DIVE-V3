# =============================================================================
# DIVE V3 Pilot Deployment - Cost-Optimized GCP Configuration
# =============================================================================
# Optimized for 10-20 active users using Cloud Run instead of GKE.
# Estimated monthly cost: ~$50-100/month (vs ~$500+ for GKE)
#
# Usage:
#   cd terraform/pilot
#   terraform init
#   terraform plan -var-file=pilot.tfvars
#   terraform apply -var-file=pilot.tfvars
#
# Architecture:
#   - Cloud Run: Backend, Frontend, KAS (serverless, scale to zero)
#   - Cloud SQL (PostgreSQL): Keycloak database (basic tier)
#   - Memorystore (Redis): Session cache (basic tier)
#   - Cloud Storage: Policy bundles, static assets
#   - Artifact Registry: Container images
#   - Secret Manager: Credentials (existing dive25 project)
#   - Cloud Armor: WAF (basic DDoS protection)
#
# Note: Keycloak runs as Cloud Run service with Cloud SQL backend
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "dive25-terraform-state"
    prefix = "pilot"
  }
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "dive25"
}

variable "region" {
  description = "GCP region for deployment"
  type        = string
  default     = "us-east4"  # Virginia - low latency to DC area
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "pilot"
}

variable "domain" {
  description = "Base domain for services"
  type        = string
  default     = "dive25.com"
}

variable "cloudflare_enabled" {
  description = "Use existing Cloudflare tunnels for external access"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  service_prefix = "dive-v3-${var.environment}"
  
  labels = {
    environment = var.environment
    project     = "dive-v3"
    managed-by  = "terraform"
    cost-center = "pilot"
  }

  # Cloud Run services configuration
  services = {
    backend = {
      name        = "${local.service_prefix}-backend"
      image       = "${var.region}-docker.pkg.dev/${var.project_id}/dive-v3/backend:latest"
      port        = 4000
      cpu         = "1"
      memory      = "512Mi"
      min_instances = 0  # Scale to zero when idle
      max_instances = 2
      env_vars = {
        NODE_ENV          = "production"
        LOG_LEVEL         = "info"
        OPA_URL           = "http://localhost:8181"  # Sidecar
        KEYCLOAK_URL      = "https://${local.service_prefix}-keycloak-${data.google_project.current.number}.${var.region}.run.app"
        KEYCLOAK_REALM    = "dive-v3-broker"
      }
    }
    frontend = {
      name        = "${local.service_prefix}-frontend"
      image       = "${var.region}-docker.pkg.dev/${var.project_id}/dive-v3/frontend:latest"
      port        = 3000
      cpu         = "1"
      memory      = "512Mi"
      min_instances = 0
      max_instances = 2
      env_vars = {
        NODE_ENV                = "production"
        NEXT_PUBLIC_API_URL     = "https://usa-api.${var.domain}"
        NEXTAUTH_URL            = "https://usa-app.${var.domain}"
      }
    }
    keycloak = {
      name        = "${local.service_prefix}-keycloak"
      image       = "${var.region}-docker.pkg.dev/${var.project_id}/dive-v3/keycloak:latest"
      port        = 8080
      cpu         = "2"
      memory      = "2Gi"
      min_instances = 1  # Always-on for auth
      max_instances = 2
      env_vars = {
        KC_PROXY_HEADERS = "xforwarded"
        KC_HTTP_ENABLED  = "true"
        KC_HOSTNAME      = "usa-idp.${var.domain}"
      }
    }
    kas = {
      name        = "${local.service_prefix}-kas"
      image       = "${var.region}-docker.pkg.dev/${var.project_id}/dive-v3/kas:latest"
      port        = 8080
      cpu         = "1"
      memory      = "256Mi"
      min_instances = 0
      max_instances = 2
      env_vars = {
        NODE_ENV = "production"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "google_project" "current" {
  project_id = var.project_id
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
  ])
  
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# VPC Network (for Cloud SQL and Redis private access)
# -----------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                    = "${local.service_prefix}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  
  depends_on = [google_project_service.required_apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${local.service_prefix}-subnet"
  project       = var.project_id
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = "10.0.0.0/24"
  
  private_ip_google_access = true
}

# VPC Connector for Cloud Run to access private resources
resource "google_vpc_access_connector" "connector" {
  name          = "${local.service_prefix}-connector"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"  # Small range for connector
  
  min_instances = 2
  max_instances = 3
  
  depends_on = [google_project_service.required_apis]
}

# -----------------------------------------------------------------------------
# Cloud SQL (PostgreSQL for Keycloak) - Minimal Cost Configuration
# -----------------------------------------------------------------------------

resource "google_sql_database_instance" "keycloak" {
  name             = "${local.service_prefix}-keycloak-db"
  project          = var.project_id
  region           = var.region
  database_version = "POSTGRES_15"
  
  settings {
    tier              = "db-f1-micro"  # Smallest tier (~$10/month)
    availability_type = "ZONAL"        # No HA for cost savings
    disk_size         = 10             # 10GB minimum
    disk_type         = "PD_HDD"       # Cheaper than SSD for pilot
    
    backup_configuration {
      enabled            = true
      start_time         = "03:00"     # 3 AM backup
      point_in_time_recovery_enabled = false  # Disabled for cost
    }
    
    ip_configuration {
      ipv4_enabled    = false  # Private IP only
      private_network = google_compute_network.vpc.id
    }
    
    user_labels = local.labels
  }
  
  deletion_protection = false  # Pilot can be deleted
  
  depends_on = [google_project_service.required_apis]
}

resource "google_sql_database" "keycloak" {
  name     = "keycloak"
  project  = var.project_id
  instance = google_sql_database_instance.keycloak.name
}

resource "google_sql_user" "keycloak" {
  name     = "keycloak"
  project  = var.project_id
  instance = google_sql_database_instance.keycloak.name
  password = data.google_secret_manager_secret_version.postgres_password.secret_data
}

# -----------------------------------------------------------------------------
# Memorystore (Redis) - Minimal Cost Configuration
# -----------------------------------------------------------------------------

resource "google_redis_instance" "cache" {
  name           = "${local.service_prefix}-redis"
  project        = var.project_id
  region         = var.region
  tier           = "BASIC"          # No HA for cost savings
  memory_size_gb = 1                # 1GB minimum
  
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  
  redis_version = "REDIS_7_0"
  
  labels = local.labels
  
  depends_on = [google_project_service.required_apis]
}

# Private service access for Redis
resource "google_compute_global_address" "private_ip_range" {
  name          = "${local.service_prefix}-private-ip"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# -----------------------------------------------------------------------------
# Artifact Registry (Container Images)
# -----------------------------------------------------------------------------

resource "google_artifact_registry_repository" "dive_v3" {
  location      = var.region
  repository_id = "dive-v3"
  project       = var.project_id
  format        = "DOCKER"
  description   = "DIVE V3 container images"
  
  labels = local.labels
  
  depends_on = [google_project_service.required_apis]
}

# -----------------------------------------------------------------------------
# Secret Manager References (existing secrets in dive25 project)
# -----------------------------------------------------------------------------

data "google_secret_manager_secret_version" "postgres_password" {
  project = var.project_id
  secret  = "dive-v3-postgres-usa"
  version = "latest"
}

data "google_secret_manager_secret_version" "keycloak_admin_password" {
  project = var.project_id
  secret  = "dive-v3-keycloak-usa"
  version = "latest"
}

data "google_secret_manager_secret_version" "auth_secret" {
  project = var.project_id
  secret  = "dive-v3-auth-secret-usa"
  version = "latest"
}

# -----------------------------------------------------------------------------
# Cloud Storage (Policy Bundles)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "policy_bundles" {
  name          = "${var.project_id}-${local.service_prefix}-bundles"
  project       = var.project_id
  location      = var.region
  force_destroy = true
  
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }
  
  labels = local.labels
}

# -----------------------------------------------------------------------------
# Service Account for Cloud Run
# -----------------------------------------------------------------------------

resource "google_service_account" "cloud_run" {
  account_id   = "${local.service_prefix}-run"
  project      = var.project_id
  display_name = "DIVE V3 Pilot Cloud Run Service Account"
  description  = "Service account for DIVE V3 pilot Cloud Run services"
}

# Grant necessary permissions
resource "google_project_iam_member" "cloud_run_roles" {
  for_each = toset([
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/storage.objectViewer",
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "vpc_network" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}

output "cloud_sql_connection" {
  description = "Cloud SQL connection string"
  value       = google_sql_database_instance.keycloak.connection_name
  sensitive   = true
}

output "redis_host" {
  description = "Redis instance host"
  value       = google_redis_instance.cache.host
  sensitive   = true
}

output "artifact_registry_url" {
  description = "Artifact Registry URL for container images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.dive_v3.repository_id}"
}

output "policy_bucket" {
  description = "Cloud Storage bucket for policy bundles"
  value       = google_storage_bucket.policy_bundles.name
}

output "service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run.email
}

output "estimated_monthly_cost" {
  description = "Estimated monthly cost breakdown"
  value = {
    cloud_sql_f1_micro = "$10-15"
    redis_basic_1gb    = "$25-30"
    cloud_run          = "$10-20 (scale to zero)"
    storage            = "$1-5"
    networking         = "$5-10"
    total_estimate     = "$50-80/month"
    note               = "Actual costs depend on usage. With Cloudflare tunnels, no load balancer needed."
  }
}

