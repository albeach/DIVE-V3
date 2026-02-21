# ============================================
# MFA Browser Authentication Flow (NATIVE KEYCLOAK 26.4.2) - BEST PRACTICE PATTERN
# ============================================
# Multi-Level AAL Enforcement: AAL1/AAL2/AAL3 Using ONLY Native Keycloak Features
#
# Key implementation notes:
# - conditional-user-attribute requires `regex = "true"` for pattern matching (default is exact string)
# - conditional-sub-flow-executed uses `check_result = "not-executed"` (NOT `negate = "true"` which is ignored)
# - Implements "Conditional 2FA sub-flow with OTP default" pattern from Keycloak docs
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
# ACR/AMR Mapping (CORRECTED Jan 2026):
# - AAL1 (password only): acr="1", amr=["pwd"]
# - AAL2 (password+OTP): acr="2", amr=["pwd","otp"]
# - AAL3 (password+WebAuthn): acr="3", amr=["pwd","hwk"]

locals {
  # Keycloak flow aliases cannot contain parentheses, brackets, or special chars
  # Sanitize the display name to create a valid flow alias
  sanitized_display_name = replace(replace(replace(replace(var.realm_display_name, "(", ""), ")", ""), "[", ""), "]", "")
  # Also replace spaces with underscores for cleaner aliases
  flow_suffix = replace(local.sanitized_display_name, " ", "-")
}

resource "keycloak_authentication_flow" "classified_browser" {
  realm_id    = var.realm_id
  alias       = "Classified-Access-Browser-Flow-${local.flow_suffix}"
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
  priority          = 5 # Run before cookie so kc_idp_hint is honored immediately
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
  alias             = "Forms-${local.flow_suffix}"
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

# AMR config for password execution (FIXED 2026-02-14):
# Keycloak 26.5's AmrProtocolMapper reads AUTHENTICATORS_COMPLETED user session note,
# then looks up each execution's config for "default.reference.value" (NOT "reference").
# Without "default.reference.maxAge", AMR expires immediately (default=0).
# See: AmrUtils.java, AmrProtocolMapper.java in Keycloak source.
resource "keycloak_authentication_execution_config" "browser_password_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_forms.id
  alias        = "Password ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "1"     # AAL1 for password-only authentication
    "default.reference.value"  = "pwd"   # AMR reference for password (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
  }
}

# ============================================
# Step 2: Conditional AAL3 (TOP_SECRET → WebAuthn)
# ============================================

resource "keycloak_authentication_subflow" "browser_conditional_webauthn" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  alias             = "Conditional WebAuthn AAL3 - ${local.flow_suffix}"
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
  alias        = "TOP SECRET Check - ${local.flow_suffix}"
  config = {
    # CRITICAL (2026-02-09): Check country-specific clearance attribute
    # Backend is SSOT for normalization, but conditionals need to match country-specific values
    # Pattern covers all 32 NATO countries' TOP SECRET equivalents
    attribute_name           = "clearance"
    attribute_expected_value = "^(TOP.?SECRET|STRENG.?GEHEIM|TRÈS.?SECRET|SVÆRT.?HEMMELIG|ŚCIŚLE.?TAJNE|PŘÍSNĚ.?TAJNÉ|SZIGORÚAN.?TITKOS|TÄIESTI.?SALAJANE|YDERST.?HEMMELIGT|ΕΞΑΙΡΕΤΙΚΩΣ.?ΑΠΟΡΡΗΤΟ)$"
    regex                    = "true"
    not                      = "false"
  }
}

# LoA Level Condition (AAL3) - Sets acr=3 when this subflow completes
# CRITICAL: This authenticator SETS the LoA level in the session
resource "keycloak_authentication_execution" "browser_loa_level_3" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "conditional-level-of-authentication"
  requirement       = "REQUIRED"
  priority          = 15 # Execute AFTER user-attribute check, BEFORE webauthn

  depends_on = [
    keycloak_authentication_execution.browser_condition_top_secret,
    keycloak_authentication_execution_config.browser_condition_top_secret_config
  ]
}

resource "keycloak_authentication_execution_config" "browser_loa_level_3_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_loa_level_3.id
  alias        = "LoA Level 3 AAL3 - ${local.flow_suffix}"
  config = {
    loa-condition-level = "3" # AAL3 for TOP_SECRET + WebAuthn (correct property name!)
    loa-max-age         = "0" # 0 = require re-auth every time (most secure for TOP_SECRET)
  }
}

