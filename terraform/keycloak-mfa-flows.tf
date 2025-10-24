# ============================================
# Keycloak MFA Authentication Flows
# ============================================
# AAL2 Enforcement: Conditional MFA based on clearance level
# Gap #6 Remediation - Phase 1: Use Keycloak built-in OTP
# Reference: docs/KEYCLOAK-CONFIGURATION-AUDIT.md Lines 88-93

# ============================================
# Classified Access Browser Flow (USA Realm)
# ============================================
# Enforces MFA for users with clearance >= CONFIDENTIAL

resource "keycloak_authentication_flow" "usa_classified_browser" {
  realm_id    = keycloak_realm.dive_v3_usa.id
  alias       = "Classified Access Browser Flow"
  description = "AAL2 enforcement: MFA required for CONFIDENTIAL, SECRET, TOP_SECRET clearances"
}

# Step 1: Cookie check (SSO)
resource "keycloak_authentication_execution" "usa_classified_cookie" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_flow.usa_classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

# Step 2: Conditional subflow for classified users
resource "keycloak_authentication_subflow" "usa_classified_conditional" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_flow.usa_classified_browser.alias
  alias             = "Classified User Conditional"
  requirement       = "ALTERNATIVE"
  provider_id       = "basic-flow"
}

# Step 3: Username + Password
resource "keycloak_authentication_execution" "usa_classified_username_password" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_subflow.usa_classified_conditional.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
}

# Step 4: Conditional OTP subflow (conditional execution container)
resource "keycloak_authentication_subflow" "usa_classified_otp_conditional" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_subflow.usa_classified_conditional.alias
  alias             = "Conditional OTP for Classified"
  requirement       = "CONDITIONAL"  # This makes it a conditional flow
  # provider_id is omitted for conditional flows (Keycloak sets authenticationFlow=true internally)
}

# Condition: User attribute "clearance" != "UNCLASSIFIED"
resource "keycloak_authentication_execution" "usa_classified_condition_user_attribute" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_subflow.usa_classified_otp_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

# Configuration for conditional-user-attribute
resource "keycloak_authentication_execution_config" "usa_classified_condition_config" {
  realm_id     = keycloak_realm.dive_v3_usa.id
  execution_id = keycloak_authentication_execution.usa_classified_condition_user_attribute.id
  alias        = "Classified Clearance Check"
  config = {
    # Attribute name
    attribute_name = "clearance"
    # Attribute value regex (match anything EXCEPT UNCLASSIFIED)
    attribute_value = "^(?!UNCLASSIFIED$).*"
    # Negate: false (we want to match the regex)
    negate = "false"
  }
}

# Action: Require OTP if condition passes
resource "keycloak_authentication_execution" "usa_classified_otp_form" {
  realm_id          = keycloak_realm.dive_v3_usa.id
  parent_flow_alias = keycloak_authentication_subflow.usa_classified_otp_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  # Ensure condition is created before OTP form to maintain proper execution order
  depends_on = [
    keycloak_authentication_execution.usa_classified_condition_user_attribute,
    keycloak_authentication_execution_config.usa_classified_condition_config
  ]
}

# Bind the flow to USA realm browser authentication
resource "keycloak_authentication_bindings" "usa_classified_bindings" {
  realm_id     = keycloak_realm.dive_v3_usa.id
  browser_flow = keycloak_authentication_flow.usa_classified_browser.alias
}

# ============================================
# Replicate for France Realm
# ============================================

resource "keycloak_authentication_flow" "fra_classified_browser" {
  realm_id    = keycloak_realm.dive_v3_fra.id
  alias       = "Classified Access Browser Flow - France"
  description = "AAL2 enforcement: MFA required for CONFIDENTIEL-DÉFENSE and above"
}

resource "keycloak_authentication_execution" "fra_classified_cookie" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_flow.fra_classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_subflow" "fra_classified_conditional" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_flow.fra_classified_browser.alias
  alias             = "Classified User Conditional - France"
  requirement       = "ALTERNATIVE"
  provider_id       = "basic-flow"
}

resource "keycloak_authentication_execution" "fra_classified_username_password" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_subflow.fra_classified_conditional.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_subflow" "fra_classified_otp_conditional" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_subflow.fra_classified_conditional.alias
  alias             = "Conditional OTP for Classified - France"
  requirement       = "CONDITIONAL"
  # provider_id omitted for conditional flows
}

