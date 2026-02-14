# Flexible claim sources for standard profile attributes to handle provider-specific naming
# CRITICAL (2026-02-14): Do NOT add flex mappers for DIVE custom attributes (clearance,
# countryOfAffiliation, uniqueID, acpCOI). When a flex mapper's claim is absent from the
# partner token, Keycloak writes empty/null to the user attribute, OVERWRITING the value
# set by the canonical mapper. DIVE instances always use canonical claim names.
locals {
  idp_attribute_sources = {
    email       = ["email", "mail"]
    given_name  = ["given_name", "firstName", "firstname", "givenName"]
    family_name = ["family_name", "lastName", "surname", "familyName"]
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

  # Client credentials (these are created in the partner's Keycloak)
  # The client name format is: dive-v3-broker-{instance-code}
  # This matches what Terraform creates in spoke realms via incoming_federation client
  client_id     = "dive-v3-broker-${lower(var.instance_code)}"
  client_secret = each.value.client_secret

  # OIDC settings
  validate_signature = true
  default_scopes     = "openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr"

  # Sync settings
  sync_mode   = "FORCE"
  trust_email = true

  # First-broker-login settings
  # CRITICAL (2026-01-24): MUST use "first broker login" flow for attribute import!
  # 
  # When first_broker_login_flow_alias = "" (empty), IdP attribute mappers DO NOT EXECUTE!
  # Result: Hub user created WITHOUT attributes from FRA IdP (countryOfAffiliation missing)
  # 
  # The "first broker login" flow:
  #   1. Executes IdP attribute mappers (imports countryOfAffiliation, clearance, etc.)
  #   2. Creates user with imported attributes
  #   3. Links federated identity
  # 
  # Keycloak v26+ Best Practice: Use built-in "first broker login" flow
  # This is required for IdP mappers to execute with syncMode: FORCE
  first_broker_login_flow_alias = "first broker login"  # Required for attribute import

  # Store tokens for later use
  store_token = true

  # UI settings
  gui_order          = lookup(local.federation_order, each.value.instance_code, 99)
  hide_on_login_page = false

  # MFA Flow Binding - DISABLED for Federation (Trust Partner MFA)
  # CRITICAL FIX: Do NOT enforce post-broker MFA for federated IdPs
  # Rationale: Partner IdPs already enforce MFA (ACR/AMR claims in token)
  # Re-requiring MFA enrollment breaks user experience and ignores partner security
  # Hub should trust partner's authentication including MFA
  post_broker_login_flow_alias = ""  # Empty = no post-broker flow

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
# ACR/AMR MAPPERS FOR FEDERATION (CRITICAL - Fixed Feb 2026)
# =============================================================================
# CRITICAL FIX: These mappers MUST exist for federated users.
#
# Architecture (corrected Feb 2026):
# 1. FRA Spoke authenticates user with password + OTP
# 2. Spoke's browser flow sets session: AUTHENTICATORS_COMPLETED (exec IDs), acr = 2
# 3. Spoke's native oidc-amr-mapper outputs: amr = ["pwd","otp"] (from session)
#    Spoke's native oidc-acr-mapper outputs: acr = "2" (from session AcrStore)
# 4. Hub receives spoke token with native amr and acr claims
# 5. Hub's IdP mapper (BELOW) extracts amr → stores to user.amr attribute
#    Hub's IdP mapper (BELOW) extracts acr → stores to user.acr attribute
# 6. Hub's broker client user_amr mapper reads user.amr → outputs user_amr to frontend
# 7. Frontend reads user_amr (prioritized over native amr for federated users)
#
# KEY INSIGHT (Feb 2026): Use native 'amr'/'acr' claims, NOT 'user_amr'/'user_acr'!
# The user_amr/user_acr claims come from user ATTRIBUTES which are EMPTY for
# locally-authenticated spoke users. Only the native session-based claims are reliable.

# AMR IdP Mapper - extracts amr from Spoke token → stores to user.amr
# CRITICAL FIX (Feb 2026): Must use native 'amr' claim, NOT 'user_amr'!
# The native oidc-amr-mapper on the spoke reads AUTHENTICATORS_COMPLETED user
# session note + "default.reference.value" from execution configs → outputs 'amr'.
# The 'user_amr' claim reads from user.amr attribute, which is EMPTY for
# locally-authenticated spoke users (only populated for federated users).
# Using 'user_amr' caused AAL1/MFA-not-set for all federated users.
# This matches the shell script _configure_idp_mappers() which also uses 'amr'.
resource "keycloak_custom_identity_provider_mapper" "amr_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "amr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "amr"   # Read from native session AMR claim (always set after auth)
    "user.attribute" = "amr"   # Store to local user's amr attribute
    "syncMode"       = "FORCE" # Update on every login (dynamic!)
  }
}

# ACR IdP Mapper - extracts acr from Spoke token → stores to user.acr
# CRITICAL FIX (Feb 2026): Must use native 'acr' claim, NOT 'user_acr'!
# Same rationale as AMR — the native oidc-acr-mapper reads from the spoke's
# authentication session (AcrStore) and is always correct for local auth.
# The 'user_acr' attribute is EMPTY for locally-authenticated spoke users.
resource "keycloak_custom_identity_provider_mapper" "acr_mapper" {
  for_each = var.federation_partners

  realm                    = keycloak_realm.broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.federation_partner[each.key].alias
  name                     = "acr-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "claim"          = "acr"   # Read from native session ACR claim (always set after auth)
    "user.attribute" = "acr"   # Store to local user's acr attribute
    "syncMode"       = "FORCE" # Update on every login (dynamic!)
  }
}

# Flexible claim mappers for standard profile attributes only
# These handle legitimate naming differences across OIDC providers (e.g., surname vs family_name)
# NOTE: DIVE custom attributes (clearance, countryOfAffiliation, uniqueID, acpCOI) use
# only the static mappers above — flex mappers with absent claims erase correct values.
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

  # Partner realm path (all instances use instance-code-suffixed realms for consistency)
  # FIX (Jan 2026): Changed USA from legacy "dive-v3-broker" to "dive-v3-broker-usa" for consistency
  partner_realm = {
    for k, v in var.federation_partners :
    k => "dive-v3-broker-${lower(v.instance_code)}"
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

