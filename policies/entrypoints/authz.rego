# Entrypoint: Unified Authorization API
# Package: dive.authz
#
# This is the PRIMARY entrypoint for all DIVE V3 authorization decisions.
# It provides a unified API that:
# 1. Imports from base layer (clearance, coi, country, time)
# 2. Imports from org layer (NATO classification, ACP-240 rules)
# 3. Imports from tenant layer (trusted issuers, federation)
# 4. Exports a consistent decision structure
#
# Decision Endpoint: POST /v1/data/dive/authz/decision
#
# Input Schema:
# {
#   "subject": { "uniqueID", "clearance", "countryOfAffiliation", "acpCOI", "issuer", ... },
#   "action": { "operation" },
#   "resource": { "resourceId", "classification", "releasabilityTo", "COI", ... },
#   "context": { "currentTime", "acr", "amr", "tenant", ... }
# }
#
# Output Schema:
# {
#   "allow": boolean,
#   "reason": string,
#   "obligations": array,
#   "evaluation_details": object
# }
#
# Version: 2.0.0
# Last Updated: 2025-12-03

package dive.authz

import rego.v1

# Import base layer packages
import data.dive.base.clearance as base_clearance
import data.dive.base.coi as base_coi
import data.dive.base.country as base_country
import data.dive.base.time as base_time

# Import organization layer
import data.dive.org.nato.acp240
import data.dive.org.nato.classification as nato_classification

# Import tenant layer
import data.dive.tenant.base as tenant_base

# ============================================
# Main Authorization Decision
# ============================================
# Uses fail-secure pattern: default deny, allow only when all checks pass.

default allow := false

allow if {
	# All ACP-240 checks must pass
	acp240.check_authenticated
	acp240.check_required_attributes
	acp240.check_clearance_sufficient
	acp240.check_country_releasable
	acp240.check_coi_satisfied
	acp240.check_embargo_passed
	acp240.check_ztdf_integrity_valid
	acp240.check_upload_releasability_valid
	acp240.check_authentication_strength_sufficient
	acp240.check_mfa_verified
	acp240.check_industry_access_allowed
	
	# COI coherence (set rule - must be empty)
	count(acp240.is_coi_coherence_violation) == 0
	
	# Tenant federation check (if issuer present)
	check_federation
}

# ============================================
# Federation Check
# ============================================
# Validates that the subject's issuer is trusted and can federate
# with the current tenant.

check_federation if {
	# No issuer = local auth, always allowed
	not input.subject.issuer
}

check_federation if {
	# Issuer present - validate trust
	input.subject.issuer
	tenant_base.is_from_trusted_origin
	tenant_base.subject_can_access_tenant
}

# ============================================
# Decision Output Structure
# ============================================
# Provides complete decision with reason and obligations.

decision := {
	"allow": allow,
	"reason": reason,
	"obligations": obligations,
	"evaluation_details": evaluation_details,
}

# ============================================
# Reason Determination
# ============================================
# Returns human-readable reason for the decision.
# Priority order matches ACP-240 check sequence.

reason := "Access granted - all conditions satisfied" if {
	allow
} else := msg if {
	msg := acp240.is_not_authenticated
} else := msg if {
	msg := acp240.is_missing_required_attributes
} else := msg if {
	msg := acp240.is_insufficient_clearance
} else := msg if {
	msg := acp240.is_authentication_strength_insufficient
} else := msg if {
	msg := acp240.is_mfa_not_verified
} else := msg if {
	msg := acp240.is_upload_not_releasable_to_uploader
} else := msg if {
	msg := acp240.is_not_releasable_to_country
} else := msg if {
	msg := acp240.is_coi_violation
} else := msg if {
	msg := acp240.is_under_embargo
} else := msg if {
	msg := acp240.is_ztdf_integrity_violation
} else := msg if {
	msg := acp240.is_industry_access_blocked
} else := msg if {
	# COI coherence violations
	count(acp240.is_coi_coherence_violation) > 0
	violations := acp240.is_coi_coherence_violation
	msg := concat("; ", violations)
} else := msg if {
	# Federation check
	input.subject.issuer
	not tenant_base.is_from_trusted_origin
	msg := tenant_base.untrusted_issuer_msg(input.subject.issuer)
} else := msg if {
	# Federation partner check
	input.subject.issuer
	tenant_base.is_from_trusted_origin
	not tenant_base.subject_can_access_tenant
	msg := tenant_base.federation_denied_msg(tenant_base.subject_tenant, tenant_base.current_tenant)
} else := "Access denied"

