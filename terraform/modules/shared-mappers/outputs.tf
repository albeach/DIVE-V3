# ============================================
# Shared Mappers Module - Outputs
# ============================================

output "mapper_count" {
  description = "Number of mappers created"
  value       = 7 # uniqueID, clearance, clearanceOriginal, country, coi, dutyOrg, orgUnit
}

output "idp_alias" {
  description = "Identity Provider alias these mappers are attached to"
  value       = var.idp_alias
}

output "mappers" {
  description = "Map of all created mappers"
  value = {
    unique_id          = keycloak_custom_identity_provider_mapper.unique_id.id
    clearance          = keycloak_custom_identity_provider_mapper.clearance.id
    clearance_original = keycloak_custom_identity_provider_mapper.clearance_original.id
    country            = keycloak_custom_identity_provider_mapper.country.id
    coi                = keycloak_custom_identity_provider_mapper.coi.id
    dutyorg            = keycloak_custom_identity_provider_mapper.dutyorg.id
    orgunit            = keycloak_custom_identity_provider_mapper.orgunit.id
  }
}

