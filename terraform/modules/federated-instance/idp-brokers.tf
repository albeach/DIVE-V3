# Flexible claim sources per attribute to handle partner-specific naming (e.g., surname vs family_name)
locals {
  idp_attribute_sources = {
    clearance            = ["clearance", "security_clearance", "clearance_level"]
    countryOfAffiliation = ["countryOfAffiliation", "country", "nationality"]
    uniqueID             = ["uniqueID", "uniqueId", "uid", "sub"]
    acpCOI               = ["acpCOI", "acpCoi", "coi", "COI"]
    email                = ["email", "mail"]
    given_name           = ["given_name", "firstName", "firstname", "givenName"]
    family_name          = ["family_name", "lastName", "surname", "familyName"]
  }
}

# Federated Instance Module - IdP Broker Configuration
# Creates OIDC Identity Provider brokers for federation with other DIVE instances

# =============================================================================
# OIDC IDENTITY PROVIDERS FOR FEDERATION
# =============================================================================
# Each instance can federate with other DIVE instances via OIDC IdP brokers

resource "keycloak_oidc_identity_provider" "federation_partner" {
  for_each = var.federation_partners

  realm        = keycloak_realm.broker.id
  alias        = "${lower(each.value.instance_code)}-idp"
  display_name = "DIVE V3 - ${each.value.instance_name}"
  enabled      = each.value.enabled

  # Provider settings
  provider_id = "oidc"
  # Split front-channel (browser) vs back-channel (server-to-server) URLs.
  # Front-channel: use public IdP URL so redirects match the browser.
  # Back-channel: allow an internal URL (e.g., http://keycloak-gbr:8080) to avoid TLS trust issues in local.
  authorization_url = "${each.value.idp_url}/realms/${local.partner_realm[each.key]}/protocol/openid-connect/auth"
  logout_url        = "${each.value.idp_url}/realms/${local.partner_realm[each.key]}/protocol/openid-connect/logout"
  issuer            = "${each.value.idp_url}/realms/${local.partner_realm[each.key]}"

  token_url     = "${local.partner_internal_url[each.key]}/realms/${local.partner_realm[each.key]}/protocol/openid-connect/token"
  user_info_url = "${local.partner_internal_url[each.key]}/realms/${local.partner_realm[each.key]}/protocol/openid-connect/userinfo"
  jwks_url      = "${local.partner_internal_url[each.key]}/realms/${local.partner_realm[each.key]}/protocol/openid-connect/certs"

  # Client credentials (these would be created in the partner's Keycloak)
  # NOTE: client_secret is a placeholder until sync-federation-secrets.sh runs post-Terraform
  # The chicken-and-egg problem: Partner creates the client, we need their secret
  client_id     = "dive-v3-${lower(var.instance_code)}-client"
  client_secret = each.value.client_secret

  # OIDC settings
  validate_signature = true
  default_scopes     = "openid profile email"

  # Sync settings
  sync_mode   = "FORCE"
  trust_email = true

  # Store tokens for later use
  store_token = true

  # UI settings
  gui_order          = lookup(local.federation_order, each.value.instance_code, 99)
  hide_on_login_page = false

  # MFA Flow Binding
  # Use simple_post_broker_otp_flow_alias for MFA after federated login
  post_broker_login_flow_alias = var.simple_post_broker_otp_flow_alias

  # Extra config for attribute mapping
  extra_config = {
    "clientAuthMethod" = "client_secret_post"
    # Local dev: allow self-signed certs when disable_trust_manager is true
    "disableTrustManager" = tostring(local.partner_disable_trust[each.key])
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
    "claim"          = "clearance"
    "user.attribute" = "clearance"
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "country_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "unique_id_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "unique-id-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "coi_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "organization_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "organization-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "organization"
    "user.attribute" = "organization"
    "syncMode"       = "FORCE"
  }
}

