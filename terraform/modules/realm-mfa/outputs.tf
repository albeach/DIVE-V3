# ============================================
# Module Outputs
# ============================================

output "browser_flow_id" {
  description = "ID of the classified browser authentication flow"
  value       = keycloak_authentication_flow.classified_browser.id
}

output "browser_flow_alias" {
  description = "Alias of the classified browser authentication flow"
  value       = keycloak_authentication_flow.classified_browser.alias
}

output "direct_grant_flow_id" {
  description = "ID of the Direct Grant MFA flow (if enabled)"
  value       = var.enable_direct_grant_mfa ? keycloak_authentication_flow.direct_grant_mfa[0].id : null
}

output "direct_grant_flow_alias" {
  description = "Alias of the Direct Grant MFA flow (if enabled)"
  value       = var.enable_direct_grant_mfa ? keycloak_authentication_flow.direct_grant_mfa[0].alias : null
}

output "otp_conditional_flow_alias" {
  description = "Alias of the conditional OTP subflow (for reference)"
  value       = keycloak_authentication_subflow.browser_conditional_otp.alias
}

# ============================================
# Post-Broker MFA Flow Outputs (DEPRECATED - DO NOT USE)
# ============================================
# WARNING: The complex Post-Broker MFA flow with conditional subflows
# does NOT work for federated users. Use simple_post_broker_otp instead.

output "post_broker_mfa_flow_id" {
  description = "DEPRECATED - Use simple_post_broker_otp_flow_id instead"
  value       = keycloak_authentication_flow.post_broker_mfa.id
}

output "post_broker_mfa_flow_alias" {
  description = "DEPRECATED - Use simple_post_broker_otp_flow_alias instead"
  value       = keycloak_authentication_flow.post_broker_mfa.alias
}

# ============================================
# Simple Post-Broker OTP Flow Outputs (THE WORKING SOLUTION)
# ============================================
# This is the CORRECT flow for enforcing MFA on federated users.
# It contains only a single OTP Form authenticator as REQUIRED.
# See: https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login

# Note: These outputs are defined in simple-post-broker-otp.tf
# - simple_post_broker_otp_flow_alias
# - simple_post_broker_otp_flow_id