# ============================================
# Spain Realm IdP Broker (in Federation Hub)
# ============================================
# Brokers identities from dive-v3-esp realm to broker realm
# NATO Expansion: Phase 1 - Ministerio de Defensa

resource "keycloak_oidc_identity_provider" "esp_realm_broker" {
  realm        = keycloak_realm.dive_v3_broker.id
  alias        = "esp-realm-broker"
  display_name = "Spain (Ministerio de Defensa)"
  enabled      = true
  
  # OIDC endpoints from Spanish realm
  authorization_url = "http://localhost:8081/realms/dive-v3-esp/protocol/openid-connect/auth"
  token_url         = "http://keycloak:8080/realms/dive-v3-esp/protocol/openid-connect/token"
  jwks_url          = "http://keycloak:8080/realms/dive-v3-esp/protocol/openid-connect/certs"
  user_info_url     = "http://keycloak:8080/realms/dive-v3-esp/protocol/openid-connect/userinfo"
  
  # Client credentials from Spanish realm
  client_id     = keycloak_openid_client.esp_realm_client.client_id
  client_secret = keycloak_openid_client.esp_realm_client.client_secret
  
  default_scopes = "openid profile email"
  
  store_token = true
  trust_email = true
  sync_mode   = "FORCE"  # Always sync from Spanish realm
  
  first_broker_login_flow_alias = "first broker login"
  link_only = false  # Auto-create users
  
  gui_order = "7"
}

# Attribute mappers for Spain broker (map all DIVE attributes)
resource "keycloak_custom_identity_provider_mapper" "esp_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_clearance" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_country" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_coi" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_dutyorg" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_orgunit" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_acr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "acr"
    "user.attribute" = "acr"
  }
}

resource "keycloak_custom_identity_provider_mapper" "esp_broker_amr" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.esp_realm_broker.alias
  name                     = "esp-amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "amr"
    "user.attribute" = "amr"
  }
}


