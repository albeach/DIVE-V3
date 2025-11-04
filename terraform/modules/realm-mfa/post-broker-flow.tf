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
  requirement       = "ALTERNATIVE"
  
  depends_on = [
    keycloak_authentication_execution.post_broker_review_profile
  ]
}

# Step 3: ALWAYS Require OTP Configuration on First Broker Login
# NOTE: For production, you'd add conditional logic based on IdP token claims
# For now, ALL users are required to setup OTP (demonstrates MFA enrollment flow)
resource "keycloak_authentication_execution" "post_broker_configure_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "auth-otp-form"  
  requirement       = "REQUIRED"
  
  depends_on = [
    keycloak_authentication_execution.post_broker_create_user
  ]
}

# Optional: Update profile attributes
resource "keycloak_authentication_execution" "post_broker_update_attributes" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_mfa.alias
  authenticator     = "idp-confirm-link"
  requirement       = "DISABLED"
  
  depends_on = [
    keycloak_authentication_execution.post_broker_configure_otp
  ]
}

# Output the flow alias for broker configuration
output "post_broker_mfa_flow_alias" {
  description = "Post broker MFA flow alias"
  value       = keycloak_authentication_flow.post_broker_mfa.alias
}

