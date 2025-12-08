# Compatibility Layer: V1 Authorization Shim
# Package: dive.authorization
#
# This module provides BACKWARD COMPATIBILITY with the original
# monolithic fuel_inventory_abac_policy.rego interface.
#
# IMPORTANT: This is a SHIM layer that delegates to the new modular
# architecture. New integrations should use dive.authz instead.
#
# Deprecated API: POST /v1/data/dive/authorization/decision
# New API:        POST /v1/data/dive/authz/decision
#
# Migration Path:
# 1. Update PEP middleware to use dive.authz
# 2. Remove this shim after migration complete
# 3. Archive the original monolithic policy
#
# Version: 1.0.0 (SHIM)
# Last Updated: 2025-12-03

package dive.authorization

import rego.v1

# Import new modular entrypoint
import data.dive.authz

# Import ACP-240 rules for direct access to violation checks
import data.dive.org.nato.acp240

# Import base packages for constants
import data.dive.base.clearance as base_clearance
import data.dive.base.coi as base_coi
import data.dive.base.country as base_country

# ============================================
# Main Authorization Rule (V1 Compatible)
# ============================================
# Delegates to new modular implementation.

allow := authz.allow

# ============================================
# Decision Output (V1 Compatible)
# ============================================

decision := authz.decision

# ============================================
# Reason (V1 Compatible)
# ============================================

reason := authz.reason

# ============================================
# Obligations (V1 Compatible)
# ============================================

default obligations := []

obligations := authz.obligations

# ============================================
# Evaluation Details (V1 Compatible)
# ============================================

evaluation_details := authz.evaluation_details

# ============================================
# Violation Checks (V1 Compatible)
# ============================================
# These expose the individual violation check rules
# that were originally defined in the monolith.

is_not_authenticated := acp240.is_not_authenticated

is_missing_required_attributes := acp240.is_missing_required_attributes

is_insufficient_clearance := acp240.is_insufficient_clearance

is_not_releasable_to_country := acp240.is_not_releasable_to_country

is_coi_violation := acp240.is_coi_violation

is_under_embargo := acp240.is_under_embargo

is_ztdf_integrity_violation := acp240.is_ztdf_integrity_violation

is_upload_not_releasable_to_uploader := acp240.is_upload_not_releasable_to_uploader

is_authentication_strength_insufficient := acp240.is_authentication_strength_insufficient

is_mfa_not_verified := acp240.is_mfa_not_verified

is_industry_access_blocked := acp240.is_industry_access_blocked

is_coi_coherence_violation := acp240.is_coi_coherence_violation

# ============================================
# Helper Functions (V1 Compatible)
# ============================================

check_authenticated := acp240.check_authenticated

check_required_attributes := acp240.check_required_attributes

check_clearance_sufficient := acp240.check_clearance_sufficient

check_country_releasable := acp240.check_country_releasable

check_coi_satisfied := acp240.check_coi_satisfied

check_embargo_passed := acp240.check_embargo_passed

check_ztdf_integrity_valid := acp240.check_ztdf_integrity_valid

check_upload_releasability_valid := acp240.check_upload_releasability_valid

check_authentication_strength_sufficient := acp240.check_authentication_strength_sufficient

check_mfa_verified := acp240.check_mfa_verified

check_industry_access_allowed := acp240.check_industry_access_allowed

# ============================================
# Organization Type Helpers (V1 Compatible)
# ============================================

valid_org_types := acp240.valid_org_types

resolved_org_type := acp240.resolved_org_type

resolved_industry_allowed := acp240.resolved_industry_allowed

# ============================================
# AAL Level (V1 Compatible)
# ============================================

aal_level := acp240.aal_level

# ============================================
# ZTDF Status (V1 Compatible)
# ============================================

ztdf_enabled := acp240.ztdf_enabled

# ============================================
# Equivalency Helpers (V1 Compatible)
# ============================================

uses_classification_equivalency := acp240.uses_classification_equivalency

equivalency_applied := acp240.equivalency_applied

equivalency_details := acp240.equivalency_details

# ============================================
# AMR Parser (V1 Compatible)
# ============================================

parse_amr(amr_input) := acp240.parse_amr(amr_input)

# ============================================
# KAS Obligations (V1 Compatible)
# ============================================

kas_obligations := acp240.kas_obligations

# ============================================
# COI Membership Registry (V1 Compatible)
# ============================================
# Expose COI members for backward compatibility.
# New code should use dive.base.coi.coi_members instead.

coi_members := base_coi.coi_members

# ============================================
# Country Codes (V1 Compatible)
# ============================================
# Expose valid country codes for backward compatibility.
# New code should use dive.base.country.valid_country_codes instead.

valid_country_codes := base_country.valid_country_codes

# ============================================
# Clearance Levels (V1 Compatible)
# ============================================
# Expose clearance levels for backward compatibility.
# New code should use dive.base.clearance.clearance_rank instead.

clearance_levels := base_clearance.clearance_rank

# ============================================
# Classification Equivalency (V1 Compatible)
# ============================================
# These are provided for backward compatibility only.
# New code should use dive.org.nato.classification instead.

import data.dive.org.nato.classification as nato_classification

classification_equivalency := nato_classification.classification_equivalency

nato_to_dive_standard := nato_classification.nato_to_dive

dive_clearance_levels := base_clearance.clearance_rank

get_equivalency_level(classification, country) := nato_classification.get_nato_level(classification, country)

classification_equivalent(user_clearance, user_country, resource_classification, resource_country) if {
	nato_classification.is_clearance_sufficient(user_clearance, user_country, resource_classification, resource_country)
}







