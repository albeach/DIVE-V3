# Organization Layer: ACP-240 ABAC Rules
# Package: dive.org.nato.acp240
#
# NATO ACP-240 Data-Centric Security Policy Rules
# Implements: ABAC authorization for coalition operations
#
# ACP-240 Core Principles:
# 1. Data-centric security (protect the data, not the network)
# 2. Attribute-based access control (ABAC)
# 3. Policy-based enforcement
# 4. Coalition interoperability
#
# Reference: ACP-240, STANAG 4774/5636, ADatP-5663
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.org.nato.acp240

import rego.v1

import data.dive.base.clearance
import data.dive.base.coi
import data.dive.base.country
import data.dive.base.time
import data.dive.org.nato.classification

# ============================================
# ACP-240 Section 4.1: Authentication Check
# ============================================
# Subjects must be authenticated before any authorization decision.

is_not_authenticated := msg if {
	not input.subject.authenticated
	msg := "Subject is not authenticated"
}

check_authenticated if {
	not is_not_authenticated
} else := false

# ============================================
# ACP-240 Section 4.2: Required Attributes
# ============================================
# Validates presence of mandatory attributes per ACP-240.
# Uses else-chain to return first matching error (avoids OPA conflict).

is_missing_required_attributes := msg if {
	not input.subject.uniqueID
	msg := "Missing required attribute: uniqueID"
} else := msg if {
	input.subject.uniqueID == ""
	msg := "Empty uniqueID is not allowed"
} else := msg if {
	not input.subject.clearance
	msg := "Missing required attribute: clearance"
} else := msg if {
	input.subject.clearance == ""
	msg := "Empty clearance is not allowed"
} else := msg if {
	not input.subject.countryOfAffiliation
	msg := "Missing required attribute: countryOfAffiliation"
} else := msg if {
	input.subject.countryOfAffiliation == ""
	msg := "Empty countryOfAffiliation is not allowed"
} else := msg if {
	not input.resource.classification
	msg := "Missing required attribute: resource.classification"
} else := msg if {
	not input.resource.releasabilityTo
	msg := "Missing required attribute: resource.releasabilityTo"
} else := msg if {
	input.resource.releasabilityTo == null
	msg := "Null releasabilityTo is not allowed"
} else := msg if {
	# Validate country codes
	input.subject.countryOfAffiliation
	input.subject.countryOfAffiliation != ""
	not country.is_valid(input.subject.countryOfAffiliation)
	msg := sprintf("Invalid country code: %s (must be ISO 3166-1 alpha-3)", [input.subject.countryOfAffiliation])
} else := msg if {
	country.is_valid(input.subject.countryOfAffiliation)
	input.resource.releasabilityTo
	count(input.resource.releasabilityTo) > 0
	invalid := country.invalid_countries(input.resource.releasabilityTo)
	count(invalid) > 0
	msg := sprintf("Invalid country codes in releasabilityTo: %v", [invalid])
}

check_required_attributes if {
	not is_missing_required_attributes
} else := false

# ============================================
# ACP-240 Section 4.3: Clearance Check
# ============================================
# Verifies subject clearance meets resource classification.
# Supports both national and NATO standard classifications.

# Check if classification equivalency is being used
uses_classification_equivalency if {
	input.subject.clearanceOriginal
	input.subject.clearanceCountry
	input.resource.originalClassification
	input.resource.originalCountry
	input.subject.clearanceOriginal != null
	input.subject.clearanceCountry != null
	input.resource.originalClassification != null
	input.resource.originalCountry != null
}

