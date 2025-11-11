# ============================================
# Outputs
# ============================================

output "browser_flow_id" {
  description = "ID of the step-up browser authentication flow"
  value       = keycloak_authentication_flow.stepup_browser.id
}

output "browser_flow_alias" {
  description = "Alias of the step-up browser authentication flow"
  value       = keycloak_authentication_flow.stepup_browser.alias
}

output "acr_aal1" {
  description = "ACR value for AAL1 (password only)"
  value       = var.acr_loa_mappings["aal1"].acr_value
}

output "acr_aal2" {
  description = "ACR value for AAL2 (password + OTP)"
  value       = var.acr_loa_mappings["aal2"].acr_value
}

output "acr_aal3" {
  description = "ACR value for AAL3 (password + WebAuthn)"
  value       = var.acr_loa_mappings["aal3"].acr_value
}

