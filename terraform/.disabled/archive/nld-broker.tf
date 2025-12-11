# ============================================
# Netherlands Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-nld realm to broker realm
# NATO Expansion: Phase 1 - Ministerie van Defensie

resource "keycloak_oidc_identity_provider" "nld_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "nld-realm-broker"
  display_name = "Netherlands (Defensie)"
  enabled      = true

  # OIDC endpoints from Dutch realm
  authorization_url = "${local.realm_urls.nld}${local.oidc_auth_path}"
  token_url         = "${local.realm_urls.nld}${local.oidc_token_path}"
  jwks_url          = "${local.realm_urls.nld}${local.oidc_certs_path}"
  user_info_url     = "${local.realm_urls.nld}${local.oidc_userinfo_path}"

  # Client credentials from Dutch realm
  client_id     = keycloak_openid_client.nld_realm_client.client_id
  client_secret = keycloak_openid_client.nld_realm_client.client_secret

  default_scopes = "openid profile email"

  store_token = true
  trust_email = true
  sync_mode   = "FORCE" # Always sync from Dutch realm

  first_broker_login_flow_alias = module.broker_mfa.post_broker_mfa_flow_alias
  link_only                     = false # Auto-create users

  # CRITICAL: Enable backchannel logout to cascade logout to national realm
  backchannel_supported = true
  logout_url            = "${local.realm_urls.nld}${local.oidc_logout_path}"


  gui_order = "9"
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_username" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-username-from-uniqueID"
  identity_provider_mapper = "oidc-username-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "template" = "$${CLAIM.uniqueID}" # Set username = uniqueID from token
  }
}

# Also map uniqueID to user attribute (for OPA/backend usage)
resource "keycloak_custom_identity_provider_mapper" "nld_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "nld_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.nld_realm_broker.alias
  name                     = "nld-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}