# Uses else-chain to return first matching error (avoids OPA conflict).
# Clearance check with classification equivalency (cross-nation)
is_insufficient_clearance := msg if {
	uses_classification_equivalency
	not classification.is_clearance_sufficient(
		input.subject.clearanceOriginal,
		input.subject.clearanceCountry,
		input.resource.originalClassification,
		input.resource.originalCountry,
	)
	msg := classification.insufficient_clearance_msg(
		input.subject.clearanceOriginal,
		input.subject.clearanceCountry,
		input.resource.originalClassification,
		input.resource.originalCountry,
	)
} else := msg if {
	# Fallback: User has localized clearance but resource uses NATO standard classification
	# Normalize user's clearance to DIVE V3 standard and compare
	not uses_classification_equivalency
	input.subject.clearanceCountry
	normalized_user_clearance := classification.get_dive_level(input.subject.clearance, input.subject.clearanceCountry)
	normalized_user_clearance != null  # Normalization succeeded
	not clearance.sufficient(normalized_user_clearance, input.resource.classification)
	msg := sprintf("Insufficient clearance: user has %s (%s normalized), resource requires %s",
		[input.subject.clearance, normalized_user_clearance, input.resource.classification])
} else := msg if {
	# User has clearanceCountry but clearance is not in known mapping - deny
	not uses_classification_equivalency
	input.subject.clearanceCountry
	normalized_user_clearance := classification.get_dive_level(input.subject.clearance, input.subject.clearanceCountry)
	normalized_user_clearance == null
	msg := sprintf("Invalid clearance level: %s not recognized for country %s",
		[input.subject.clearance, input.subject.clearanceCountry])
} else := msg if {
	# Clearance check with DIVE V3 standard levels (backward compatibility)
	not uses_classification_equivalency
	not input.subject.clearanceCountry  # No localization info, use direct comparison
	not clearance.sufficient(input.subject.clearance, input.resource.classification)
	msg := clearance.insufficient_clearance_msg(input.subject.clearance, input.resource.classification)
} else := msg if {
	# Validate clearance level - only when no clearanceCountry for normalization
	not uses_classification_equivalency
	not input.subject.clearanceCountry
	not clearance.is_valid(input.subject.clearance)
	msg := clearance.invalid_clearance_msg(input.subject.clearance)
} else := msg if {
	# Validate classification level
	not uses_classification_equivalency
	not clearance.is_valid(input.resource.classification)
	msg := clearance.invalid_clearance_msg(input.resource.classification)
}

check_clearance_sufficient if {
	not is_insufficient_clearance
} else := false

# ============================================
# ACP-240 Section 4.4: Releasability Check
# ============================================
# Verifies subject's country is in resource releasabilityTo.

# Uses else-chain to return first matching error (avoids OPA conflict).
is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) == 0
	msg := "Resource releasabilityTo is empty (deny all)"
} else := msg if {
	count(input.resource.releasabilityTo) > 0
	user_country := input.subject.countryOfAffiliation
	not user_country in input.resource.releasabilityTo
	msg := sprintf("Country %s not in releasabilityTo: %v", [
		user_country,
		input.resource.releasabilityTo,
	])
}

check_country_releasable if {
	not is_not_releasable_to_country
} else := false

# ============================================
# ACP-240 Section 4.5: COI (Community of Interest) Check
# ============================================
# Validates COI membership requirements.

# Uses else-chain to return first matching error (avoids OPA conflict).
is_coi_violation := msg if {
	# US-ONLY requires exact match
	"US-ONLY" in input.resource.COI
	user_coi := object.get(input.subject, "acpCOI", [])
	not user_coi == ["US-ONLY"]
	msg := sprintf("Resource requires US-ONLY COI. User has COI: %v", [user_coi])
} else := msg if {
	count(input.resource.COI) > 0
	user_coi := object.get(input.subject, "acpCOI", [])
	count(user_coi) > 0 # User has COI tags
	operator := object.get(input.resource, "coiOperator", "ALL")
	operator == "ALL"
	not coi.has_access_all(user_coi, input.resource.COI)
	msg := sprintf("COI operator=ALL: user COI %v does not satisfy resource COI %v", [
		user_coi,
		input.resource.COI,
	])
} else := msg if {
	count(input.resource.COI) > 0
	user_coi := object.get(input.subject, "acpCOI", [])
	count(user_coi) > 0
	operator := object.get(input.resource, "coiOperator", "ALL")
	operator == "ANY"
	not coi.has_access_any(user_coi, input.resource.COI)
	msg := sprintf("COI operator=ANY: user COI %v does not intersect resource COI %v", [
		user_coi,
		input.resource.COI,
	])
}

check_coi_satisfied if {
	not is_coi_violation
} else := false

# ============================================
# ACP-240 Section 4.6: Embargo Check
# ============================================
# Verifies resource is not under time-based embargo.

is_under_embargo := msg if {
	input.resource.creationDate
	input.context.currentTime
	time.is_under_embargo(input.resource.creationDate, input.context.currentTime)
	msg := time.embargo_msg(input.resource.creationDate, input.context.currentTime)
}

check_embargo_passed if {
	not is_under_embargo
} else := false

