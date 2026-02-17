# =============================================================================
# DIVE V3 Hub - Terraform Variables
# =============================================================================
# Variables for Hub-in-a-Box deployment using federated-instance module.
# Hub is architecturally symmetric with spokes - both are federated instances.
# =============================================================================

# =============================================================================
# KEYCLOAK CONFIGURATION
# =============================================================================
variable "keycloak_url" {
  description = "Keycloak URL"
  type        = string
  default     = "https://localhost:8443"
}

variable "keycloak_admin_username" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password (from GCP Secret Manager: dive-v3-keycloak-usa)"
  type        = string
  sensitive   = true
}

# =============================================================================
# INSTANCE URLS
# =============================================================================
variable "app_url" {
  description = "Frontend application URL"
  type        = string
  default     = "https://localhost:3000"
}

variable "api_url" {
  description = "Backend API URL"
  type        = string
  default     = "https://localhost:4000"
}

variable "idp_url" {
  description = "Keycloak IdP URL"
  type        = string
  default     = "https://localhost:8443"
}

# =============================================================================
# CLIENT SECRETS
# =============================================================================
variable "client_secret" {
  description = "OIDC client secret (from GCP Secret Manager: dive-v3-keycloak-client-secret)"
  type        = string
  sensitive   = true
}

# =============================================================================
# TEST USERS
# =============================================================================
# =============================================================================
# TEST USERS - SSOT CONFIGURATION
# =============================================================================
# User creation SSOT: scripts/hub-init/seed-hub-users.sh
# This variable exists for backwards compatibility but should remain false.
variable "create_test_users" {
  description = <<-EOT
    DEPRECATED: User creation via Terraform (SSOT: bash script)
    
    Set to false (default). User creation is handled by:
      scripts/hub-init/seed-hub-users.sh
    
    This script runs during Phase 7 of deployment and creates:
      - testuser-usa-[1-5] (5-level clearance system)
      - admin-usa (super_admin role)
    
    Terraform user creation is disabled to prevent:
      - State conflicts (users created but Terraform doesn't know)
      - Duplicate users (both Terraform and script create same users)
      - Inflexible configuration (can't easily update attributes)
    
    Only set to true if you:
      1. Remove bash script from deployment workflow
      2. Accept Terraform state management overhead
      3. Document the architectural change
  EOT
  type        = bool
  default     = false # SSOT: bash script (scripts/hub-init/seed-hub-users.sh)
}

variable "test_user_password" {
  description = "Test user password (from GCP Secret Manager: dive-v3-test-user-password)"
  type        = string
  sensitive   = true
  default     = "TestUser2025!Pilot"
}

variable "admin_user_password" {
  description = "Admin user password (from GCP Secret Manager: dive-v3-admin-password)"
  type        = string
  sensitive   = true
  default     = "DiveAdminSecure2025!"
}

# =============================================================================
# WEBAUTHN
# =============================================================================
variable "webauthn_rp_id" {
  description = "WebAuthn Relying Party ID"
  type        = string
  default     = "localhost"
}

# =============================================================================
# MFA CONFIGURATION
# =============================================================================
variable "enable_mfa" {
  description = "Enable MFA (Multi-Factor Authentication) flows"
  type        = bool
  default     = true
}

# =============================================================================
# FEDERATION PARTNERS (SPOKES)
# =============================================================================
# This is the KEY addition: Hub needs to know about its federation partners.
# When a spoke federates TO the Hub, the Hub needs an incoming federation client.
# These are created by the federated-instance module.
#
# Example: When FRA federates to Hub, it uses "dive-v3-broker-fra" client in Hub.
# =============================================================================
variable "federation_partners" {
  description = "Federation partner spokes (dynamically populated from instances/ directory)"
  type = map(object({
    instance_code = string
    instance_name = string
    idp_url       = string
    enabled       = bool
    client_secret = optional(string, "placeholder-sync-after-terraform")
    # Optional: internal/back-channel URL (e.g., http://dive-spoke-fra-keycloak:8443)
    idp_internal_url = optional(string, null)
    # Optional: disable trust manager for self-signed local certs
    disable_trust_manager = optional(bool, true) # Local dev uses mkcert
  }))
  default = {}
}

# =============================================================================
# INCOMING FEDERATION CLIENT SECRETS
# =============================================================================
# These secrets are used by SPOKES when they federate TO the Hub.
# GCP Secret Names: dive-v3-federation-usa-{spoke}
#
# Example:
#   incoming_federation_secrets = {
#     fra = "secret-from-dive-v3-federation-usa-fra"
#     gbr = "secret-from-dive-v3-federation-usa-gbr"
#   }
#
# These are loaded dynamically from GCP Secret Manager by hub.sh deployment script.
# =============================================================================
variable "incoming_federation_secrets" {
  description = "Federation client secrets from GCP Secret Manager (dive-v3-federation-usa-*)"
  type        = map(string)
  sensitive   = true
  default     = {}
}

