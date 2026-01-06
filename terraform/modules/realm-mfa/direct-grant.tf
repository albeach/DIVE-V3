# ============================================
# MFA Direct Grant Flow (ARCHIVED - v3.0.0)
# ============================================
# ⚠️ ARCHIVED: This file is kept for reference only.
#
# SSOT CONSOLIDATION (December 2025):
# - Custom SPIs have been REMOVED from the Docker image
# - The `direct-grant-otp-setup` authenticator is NO LONGER AVAILABLE
# - Setting enable_direct_grant_mfa = true will cause Terraform to fail
# - This file will be deleted in a future release
#
# REASON FOR DEPRECATION:
# 1. Security: Direct Grant sends password via POST (not AAL2 compliant)
# 2. Limitation: Keycloak does not support conditional MFA in Direct Grant natively
# 3. Best Practice: NIST SP 800-63B recommends browser-based flows for AAL2
# 4. Federation: Direct Grant bypasses IdP federation (breaks multi-realm)
# 5. Custom SPI: Required custom DirectGrantOTPAuthenticator (now REMOVED)
#
# MIGRATION PATH:
# - Use Authorization Code flow (browser-based) exclusively
# - All production deployments must use browser-based authentication
# - Direct Grant (ROPC) should only be used for machine-to-machine (M2M)
#
# DEFAULT: This flow is DISABLED and MUST remain disabled (enable_direct_grant_mfa = false)
#
# Reference: docs/KEYCLOAK_REFACTORING_SESSION_PROMPT.md

resource "keycloak_authentication_flow" "direct_grant_mfa" {
  count       = var.enable_direct_grant_mfa ? 1 : 0
  realm_id    = var.realm_id
  alias       = "Direct Grant with Conditional MFA - ${local.flow_suffix} DEPRECATED"
  description = "DEPRECATED: Use browser-based flows only. See NATIVE-KEYCLOAK-REFACTORING.md"
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

# Configure ACR for password authentication (AAL1 baseline)
# This sets ACR="0" (AAL1) for password-only authentication
# Will be upgraded to ACR="1" (AAL2) if OTP is also completed
resource "keycloak_authentication_execution_config" "direct_grant_password_acr_config" {
  count        = var.enable_direct_grant_mfa ? 1 : 0
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.direct_grant_password[0].id
  alias        = "Direct Grant Password ACR - ${local.flow_suffix}"
  config = {
    acr_level = "0" # AAL1 for password-only
  }
}

# Step 3: OTP subflow (CONDITIONAL - clearance-based MFA enforcement)
resource "keycloak_authentication_subflow" "direct_grant_otp_conditional" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.direct_grant_mfa[0].alias
  alias             = "Conditional OTP - Direct Grant - ${local.flow_suffix}"
  requirement       = "CONDITIONAL" # Only enforce if condition (clearance) is met

  depends_on = [
    keycloak_authentication_execution.direct_grant_password
  ]
}

# Condition: User attribute "clearance" != "UNCLASSIFIED" AND != "RESTRICTED"
# MFA required only for CONFIDENTIAL, SECRET, TOP_SECRET users
# CRITICAL: Both UNCLASSIFIED and RESTRICTED remain AAL1 (no MFA)
resource "keycloak_authentication_execution" "direct_grant_condition_user_attribute" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.direct_grant_otp_conditional[0].alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED" # Enforce clearance-based MFA
}

# Configuration for conditional-user-attribute
resource "keycloak_authentication_execution_config" "direct_grant_condition_config" {
  count        = var.enable_direct_grant_mfa ? 1 : 0
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.direct_grant_condition_user_attribute[0].id
  alias        = "Direct Grant Clearance Check - ${local.flow_suffix}"
  config = {
    attribute_name  = var.clearance_attribute_name
    attribute_value = var.clearance_attribute_value_regex
    negate          = "false"
  }
}

# Action: Custom DIVE V3 OTP Direct Grant Authenticator
# Enables OTP enrollment AND validation within Direct Grant flow
# Allows users to scan QR codes and enroll OTP directly in custom login page
resource "keycloak_authentication_execution" "direct_grant_otp" {
  count             = var.enable_direct_grant_mfa ? 1 : 0
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.direct_grant_otp_conditional[0].alias
  authenticator     = "direct-grant-otp-setup" # Custom SPI (dive-keycloak-spi.jar)
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.direct_grant_condition_user_attribute,
    keycloak_authentication_execution_config.direct_grant_condition_config
  ]
}

# Configure ACR (Authentication Context Class Reference) for Direct Grant OTP
# Keycloak 26+: This sets ACR="1" (AAL2) when OTP is successfully completed
resource "keycloak_authentication_execution_config" "direct_grant_otp_acr_config" {
  count        = var.enable_direct_grant_mfa ? 1 : 0
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.direct_grant_otp[0].id
  alias        = "Direct Grant OTP ACR - ${local.flow_suffix}"
  config = {
    acr_level = "1" # Set ACR to "1" (AAL2) when OTP succeeds in Direct Grant
  }
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