resource "keycloak_authentication_execution" "fra_classified_condition_user_attribute" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_subflow.fra_classified_otp_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "fra_classified_condition_config" {
  realm_id     = keycloak_realm.dive_v3_fra.id
  execution_id = keycloak_authentication_execution.fra_classified_condition_user_attribute.id
  alias        = "Classified Clearance Check - France"
  config = {
    attribute_name = "clearance"
    # Match French clearances: CONFIDENTIEL-DÉFENSE, SECRET-DÉFENSE, TRÈS SECRET-DÉFENSE
    attribute_value = "^(CONFIDENTIEL-DÉFENSE|SECRET-DÉFENSE|TRÈS SECRET-DÉFENSE)$"
    negate          = "false"
  }
}

resource "keycloak_authentication_execution" "fra_classified_otp_form" {
  realm_id          = keycloak_realm.dive_v3_fra.id
  parent_flow_alias = keycloak_authentication_subflow.fra_classified_otp_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  # Ensure condition is created before OTP form to maintain proper execution order
  depends_on = [
    keycloak_authentication_execution.fra_classified_condition_user_attribute,
    keycloak_authentication_execution_config.fra_classified_condition_config
  ]
}

resource "keycloak_authentication_bindings" "fra_classified_bindings" {
  realm_id     = keycloak_realm.dive_v3_fra.id
  browser_flow = keycloak_authentication_flow.fra_classified_browser.alias
}

# ============================================
# Replicate for Canada Realm
# ============================================

resource "keycloak_authentication_flow" "can_classified_browser" {
  realm_id    = keycloak_realm.dive_v3_can.id
  alias       = "Classified Access Browser Flow - Canada"
  description = "AAL2 enforcement: MFA required for PROTECTED B and above"
}

resource "keycloak_authentication_execution" "can_classified_cookie" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_flow.can_classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_subflow" "can_classified_conditional" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_flow.can_classified_browser.alias
  alias             = "Classified User Conditional - Canada"
  requirement       = "ALTERNATIVE"
  provider_id       = "basic-flow"
}

resource "keycloak_authentication_execution" "can_classified_username_password" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_subflow.can_classified_conditional.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_subflow" "can_classified_otp_conditional" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_subflow.can_classified_conditional.alias
  alias             = "Conditional OTP for Classified - Canada"
  requirement       = "CONDITIONAL"
  # provider_id omitted for conditional flows
}

resource "keycloak_authentication_execution" "can_classified_condition_user_attribute" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_subflow.can_classified_otp_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "can_classified_condition_config" {
  realm_id     = keycloak_realm.dive_v3_can.id
  execution_id = keycloak_authentication_execution.can_classified_condition_user_attribute.id
  alias        = "Classified Clearance Check - Canada"
  config = {
    attribute_name = "clearance"
    # Match Canadian clearances: PROTECTED B, SECRET, TOP SECRET
    attribute_value = "^(PROTECTED B|SECRET|TOP SECRET)$"
    negate          = "false"
  }
}

resource "keycloak_authentication_execution" "can_classified_otp_form" {
  realm_id          = keycloak_realm.dive_v3_can.id
  parent_flow_alias = keycloak_authentication_subflow.can_classified_otp_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  # Ensure condition is created before OTP form to maintain proper execution order
  depends_on = [
    keycloak_authentication_execution.can_classified_condition_user_attribute,
    keycloak_authentication_execution_config.can_classified_condition_config
  ]
}

resource "keycloak_authentication_bindings" "can_classified_bindings" {
  realm_id     = keycloak_realm.dive_v3_can.id
  browser_flow = keycloak_authentication_flow.can_classified_browser.alias
}

# ============================================
# Replicate for Broker Realm
# ============================================
# The broker realm is the main entry point for federation
# It also needs conditional MFA to enforce AAL2 for classified users

resource "keycloak_authentication_flow" "broker_classified_browser" {
  realm_id    = keycloak_realm.dive_v3_broker.id
  alias       = "Classified Access Browser Flow - Broker"
  description = "AAL2 enforcement: MFA required for CONFIDENTIAL, SECRET, TOP_SECRET clearances"
}

resource "keycloak_authentication_execution" "broker_classified_cookie" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_flow.broker_classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_subflow" "broker_classified_conditional" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_flow.broker_classified_browser.alias
  alias             = "Classified User Conditional - Broker"
  requirement       = "ALTERNATIVE"
  provider_id       = "basic-flow"
}

resource "keycloak_authentication_execution" "broker_classified_username_password" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_classified_conditional.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_subflow" "broker_classified_otp_conditional" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_classified_conditional.alias
  alias             = "Conditional OTP for Classified - Broker"
  requirement       = "CONDITIONAL"
  # provider_id omitted for conditional flows
}

# Condition: User attribute "clearance" != "UNCLASSIFIED"
resource "keycloak_authentication_execution" "broker_classified_condition_user_attribute" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_classified_otp_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

