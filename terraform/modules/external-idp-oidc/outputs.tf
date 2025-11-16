# DIVE V3 - External OIDC IdP Module Outputs

output "idp_alias" {
  description = "The alias of the created OIDC IdP"
  value       = keycloak_oidc_identity_provider.external_idp.alias
}

output "idp_internal_id" {
  description = "The internal ID of the created OIDC IdP"
  value       = keycloak_oidc_identity_provider.external_idp.internal_id
}

output "idp_redirect_uri" {
  description = "The redirect URI for this IdP"
  value       = "https://keycloak.example.com/realms/${var.realm_id}/broker/${var.idp_alias}/endpoint"
}

output "idp_issuer" {
  description = "The issuer for this IdP"
  value       = keycloak_oidc_identity_provider.external_idp.issuer
}

output "idp_authorization_url" {
  description = "The authorization URL for this IdP"
  value       = keycloak_oidc_identity_provider.external_idp.authorization_url
}

output "claim_mappers" {
  description = "List of created claim mappers"
  value = concat(
    [keycloak_custom_identity_provider_mapper.unique_id.id],
    [keycloak_custom_identity_provider_mapper.email.id],
    [keycloak_hardcoded_attribute_identity_provider_mapper.country.id],
    [for mapper in keycloak_custom_identity_provider_mapper.custom_claims : mapper.id]
  )
}

output "idp_config_summary" {
  description = "Summary of IdP configuration"
  value = {
    alias        = keycloak_oidc_identity_provider.external_idp.alias
    display_name = keycloak_oidc_identity_provider.external_idp.display_name
    client_id    = keycloak_oidc_identity_provider.external_idp.client_id
    country_code = var.country_code
    enabled      = keycloak_oidc_identity_provider.external_idp.enabled
    pkce_enabled = keycloak_oidc_identity_provider.external_idp.pkce_enabled
  }
}


