# ============================================================================
# DIVE V3 - GCP Secret Manager Module - Outputs
# ============================================================================

output "secret_ids" {
  description = "Map of federation secret IDs"
  value       = { for k, v in google_secret_manager_secret.federation : k => v.id }
}

output "secret_names" {
  description = "Map of federation secret names"
  value       = { for k, v in google_secret_manager_secret.federation : k => v.secret_id }
}

output "keycloak_service_accounts" {
  description = "Map of Keycloak instance service account emails"
  value       = { for k, v in google_service_account.keycloak : k => v.email }
}

output "sync_script_service_account" {
  description = "Service account email for the sync script"
  value       = google_service_account.sync_script.email
}

output "federation_matrix" {
  description = "The federation matrix used for secret creation"
  value       = var.federation_matrix
}

# Output for generating service account keys (use with caution)
output "keycloak_service_account_names" {
  description = "Map of Keycloak instance service account names (for key generation)"
  value       = { for k, v in google_service_account.keycloak : k => v.name }
}

# Summary for documentation
output "summary" {
  description = "Summary of created resources"
  value = {
    total_secrets         = length(local.federation_secrets_map)
    instances             = keys(var.instances)
    replication_locations = var.replication_locations
    audit_logging_enabled = true
    workload_identity     = var.enable_workload_identity
  }
}











