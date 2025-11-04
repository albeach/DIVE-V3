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

