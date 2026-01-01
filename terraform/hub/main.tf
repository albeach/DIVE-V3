# DIVE V3 Hub Configuration
# Hub-in-a-Box deployment for local development and federation coordinator
# This configuration adds MFA flows to an EXISTING realm (imported via JSON)

# Data source: Import existing realm (created by Keycloak JSON import on startup)
data "keycloak_realm" "hub" {
  realm = "dive-v3-broker-usa"
}

# Data source: Get broker client for protocol mapper configuration
data "keycloak_openid_client" "broker_client" {
  realm_id  = data.keycloak_realm.hub.id
  client_id = "dive-v3-client-broker-usa"
}

# MFA Module: Add clearance-based authentication flows
module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = data.keycloak_realm.hub.id
  realm_name         = "dive-v3-broker-usa"
  realm_display_name = "DIVE V3 - Hub"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}

# Set browser flow to the MFA flow using kcadm.sh (since realm already exists)
resource "null_resource" "set_browser_flow" {
  provisioner "local-exec" {
    command = <<-EOT
      docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin \
        --password "${var.keycloak_admin_password}" >/dev/null 2>&1 && \
      docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh update realms/dive-v3-broker-usa \
        -s browserFlow="${module.mfa.browser_flow_alias}" >/dev/null 2>&1
    EOT
  }

  depends_on = [module.mfa]

  triggers = {
    flow_alias = module.mfa.browser_flow_alias
  }
}

# Outputs
output "realm_id" {
  value       = data.keycloak_realm.hub.id
  description = "Hub realm ID"
}

output "browser_flow_alias" {
  value       = module.mfa.browser_flow_alias
  description = "Classified Access Browser Flow alias"
}

output "mfa_enabled" {
  value       = true
  description = "MFA flows deployed successfully"
}

