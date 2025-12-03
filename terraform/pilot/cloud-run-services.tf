# =============================================================================
# DIVE V3 Pilot - Cloud Run Services
# =============================================================================
# Serverless deployment of DIVE V3 services with scale-to-zero capability.
# This file defines Cloud Run services for Backend, Frontend, Keycloak, and KAS.
# =============================================================================

# -----------------------------------------------------------------------------
# Backend API Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "backend" {
  name     = local.services.backend.name
  project  = var.project_id
  location = var.region
  
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"  # Via Cloudflare tunnel
  
  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instance_count = local.services.backend.min_instances
      max_instance_count = local.services.backend.max_instances
    }
    
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    
    containers {
      image = local.services.backend.image
      
      ports {
        container_port = local.services.backend.port
      }
      
      resources {
        limits = {
          cpu    = local.services.backend.cpu
          memory = local.services.backend.memory
        }
        cpu_idle = true  # Allow CPU throttling when idle
      }
      
      # Environment variables
      dynamic "env" {
        for_each = local.services.backend.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      # Secrets from Secret Manager
      env {
        name = "MONGO_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-mongodb-usa"
            version = "latest"
          }
        }
      }
      
      env {
        name = "KEYCLOAK_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-keycloak-client-secret"
            version = "latest"
          }
        }
      }
      
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.cache.host}:6379"
      }
      
      startup_probe {
        http_get {
          path = "/health"
          port = local.services.backend.port
        }
        initial_delay_seconds = 10
        timeout_seconds       = 3
        period_seconds        = 5
        failure_threshold     = 10
      }
      
      liveness_probe {
        http_get {
          path = "/health"
          port = local.services.backend.port
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
    
    # OPA sidecar container
    containers {
      name  = "opa"
      image = "openpolicyagent/opa:0.68.0"
      
      args = [
        "run",
        "--server",
        "--addr=localhost:8181",
        "--log-level=info",
        "--set=decision_logs.console=true",
      ]
      
      resources {
        limits = {
          cpu    = "0.5"
          memory = "256Mi"
        }
      }
      
      # Mount policy bundle from GCS
      volume_mounts {
        name       = "policy-bundle"
        mount_path = "/bundles"
      }
    }
    
    volumes {
      name = "policy-bundle"
      gcs {
        bucket    = google_storage_bucket.policy_bundles.name
        read_only = true
      }
    }
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  labels = local.labels
  
  depends_on = [
    google_project_service.required_apis,
    google_vpc_access_connector.connector,
  ]
}

# -----------------------------------------------------------------------------
# Frontend Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "frontend" {
  name     = local.services.frontend.name
  project  = var.project_id
  location = var.region
  
  ingress = "INGRESS_TRAFFIC_ALL"  # Public access via Cloudflare
  
  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instance_count = local.services.frontend.min_instances
      max_instance_count = local.services.frontend.max_instances
    }
    
    containers {
      image = local.services.frontend.image
      
      ports {
        container_port = local.services.frontend.port
      }
      
      resources {
        limits = {
          cpu    = local.services.frontend.cpu
          memory = local.services.frontend.memory
        }
        cpu_idle = true
      }
      
      dynamic "env" {
        for_each = local.services.frontend.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-auth-secret-usa"
            version = "latest"
          }
        }
      }
      
      env {
        name = "KEYCLOAK_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-keycloak-client-secret"
            version = "latest"
          }
        }
      }
      
      startup_probe {
        http_get {
          path = "/"
          port = local.services.frontend.port
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 10
      }
    }
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  labels = local.labels
}

# Allow unauthenticated access to frontend (auth handled by NextAuth)
resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Keycloak Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "keycloak" {
  name     = local.services.keycloak.name
  project  = var.project_id
  location = var.region
  
  ingress = "INGRESS_TRAFFIC_ALL"  # Public access for IdP
  
  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instance_count = local.services.keycloak.min_instances  # Always on
      max_instance_count = local.services.keycloak.max_instances
    }
    
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    
    containers {
      image = local.services.keycloak.image
      
      ports {
        container_port = local.services.keycloak.port
      }
      
      resources {
        limits = {
          cpu    = local.services.keycloak.cpu
          memory = local.services.keycloak.memory
        }
      }
      
      dynamic "env" {
        for_each = local.services.keycloak.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      env {
        name  = "KC_DB"
        value = "postgres"
      }
      
      env {
        name  = "KC_DB_URL"
        value = "jdbc:postgresql:///${google_sql_database.keycloak.name}?cloudSqlInstance=${google_sql_database_instance.keycloak.connection_name}&socketFactory=com.google.cloud.sql.postgres.SocketFactory"
      }
      
      env {
        name  = "KC_DB_USERNAME"
        value = google_sql_user.keycloak.name
      }
      
      env {
        name = "KC_DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-postgres-usa"
            version = "latest"
          }
        }
      }
      
      env {
        name = "KEYCLOAK_ADMIN_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-keycloak-usa"
            version = "latest"
          }
        }
      }
      
      startup_probe {
        http_get {
          path = "/health/ready"
          port = local.services.keycloak.port
        }
        initial_delay_seconds = 60
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 30
      }
      
      liveness_probe {
        http_get {
          path = "/health/live"
          port = local.services.keycloak.port
        }
        period_seconds    = 30
        timeout_seconds   = 10
        failure_threshold = 3
      }
    }
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  labels = local.labels
}

# Allow unauthenticated access to Keycloak (it handles its own auth)
resource "google_cloud_run_v2_service_iam_member" "keycloak_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.keycloak.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# KAS Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "kas" {
  name     = local.services.kas.name
  project  = var.project_id
  location = var.region
  
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  
  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instance_count = local.services.kas.min_instances
      max_instance_count = local.services.kas.max_instances
    }
    
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    
    containers {
      image = local.services.kas.image
      
      ports {
        container_port = local.services.kas.port
      }
      
      resources {
        limits = {
          cpu    = local.services.kas.cpu
          memory = local.services.kas.memory
        }
        cpu_idle = true
      }
      
      dynamic "env" {
        for_each = local.services.kas.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      env {
        name = "KAS_SIGNING_KEY"
        value_source {
          secret_key_ref {
            secret  = "dive-v3-kas-signing-key"
            version = "latest"
          }
        }
      }
    }
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  labels = local.labels
}

# -----------------------------------------------------------------------------
# Outputs - Cloud Run Service URLs
# -----------------------------------------------------------------------------

output "backend_url" {
  description = "Backend API Cloud Run URL"
  value       = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  description = "Frontend Cloud Run URL"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "keycloak_url" {
  description = "Keycloak Cloud Run URL"
  value       = google_cloud_run_v2_service.keycloak.uri
}

output "kas_url" {
  description = "KAS Cloud Run URL"
  value       = google_cloud_run_v2_service.kas.uri
}