# WebAuthn Authenticator (hardware-backed, AAL3)
resource "keycloak_authentication_execution" "browser_webauthn_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "webauthn-authenticator"
  requirement       = "REQUIRED"
  priority          = 20 # Execute AFTER LoA condition

  depends_on = [
    keycloak_authentication_execution.browser_loa_level_3,
    keycloak_authentication_execution_config.browser_loa_level_3_config
  ]
}

# ACR/AMR config for WebAuthn execution (FIXED 2026-02-14):
# Uses "default.reference.value" (not "reference") per Keycloak 26.5 AmrUtils.java
resource "keycloak_authentication_execution_config" "browser_webauthn_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_webauthn_form.id
  alias        = "WebAuthn ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "3"     # AAL3 for TOP_SECRET + WebAuthn
    "default.reference.value"  = "hwk"   # AMR reference for hardware key (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
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
  alias             = "Conditional OTP AAL2 - ${local.flow_suffix}"
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
  alias        = "CONFIDENTIAL SECRET Check - ${local.flow_suffix}"
  config = {
    # CRITICAL (2026-02-09): Check country-specific clearance attribute
    # Backend is SSOT for normalization, but conditionals need to match country-specific values
    # Pattern covers all 32 NATO countries' CONFIDENTIAL and SECRET equivalents
    attribute_name           = "clearance"
    attribute_expected_value = "^(CONFIDENTIAL|SECRET|GEHEIM|VS.?VERTRAULICH|CONFIDENTIEL|DÉFENSE|SALAJANE|TAJNE|TITKOS|HEMMELIG|ΑΠΟΡΡΗΤΟ)$"
    regex                    = "true"
    not                      = "false"
  }
}

# LoA Level Condition (AAL2) - Sets acr=2 when this subflow completes
# CRITICAL: This authenticator SETS the LoA level in the session
resource "keycloak_authentication_execution" "browser_loa_level_2" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "conditional-level-of-authentication"
  requirement       = "REQUIRED"
  priority          = 15 # Execute AFTER user-attribute check, BEFORE 2FA

  depends_on = [
    keycloak_authentication_execution.browser_condition_user_attribute,
    keycloak_authentication_execution_config.browser_condition_config
  ]
}

resource "keycloak_authentication_execution_config" "browser_loa_level_2_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_loa_level_2.id
  alias        = "LoA Level 2 AAL2 - ${local.flow_suffix}"
  config = {
    loa-condition-level = "2"   # AAL2 for CONFIDENTIAL/SECRET + OTP (correct property name!)
    loa-max-age         = "300" # 5 minutes validity for SECRET/CONFIDENTIAL
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
  alias             = "2FA Options - ${local.flow_suffix}"
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

# ACR/AMR config for existing OTP execution (FIXED 2026-02-14):
# Uses "default.reference.value" (not "reference") per Keycloak 26.5 AmrUtils.java
resource "keycloak_authentication_execution_config" "browser_otp_existing_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form_existing.id
  alias        = "OTP Existing ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "2"     # AAL2 for CONFIDENTIAL/SECRET + OTP
    "default.reference.value"  = "otp"   # AMR reference for OTP (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
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
  alias             = "Force OTP Enrollment - ${local.flow_suffix}"
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
  alias        = "2FA Not Executed Check - ${local.flow_suffix}"
  config = {
    flow_to_check = keycloak_authentication_subflow.browser_2fa_options.alias
    # check_result="not-executed" triggers when 2FA Options didn't run (user has no 2FA configured)
    # Note: "negate" parameter does NOT exist for conditional-sub-flow-executed
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

# ACR/AMR config for OTP enrollment execution (FIXED 2026-02-14):
# Uses "default.reference.value" (not "reference") per Keycloak 26.5 AmrUtils.java
resource "keycloak_authentication_execution_config" "browser_otp_enrollment_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form_enrollment.id
  alias        = "OTP Enrollment ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level                  = "2"     # AAL2 for OTP enrollment
    "default.reference.value"  = "otp"   # AMR reference for OTP (RFC-8176)
    "default.reference.maxAge" = "36000" # 10 hours — matches SSO session timeout
  }
}

# ============================================
# Authentication Flow Bindings
# ============================================
resource "keycloak_authentication_bindings" "classified_bindings" {
  realm_id     = var.realm_id
  browser_flow = var.use_standard_browser_flow ? "browser" : keycloak_authentication_flow.classified_browser.alias
}
