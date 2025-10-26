# ============================================
# MFA Direct Grant Flow (Resource Owner Password Credentials)
# ============================================
# Enables MFA for Direct Grant flow used by custom login page
# Reference: docs/MFA-OTP-IMPLEMENTATION.md Section 4.2

resource "keycloak_authentication_flow" "direct_grant_mfa" {
  count       = var.enable_direct_grant_mfa ? 1 : 0
  realm_id    = var.realm_id
  alias       = "Direct Grant with Conditional MFA - ${var.realm_display_name}"
  description = "Direct Grant flow with conditional MFA for classified clearances"
}

# Step 1: Username validation
resource "keycloak_authentication_execution" "direct_grant_username" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.direct_grant_mfa[0].alias
  authenticator     = "direct-grant-validate-username"
  requirement       = "REQUIRED"
}

# Step 2: Password validation
resource "keycloak_authentication_execution" "direct_grant_password" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.direct_grant_mfa[0].alias
  authenticator     = "direct-grant-validate-password"
  requirement       = "REQUIRED"
  
  depends_on = [
    keycloak_authentication_execution.direct_grant_username
  ]
}

# Step 3: Conditional OTP subflow
resource "keycloak_authentication_subflow" "direct_grant_otp_conditional" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.direct_grant_mfa[0].alias
  alias             = "Conditional OTP - Direct Grant - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"  # Allows initial login, enforces MFA after setup
  
  depends_on = [
    keycloak_authentication_execution.direct_grant_password
  ]
}

# Condition: User attribute "clearance" != "UNCLASSIFIED"
resource "keycloak_authentication_execution" "direct_grant_condition_user_attribute" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.direct_grant_otp_conditional[0].alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

# Configuration for conditional-user-attribute
resource "keycloak_authentication_execution_config" "direct_grant_condition_config" {
  count        = var.enable_direct_grant_mfa ? 1 : 0
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.direct_grant_condition_user_attribute[0].id
  alias        = "Direct Grant Clearance Check - ${var.realm_display_name}"
  config = {
    attribute_name  = var.clearance_attribute_name
    attribute_value = var.clearance_attribute_value_regex
    negate          = "false"
  }
}

# Action: Standard OTP Direct Grant Authenticator (NOT custom SPI)
# Uses Keycloak's built-in OTP validation
resource "keycloak_authentication_execution" "direct_grant_otp" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.direct_grant_otp_conditional[0].alias
  authenticator     = "direct-grant-validate-otp"  # Built-in Keycloak authenticator
  requirement       = "REQUIRED"
  
  depends_on = [
    keycloak_authentication_execution.direct_grant_condition_user_attribute,
    keycloak_authentication_execution_config.direct_grant_condition_config
  ]
}

# Bind the flow to realm direct grant authentication
# Note: Direct Grant flow binding is not available in keycloak_authentication_bindings resource
# Instead, it must be configured in the realm's authentication settings via the Keycloak provider
# or manually in the Keycloak Admin Console under Authentication > Bindings
# 
# For automated binding, use keycloak_realm's authentication_flow property if available,
# or configure via Keycloak REST API
#
# Manual Configuration:
# 1. Keycloak Admin Console → {Realm} → Authentication → Bindings
# 2. Set "Direct Grant Flow" to the flow created by this module

