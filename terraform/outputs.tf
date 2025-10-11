output "realm_id" {
  description = "The ID of the DIVE V3 realm"
  value       = keycloak_realm.dive_v3.id
}

output "realm_name" {
  description = "The name of the DIVE V3 realm"
  value       = keycloak_realm.dive_v3.realm
}

output "client_id" {
  description = "The client ID for the Next.js application"
  value       = keycloak_openid_client.dive_v3_app.client_id
}

output "client_secret" {
  description = "The client secret for the Next.js application (SENSITIVE)"
  value       = keycloak_openid_client.dive_v3_app.client_secret
  sensitive   = true
}

output "issuer_url" {
  description = "The OIDC issuer URL for DIVE V3"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3.realm}"
}

output "authorization_url" {
  description = "The authorization endpoint URL"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3.realm}/protocol/openid-connect/auth"
}

output "token_url" {
  description = "The token endpoint URL"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3.realm}/protocol/openid-connect/token"
}

output "userinfo_url" {
  description = "The userinfo endpoint URL"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3.realm}/protocol/openid-connect/userinfo"
}

output "jwks_uri" {
  description = "The JWKS (public keys) endpoint"
  value       = "${var.keycloak_url}/realms/${keycloak_realm.dive_v3.realm}/protocol/openid-connect/certs"
}

output "test_user_credentials" {
  description = "Test user credentials for U.S. IdP simulation (SENSITIVE)"
  value = var.create_test_users ? {
    us_secret = {
      username = "testuser-us"
      password = "Password123!"
      email    = "john.doe@army.mil"
      clearance = "SECRET"
      country = "USA"
    }
    us_confidential = {
      username = "testuser-us-confid"
      password = "Password123!"
      email    = "jane.smith@navy.mil"
      clearance = "CONFIDENTIAL"
      country = "USA"
    }
    us_unclassified = {
      username = "testuser-us-unclass"
      password = "Password123!"
      email    = "bob.jones@contractor.mil"
      clearance = "UNCLASSIFIED"
      country = "USA"
    }
  } : null
  sensitive = true
}

output "admin_console_url" {
  description = "Keycloak admin console URL"
  value       = "${var.keycloak_url}/admin/${keycloak_realm.dive_v3.realm}/console/"
}

