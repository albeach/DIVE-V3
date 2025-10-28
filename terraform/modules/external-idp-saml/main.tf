# DIVE V3 - External SAML IdP Terraform Module
# This module automates the onboarding of external SAML identity providers into Keycloak broker

terraform {
  required_version = ">= 1.0"
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Create SAML Identity Provider
resource "keycloak_saml_identity_provider" "external_idp" {
  realm        = var.realm_id
  alias        = var.idp_alias
  display_name = var.idp_display_name
  enabled      = var.enabled

  # SAML Configuration
  entity_id                      = var.idp_entity_id
  single_sign_on_service_url     = var.idp_sso_url
  single_logout_service_url      = var.idp_slo_url != "" ? var.idp_slo_url : null
  signing_certificate            = var.idp_certificate
  name_id_policy_format          = var.name_id_policy_format
  signature_algorithm            = var.signature_algorithm
  want_assertions_signed         = var.want_assertions_signed
  want_assertions_encrypted      = var.want_assertions_encrypted
  force_authn                    = var.force_authn
  post_binding_response          = true
  post_binding_authn_request     = true
  post_binding_logout            = true
  validate_signature             = true
  backchannel_supported          = false

  # User Management
  trust_email                    = var.trust_email
  store_token                    = var.store_token
  link_only                      = var.link_only
  first_broker_login_flow_alias  = var.first_broker_login_flow_alias
  post_broker_login_flow_alias   = var.post_broker_login_flow_alias != "" ? var.post_broker_login_flow_alias : null

  # Additional Configuration
  gui_order = 1
}

# Attribute Mapper: uniqueID
resource "keycloak_attribute_importer_identity_provider_mapper" "unique_id" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-uniqueID-mapper"
  identity_provider_alias = keycloak_saml_identity_provider.external_idp.alias

  attribute_friendly_name = "uid"
  user_attribute         = "uniqueID"

  extra_config = {
    syncMode = "INHERIT"
  }
}

# Attribute Mapper: Email
resource "keycloak_attribute_importer_identity_provider_mapper" "email" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-email-mapper"
  identity_provider_alias = keycloak_saml_identity_provider.external_idp.alias

  attribute_friendly_name = "mail"
  user_attribute         = "email"

  extra_config = {
    syncMode = "INHERIT"
  }
}

# Hardcoded Mapper: Country of Affiliation
resource "keycloak_hardcoded_attribute_identity_provider_mapper" "country" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-country-mapper"
  identity_provider_alias = keycloak_saml_identity_provider.external_idp.alias

  attribute_name  = "countryOfAffiliation"
  attribute_value = var.country_code
  user_session    = false

  extra_config = {
    syncMode = "INHERIT"
  }
}

# Dynamic Attribute Mappers (from variable)
resource "keycloak_attribute_importer_identity_provider_mapper" "custom_attributes" {
  for_each = var.attribute_mappings

  realm                   = var.realm_id
  name                    = "${var.idp_alias}-${each.key}-mapper"
  identity_provider_alias = keycloak_saml_identity_provider.external_idp.alias

  attribute_friendly_name = each.value.saml_attribute_name
  user_attribute          = each.value.user_attribute_name

  extra_config = {
    syncMode = each.value.sync_mode
  }
}

