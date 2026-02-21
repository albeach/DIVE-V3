# =============================================================================
# DIVE V3 — AWS DNS Module Outputs
# =============================================================================

output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = aws_route53_zone.environment.zone_id
}

output "zone_name" {
  description = "Hosted zone name"
  value       = aws_route53_zone.environment.name
}

output "name_servers" {
  description = "Name servers for the hosted zone (delegate from parent)"
  value       = aws_route53_zone.environment.name_servers
}

output "hub_frontend_fqdn" {
  description = "Hub frontend FQDN"
  value       = aws_route53_record.hub_frontend.fqdn
}

output "hub_api_fqdn" {
  description = "Hub API FQDN"
  value       = aws_route53_record.hub_api.fqdn
}

output "hub_auth_fqdn" {
  description = "Hub Keycloak FQDN"
  value       = aws_route53_record.hub_auth.fqdn
}

output "spoke_frontend_fqdns" {
  description = "Spoke frontend FQDNs"
  value       = { for k, v in aws_route53_record.spoke_frontend : k => v.fqdn }
}
