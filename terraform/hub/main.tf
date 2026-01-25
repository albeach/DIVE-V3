# =============================================================================
# DIVE V3 Hub Configuration
# =============================================================================
# Hub-in-a-Box deployment using federated-instance module.
# This creates:
#   - Hub realm (dive-v3-broker-usa)
#   - Hub OIDC client (dive-v3-broker-usa)
#   - Incoming federation clients for each spoke (dive-v3-broker-fra, etc.)
#   - Protocol mappers for attribute exchange
#   - MFA flows for clearance-based authentication
#
# The Hub is architecturally symmetric with spokes - both use federated-instance.
# The key difference: Hub federates WITH spokes, spokes federate WITH Hub.
# =============================================================================

# =============================================================================
# FEDERATED INSTANCE MODULE (Hub)
# =============================================================================
module "instance" {
  source = "../modules/federated-instance"

  # Hub Instance Configuration
  instance_code = "USA"
  instance_name = "United States (Hub)"

  # URLs (local development)
  app_url = var.app_url
  api_url = var.api_url
  idp_url = var.idp_url

  # Realm and Client Configuration
  # CRITICAL: realm_name AND client_id must use instance suffix
  realm_name    = "dive-v3-broker-usa"
  client_id     = "dive-v3-broker-usa"
  client_secret = var.client_secret

  # Theme
  login_theme = "dive-v3"

  # Test users (Hub gets test users for USA)
  create_test_users   = var.create_test_users  # SSOT: Terraform creates testuser-usa-[1-5] + admin-usa
  test_user_password  = var.test_user_password
  admin_user_password = var.admin_user_password

  # WebAuthn
  webauthn_rp_id = var.webauthn_rp_id

  # Federation Partners (Spokes)
  # This is the KEY fix: Hub needs incoming federation clients for each spoke
  # When FRA federates TO Hub, it uses dive-v3-broker-fra client in Hub Keycloak
  federation_partners = var.federation_partners

  # Incoming Federation Secrets (for spokes authenticating to Hub)
  # These are loaded from GCP Secret Manager: dive-v3-federation-usa-{spoke}
  incoming_federation_secrets = var.incoming_federation_secrets

  # MFA Configuration
  browser_flow_override_id          = var.enable_mfa ? module.mfa[0].browser_flow_id : null
  simple_post_broker_otp_flow_alias = var.enable_mfa ? module.mfa[0].simple_post_broker_otp_flow_alias : null

  # Local Development Port Configuration (for spoke callback URLs)
  local_keycloak_port = 8443
  local_frontend_port = 3000
}

# =============================================================================
# MFA MODULE (Clearance-based Authentication Flows)
# =============================================================================
module "mfa" {
  count  = var.enable_mfa ? 1 : 0
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker-usa"
  realm_display_name = "DIVE V3 - United States (Hub)"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}

# =============================================================================
# OUTPUTS
# =============================================================================
output "realm_id" {
  value       = module.instance.realm_id
  description = "Hub realm ID"
}

output "realm_name" {
  value       = module.instance.realm_name
  description = "Hub realm name"
}

output "client_id" {
  value       = module.instance.client_id
  description = "Hub OIDC client ID"
}

output "client_secret" {
  value       = module.instance.client_secret
  description = "Hub OIDC client secret"
  sensitive   = true
}

output "instance_code" {
  value       = module.instance.instance_code
  description = "Hub instance code (USA)"
}

output "federation_idp_aliases" {
  value       = module.instance.federation_idp_aliases
  description = "Configured federation IdP aliases (spokes)"
}

output "incoming_federation_clients" {
  value       = module.instance.incoming_federation_clients
  description = "Incoming federation clients for spokes"
  sensitive   = true
}

output "browser_flow_alias" {
  value       = var.enable_mfa ? module.mfa[0].browser_flow_alias : "browser"
  description = "Classified Access Browser Flow alias"
}

output "mfa_enabled" {
  value       = var.enable_mfa
  description = "MFA flows deployed successfully"
}

