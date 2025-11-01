# ============================================
# Germany Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-deu realm to broker realm
# NATO Expansion: Phase 1 - Bundeswehr

resource "keycloak_oidc_identity_provider" "deu_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "deu-realm-broker"
  display_name = "Germany (Bundeswehr)"
  enabled      = true

  # OIDC endpoints from German realm
  authorization_url = "https://localhost:8443/realms/dive-v3-deu/protocol/openid-connect/auth"
  token_url         = "https://localhost:8443/realms/dive-v3-deu/protocol/openid-connect/token"
  jwks_url          = "https://localhost:8443/realms/dive-v3-deu/protocol/openid-connect/certs"
  user_info_url     = "https://localhost:8443/realms/dive-v3-deu/protocol/openid-connect/userinfo"

  # Client credentials from German realm
  client_id     = keycloak_openid_client.deu_realm_client.client_id
  client_secret = keycloak_openid_client.deu_realm_client.client_secret

  default_scopes = "openid profile email"

  store_token = true
  trust_email = true
  sync_mode   = "FORCE" # Always sync from German realm

  first_broker_login_flow_alias = "first broker login"
  link_only                     = false # Auto-create users

  gui_order = "4"
}

# Attribute mappers for Germany broker (map all DIVE attributes)
resource "keycloak_custom_identity_provider_mapper" "deu_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "deu_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.deu_realm_broker.alias
  name                     = "deu-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}


