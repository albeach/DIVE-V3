# ============================================
# MFA Browser Authentication Flow
# ============================================
# AAL2 Enforcement: Conditional MFA based on clearance level
# Compatible with all DIVE V3 realms (USA, France, Canada, Industry)

resource "keycloak_authentication_flow" "classified_browser" {
  realm_id    = var.realm_id
  alias       = "Classified Access Browser Flow - ${var.realm_display_name}"
  description = "AAL2 enforcement: MFA required for CONFIDENTIAL, SECRET, TOP_SECRET clearances"
}

# SECURITY FIX (Oct 26, 2025): Removed SSO cookie bypass for AAL2 compliance
# The auth-cookie execution was allowing users to bypass MFA by reusing SSO sessions
# For TOP_SECRET clearance, AAL2 requires MFA on EVERY authentication (NIST SP 800-63B)
# 
# PREVIOUS DESIGN (INSECURE):
# ├─ Cookie (SSO) [ALTERNATIVE] ← Would bypass MFA if session exists!
# └─ Classified User Conditional [ALTERNATIVE]
#
# NEW DESIGN (SECURE):
# └─ Classified User Conditional [REQUIRED] ← Always requires authentication + MFA check

# Step 1: Conditional subflow for classified users (REQUIRED - no SSO bypass)
resource "keycloak_authentication_subflow" "classified_conditional" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  alias             = "Classified User Conditional - ${var.realm_display_name}"
  requirement       = "REQUIRED"  # Changed from ALTERNATIVE to prevent SSO bypass
  provider_id       = "basic-flow"
}

# Step 3: Username + Password
resource "keycloak_authentication_execution" "classified_username_password" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.classified_conditional.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
}

# Step 4: Conditional OTP subflow (conditional execution container)
resource "keycloak_authentication_subflow" "classified_otp_conditional" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.classified_conditional.alias
  alias             = "Conditional OTP for Classified - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"  # This makes it a conditional flow
  # provider_id is omitted for conditional flows (Keycloak sets authenticationFlow=true internally)
}

# Condition: User attribute "clearance" != "UNCLASSIFIED"
resource "keycloak_authentication_execution" "classified_condition_user_attribute" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.classified_otp_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

# Configuration for conditional-user-attribute
resource "keycloak_authentication_execution_config" "classified_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.classified_condition_user_attribute.id
  alias        = "Classified Clearance Check - ${var.realm_display_name}"
  config = {
    # Attribute name
    attribute_name = var.clearance_attribute_name
    # Attribute value regex (match anything EXCEPT UNCLASSIFIED)
    attribute_value = var.clearance_attribute_value_regex
    # Negate: false (we want to match the regex)
    negate = "false"
  }
}

# Action: Require OTP if condition passes
resource "keycloak_authentication_execution" "classified_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.classified_otp_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  # Ensure condition is created before OTP form to maintain proper execution order
  depends_on = [
    keycloak_authentication_execution.classified_condition_user_attribute,
    keycloak_authentication_execution_config.classified_condition_config
  ]
}

# Bind the flow to realm browser authentication
resource "keycloak_authentication_bindings" "classified_bindings" {
  realm_id     = var.realm_id
  browser_flow = keycloak_authentication_flow.classified_browser.alias
}

