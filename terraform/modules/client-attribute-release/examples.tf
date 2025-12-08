# Client Attribute Release Module
# 
# This module configures client-specific attribute release policies
# for DIVE V3 federation partners.

module "client_attribute_release" {
  source = "./modules/client-attribute-release"

  realm_id = "dive-v3-broker"
}

# Example: Assign scopes to specific clients
# (These would be created separately per SP)

# Industry client: Minimal attributes only
# resource "keycloak_openid_client_default_scopes" "industry_scopes" {
#   realm_id  = "dive-v3-broker"
#   client_id = "dive-v3-industry-client"
#
#   default_scopes = [
#     "openid",
#     "profile",
#     module.client_attribute_release.client_scopes.minimal.name,
#   ]
# }

# UK SP: Full attributes
# resource "keycloak_openid_client_default_scopes" "uk_sp_scopes" {
#   realm_id  = "dive-v3-broker"
#   client_id = "uk-coalition-portal"
#
#   default_scopes = [
#     "openid",
#     "profile",
#     "email",
#     module.client_attribute_release.client_scopes.full.name,
#   ]
# }

output "attribute_release_config" {
  description = "Client attribute release configuration"
  value       = module.client_attribute_release.client_scopes
}










