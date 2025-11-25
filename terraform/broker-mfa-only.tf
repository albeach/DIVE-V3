# ============================================
# Broker Realm MFA Configuration
# ============================================
# This provides the Classified Access Browser Flow for the broker realm
# Other realm MFA modules have been disabled pending realm refactoring

module "broker_mfa" {
  source = "./modules/realm-mfa"

  realm_id           = keycloak_realm.dive_v3_broker.id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 Broker"

  enable_direct_grant_mfa   = false
  use_standard_browser_flow = true  # Federation compatible
}
