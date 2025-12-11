# ============================================
# MFA Browser Authentication Flow (NATIVE KEYCLOAK 26.4.2) - BEST PRACTICE PATTERN
# ============================================
# Multi-Level AAL Enforcement: AAL1/AAL2/AAL3 Using ONLY Native Keycloak Features
# 
# CRITICAL FIX #2 (Dec 1, 2025):
# - Changed `negate = "true"` to `check_result = "not-executed"` for conditional-sub-flow-executed!
# - The "negate" parameter doesn't exist for this authenticator - it was being silently ignored!
# - Valid check_result values: "executed" or "not-executed"
# - This was causing the Force OTP Enrollment subflow to never trigger.
#
# CRITICAL FIX #1 (Dec 1, 2025):
# - Added `regex = "true"` to conditional-user-attribute configs!
# - Without this flag, Keycloak does EXACT STRING matching, not regex matching.
# - This was the root cause of MFA not triggering for SECRET/CONFIDENTIAL users.
# - Also corrected property name: `attribute_expected_value` (not `attribute_value`)
#
# PREVIOUS FIX (Nov 29, 2025):
# - Implements the "Conditional 2FA sub-flow with OTP default" pattern from Keycloak docs
# - Reference: https://www.keycloak.org/docs/latest/server_admin/index.html#twofa-conditional-workflow-examples
#
# KEY INSIGHT: The `auth-otp-form` authenticator ONLY validates existing OTP credentials.
# It does NOT force enrollment if user has no OTP configured.
# To force enrollment, we need to:
#   1. First try existing 2FA methods (ALTERNATIVE)
#   2. Check if 2FA was NOT completed using `Condition - sub-flow executed`
#   3. If not completed, force OTP enrollment with REQUIRED OTP Form
#
# Flow Structure (BEST PRACTICE):
# 1. Cookie (ALTERNATIVE) - SSO reuse
# 2. Forms Subflow (ALTERNATIVE) - Contains auth + MFA together
#    ├─ Username-Password (REQUIRED) - Authenticates user FIRST
#    ├─ Conditional AAL3 (CONDITIONAL) - TOP_SECRET → WebAuthn
#    │   ├─ Condition: clearance == TOP_SECRET
#    │   └─ WebAuthn Authenticator (REQUIRED)
#    └─ Conditional AAL2 (CONDITIONAL) - CONFIDENTIAL/SECRET → OTP
#        ├─ Condition: clearance in (CONFIDENTIAL, SECRET)
#        ├─ 2FA Options Subflow (CONDITIONAL) - Try existing 2FA first
#        │   ├─ Condition - User Configured (checks if ANY 2FA is configured)
#        │   └─ OTP Form (ALTERNATIVE) - Validates existing OTP
#        └─ Force OTP Enrollment (CONDITIONAL) - Fallback for users without 2FA
#            ├─ Condition - Sub-flow Executed (checks if 2FA Options was NOT executed)
#            └─ OTP Form (REQUIRED) - Forces enrollment if no 2FA configured
#
# This pattern handles ALL use cases:
# - New users (no OTP): Forced to enroll
# - Returning users with OTP: Validates existing OTP
# - Users from external IdPs: Clearance attribute determines MFA requirement
#
# ACR/AMR Mapping:
# - AAL1 (password only): acr="0", amr=["pwd"]
# - AAL2 (password+OTP): acr="1", amr=["pwd","otp"]
# - AAL3 (password+WebAuthn): acr="2", amr=["pwd","hwk"]

resource "keycloak_authentication_flow" "classified_browser" {
  realm_id    = var.realm_id
  alias       = "Classified Access Browser Flow - ${var.realm_display_name}"
  description = "Multi-level AAL (AAL1/AAL2/AAL3) with mandatory MFA for classified clearances"
}

# ============================================
# Top Level: Cookie vs Forms
# ============================================

