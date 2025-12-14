# Variables for Federated Instance Deployment
# These are set per-workspace via .tfvars files
#
# SECRETS MANAGEMENT:
#   Option 1 (Recommended): Set via environment variable
#     export TF_VAR_keycloak_admin_password="your-secure-password"
#     terraform apply
#
#   Option 2: Set in .tfvars file (gitignored)
#     keycloak_admin_password = "your-secure-password"
#
#   Option 3: Pass via command line (not recommended - visible in history)
#     terraform apply -var="keycloak_admin_password=your-secure-password"

# Keycloak Connection (different per instance)
variable "keycloak_url" {
  description = "Keycloak admin URL (e.g., https://localhost:8443 for USA, https://localhost:8444 for FRA)"
  type        = string
}

variable "keycloak_admin_username" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password. Set via TF_VAR_keycloak_admin_password environment variable."
  type        = string
  sensitive   = true
  # NO DEFAULT - forces explicit setting for security
  # If you see "variable not set" error, set TF_VAR_keycloak_admin_password or use .tfvars
}

# Public URLs (Cloudflare tunnel URLs)
variable "app_url" {
  description = "Frontend application URL (e.g., https://usa-app.dive25.com)"
  type        = string
  # Default to localhost for resilient local dev; override in *.tfvars for CF/tunnel
  default = "https://localhost:3000"
}

variable "api_url" {
  description = "Backend API URL (e.g., https://usa-api.dive25.com)"
  type        = string
  default     = "https://localhost:4000"
}

variable "idp_url" {
  description = "Keycloak public URL (e.g., https://usa-idp.dive25.com)"
  type        = string
  default     = "https://localhost:8443"
}

# OIDC Client Secret from GCP Secret Manager
variable "client_secret" {
  description = <<-EOT
    OIDC client secret for the broker client.
    Set via TF_VAR_client_secret environment variable.
    
    This MUST match the secret in GCP Secret Manager (dive-v3-keycloak-client-secret-{instance})
    to ensure Docker Compose and Terraform use the same secret.
    
    Without this, Keycloak generates a random secret causing:
    - NextAuth "Configuration" errors
    - Token validation failures
    - State drift between resets
    
    REQUIRED: Run 'source ./scripts/sync-gcp-secrets.sh <instance>' before terraform apply!
  EOT
  type        = string
  sensitive   = true
  # NO DEFAULT - forces explicit setting to prevent drift
  # If you see "variable not set" error, run: source ./scripts/sync-gcp-secrets.sh <instance>

  validation {
    condition     = var.client_secret != null && length(var.client_secret) > 10
    error_message = <<-EOT
      client_secret is REQUIRED to prevent secret drift!
      
      Run this first:
        source ./scripts/sync-gcp-secrets.sh <instance>
        
      This will set TF_VAR_client_secret from GCP Secret Manager.
    EOT
  }
}

# Test users
variable "create_test_users" {
  description = "Whether to create test users"
  type        = bool
  default     = true
}

variable "test_user_password" {
  description = "Password for pilot/test users (set via TF_VAR_test_user_password from GCP Secret Manager)"
  type        = string
  sensitive   = true
  # No default to avoid accidental check-in of secrets
}

variable "admin_user_password" {
  description = "Password for admin-[INSTANCE] super_admin user (set via TF_VAR_admin_user_password from GCP Secret Manager). Falls back to test_user_password if unset."
  type        = string
  sensitive   = true
}

# Federation partners
variable "federation_partners" {
  description = "Map of partner instances for IdP federation"
  type = map(object({
    instance_code = string
    instance_name = string
    idp_url       = string
    enabled       = bool
    client_secret = optional(string)
  }))
  default = {}
}

# WebAuthn / Passkey Configuration
variable "webauthn_rp_id" {
  description = <<-EOT
    WebAuthn Relying Party ID - the effective domain for passkey/WebAuthn credentials.
    MUST match the parent domain of all subdomains (e.g., "dive25.com" for *.dive25.com).
    
    Per-instance defaults:
    - USA/FRA/GBR: "dive25.com"
    - DEU: "prosecurity.biz"
    
    An empty string ("") only works for localhost development and will cause
    "Your device can't be used with this site" errors in production.
  EOT
  type        = string
  default     = "" # Empty = use lookup in instance.tf
}

# Incoming Federation Secrets
variable "incoming_federation_secrets" {
  description = "Map of partner instance codes to their client secrets for incoming federation"
  type        = map(string)
  default     = {}
  sensitive   = true
}