# ============================================
# Obligations
# ============================================
# Returns obligations that must be fulfilled (e.g., KAS key request).

default obligations := []

obligations := obs if {
	allow
	input.resource.encrypted == true
	obs := [o | some o in acp240.kas_obligations]
	count(obs) > 0
}

# ============================================
# Evaluation Details
# ============================================
# Provides detailed breakdown of all checks for audit/debugging.

evaluation_details := {
	"checks": {
		"authenticated": acp240.check_authenticated,
		"required_attributes": acp240.check_required_attributes,
		"clearance_sufficient": acp240.check_clearance_sufficient,
		"country_releasable": acp240.check_country_releasable,
		"coi_satisfied": acp240.check_coi_satisfied,
		"embargo_passed": acp240.check_embargo_passed,
		"ztdf_integrity_valid": acp240.check_ztdf_integrity_valid,
		"upload_releasability_valid": acp240.check_upload_releasability_valid,
		"authentication_strength_sufficient": acp240.check_authentication_strength_sufficient,
		"mfa_verified": acp240.check_mfa_verified,
		"industry_access_allowed": acp240.check_industry_access_allowed,
		"coi_coherence_violations": count(acp240.is_coi_coherence_violation),
		"federation_trusted": federation_trusted,
	},
	"subject": {
		"uniqueID": object.get(input.subject, "uniqueID", ""),
		"clearance": object.get(input.subject, "clearance", ""),
		"clearanceOriginal": object.get(input.subject, "clearanceOriginal", ""),
		"clearanceCountry": object.get(input.subject, "clearanceCountry", ""),
		"country": object.get(input.subject, "countryOfAffiliation", ""),
		"organizationType": acp240.resolved_org_type,
		"issuer": object.get(input.subject, "issuer", ""),
		"tenant": tenant_base.subject_tenant,
	},
	"resource": {
		"resourceId": object.get(input.resource, "resourceId", ""),
		"classification": object.get(input.resource, "classification", ""),
		"originalClassification": object.get(input.resource, "originalClassification", ""),
		"originalCountry": object.get(input.resource, "originalCountry", ""),
		"encrypted": object.get(input.resource, "encrypted", false),
		"ztdfEnabled": acp240.ztdf_enabled,
		"releasableToIndustry": acp240.resolved_industry_allowed,
	},
	"authentication": {
		"acr": object.get(input.context, "acr", ""),
		"amr": object.get(input.context, "amr", []),
		"aal_level": acp240.aal_level,
	},
	"tenant": {
		"current_tenant": tenant_base.current_tenant,
		"subject_tenant": tenant_base.subject_tenant,
		"can_federate": federation_trusted,
	},
	"acp240_compliance": {
		"ztdf_validation": acp240.ztdf_enabled,
		"kas_obligations": count(obligations) > 0,
		"fail_closed_enforcement": true,
		"aal2_enforced": true,
		"classification_equivalency_enabled": true,
		"equivalency_applied": acp240.equivalency_applied,
		"equivalency_details": acp240.equivalency_details,
	},
}

# Helper for federation trusted check
federation_trusted if {
	not input.subject.issuer
}

federation_trusted if {
	input.subject.issuer
	tenant_base.subject_can_access_tenant
}

default federation_trusted := false

# ============================================
# Backward Compatibility Aliases
# ============================================
# For backward compatibility with existing integrations.

# Expose ACP-240 violation checks at top level
is_not_authenticated := acp240.is_not_authenticated

is_missing_required_attributes := acp240.is_missing_required_attributes

is_insufficient_clearance := acp240.is_insufficient_clearance

is_not_releasable_to_country := acp240.is_not_releasable_to_country

is_coi_violation := acp240.is_coi_violation

is_under_embargo := acp240.is_under_embargo

is_ztdf_integrity_violation := acp240.is_ztdf_integrity_violation

is_authentication_strength_insufficient := acp240.is_authentication_strength_insufficient

is_mfa_not_verified := acp240.is_mfa_not_verified

is_industry_access_blocked := acp240.is_industry_access_blocked

is_coi_coherence_violation := acp240.is_coi_coherence_violation

is_upload_not_releasable_to_uploader := acp240.is_upload_not_releasable_to_uploader

