# ============================================================================
# DIVE V3 - GCP Secret Manager Module
# ============================================================================
# Creates and manages federation secrets in GCP Secret Manager
# 
# This module:
# 1. Creates secrets for all federation relationships
# 2. Configures IAM for per-instance access control
# 3. Enables audit logging
# ============================================================================

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# ============================================================================
# LOCAL VARIABLES
# ============================================================================

locals {
  # Generate all federation secret names from the matrix
  # Format: dive-v3-federation-{source}-{target}
  federation_secrets = flatten([
    for source, targets in var.federation_matrix : [
      for target in targets : {
        key         = "${source}-${target}"
        source      = source
        target      = target
        secret_name = "dive-v3-federation-${source}-${target}"
        labels = {
          project = "dive-v3"
          type    = "federation"
          source  = source
          target  = target
        }
      }
    ]
  ])

  # Convert to map for for_each
  federation_secrets_map = { for s in local.federation_secrets : s.key => s }
}

# ============================================================================
# SERVICE ACCOUNTS
# ============================================================================

resource "google_service_account" "keycloak" {
  for_each = var.instances

  account_id   = "dive-v3-keycloak-${each.key}"
  display_name = "DIVE V3 Keycloak ${upper(each.key)} Instance"
  description  = "Service account for DIVE V3 ${each.value.name} Keycloak instance to access federation secrets"
  project      = var.project_id
}

# ============================================================================
# SECRETS
# ============================================================================

resource "google_secret_manager_secret" "federation" {
  for_each = local.federation_secrets_map

  secret_id = each.value.secret_name
  project   = var.project_id

  labels = each.value.labels

  replication {
    user_managed {
      dynamic "replicas" {
        for_each = var.replication_locations
        content {
          location = replicas.value
        }
      }
    }
  }

  # Topics for notifications (optional)
  dynamic "topics" {
    for_each = var.notification_topic != null ? [var.notification_topic] : []
    content {
      name = topics.value
    }
  }
}

# Initial secret version (placeholder - will be updated by sync script)
resource "google_secret_manager_secret_version" "federation_initial" {
  for_each = local.federation_secrets_map

  secret      = google_secret_manager_secret.federation[each.key].id
  secret_data = "placeholder-to-be-synced-${each.value.source}-${each.value.target}"

  lifecycle {
    # Ignore changes to secret_data - this will be managed by the sync script
    ignore_changes = [secret_data]
  }
}

# ============================================================================
# IAM BINDINGS
# ============================================================================

# Each instance can access secrets where it is the TARGET
# (because the target instance needs to authenticate against the source)
resource "google_secret_manager_secret_iam_member" "keycloak_access" {
  for_each = local.federation_secrets_map

  project   = var.project_id
  secret_id = google_secret_manager_secret.federation[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak[each.value.target].email}"
}

# Allow sync script service account to write all secrets
resource "google_secret_manager_secret_iam_member" "sync_script_access" {
  for_each = local.federation_secrets_map

  project   = var.project_id
  secret_id = google_secret_manager_secret.federation[each.key].id
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_service_account.sync_script.email}"
}

# Service account for the sync script (runs during deployment)
resource "google_service_account" "sync_script" {
  account_id   = "dive-v3-secrets-sync"
  display_name = "DIVE V3 Secrets Sync Script"
  description  = "Service account for syncing federation secrets from Keycloak to Secret Manager"
  project      = var.project_id
}

# ============================================================================
# AUDIT LOGGING
# ============================================================================

# Ensure Cloud Audit Logs are enabled for Secret Manager
# This is typically enabled by default, but we can configure data access logs
resource "google_project_iam_audit_config" "secret_manager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }

  audit_log_config {
    log_type = "ADMIN_READ"
  }
}

# ============================================================================
# WORKLOAD IDENTITY (for GKE/Cloud Run future use)
# ============================================================================

# Workload Identity binding for each Keycloak service account
resource "google_service_account_iam_member" "workload_identity" {
  for_each = var.enable_workload_identity ? var.instances : {}

  service_account_id = google_service_account.keycloak[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.workload_identity_namespace}/keycloak-${each.key}]"
}