# Option 1: SSO Cookie (returning users, already authenticated)
resource "keycloak_authentication_execution" "browser_idp_redirector" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "identity-provider-redirector"
  requirement       = "ALTERNATIVE"
  priority          = 5  # Run before cookie so kc_idp_hint is honored immediately
}

resource "keycloak_authentication_execution" "browser_cookie" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
  priority          = 10 # Execute cookie check first
}

# Option 2: Forms Subflow (new authentication required)
resource "keycloak_authentication_subflow" "browser_forms_subflow" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  alias             = "Forms - ${var.realm_display_name}"
  requirement       = "ALTERNATIVE"
  priority          = 20 # Forms subflow executes after cookie check

  depends_on = [keycloak_authentication_execution.browser_cookie]
}

# ============================================
# Forms Subflow: Auth THEN Conditional MFA
# ============================================

# Step 1: Username + Password (REQUIRED - creates user context)
resource "keycloak_authentication_execution" "browser_forms" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
  priority          = 10 # Password form FIRST
}

# Configure ACR and AMR for password authentication (AAL1 baseline)
resource "keycloak_authentication_execution_config" "browser_password_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_forms.id
  alias        = "Password ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "0"   # AAL1 for password-only
    reference = "pwd" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Step 2: Conditional AAL3 (TOP_SECRET → WebAuthn)
# ============================================

resource "keycloak_authentication_subflow" "browser_conditional_webauthn" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  alias             = "Conditional WebAuthn AAL3 - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 20 # WebAuthn check AFTER password

  depends_on = [keycloak_authentication_execution.browser_forms]
}

# Condition: clearance == "TOP_SECRET"
resource "keycloak_authentication_execution" "browser_condition_top_secret" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
  priority          = 10 # Execute FIRST to evaluate condition
}

resource "keycloak_authentication_execution_config" "browser_condition_top_secret_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_top_secret.id
  alias        = "TOP SECRET Check - ${var.realm_display_name}"
  config = {
    attribute_name           = var.clearance_attribute_name
    attribute_expected_value = "^TOP_SECRET$" # Regex pattern for TOP_SECRET
    regex                    = "true"         # CRITICAL: Enable regex matching!
    not                      = "false"        # Do not negate the result
  }
}

# WebAuthn Authenticator (hardware-backed, AAL3)
resource "keycloak_authentication_execution" "browser_webauthn_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "webauthn-authenticator"
  requirement       = "REQUIRED"
  priority          = 20 # Execute AFTER condition check

  depends_on = [
    keycloak_authentication_execution.browser_condition_top_secret,
    keycloak_authentication_execution_config.browser_condition_top_secret_config
  ]
}

# Configure ACR and AMR for WebAuthn (AAL3)
resource "keycloak_authentication_execution_config" "browser_webauthn_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_webauthn_form.id
  alias        = "WebAuthn ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "3"   # AAL3 for hardware key (AAL3)
    reference = "hwk" # AMR reference: hardware key per RFC 8176
  }
}

# ============================================
# Step 3: Conditional AAL2 (CONFIDENTIAL/SECRET → OTP)
# ============================================
# BEST PRACTICE PATTERN: "Conditional 2FA sub-flow with OTP default"
# This pattern handles both new users (enrollment) and returning users (validation)

resource "keycloak_authentication_subflow" "browser_conditional_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  alias             = "Conditional OTP AAL2 - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 30 # OTP check AFTER WebAuthn

  depends_on = [keycloak_authentication_subflow.browser_conditional_webauthn]
}

# Condition: clearance in (CONFIDENTIAL, SECRET)
resource "keycloak_authentication_execution" "browser_condition_user_attribute" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
  priority          = 10 # Execute FIRST to evaluate condition
}

resource "keycloak_authentication_execution_config" "browser_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_user_attribute.id
  alias        = "CONFIDENTIAL SECRET Check - ${var.realm_display_name}"
  config = {
    attribute_name           = var.clearance_attribute_name
    attribute_expected_value = "^(CONFIDENTIAL|SECRET)$" # Regex pattern for both levels
    regex                    = "true"                    # CRITICAL: Enable regex matching!
    not                      = "false"                   # Do not negate the result
  }
}

