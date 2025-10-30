# DIVE V3 - External SAML IdP Module Outputs

output "idp_alias" {
  description = "The alias of the created SAML IdP"
  value       = keycloak_saml_identity_provider.external_idp.alias
}

output "idp_internal_id" {
  description = "The internal ID of the created SAML IdP"
  value       = keycloak_saml_identity_provider.external_idp.internal_id
}

output "idp_redirect_uri" {
  description = "The redirect URI for this IdP (for external IdP configuration)"
  value       = "https://keycloak.example.com/realms/${var.realm_id}/broker/${var.idp_alias}/endpoint"
}

output "idp_entity_id" {
  description = "The entity ID used for this IdP"
  value       = keycloak_saml_identity_provider.external_idp.entity_id
}

output "idp_sso_url" {
  description = "The SSO URL for this IdP"
  value       = keycloak_saml_identity_provider.external_idp.single_sign_on_service_url
}

output "attribute_mappers" {
  description = "List of created attribute mappers"
  value = concat(
    [keycloak_attribute_importer_identity_provider_mapper.unique_id.id],
    [keycloak_attribute_importer_identity_provider_mapper.email.id],
    [keycloak_hardcoded_attribute_identity_provider_mapper.country.id],
    [for mapper in keycloak_attribute_importer_identity_provider_mapper.custom_attributes : mapper.id]
  )
}

output "idp_config_summary" {
  description = "Summary of IdP configuration for documentation"
  value = {
    alias        = keycloak_saml_identity_provider.external_idp.alias
    display_name = keycloak_saml_identity_provider.external_idp.display_name
    entity_id    = keycloak_saml_identity_provider.external_idp.entity_id
    country_code = var.country_code
    enabled      = keycloak_saml_identity_provider.external_idp.enabled
  }
}


