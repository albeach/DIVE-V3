# ============================================
# Shared Identity Provider Attribute Mappers
# ============================================
# DRY module for all IdP broker attribute mapping
# Phase 2: Attribute Normalization & Mapper Consolidation
#
# Implements canonical attribute schema:
# - uniqueID: Email or URN identifier (FORCE sync)
# - clearance: Normalized clearance level (FORCE sync)
# - clearanceOriginal: Original country clearance (FORCE sync, audit trail)
# - countryOfAffiliation: ISO 3166-1 alpha-3 country code (FORCE sync)
# - acpCOI: Community of Interest tags (IMPORT sync, optional)
# - dutyOrg: Organizational affiliation (FORCE sync)
# - orgUnit: Organizational unit (FORCE sync)
#
# Note: ACR/AMR are session notes, not user attributes.
# They're managed by authentication flows, not IdP mappers.

# ============================================
# uniqueID Mapper
# ============================================
# Maps email or sub claim to uniqueID user attribute
# FORCE sync: Always overwrite with latest value from IdP

resource "keycloak_custom_identity_provider_mapper" "unique_id" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = var.unique_id_claim
    "user.attribute" = "uniqueID"
  }
}

# ============================================
# clearance Mapper
# ============================================
# Maps normalized clearance level
# FORCE sync: Always sync to ensure current clearance is enforced

resource "keycloak_custom_identity_provider_mapper" "clearance" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearance"
    "user.attribute" = "clearance"
  }
}

# ============================================
# clearanceOriginal Mapper
# ============================================
# CRITICAL: Preserves original country-specific clearance
# Provides audit trail for clearance transformations
# Required for NATO ACP-240 compliance

resource "keycloak_custom_identity_provider_mapper" "clearance_original" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-clearanceOriginal-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearanceOriginal"
    "user.attribute" = "clearanceOriginal"
  }
}

# ============================================
# countryOfAffiliation Mapper
# ============================================
# Maps country code (ISO 3166-1 alpha-3)
# FORCE sync: Country affiliation is security-critical

resource "keycloak_custom_identity_provider_mapper" "country" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

# ============================================
# acpCOI Mapper (Community of Interest)
# ============================================
# Maps COI tags (NATO-COSMIC, FVEY, etc.)
# IMPORT sync: Don't overwrite user-managed COIs

resource "keycloak_custom_identity_provider_mapper" "coi" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "IMPORT" # Only set on first login, preserve user changes
    "claim"          = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

# ============================================
# dutyOrg Mapper (Organizational Affiliation)
# ============================================
# Maps organizational affiliation
# FORCE sync: Keep organizational data current

resource "keycloak_custom_identity_provider_mapper" "dutyorg" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

# ============================================
# orgUnit Mapper (Organizational Unit)
# ============================================
# Maps organizational unit
# FORCE sync: Keep organizational structure current

resource "keycloak_custom_identity_provider_mapper" "orgunit" {
  realm                    = var.realm_id
  identity_provider_alias  = var.idp_alias
  name                     = "${var.idp_prefix}-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

# ============================================
# IMPORTANT: ACR/AMR NOT INCLUDED
# ============================================
# ACR (Authentication Context Class Reference) and
# AMR (Authentication Methods Reference) are session-based
# attributes managed by authentication flows, NOT IdP mappers.
#
# They are set via:
# - Session notes in authentication flow
# - Protocol mappers (session note to token claim)
#
# Including them as IdP mappers was a previous implementation
# error that has been corrected in Phase 2.