# ============================================
# ACP-240 Section 4.7: ZTDF Integrity (STANAG 4778)
# ============================================
# Validates Zero Trust Data Format integrity binding.

# Uses else-chain to return first matching error (avoids OPA conflict).
is_ztdf_integrity_violation := msg if {
	input.resource.ztdf
	input.resource.ztdf.integrityValidated == false
	msg := "ZTDF integrity validation failed (cryptographic binding compromised)"
} else := msg if {
	input.resource.ztdf
	not input.resource.ztdf.policyHash
	msg := "ZTDF policy hash missing (STANAG 4778 binding required)"
} else := msg if {
	input.resource.ztdf
	input.resource.ztdf.policyHash
	not input.resource.ztdf.payloadHash
	msg := "ZTDF payload hash missing (integrity protection required)"
} else := msg if {
	input.resource.ztdf
	input.resource.ztdf.policyHash
	input.resource.ztdf.payloadHash
	not input.resource.ztdf.integrityValidated
	msg := "ZTDF integrity not validated (STANAG 4778 binding required)"
}

check_ztdf_integrity_valid if {
	not is_ztdf_integrity_violation
} else := false

# ============================================
# ACP-240 Section 4.8: AAL Enforcement (NIST SP 800-63B)
# ============================================
# Enforces Authentication Assurance Level requirements.

# Parse AMR (Authentication Methods Reference)
parse_amr(amr_input) := parsed if {
	is_array(amr_input)
	parsed := amr_input
} else := parsed if {
	is_string(amr_input)
	parsed := json.unmarshal(amr_input)
	is_array(parsed)
} else := [amr_input] if {
	is_string(amr_input)
} else := []

is_authentication_strength_insufficient := msg if {
	input.resource.classification != "UNCLASSIFIED"
	input.context.acr
	acr_str := sprintf("%v", [input.context.acr])
	acr_lower := lower(acr_str)
	# AAL2 indicators
	not contains(acr_lower, "silver")
	not contains(acr_lower, "gold")
	not contains(acr_lower, "aal2")
	not contains(acr_lower, "multi-factor")
	acr_str != "1"
	acr_str != "2"
	acr_str != "3"
	# Fallback: Check AMR for 2+ factors
	amr_factors := parse_amr(input.context.amr)
	count(amr_factors) < 2
	msg := sprintf("Classification %v requires AAL2, but ACR='%v' and only %v factor(s)", [
		input.resource.classification,
		acr_str,
		count(amr_factors),
	])
}

is_mfa_not_verified := msg if {
	input.resource.classification != "UNCLASSIFIED"
	input.context.amr
	amr_factors := parse_amr(input.context.amr)
	count(amr_factors) < 2
	msg := sprintf("MFA required for %v: need 2+ factors, got %v", [
		input.resource.classification,
		count(amr_factors),
	])
}

check_authentication_strength_sufficient if {
	not is_authentication_strength_insufficient
} else := false

check_mfa_verified if {
	not is_mfa_not_verified
} else := false

# ============================================
# ACP-240 Section 4.9: Upload Releasability
# ============================================
# Uploaded resource must be releasable to uploader's country.

is_upload_not_releasable_to_uploader := msg if {
	input.action.operation == "upload"
	count(input.resource.releasabilityTo) > 0
	not input.subject.countryOfAffiliation in input.resource.releasabilityTo
	msg := sprintf("Upload releasabilityTo must include uploader country: %s", [input.subject.countryOfAffiliation])
}

check_upload_releasability_valid if {
	not is_upload_not_releasable_to_uploader
} else := false

# ============================================
# ACP-240 Section 4.10: Industry Access Control
# ============================================
# Industry partners may have restricted access to government-only resources.

valid_org_types := {"GOV", "MIL", "INDUSTRY"}

resolved_org_type := org_type if {
	org_type := input.subject.organizationType
	valid_org_types[org_type]
} else := "GOV"

resolved_industry_allowed := allowed if {
	allowed := input.resource.releasableToIndustry
	is_boolean(allowed)
} else := false

is_industry_access_blocked := msg if {
	resolved_org_type == "INDUSTRY"
	not resolved_industry_allowed
	msg := sprintf("Industry access denied: organizationType=%s but resource.releasableToIndustry=%v", [
		resolved_org_type,
		object.get(input.resource, "releasableToIndustry", "not set"),
	])
}

