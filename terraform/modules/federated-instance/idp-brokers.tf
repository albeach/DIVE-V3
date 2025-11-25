# Federated Instance Module - IdP Broker Configuration
# Creates OIDC Identity Provider brokers for federation with other DIVE instances

# =============================================================================
# OIDC IDENTITY PROVIDERS FOR FEDERATION
# =============================================================================
# Each instance can federate with other DIVE instances via OIDC IdP brokers

resource "keycloak_oidc_identity_provider" "federation_partner" {
  for_each = var.federation_partners

  realm        = keycloak_realm.broker.id
  alias        = "${lower(each.value.instance_code)}-federation"
  display_name = "DIVE V3 - ${each.value.instance_name}"
  enabled      = each.value.enabled

  # Provider settings
  provider_id           = "oidc"
  authorization_url     = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/auth"
  token_url            = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/token"
  user_info_url        = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/userinfo"
  jwks_url             = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/certs"
  logout_url           = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/logout"
  issuer               = "${each.value.idp_url}/realms/dive-v3-broker"
  
  # Client credentials (these would be created in the partner's Keycloak)
  client_id     = "dive-v3-${lower(var.instance_code)}-federation"
  client_secret = lookup(each.value, "client_secret", "placeholder-configure-manually")

  # OIDC settings
  validate_signature   = true
  default_scopes       = "openid profile email"
  
  # Sync settings
  sync_mode           = "FORCE"
  trust_email         = true
  
  # Store tokens for later use
  store_token         = true
  
  # UI settings
  gui_order           = lookup(local.federation_order, each.value.instance_code, 99)
  hide_on_login_page  = false

  # Extra config for attribute mapping
  extra_config = {
    "clientAuthMethod" = "client_secret_post"
  }
}

# =============================================================================
# ATTRIBUTE MAPPERS FOR FEDERATED USERS
# =============================================================================
# Map attributes from partner IdPs to local user attributes

resource "keycloak_custom_identity_provider_mapper" "clearance_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"               = "clearance"
    "user.attribute"      = "clearance"
    "syncMode"           = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "country_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"               = "countryOfAffiliation"
    "user.attribute"      = "countryOfAffiliation"
    "syncMode"           = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "unique_id_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "unique-id-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"               = "uniqueID"
    "user.attribute"      = "uniqueID"
    "syncMode"           = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "coi_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"               = "acpCOI"
    "user.attribute"      = "acpCOI"
    "syncMode"           = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "organization_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "organization-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"               = "organization"
    "user.attribute"      = "organization"
    "syncMode"           = "FORCE"
  }
}

# =============================================================================
# LOCALS
# =============================================================================

locals {
  # Order of federation IdPs on login page
  federation_order = {
    "USA"      = 1
    "FRA"      = 2
    "DEU"      = 3
    "GBR"      = 4
    "CAN"      = 5
    "ITA"      = 6
    "ESP"      = 7
    "NLD"      = 8
    "POL"      = 9
    "INDUSTRY" = 10
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "federation_idp_aliases" {
  description = "Aliases of configured federation IdPs"
  value       = { for k, v in keycloak_oidc_identity_provider.federation_partner : k => v.alias }
}

