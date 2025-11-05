# ============================================
# France Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-fra realm to broker realm
# Gap #1 Remediation: Multi-Realm Architecture

resource "keycloak_oidc_identity_provider" "fra_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "fra-realm-broker"
  display_name = "France (Ministère des Armées)"
  enabled      = true

  # OIDC endpoints from France realm
  authorization_url = "${local.realm_urls.fra}${local.oidc_auth_path}"
  token_url         = "${local.realm_urls.fra}${local.oidc_token_path}"
  jwks_url          = "${local.realm_urls.fra}${local.oidc_certs_path}"
  user_info_url     = "${local.realm_urls.fra}${local.oidc_userinfo_path}"

  # Client credentials from France realm
  client_id     = keycloak_openid_client.fra_realm_client.client_id
  client_secret = keycloak_openid_client.fra_realm_client.client_secret

  default_scopes = "openid profile email"

  store_token = true
  trust_email = true
  sync_mode   = "FORCE"

  first_broker_login_flow_alias = module.broker_mfa.post_broker_mfa_flow_alias
  link_only                     = false
  
  # CRITICAL: Enable backchannel logout to cascade logout to national realm
  backchannel_supported = true
  logout_url            = "${local.realm_urls.fra}${local.oidc_logout_path}"

  gui_order = "2"
}

# Attribute mappers for France broker (all DIVE attributes)
resource "keycloak_custom_identity_provider_mapper" "fra_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "fra_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.fra_realm_broker.alias
  name                     = "fra-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}

