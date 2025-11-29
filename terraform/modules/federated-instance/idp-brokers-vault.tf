# ============================================================================
# Federated Instance Module - IdP Broker Configuration (Vault Enabled)
# ============================================================================
# Creates OIDC Identity Provider brokers for federation with other DIVE instances
# This version uses Keycloak Vault references for client secrets.
#
# IMPORTANT: This file should replace idp-brokers.tf when Vault integration
# is enabled. The main difference is the client_secret value uses ${vault.key}
# syntax instead of hardcoded placeholders.
#
# Prerequisites:
# 1. Secrets must be uploaded to GCP Secret Manager
# 2. Vault directory must be mounted in Keycloak container
# 3. Keycloak must be started with --vault=file --vault-dir=/opt/keycloak/vault
# ============================================================================

# =============================================================================
# OIDC IDENTITY PROVIDERS FOR FEDERATION
# =============================================================================

resource "keycloak_oidc_identity_provider" "federation_partner" {
  for_each = var.federation_partners

  realm        = keycloak_realm.broker.id
  alias        = "${lower(each.value.instance_code)}-federation"
  display_name = "DIVE V3 - ${each.value.instance_name}"
  enabled      = each.value.enabled

  # Provider settings
  provider_id       = "oidc"
  authorization_url = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/auth"
  token_url         = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/token"
  user_info_url     = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/userinfo"
  jwks_url          = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/certs"
  logout_url        = "${each.value.idp_url}/realms/dive-v3-broker/protocol/openid-connect/logout"
  issuer            = "${each.value.idp_url}/realms/dive-v3-broker"

  # Client credentials
  # The client_id follows the pattern: dive-v3-{this_instance}-federation
  # This is the client that the PARTNER instance created FOR this instance
  client_id = "dive-v3-${lower(var.instance_code)}-federation"

  # VAULT REFERENCE: Secret is fetched from Keycloak's vault at runtime
  # Format: ${vault.key} where key becomes {realm}_{key} for file lookup
  # Example: ${vault.usa-federation-secret} -> dive-v3-broker_usa-federation-secret
  #
  # The partner instance creates the client and generates the secret.
  # That secret is stored in GCP Secret Manager and synced to Keycloak's vault dir.
  client_secret = "$${vault.${lower(each.value.instance_code)}-federation-secret}"

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

  # ============================================
  # CRITICAL: Post-Broker MFA Flow Binding (THE WORKING SOLUTION)
  # ============================================
  # This is the KEY to making MFA work for federated users!
  #
  # IMPORTANT: Use Keycloak's DEFAULT "first broker login" for user creation,
  # and a SIMPLE Post-Broker flow for MFA enforcement.
  #
  # Reference: https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login
  # "The easiest way is to enforce authentication with one particular 2-factor method.
  #  For example, when requesting OTP, the flow can look like this with only a single
  #  authenticator configured."
  #
  # DO NOT use complex flows with conditional subflows - they cause:
  # "REQUIRED and ALTERNATIVE elements at same level! Those alternative executions will be ignored"
  #
  # The simple_post_broker_otp_flow_alias should point to a flow containing ONLY:
  #   - OTP Form (REQUIRED)
  # That's it. No user creation steps. No conditions.
  first_broker_login_flow_alias = "first broker login"
  post_broker_login_flow_alias  = var.simple_post_broker_otp_flow_alias

  # Extra config for attribute mapping
  extra_config = {
    "clientAuthMethod" = "client_secret_post"
  }

  # Lifecycle management
  lifecycle {
    # The client_secret value includes ${vault...} which Keycloak resolves at runtime
    # Terraform should not try to "fix" this value on subsequent applies
    ignore_changes = [client_secret]
  }
}

# =============================================================================
# ATTRIBUTE MAPPERS FOR FEDERATED USERS
# =============================================================================

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

output "federation_idp_vault_keys" {
  description = "Vault keys used for each federation IdP"
  value = { for k, v in var.federation_partners :
    k => "${lower(v.instance_code)}-federation-secret"
  }
}

