# DIVE V3 Pilot Configuration
# Single-instance (USA) deployment for local testing

module "instance" {
  source = "../modules/federated-instance"

  # Pilot is always USA
  instance_code = "USA"
  instance_name = "United States (Pilot)"

  # Localhost URLs
  app_url = "https://localhost:3000"
  api_url = "https://localhost:4000"
  idp_url = "https://localhost:8443"

  # Realm configuration
  realm_name    = "dive-v3-broker"
  client_id     = "dive-v3-broker"
  client_secret = var.client_secret

  # Test users
  create_test_users   = true
  test_user_password  = var.test_user_password
  admin_user_password = var.admin_user_password

  # Federation partners (real IdPs)
  federation_partners = {
    fra = {
      instance_code = "FRA"
      instance_name = "France"
      idp_url       = var.fra_idp_url
      enabled       = true
      client_secret = "placeholder-sync-after-terraform"
    }
    gbr = {
      instance_code         = "GBR"
      instance_name         = "United Kingdom"
      idp_url               = var.gbr_idp_url
      idp_internal_url      = var.gbr_idp_internal_url
      disable_trust_manager = var.gbr_disable_trust_manager
      enabled               = true
      client_secret         = var.gbr_client_secret
    }
    deu = {
      instance_code = "DEU"
      instance_name = "Germany"
      idp_url       = var.deu_idp_url
      enabled       = true
      client_secret = "placeholder-sync-after-terraform"
    }
  }

  # Theme - use USA custom theme
  login_theme                 = "dive-v3-usa"
  incoming_federation_secrets = {}

  # WebAuthn - localhost domain
  webauthn_rp_id = "localhost"

  # MFA Flow
  browser_flow_override_id          = module.mfa.browser_flow_id
  simple_post_broker_otp_flow_alias = module.mfa.simple_post_broker_otp_flow_alias
}

module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 - USA Pilot"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}

output "realm_id" {
  value = module.instance.realm_id
}

output "client_id" {
  value = module.instance.client_id
}

output "client_secret" {
  value     = module.instance.client_secret
  sensitive = true
}
