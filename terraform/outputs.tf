output "realm_id" {
  description = "The ID of the DIVE V3 broker realm (v2.0.0 multi-realm)"
  value       = keycloak_realm.dive_v3_broker.id
}

output "realm_name" {
  description = "The name of the DIVE V3 broker realm (v2.0.0 multi-realm)"
  value       = keycloak_realm.dive_v3_broker.realm
}

output "client_id" {
  description = "The client ID for the Next.js application (broker realm)"
  value       = keycloak_openid_client.dive_v3_app_broker.client_id
}

output "client_secret" {
  description = "The client secret for the Next.js application (SENSITIVE)"
  value       = keycloak_openid_client.dive_v3_app_broker.client_secret
  sensitive   = true
}

output "issuer_url" {
  description = "The OIDC issuer URL for DIVE V3 (broker realm)"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3_broker.realm}"
}

output "authorization_url" {
  description = "The authorization endpoint URL (broker realm)"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3_broker.realm}/protocol/openid-connect/auth"
}

output "token_url" {
  description = "The token endpoint URL (broker realm)"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3_broker.realm}/protocol/openid-connect/token"
}

output "userinfo_url" {
  description = "The userinfo endpoint URL (broker realm)"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3_broker.realm}/protocol/openid-connect/userinfo"
}

output "jwks_uri" {
  description = "The JWKS (public keys) endpoint (broker realm)"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3_broker.realm}/protocol/openid-connect/certs"
}

output "test_user_credentials" {
  description = "Test user credentials for U.S. IdP simulation (SENSITIVE)"
  value = var.create_test_users ? {
    us_secret = {
      username  = "testuser-us"
      password  = "Password123!"
      email     = "john.doe@army.mil"
      clearance = "SECRET"
      country   = "USA"
    }
    us_confidential = {
      username  = "testuser-us-confid"
      password  = "Password123!"
      email     = "jane.smith@navy.mil"
      clearance = "CONFIDENTIAL"
      country   = "USA"
    }
    us_unclassified = {
      username  = "testuser-us-unclass"
      password  = "Password123!"
      email     = "bob.jones@contractor.mil"
      clearance = "UNCLASSIFIED"
      country   = "USA"
    }
  } : null
  sensitive = true
}

output "admin_console_url" {
  description = "Keycloak admin console URL (broker realm)"
  value       = "${var.keycloak_url}/admin/${keycloak_realm.dive_v3_broker.realm}/console/"
}