check_industry_access_allowed if {
	not is_industry_access_blocked
} else := false

# ============================================
# ACP-240 Section 4.9: Industry Clearance Cap
# ============================================
# Phase 3: Enforces per-tenant maximum classification for industry users.
# Industry users may have government clearances but are capped based on
# their country of affiliation's policy for industry access.
#
# This implements the DIVE V3 requirement that industry users cannot
# access resources above their tenant's industry_max_classification level.

# Clearance level hierarchy (higher number = higher clearance)
clearance_hierarchy := {
	"UNCLASSIFIED": 0,
	"RESTRICTED": 1,
	"CONFIDENTIAL": 2,
	"SECRET": 3,
	"TOP_SECRET": 4,
}

# Get numeric clearance level
get_clearance_level(clearance) := level if {
	level := clearance_hierarchy[clearance]
} else := 0

# Look up industry max classification for a tenant
# Uses imported tenant_configs data
get_industry_max_classification(tenant_code) := max_class if {
	data.tenant_configs
	tenant_cfg := data.tenant_configs[tenant_code]
	max_class := tenant_cfg.industry_max_classification
} else := max_class if {
	# Fallback: check tenant-specific data files
	data.tenant_config
	max_class := data.tenant_config.industry_max_classification
} else := "CONFIDENTIAL" # Default cap for industry if not configured

# Check if industry user exceeds clearance cap
is_industry_clearance_exceeded := msg if {
	# Only applies to industry users
	resolved_org_type == "INDUSTRY"

	# Get user's country
	user_country := input.subject.countryOfAffiliation

	# Get industry max classification for this tenant
	max_class := get_industry_max_classification(user_country)

	# Get resource classification
	resource_class := input.resource.classification

	# Get numeric levels
	resource_level := get_clearance_level(resource_class)
	max_level := get_clearance_level(max_class)

	# Check if resource exceeds industry cap
	resource_level > max_level

	msg := sprintf("Industry clearance cap exceeded: resource=%s (%d) > tenant %s max=%s (%d)", [
		resource_class,
		resource_level,
		user_country,
		max_class,
		max_level,
	])
}

check_industry_clearance_cap_ok if {
	not is_industry_clearance_exceeded
} else := false

# ============================================
# COI Coherence Checks (Advanced)
# ============================================
# Validates COI assignment coherence per ACP-240.

is_coi_coherence_violation contains msg if {
	"US-ONLY" in input.resource.COI
	some x in input.resource.COI
	x != "US-ONLY"
	msg := sprintf("COI US-ONLY cannot be combined with foreign-sharing COIs: %s", [x])
}

is_coi_coherence_violation contains msg if {
	"EU-RESTRICTED" in input.resource.COI
	some x in input.resource.COI
	x == "NATO-COSMIC"
	msg := "COI EU-RESTRICTED cannot be combined with NATO-COSMIC"
}

is_coi_coherence_violation contains msg if {
	"EU-RESTRICTED" in input.resource.COI
	some x in input.resource.COI
	x == "US-ONLY"
	msg := "COI EU-RESTRICTED cannot be combined with US-ONLY"
}

# RELAXED: Releasability ⊆ COI check (ACP-240 Section 4.7 - Explicit Release)
#
# The strict interpretation (releasabilityTo ⊆ COI_members) has been relaxed.
# Rationale: releasabilityTo is the AUTHORITATIVE list of approved recipients.
# COI indicates the originating community, but explicit release overrides.
#
# Example: COI: ["FVEY"] + releasabilityTo: ["ROU", "USA"] means
#          "FVEY-relevant content with explicit approval to share with Romania"
#
# To enforce strict mode, enable input.context.strict_coi_coherence = true
is_coi_coherence_violation contains msg if {
	# Only enforce in strict mode
	input.context.strict_coi_coherence == true
	count(input.resource.COI) > 0
	union := {c | some coi_name in input.resource.COI; some c in coi.members(coi_name)}
	some r in input.resource.releasabilityTo
	not r in union
	msg := sprintf("[STRICT] Releasability country %s not in COI union %v", [r, union])
}

# Informational warning (does not block access)
coi_extended_release_warning := warning if {
	count(input.resource.COI) > 0
	union := {c | some coi_name in input.resource.COI; some c in coi.members(coi_name)}
	extended := {r | some r in input.resource.releasabilityTo; not r in union}
	count(extended) > 0
	warning := sprintf("Explicit release beyond COI: %v extended to %v", [input.resource.COI, extended])
}

