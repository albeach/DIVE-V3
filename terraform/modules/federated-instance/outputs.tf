# Federated Instance Module - Outputs

output "realm_id" {
  description = "The ID of the broker realm"
  value       = keycloak_realm.broker.id
}

output "realm_name" {
  description = "The name of the broker realm"
  value       = keycloak_realm.broker.realm
}

output "client_id" {
  description = "The client ID"
  value       = keycloak_openid_client.broker_client.client_id
}

output "client_secret" {
  description = "The client secret (sensitive)"
  value       = keycloak_openid_client.broker_client.client_secret
  sensitive   = true
}

output "instance_code" {
  description = "The instance code (ISO 3166-1 alpha-3)"
  value       = var.instance_code
}

output "token_url" {
  description = "OAuth2 token endpoint URL"
  value       = "${var.idp_url}/realms/${var.realm_name}/protocol/openid-connect/token"
}

output "authorization_url" {
  description = "OAuth2 authorization endpoint URL"
  value       = "${var.idp_url}/realms/${var.realm_name}/protocol/openid-connect/auth"
}

output "userinfo_url" {
  description = "OAuth2 userinfo endpoint URL"
  value       = "${var.idp_url}/realms/${var.realm_name}/protocol/openid-connect/userinfo"
}

output "jwks_uri" {
  description = "JWKS URI for token validation"
  value       = "${var.idp_url}/realms/${var.realm_name}/protocol/openid-connect/certs"
}

output "issuer" {
  description = "Token issuer URL"
  value       = "${var.idp_url}/realms/${var.realm_name}"
}

output "incoming_federation_clients" {
  description = "Client IDs and secrets for incoming federation (partners use these to federate TO this instance)"
  value = {
    for k, v in keycloak_openid_client.incoming_federation : k => {
      client_id     = v.client_id
      client_secret = v.client_secret
    }
  }
  sensitive = true
}