# =============================================================================
# ACR/AMR MAPPERS FOR FEDERATION (CRITICAL - Re-enabled Jan 2026)
# =============================================================================
# CRITICAL FIX: These mappers MUST exist for federated users.
#
# Architecture:
# 1. NZL Spoke authenticates user with password + OTP
# 2. NZL's event listener sets: AUTH_METHODS_REF = ["pwd","otp"], user.amr = ["pwd","otp"]
# 3. NZL's client mappers output: amr (native session), user_amr (user attribute)
# 4. Hub receives NZL token with amr and user_amr claims
# 5. Hub's IdP mapper (BELOW) extracts user_amr → stores to user.amr attribute
# 6. Hub's event listener detects federated user → preserves user.amr in session
# 7. Hub's client mapper reads user.amr → outputs user_amr to frontend
# 8. Frontend reads user_amr (prioritized over amr for federated users)
#
# Without these IdP mappers, federated user's AMR is never updated on the Hub!

# AMR IdP Mapper - extracts amr from Spoke token → stores to user.amr
# BEST PRACTICE: Read the native 'amr' claim (JSON array from oidc-amr-mapper)
# Keycloak's IdP mapper handles JSON arrays and stores as multi-valued attribute
# The event listener then handles both formats (multi-valued or JSON string)
resource "keycloak_custom_identity_provider_mapper" "amr_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "amr"   # Read native amr claim (JSON array from oidc-amr-mapper)
    "user.attribute" = "amr"   # Store to local user's amr attribute
    "syncMode"       = "FORCE" # Update on every login
  }
}

# ACR IdP Mapper - extracts acr from Spoke token → stores to user.acr
# BEST PRACTICE: Read the native 'acr' claim (from oidc-acr-mapper)
resource "keycloak_custom_identity_provider_mapper" "acr_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "acr"   # Read native acr claim (from oidc-acr-mapper)
    "user.attribute" = "acr"   # Store to local user's acr attribute
    "syncMode"       = "FORCE" # Update on every login
  }
}

# Flexible claim mappers (multiple variants per attribute)
resource "keycloak_custom_identity_provider_mapper" "flex_clearance" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.clearance : {
          k      = "${partner_key}-clearance-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "clearance"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "clearance-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "flex_country" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.countryOfAffiliation : {
          k      = "${partner_key}-country-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "countryOfAffiliation"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "country-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "flex_unique_id" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.uniqueID : {
          k      = "${partner_key}-unique-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "uniqueID"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "unique-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "flex_coi" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.acpCOI : {
          k      = "${partner_key}-coi-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "acpCOI"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "coi-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

# Ensure basic profile imports survive provider differences
resource "keycloak_custom_identity_provider_mapper" "flex_email" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.email : {
          k      = "${partner_key}-email-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "email"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "email-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "flex_given_name" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.given_name : {
          k      = "${partner_key}-given-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "firstName"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "given-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
  }
}

resource "keycloak_custom_identity_provider_mapper" "flex_family_name" {
  for_each = {
    for combo in flatten([
      for partner_key, partner_val in var.federation_partners : [
        for claim in local.idp_attribute_sources.family_name : {
          k      = "${partner_key}-family-${claim}"
          alias  = keycloak_oidc_identity_provider.federation_partner[partner_key].alias
          claim  = claim
          target = "lastName"
        }
      ]
    ]) : combo.k => combo
  }

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = each.value.alias
  name                     = "family-flex-${each.value.claim}"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = each.value.claim
    "user.attribute" = each.value.target
    "syncMode"       = "FORCE"
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

  # Back-channel URL for each partner (defaults to idp_url when idp_internal_url not provided)
  # Container names (e.g., dive-spoke-bel-keycloak) ARE in SSL certificate SANs
  # Certificates are generated with all container names included via mkcert
  partner_internal_url = {
    for k, v in var.federation_partners :
    k => coalesce(try(v.idp_internal_url, null), v.idp_url)
  }

  # Partner realm path (USA uses base broker; others are suffixed with code)
  partner_realm = {
    for k, v in var.federation_partners :
    k => lower(v.instance_code) == "usa" ? "dive-v3-broker" : "dive-v3-broker-${lower(v.instance_code)}"
  }

  # Whether to disable trust manager for each partner (useful for self-signed local)
  partner_disable_trust = {
    for k, v in var.federation_partners :
    k => try(v.disable_trust_manager, false)
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "federation_idp_aliases" {
  description = "Aliases of configured federation IdPs"
  value       = { for k, v in keycloak_oidc_identity_provider.federation_partner : k => v.alias }
}