# ============================================
# Step 3a: 2FA Options Subflow - Try Existing 2FA First
# ============================================
# This subflow attempts to use existing 2FA credentials
# If user has OTP configured, they'll enter their code here
# If no 2FA is configured, this subflow is skipped (CONDITIONAL)

resource "keycloak_authentication_subflow" "browser_2fa_options" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  alias             = "2FA Options - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 20 # After clearance check

  depends_on = [
    keycloak_authentication_execution.browser_condition_user_attribute,
    keycloak_authentication_execution_config.browser_condition_config
  ]
}

# Condition: User has 2FA configured (OTP credential exists)
resource "keycloak_authentication_execution" "browser_condition_user_configured" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_2fa_options.alias
  authenticator     = "conditional-user-configured"
  requirement       = "REQUIRED"
  priority          = 10 # Check if user has 2FA configured
}

# OTP Form (ALTERNATIVE) - Validates existing OTP for users who have it
resource "keycloak_authentication_execution" "browser_otp_form_existing" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_2fa_options.alias
  authenticator     = "auth-otp-form"
  requirement       = "ALTERNATIVE"
  priority          = 20 # After condition check

  depends_on = [keycloak_authentication_execution.browser_condition_user_configured]
}

# Configure ACR and AMR for OTP (AAL2)
resource "keycloak_authentication_execution_config" "browser_otp_existing_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form_existing.id
  alias        = "OTP Existing ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "1"   # AAL2 when OTP succeeds
    reference = "otp" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Step 3b: Force OTP Enrollment - Fallback for Users Without 2FA
# ============================================
# This subflow executes ONLY if the 2FA Options subflow was NOT executed
# (meaning the user has no 2FA configured)

resource "keycloak_authentication_subflow" "browser_force_otp_enrollment" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  alias             = "Force OTP Enrollment - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 30 # After 2FA Options

  depends_on = [keycloak_authentication_subflow.browser_2fa_options]
}

# Condition: 2FA Options subflow was NOT executed (user has no 2FA)
resource "keycloak_authentication_execution" "browser_condition_subflow_not_executed" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_force_otp_enrollment.alias
  authenticator     = "conditional-sub-flow-executed"
  requirement       = "REQUIRED"
  priority          = 10 # Check if 2FA Options was executed
}

resource "keycloak_authentication_execution_config" "browser_condition_subflow_not_executed_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_subflow_not_executed.id
  alias        = "2FA Not Executed Check - ${var.realm_display_name}"
  config = {
    flow_to_check = keycloak_authentication_subflow.browser_2fa_options.alias
    # CRITICAL FIX: Use check_result="not-executed" instead of negate="true"
    # The "negate" parameter doesn't exist for conditional-sub-flow-executed!
    # Valid values: "executed" (true when subflow succeeded) or "not-executed" (true when subflow didn't run)
    check_result = "not-executed" # Trigger if 2FA Options was NOT executed
  }
}

# OTP Form (REQUIRED) - Forces enrollment for users without 2FA
# This is the key: REQUIRED OTP Form will force the user to set up OTP
resource "keycloak_authentication_execution" "browser_otp_form_enrollment" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_force_otp_enrollment.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  priority          = 20 # After condition check

  depends_on = [
    keycloak_authentication_execution.browser_condition_subflow_not_executed,
    keycloak_authentication_execution_config.browser_condition_subflow_not_executed_config
  ]
}

# Configure ACR and AMR for OTP enrollment (AAL2)
resource "keycloak_authentication_execution_config" "browser_otp_enrollment_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form_enrollment.id
  alias        = "OTP Enrollment ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "1"   # AAL2 when OTP succeeds
    reference = "otp" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Authentication Flow Bindings  
# ============================================
resource "keycloak_authentication_bindings" "classified_bindings" {
  realm_id     = var.realm_id
  browser_flow = var.use_standard_browser_flow ? "browser" : keycloak_authentication_flow.classified_browser.alias
}