# NOFORN caveat enforcement
is_coi_coherence_violation contains msg if {
	input.resource.caveats
	"NOFORN" in input.resource.caveats
	count(input.resource.COI) != 1
	msg := "NOFORN caveat requires COI=[US-ONLY] (single COI)"
}

is_coi_coherence_violation contains msg if {
	input.resource.caveats
	"NOFORN" in input.resource.caveats
	count(input.resource.COI) == 1
	input.resource.COI[0] != "US-ONLY"
	msg := "NOFORN caveat requires COI=[US-ONLY]"
}

is_coi_coherence_violation contains msg if {
	input.resource.caveats
	"NOFORN" in input.resource.caveats
	count(input.resource.releasabilityTo) != 1
	msg := "NOFORN caveat requires releasabilityTo=[USA] (single country)"
}

is_coi_coherence_violation contains msg if {
	input.resource.caveats
	"NOFORN" in input.resource.caveats
	count(input.resource.releasabilityTo) == 1
	input.resource.releasabilityTo[0] != "USA"
	msg := "NOFORN caveat requires releasabilityTo=[USA]"
}

# Subset/superset checks (ANY operator)
is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"CAN-US" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [CAN-US, FVEY] invalid with ANY semantics"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"GBR-US" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [GBR-US, FVEY] invalid with ANY semantics"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"AUKUS" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [AUKUS, FVEY] invalid with ANY semantics"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"NATO-COSMIC" in input.resource.COI
	"NATO" in input.resource.COI
	msg := "Subset+superset COIs [NATO-COSMIC, NATO] invalid with ANY semantics"
}

# ============================================
# KAS Obligations
# ============================================
# Generate obligations for encrypted resources.

kas_obligations contains obligation if {
	input.resource.encrypted == true
	obligation := {
		"type": "kas",
		"action": "request_key",
		"resourceId": input.resource.resourceId,
		"kaoId": sprintf("kao-%s", [input.resource.resourceId]),
		"kasEndpoint": object.get(input.resource, "kasUrl", "http://localhost:8080/request-key"),
		"reason": "Encrypted resource requires KAS key release",
		"policyContext": {
			"clearanceRequired": input.resource.classification,
			"countriesAllowed": input.resource.releasabilityTo,
			"coiRequired": object.get(input.resource, "COI", []),
		},
	}
}

# ============================================
# AAL Level Derivation
# ============================================
# Derives AAL level from ACR/AMR claims.
# Uses else chaining to avoid multiple outputs.

aal_level := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	contains(acr_lower, "gold")
} else := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_str := sprintf("%v", [acr])
	acr_str == "2"
} else := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_str := sprintf("%v", [acr])
	acr_str == "3"
} else := "AAL2" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	contains(acr_lower, "silver")
} else := "AAL2" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	contains(acr_lower, "aal2")
} else := "AAL2" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	contains(acr_lower, "multi-factor")
} else := "AAL2" if {
	acr := object.get(input.context, "acr", "")
	acr_str := sprintf("%v", [acr])
	acr_str == "1"
} else := "AAL2" if {
	amr := object.get(input.context, "amr", [])
	amr_factors := parse_amr(amr)
	count(amr_factors) >= 2
} else := "AAL1"

# ============================================
# ZTDF Status Helper
# ============================================

ztdf_enabled if {
	input.resource.ztdf
} else := false

# ============================================
# Equivalency Applied Helper
# ============================================

equivalency_applied if {
	uses_classification_equivalency
} else if {
	# Fallback normalization: user has clearanceCountry and clearance was normalized
	not uses_classification_equivalency
	input.subject.clearanceCountry
	classification.get_dive_level(input.subject.clearance, input.subject.clearanceCountry) != null
} else := false

equivalency_details := details if {
	equivalency_applied
	details := {
		"user_clearance_original": input.subject.clearanceOriginal,
		"user_clearance_country": input.subject.clearanceCountry,
		"user_clearance_nato": input.subject.clearance,
		"resource_classification_original": input.resource.originalClassification,
		"resource_classification_country": input.resource.originalCountry,
		"resource_classification_nato": input.resource.classification,
	}
} else := {}
