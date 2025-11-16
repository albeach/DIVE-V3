# ============================================
# Direct Grant Client Module
# ============================================
# Creates a CONFIDENTIAL client for Direct Grant authentication
# Used by backend custom login API to authenticate users directly
# against national realms
#
# Security:
# - CONFIDENTIAL access type (requires client_secret)
# - Direct Access Grants enabled (Resource Owner Password Credentials)
# - Service accounts disabled (user authentication only)
# - Standard flow disabled (only Direct Grant)

variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
}

variable "realm_name" {
  description = "Keycloak realm name (e.g., dive-v3-usa)"
  type        = string
}

variable "client_id" {
  description = "Client ID for Direct Grant authentication"
  type        = string
  default     = "dive-v3-direct-grant-client"
}

variable "app_url" {
  description = "Application URL"
  type        = string
  default     = "http://localhost:3000"
}

# ============================================
# Direct Grant Client
# ============================================

resource "keycloak_openid_client" "direct_grant_client" {
  realm_id    = var.realm_id
  client_id   = var.client_id
  name        = "DIVE V3 Direct Grant Client"
  description = "Backend API client for Direct Grant authentication (custom login pages)"
  enabled     = true

  # CONFIDENTIAL client (requires client_secret)
  access_type = "CONFIDENTIAL"

  # Enable Direct Access Grants (Resource Owner Password Credentials)
  direct_access_grants_enabled = true

  # Disable other flows
  standard_flow_enabled    = false # No Authorization Code flow
  implicit_flow_enabled    = false # No Implicit flow
  service_accounts_enabled = false # No client credentials flow

  # No redirects needed for Direct Grant
  valid_redirect_uris = []
  web_origins         = []

  # Client authentication settings
  client_authenticator_type = "client-secret"

  # Access token settings
  access_token_lifespan = "900" # 15 minutes (same as realm default)
}

# ============================================
# Client Secret Output
# ============================================

output "client_id" {
  description = "Direct Grant client ID"
  value       = keycloak_openid_client.direct_grant_client.client_id
}

output "client_secret" {
  description = "Direct Grant client secret (sensitive)"
  value       = keycloak_openid_client.direct_grant_client.client_secret
  sensitive   = true
}

output "resource_id" {
  description = "Direct Grant client resource ID"
  value       = keycloak_openid_client.direct_grant_client.id
}













