# =============================================================================
# DIVE V3 — AWS Route53 DNS Module
# =============================================================================
# Manages DNS records for dev/staging environments.
#
# Creates:
#   - Hosted zone: {env}.dive25.com
#   - Hub records: hub.{env}.dive25.com, hub-api.{env}.dive25.com, auth.{env}.dive25.com
#   - Spoke records: {code}.{env}.dive25.com, {code}-api.{env}.dive25.com
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# =============================================================================
# HOSTED ZONE
# =============================================================================

resource "aws_route53_zone" "environment" {
  name    = "${var.environment}.${var.base_domain}"
  comment = "DIVE V3 ${var.environment} environment"

  tags = merge(var.tags, {
    Project     = "DIVE-V3"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# =============================================================================
# HUB DNS RECORDS
# =============================================================================

# Hub frontend: hub.{env}.dive25.com -> hub public IP
resource "aws_route53_record" "hub_frontend" {
  zone_id = aws_route53_zone.environment.zone_id
  name    = "hub.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [var.hub_public_ip]
}

# Hub API: hub-api.{env}.dive25.com -> hub public IP
resource "aws_route53_record" "hub_api" {
  zone_id = aws_route53_zone.environment.zone_id
  name    = "hub-api.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [var.hub_public_ip]
}

# Hub Keycloak: auth.{env}.dive25.com -> hub public IP
resource "aws_route53_record" "hub_auth" {
  zone_id = aws_route53_zone.environment.zone_id
  name    = "auth.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [var.hub_public_ip]
}

# =============================================================================
# SPOKE DNS RECORDS
# =============================================================================

# Spoke frontend: {code}.{env}.dive25.com -> spoke public IP
resource "aws_route53_record" "spoke_frontend" {
  for_each = var.spoke_ips

  zone_id = aws_route53_zone.environment.zone_id
  name    = "${lower(each.key)}.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [each.value]
}

# Spoke API: {code}-api.{env}.dive25.com -> spoke public IP
resource "aws_route53_record" "spoke_api" {
  for_each = var.spoke_ips

  zone_id = aws_route53_zone.environment.zone_id
  name    = "${lower(each.key)}-api.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [each.value]
}

# Spoke Keycloak: {code}-auth.{env}.dive25.com -> spoke public IP
resource "aws_route53_record" "spoke_auth" {
  for_each = var.spoke_ips

  zone_id = aws_route53_zone.environment.zone_id
  name    = "${lower(each.key)}-auth.${var.environment}.${var.base_domain}"
  type    = "A"
  ttl     = 300
  records = [each.value]
}
