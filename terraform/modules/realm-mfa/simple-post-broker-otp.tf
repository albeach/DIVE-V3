# ============================================================================
# Simple Post-Broker OTP Flow - THE WORKING SOLUTION
# ============================================================================
# This is the CORRECT way to enforce MFA for federated users.
#
# Key insight from Keycloak documentation:
# "The easiest way is to enforce authentication with one particular 2-factor
#  method. For example, when requesting OTP, the flow can look like this with
#  only a single authenticator configured."
#
# Source: https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login
#
# DO NOT add user creation steps (idp-create-user-if-unique, idp-auto-link)
# to this flow - those belong in the First Broker Login flow.
#
# DO NOT add conditional subflows - keep it simple.
#
# Flow Structure:
#   Simple Post-Broker OTP (basic-flow)
#   └── OTP Form (REQUIRED)
#
# That's it. One authenticator. No subflows. No conditions.
# ============================================================================

# ============================================
# Simple Post-Broker OTP Flow
# ============================================
resource "keycloak_authentication_flow" "simple_post_broker_otp" {
  realm_id    = var.realm_id
  alias       = "Simple Post-Broker OTP"
  description = "Simple OTP enforcement after broker login - THE WORKING SOLUTION"
  provider_id = "basic-flow"
}

# ============================================
# OTP Form Execution (REQUIRED)
# ============================================
# This single authenticator does everything:
# - If user has OTP configured: Prompts for OTP code
# - If user has no OTP: Prompts for OTP enrollment
resource "keycloak_authentication_execution" "simple_post_broker_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.simple_post_broker_otp.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
}

# ============================================
# ACR/AMR Config for Simple Post-Broker OTP (AAL2)
# ============================================
# CRITICAL FIX (December 2025):
# Without this config, OTP authentication in post-broker flows
# won't set ACR/AMR claims properly in the token.
resource "keycloak_authentication_execution_config" "simple_post_broker_otp_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.simple_post_broker_otp_form.id
  alias        = "Simple Post-Broker OTP ACR AMR - ${local.flow_suffix}"
  config = {
    acr_level = "1"   # AAL2 when OTP succeeds
    reference = "otp" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Outputs
# ============================================
output "simple_post_broker_otp_flow_alias" {
  description = "Alias of the Simple Post-Broker OTP flow - USE THIS for IdP postBrokerLoginFlowAlias"
  value       = keycloak_authentication_flow.simple_post_broker_otp.alias
}

output "simple_post_broker_otp_flow_id" {
  description = "ID of the Simple Post-Broker OTP flow"
  value       = keycloak_authentication_flow.simple_post_broker_otp.id
}















