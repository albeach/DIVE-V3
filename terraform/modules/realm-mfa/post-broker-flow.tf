# ============================================
# Post-Broker MFA Flow (Permanent Solution)
# ============================================
# This flow runs AFTER first broker login completes
# It enforces MFA based on clearance WITHOUT breaking federation
#
# Flow Structure:
# Post Broker Login Flow
# ├─ Review Profile [DISABLED]
# ├─ Create User [REQUIRED]
# ├─ Auto Link [ALTERNATIVE]
# ├─ Conditional AAL3 (TOP_SECRET → WebAuthn) [CONDITIONAL]
# │   ├─ Condition: clearance == "TOP_SECRET" [REQUIRED]
# │   └─ WebAuthn Form [REQUIRED]
# └─ Conditional AAL2 (CONFIDENTIAL/SECRET → OTP) [CONDITIONAL]
#     ├─ Condition: clearance in {CONFIDENTIAL, SECRET} [REQUIRED]
#     └─ OTP Form [REQUIRED]
#
# UNCLASSIFIED users remain AAL1 (no MFA required)
#

resource "keycloak_authentication_flow" "post_broker_mfa" {
  realm_id    = var.realm_id
  alias       = "Post Broker MFA - ${local.flow_suffix}"
  description = "AAL2 enforcement after first broker login"
  provider_id = "basic-flow"
}

# Step 1: Review Profile (DISABLED - auto-accept)
resource "keycloak_authentication_execution" "post_broker_review_profile" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-review-profile"
  requirement       = "DISABLED" # Don't force profile review
}

# Step 2: Create User (ALTERNATIVE - auto-create from IdP)
resource "keycloak_authentication_execution" "post_broker_create_user" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-create-user-if-unique"
  requirement       = "ALTERNATIVE" # ALTERNATIVE allows proper execution order

  depends_on = [
    keycloak_authentication_execution.post_broker_review_profile
  ]
}

# Step 2.5: Automatically link user (bypasses confirmation screen)
resource "keycloak_authentication_execution" "post_broker_auto_link" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-auto-link"
  requirement       = "ALTERNATIVE" # Alternative to create-user

  depends_on = [
    keycloak_authentication_execution.post_broker_create_user
  ]
}

# ============================================
# Step 3A: Conditional AAL3 (TOP_SECRET → WebAuthn)
# ============================================
# WebAuthn enforcement for TOP_SECRET users after broker login
# Ensures TOP_SECRET users get AAL3 (hardware key) authentication

resource "keycloak_authentication_subflow" "post_broker_conditional_webauthn" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  alias             = "Conditional WebAuthn AAL3 - Post Broker - ${local.flow_suffix}"
  requirement       = "CONDITIONAL"

  depends_on = [
    keycloak_authentication_execution.post_broker_auto_link # Wait for user creation/linking
  ]
}

# Condition: clearance == "TOP_SECRET"
resource "keycloak_authentication_execution" "post_broker_condition_top_secret" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional_webauthn.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "post_broker_condition_top_secret_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.post_broker_condition_top_secret.id
  alias        = "POST BROKER TOP SECRET Check - ${local.flow_suffix}"
  config = {
    attribute_name           = var.clearance_attribute_name
    attribute_expected_value = "^TOP_SECRET$" # Regex pattern for TOP_SECRET
    regex                    = "true"         # CRITICAL: Enable regex matching!
    not                      = "false"        # Do not negate the result
  }
}

# WebAuthn Authenticator (hardware-backed, AAL3)
resource "keycloak_authentication_execution" "post_broker_webauthn_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional_webauthn.alias
  authenticator     = "webauthn-authenticator"
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.post_broker_condition_top_secret,
    keycloak_authentication_execution_config.post_broker_condition_top_secret_config
  ]
}

# ACR/AMR config for Post-Broker WebAuthn (AAL3) (FIXED 2026-02-14):
# Uses "default.reference.value" (not "reference") per Keycloak 26.5 AmrUtils.java
resource "keycloak_authentication_execution_config" "post_broker_webauthn_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.post_broker_webauthn_form.id
  alias        = "Post Broker WebAuthn ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "3"     # AAL3 for hardware key
    "default.reference.value"  = "hwk"   # AMR reference: hardware key (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
  }
}

# ============================================
# Step 3B: Conditional AAL2 (CONFIDENTIAL/SECRET → OTP)
# ============================================

resource "keycloak_authentication_subflow" "post_broker_conditional_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  alias             = "Conditional OTP AAL2 - Post Broker - ${local.flow_suffix}"
  requirement       = "CONDITIONAL"

  depends_on = [
    keycloak_authentication_subflow.post_broker_conditional_webauthn # OTP after WebAuthn
  ]
}

# Condition: clearance in (CONFIDENTIAL, SECRET)
resource "keycloak_authentication_execution" "post_broker_condition_clearance" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional_otp.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

# Configuration for the clearance condition
resource "keycloak_authentication_execution_config" "post_broker_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.post_broker_condition_clearance.id
  alias        = "POST BROKER CONFIDENTIAL SECRET Check - ${local.flow_suffix}"
  config = {
    attribute_name           = var.clearance_attribute_name
    attribute_expected_value = "^(CONFIDENTIAL|SECRET)$" # Regex pattern for both levels
    regex                    = "true"                    # CRITICAL: Enable regex matching!
    not                      = "false"                   # Do not negate the result
  }
}

# Action: OTP Form (validates or prompts for OTP setup)
resource "keycloak_authentication_execution" "post_broker_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional_otp.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.post_broker_condition_clearance,
    keycloak_authentication_execution_config.post_broker_condition_config
  ]
}

# ACR/AMR config for Post-Broker OTP (AAL2) (FIXED 2026-02-14):
# Uses "default.reference.value" (not "reference") per Keycloak 26.5 AmrUtils.java
resource "keycloak_authentication_execution_config" "post_broker_otp_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.post_broker_otp_form.id
  alias        = "Post Broker OTP ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "2"     # AAL2 when OTP succeeds
    "default.reference.value"  = "otp"   # AMR reference for OTP (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
  }
}

# Optional: Update profile attributes
resource "keycloak_authentication_execution" "post_broker_update_attributes" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-confirm-link"
  requirement       = "DISABLED"

  depends_on = [
    keycloak_authentication_subflow.post_broker_conditional_otp
  ]
}

# NOTE: Output moved to outputs.tf for consistency

