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
# └─ Conditional MFA Enforcement [CONDITIONAL]
#    ├─ Condition: clearance != UNCLASSIFIED [REQUIRED]
#    └─ Configure OTP [REQUIRED]

resource "keycloak_authentication_flow" "post_broker_mfa" {
  realm_id    = var.realm_id
  alias       = "Post Broker MFA - ${var.realm_display_name}"
  description = "AAL2 enforcement after first broker login"
  provider_id = "basic-flow"
}

# Step 1: Review Profile (DISABLED - auto-accept)
resource "keycloak_authentication_execution" "post_broker_review_profile" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-review-profile"
  requirement       = "DISABLED"  # Don't force profile review
}

# Step 2: Create User (REQUIRED - auto-create from IdP)
resource "keycloak_authentication_execution" "post_broker_create_user" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-create-user-if-unique"
  requirement       = "ALTERNATIVE"  # Changed from REQUIRED to ALTERNATIVE to fix first broker login
  
  depends_on = [
    keycloak_authentication_execution.post_broker_review_profile
  ]
}

# Step 2.5: Automatically link user (bypasses confirmation screen)
resource "keycloak_authentication_execution" "post_broker_auto_link" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-auto-link"
  requirement       = "ALTERNATIVE"  # Alternative to create-user
  
  depends_on = [
    keycloak_authentication_execution.post_broker_create_user
  ]
}

# Step 3: Conditional OTP Enforcement (based on clearance)
resource "keycloak_authentication_subflow" "post_broker_conditional_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  alias             = "Conditional OTP - Post Broker - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  
  depends_on = [
    keycloak_authentication_execution.post_broker_auto_link  # Changed: Wait for user to be created/linked
  ]
}

# Condition: User attribute "clearance" != "UNCLASSIFIED"
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
  alias        = "Post Broker Clearance Check - ${var.realm_display_name}"
  config = {
    attribute_name  = var.clearance_attribute_name
    attribute_value = var.clearance_attribute_value_regex
    negate          = "false"
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

# Output the flow alias for broker configuration
output "post_broker_mfa_flow_alias" {
  description = "Post broker MFA flow alias"
  value       = keycloak_authentication_flow.post_broker_mfa.alias
}

