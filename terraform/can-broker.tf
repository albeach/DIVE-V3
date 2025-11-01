# ============================================
# Canada Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-can realm to broker realm

resource "keycloak_oidc_identity_provider" "can_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "can-realm-broker"
  display_name = "Canada (Forces canadiennes)"
  enabled      = true
  
  authorization_url = "https://localhost:8443/realms/dive-v3-can/protocol/openid-connect/auth"
  token_url         = "https://localhost:8443/realms/dive-v3-can/protocol/openid-connect/token"
  jwks_url          = "https://localhost:8443/realms/dive-v3-can/protocol/openid-connect/certs"
  user_info_url     = "https://localhost:8443/realms/dive-v3-can/protocol/openid-connect/userinfo"
  
  client_id     = keycloak_openid_client.can_realm_client.client_id
  client_secret = keycloak_openid_client.can_realm_client.client_secret
  
  default_scopes = "openid profile email"
  store_token = true
  trust_email = true
  sync_mode   = "FORCE"
  
  first_broker_login_flow_alias = "first broker login"
  link_only = false
  gui_order = "3"
}

# Full attribute mappers (8 attributes)
resource "keycloak_custom_identity_provider_mapper" "can_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "can_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.can_realm_broker.alias
  name                     = "can-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}

