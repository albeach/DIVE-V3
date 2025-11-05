# ============================================
# U.S. Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-usa realm to broker realm
# Gap #1 Remediation: Multi-Realm Architecture

resource "keycloak_oidc_identity_provider" "usa_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "usa-realm-broker"
  display_name = "United States (DoD)"
  enabled      = true

  # OIDC endpoints from U.S. realm
  # Dynamic URLs: Use local.realm_urls to support custom hostnames
  # KC_HOSTNAME ensures tokens always have correct issuer
  # All URLs must match to avoid issuer validation errors
  authorization_url = "${local.realm_urls.usa}${local.oidc_auth_path}"
  token_url         = "${local.realm_urls.usa}${local.oidc_token_path}"
  jwks_url          = "${local.realm_urls.usa}${local.oidc_certs_path}"
  user_info_url     = "${local.realm_urls.usa}${local.oidc_userinfo_path}"

  # Client credentials from U.S. realm
  client_id     = keycloak_openid_client.usa_realm_client.client_id
  client_secret = keycloak_openid_client.usa_realm_client.client_secret

  default_scopes = "openid profile email"

  store_token = true
  trust_email = true
  sync_mode   = "FORCE" # Always sync from U.S. realm

  first_broker_login_flow_alias = module.broker_mfa.post_broker_mfa_flow_alias
  link_only                     = false # Auto-create users

  gui_order = "1"
}

# Attribute mappers for U.S. broker (map all DIVE attributes)
resource "keycloak_custom_identity_provider_mapper" "usa_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "usa_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}