# Configuration for conditional-user-attribute
resource "keycloak_authentication_execution_config" "broker_classified_condition_config" {
  realm_id     = keycloak_realm.dive_v3_broker.id
  execution_id = keycloak_authentication_execution.broker_classified_condition_user_attribute.id
  alias        = "Classified Clearance Check - Broker"
  config = {
    attribute_name  = "clearance"
    attribute_value = "^(?!UNCLASSIFIED$).*"
    negate          = "false"
  }
}

# Action: Require OTP if condition passes
resource "keycloak_authentication_execution" "broker_classified_otp_form" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_classified_otp_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  # Ensure condition is created before OTP form to maintain proper execution order
  depends_on = [
    keycloak_authentication_execution.broker_classified_condition_user_attribute,
    keycloak_authentication_execution_config.broker_classified_condition_config
  ]
}

# Bind both Browser and Direct Grant flows
resource "keycloak_authentication_bindings" "broker_classified_bindings" {
  realm_id         = keycloak_realm.dive_v3_broker.id
  browser_flow     = keycloak_authentication_flow.broker_classified_browser.alias
  direct_grant_flow = keycloak_authentication_flow.broker_direct_grant_with_mfa.alias
}

# ============================================
# Direct Grant Flow with MFA (Broker Realm)
# ============================================
# This flow enables our custom login form to properly trigger MFA
# when using Direct Access Grants (Resource Owner Password Credentials flow)
#
# IMPORTANT: Direct Grant flows work differently than browser flows.
# The backend (custom-login.controller.ts) pre-checks user attributes via
# Keycloak Admin API to determine if MFA is required, then:
# - If MFA required + OTP configured: sends `totp` parameter in request
# - If MFA required + OTP NOT configured: prompts user to set up OTP first
# - If MFA not required: no `totp` parameter sent
#
# When `totp` parameter is present, Keycloak validates it even though
# the OTP execution is CONDITIONAL (only validates when totp param exists)

resource "keycloak_authentication_flow" "broker_direct_grant_with_mfa" {
  realm_id    = keycloak_realm.dive_v3_broker.id
  alias       = "Direct Grant with MFA - Broker"
  description = "Direct Access Grants flow with conditional OTP support"
}

# Step 1: Validate Username
resource "keycloak_authentication_execution" "broker_direct_grant_username" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_flow.broker_direct_grant_with_mfa.alias
  authenticator     = "direct-grant-validate-username"
  requirement       = "REQUIRED"
}

# Step 2: Validate Password
resource "keycloak_authentication_execution" "broker_direct_grant_password" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_flow.broker_direct_grant_with_mfa.alias
  authenticator     = "direct-grant-validate-password"
  requirement       = "REQUIRED"
  
  depends_on = [keycloak_authentication_execution.broker_direct_grant_username]
}

# Step 3: Conditional OTP Subflow
# This subflow will only execute if the condition passes
resource "keycloak_authentication_subflow" "broker_direct_grant_conditional_otp" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_flow.broker_direct_grant_with_mfa.alias
  alias             = "Conditional OTP - Direct Grant"
  requirement       = "CONDITIONAL"
  provider_id       = "basic-flow"
  
  depends_on = [keycloak_authentication_execution.broker_direct_grant_password]
}

# Condition: Check if user has TOTP configured
# This uses "conditional-user-configured" which checks if user has OTP set up
# Unlike "conditional-user-attribute", this works reliably in Direct Grant flows
resource "keycloak_authentication_execution" "broker_direct_grant_condition_configured" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_direct_grant_conditional_otp.alias
  authenticator     = "conditional-user-configured"
  requirement       = "REQUIRED"
}

# Action: Validate OTP if user has it configured
resource "keycloak_authentication_execution" "broker_direct_grant_otp" {
  realm_id          = keycloak_realm.dive_v3_broker.id
  parent_flow_alias = keycloak_authentication_subflow.broker_direct_grant_conditional_otp.alias
  authenticator     = "direct-grant-validate-otp"
  requirement       = "REQUIRED"
  
  depends_on = [keycloak_authentication_execution.broker_direct_grant_condition_configured]
}

# ============================================
# NOTES: OTP Policy Configuration
# ============================================
# OTP policies are configured as blocks within each realm resource:
# - terraform/usa-realm.tf (lines 66-73)
# - terraform/fra-realm.tf (lines 65-72)  
# - terraform/can-realm.tf (lines 39-46)
# - terraform/broker-realm.tf (OTP policy needs to be added)
#
# Configuration:
# - Algorithm: HmacSHA256
# - Digits: 6
# - Period: 30 seconds
# - Type: TOTP (Time-Based One Time Password)
# - Look-ahead: 1 period (for clock skew tolerance)
#
# Compatible with: Google Authenticator, Authy, Microsoft Authenticator, etc.


