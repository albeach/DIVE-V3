# =============================================================================
# DIVE V3 Spoke Configuration
# =============================================================================
# Deploys a single NATO country spoke using the federated-instance module.
# Uses country-specific tfvars from terraform/countries/<code>.tfvars
#
# Usage:
#   cd terraform/spoke
#   terraform init
#   terraform plan -var-file=../countries/pol.tfvars
#   terraform apply -var-file=../countries/pol.tfvars
#
# Required Environment Variables:
#   TF_VAR_keycloak_admin_password - Keycloak admin password (from GCP)
#   TF_VAR_client_secret           - Client secret (from GCP)
#   TF_VAR_test_user_password      - Test user password (from GCP)
#
# GCP Secret Names:
#   gcloud secrets versions access latest --secret=dive-v3-keycloak-<code> --project=dive25
#   gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25
#   gcloud secrets versions access latest --secret=dive-v3-test-user-password --project=dive25
# =============================================================================

module "instance" {
  source = "../modules/federated-instance"

  # Instance configuration from tfvars
  instance_code = var.instance_code
  instance_name = var.instance_name

  # URLs
  app_url = var.app_url
  api_url = var.api_url
  idp_url = var.idp_url

  # Realm configuration
  realm_name    = "dive-v3-broker-${lower(var.instance_code)}"
  client_id     = var.client_id
  client_secret = var.client_secret

  # Theme
  login_theme = var.login_theme

  # Test users
  create_test_users   = var.create_test_users
  test_user_password  = var.test_user_password
  admin_user_password = var.admin_user_password

  # WebAuthn
  webauthn_rp_id = var.webauthn_rp_id

  # Federation partners (typically USA hub for spokes)
  federation_partners = var.federation_partners

  # Incoming federation secrets (for other instances federating TO this one)
  incoming_federation_secrets = var.incoming_federation_secrets

  # MFA configuration
  browser_flow_override_id          = var.enable_mfa ? module.mfa[0].browser_flow_id : null
  simple_post_broker_otp_flow_alias = var.enable_mfa ? module.mfa[0].simple_post_broker_otp_flow_alias : null
}

module "mfa" {
  count  = var.enable_mfa ? 1 : 0
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker-${lower(var.instance_code)}"
  realm_display_name = "DIVE V3 - ${var.instance_name}"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}

# =============================================================================
# Outputs
# =============================================================================

output "realm_id" {
  description = "Keycloak realm ID"
  value       = module.instance.realm_id
}

output "realm_name" {
  description = "Keycloak realm name"
  value       = "dive-v3-broker-${lower(var.instance_code)}"
}

output "client_id" {
  description = "OIDC client ID"
  value       = module.instance.client_id
}

output "client_secret" {
  description = "OIDC client secret"
  value       = module.instance.client_secret
  sensitive   = true
}

output "instance_code" {
  description = "Instance country code"
  value       = var.instance_code
}

output "idp_url" {
  description = "Keycloak IdP URL"
  value       = var.idp_url
}

output "federation_idp_aliases" {
  description = "Configured federation IdP aliases"
  value       = module.instance.federation_idp_aliases
}

