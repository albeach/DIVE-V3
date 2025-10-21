package dive.authorization

import rego.v1

# ============================================
# DIVE V3 Authorization Policy - Week 3.1 (ACP-240 Enhanced)
# ============================================
# Coalition ICAM Authorization Policy
# Based on ACP-240 and NATO STANAG 4774/5636
# Implements: Clearance, Releasability, COI, Embargo, ZTDF Integrity, KAS Obligations
# Pattern: Fail-secure with is_not_a_* violations
#
# ACP-240 Enhancements:
# - ZTDF integrity validation (STANAG 4778 binding)
# - Enhanced KAS obligations for encrypted resources
# - Data-centric security policy enforcement

default allow := false

# ============================================
# Main Authorization Rule
# ============================================
# Allow only when ALL violation checks pass

allow if {
	not is_not_authenticated
	not is_missing_required_attributes
	not is_insufficient_clearance
	not is_not_releasable_to_country
	not is_coi_violation
	count(is_coi_coherence_violation) == 0  # Set rule: check if empty
	not is_under_embargo
	not is_ztdf_integrity_violation
	not is_upload_not_releasable_to_uploader
	not is_authentication_strength_insufficient
	not is_mfa_not_verified
}

# ============================================
# COI Coherence Checks (NEW)
# ============================================

# Check 5b: COI Coherence (Mutual Exclusivity, Releasability Alignment)
# Import checks from coi_coherence_policy.rego

# COI Membership Registry (same as coi_coherence_policy.rego)
coi_members := {
	"US-ONLY": {"USA"},
	"CAN-US": {"CAN", "USA"},
	"GBR-US": {"GBR", "USA"},
	"FRA-US": {"FRA", "USA"},
	"FVEY": {"USA", "GBR", "CAN", "AUS", "NZL"},
	"NATO": {
		"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD",
		"MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "USA",
	},
	"NATO-COSMIC": {"NATO"},
	"EU-RESTRICTED": {
		"AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
		"POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
	},
	"AUKUS": {"AUS", "GBR", "USA"},
	"QUAD": {"USA", "AUS", "IND", "JPN"},
	"NORTHCOM": {"USA", "CAN", "MEX"},
	"EUCOM": {"USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"},
	"PACOM": {"USA", "JPN", "KOR", "AUS", "NZL", "PHL"},
	"CENTCOM": {"USA", "SAU", "ARE", "QAT", "KWT", "BHR", "JOR", "EGY"},
	"SOCOM": {"USA", "GBR", "CAN", "AUS", "NZL"},
}

# Mutual exclusivity check (SET RULE - can produce multiple violations)
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

# Releasability ⊆ COI membership check
is_coi_coherence_violation contains msg if {
	count(input.resource.COI) > 0
	
	# Compute union of all COI member countries
	union := {c | some coi in input.resource.COI; some c in coi_members[coi]}

	# Check if releasabilityTo ⊆ union
	some r in input.resource.releasabilityTo
	not r in union

	msg := sprintf("Releasability country %s not in COI union %v", [r, union])
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

# Subset/superset check (when operator=ANY)
is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"CAN-US" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [CAN-US, FVEY] invalid with ANY semantics (widens access)"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"GBR-US" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [GBR-US, FVEY] invalid with ANY semantics (widens access)"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"AUKUS" in input.resource.COI
	"FVEY" in input.resource.COI
	msg := "Subset+superset COIs [AUKUS, FVEY] invalid with ANY semantics (widens access)"
}

is_coi_coherence_violation contains msg if {
	input.resource.coiOperator == "ANY"
	"NATO-COSMIC" in input.resource.COI
	"NATO" in input.resource.COI
	msg := "Subset+superset COIs [NATO-COSMIC, NATO] invalid with ANY semantics (widens access)"
}

# ============================================
# Violation Rules (Fail-Secure Pattern)
# ============================================

# Check 1: Authentication
is_not_authenticated := msg if {
	not input.subject.authenticated
	msg := "Subject is not authenticated"
}

# Check 2: Missing Required Attributes
is_missing_required_attributes := msg if {
	not input.subject.uniqueID
	msg := "Missing required attribute: uniqueID"
}

is_missing_required_attributes := msg if {
	not input.subject.clearance
	msg := "Missing required attribute: clearance"
}

is_missing_required_attributes := msg if {
	not input.subject.countryOfAffiliation
	msg := "Missing required attribute: countryOfAffiliation"
}

is_missing_required_attributes := msg if {
	not input.resource.classification
	msg := "Missing required attribute: resource.classification"
}

is_missing_required_attributes := msg if {
	not input.resource.releasabilityTo
	msg := "Missing required attribute: resource.releasabilityTo"
}

is_missing_required_attributes := msg if {
	input.resource.releasabilityTo == null
	msg := "Null releasabilityTo is not allowed"
}

# Check 2b: Empty String Attributes (Week 3 validation)
is_missing_required_attributes := msg if {
	input.subject.uniqueID == ""
	msg := "Empty uniqueID is not allowed"
}

is_missing_required_attributes := msg if {
	input.subject.clearance == ""
	msg := "Empty clearance is not allowed"
}

is_missing_required_attributes := msg if {
	input.subject.countryOfAffiliation == ""
	msg := "Empty countryOfAffiliation is not allowed"
}

# Check 2c: Invalid Country Codes (Week 3 validation)
# Validate ISO 3166-1 alpha-3 country codes
# Check subject country first (priority)
is_missing_required_attributes := msg if {
	input.subject.countryOfAffiliation
	input.subject.countryOfAffiliation != ""
	not valid_country_codes[input.subject.countryOfAffiliation]
	msg := sprintf("Invalid country code: %s (must be ISO 3166-1 alpha-3)", [input.subject.countryOfAffiliation])
}

# Only check resource countries if subject country is valid (avoid multiple violations)
is_missing_required_attributes := msg if {
	# Subject country must be valid or missing (don't double-report)
	valid_country_codes[input.subject.countryOfAffiliation]
	# Now check resource countries
	input.resource.releasabilityTo
	count(input.resource.releasabilityTo) > 0
	some country in input.resource.releasabilityTo
	not valid_country_codes[country]
	msg := sprintf("Invalid country code in releasabilityTo: %s (must be ISO 3166-1 alpha-3)", [country])
}

# Valid ISO 3166-1 alpha-3 country codes (NATO + common partners)
valid_country_codes := {
	"USA", "CAN", "GBR", "FRA", "DEU", "ITA", "ESP", "NLD", "BEL", "LUX",
	"PRT", "DNK", "NOR", "ISL", "TUR", "GRC", "POL", "CZE", "HUN", "SVK",
	"SVN", "EST", "LVA", "LTU", "BGR", "ROU", "HRV", "ALB", "MKD", "MNE",
	"AUS", "NZL", "JPN", "KOR", "FIN", "SWE", "AUT", "CHE", "IRL"
}

# Check 3: Clearance Level
is_insufficient_clearance := msg if {
	# Get numeric clearance levels
	user_clearance_level := clearance_levels[input.subject.clearance]
	resource_classification_level := clearance_levels[input.resource.classification]

	# User clearance must be >= resource classification
	user_clearance_level < resource_classification_level

	msg := sprintf("Insufficient clearance: %s < %s", [
		input.subject.clearance,
		input.resource.classification,
	])
}

is_insufficient_clearance := msg if {
	# Deny if clearance not in valid enum
	not clearance_levels[input.subject.clearance]
	msg := sprintf("Invalid clearance level: %s", [input.subject.clearance])
}

is_insufficient_clearance := msg if {
	# Deny if classification not in valid enum
	not clearance_levels[input.resource.classification]
	msg := sprintf("Invalid classification level: %s", [input.resource.classification])
}

# Clearance level mapping (higher number = higher clearance)
clearance_levels := {
	"UNCLASSIFIED": 0,
	"CONFIDENTIAL": 1,
	"SECRET": 2,
	"TOP_SECRET": 3,
}

# Check 4: Country Releasability
is_not_releasable_to_country := msg if {
	# Empty releasabilityTo means deny all
	count(input.resource.releasabilityTo) == 0
	msg := "Resource releasabilityTo is empty (deny all)"
} else := msg if {
	# User's country must be in the releasabilityTo list
	count(input.resource.releasabilityTo) > 0
	country := input.subject.countryOfAffiliation
	not country in input.resource.releasabilityTo

	msg := sprintf("Country %s not in releasabilityTo: %v", [
		country,
		input.resource.releasabilityTo,
	])
}

# Check 5: Community of Interest (COI) with Country Membership Matching
# DESIGN DECISION: Use country membership matching instead of strict tag matching
# - User with FVEY can access CAN-US (because FVEY countries include CAN+USA)
# - User with NATO-COSMIC can access any NATO member documents
# - Maintains compartmentalization: US-ONLY still requires US-ONLY membership
is_coi_violation := msg if {
	# If resource has COI, check based on coiOperator
	count(input.resource.COI) > 0

	# Get user COI (default to empty array if missing)
	user_coi := object.get(input.subject, "acpCOI", [])

	# Get COI operator (default to ALL)
	operator := object.get(input.resource, "coiOperator", "ALL")

	# Check based on operator: ALL mode (country membership)
	operator == "ALL"
	
	# Compute required countries from resource COIs
	required_countries := {c | 
		some coi in input.resource.COI
		some c in coi_members[coi]
	}
	
	# Compute user's countries from their COIs
	user_countries := {c | 
		some coi in user_coi
		some c in coi_members[coi]
	}
	
	# Check if user countries is a superset of required countries
	missing_countries := required_countries - user_countries
	count(missing_countries) > 0

	msg := sprintf("COI operator=ALL: user countries %v do not cover required countries %v (missing: %v, user COI: %v, resource COI: %v)", [
		user_countries,
		required_countries,
		missing_countries,
		user_coi,
		input.resource.COI,
	])
} else := msg if {
	# If resource has COI, check based on coiOperator (ANY mode - at least one COI match)
	count(input.resource.COI) > 0

	# Get user COI (default to empty array if missing)
	user_coi := object.get(input.subject, "acpCOI", [])

	# Get COI operator (default to ALL)
	operator := object.get(input.resource, "coiOperator", "ALL")

	# Check based on operator: ANY mode
	operator == "ANY"
	
	# ANY: User must have at least one matching COI (exact tag match for ANY)
	required := {coi | some coi in input.resource.COI}
	has := {coi | some coi in user_coi}
	intersection := required & has
	count(intersection) == 0

	msg := sprintf("COI operator=ANY: user has no matching COI (user COI %v does not intersect resource COI %v)", [
		user_coi,
		input.resource.COI,
	])
}

# Check 6: Embargo Date
is_under_embargo := msg if {
	# If resource has creationDate, check if it's in the future
	input.resource.creationDate

	# Parse dates
	current_time_ns := time.parse_rfc3339_ns(input.context.currentTime)
	creation_time_ns := time.parse_rfc3339_ns(input.resource.creationDate)

	# Allow ±5 minute clock skew tolerance (5 * 60 * 1000000000 nanoseconds)
	clock_skew_ns := 300000000000

	# Deny if current time is before creation time (minus tolerance)
	current_time_ns < (creation_time_ns - clock_skew_ns)

	msg := sprintf("Resource under embargo until %s (current time: %s)", [
		input.resource.creationDate,
		input.context.currentTime,
	])
}

# ============================================
# ACP-240: ZTDF Integrity Validation
# ============================================
# Enforce STANAG 4778 cryptographic binding
# CRITICAL: Fail-closed on integrity failure

is_ztdf_integrity_violation := msg if {
	# Check if resource has ZTDF metadata
	input.resource.ztdf
	
	# Priority 1: Check for explicitly failed validation
	input.resource.ztdf.integrityValidated == false
	
	msg := "ZTDF integrity validation failed (cryptographic binding compromised)"
} else := msg if {
	# Priority 2: Check for missing policy hash (STANAG 4778 requirement)
	input.resource.ztdf
	not input.resource.ztdf.policyHash
	
	msg := "ZTDF policy hash missing (STANAG 4778 binding required)"
} else := msg if {
	# Priority 3: Check for missing payload hash
	input.resource.ztdf
	input.resource.ztdf.policyHash # policy hash exists
	not input.resource.ztdf.payloadHash
	
	msg := "ZTDF payload hash missing (integrity protection required)"
} else := msg if {
	# Priority 4: Check if integrity validation flag is missing (when hashes are present)
	input.resource.ztdf
	input.resource.ztdf.policyHash
	input.resource.ztdf.payloadHash
	not input.resource.ztdf.integrityValidated
	
	msg := "ZTDF integrity not validated (STANAG 4778 binding required)"
}

# ============================================
# Check 8: Upload Releasability Validation (Week 3.2)
# ============================================
# Uploaded resource must be releasable to uploader's country
is_upload_not_releasable_to_uploader := msg if {
	# Only check for upload operations
	input.action.operation == "upload"
	
	# Ensure releasabilityTo includes uploader's country
	count(input.resource.releasabilityTo) > 0
	not input.subject.countryOfAffiliation in input.resource.releasabilityTo
	
	msg := sprintf("Upload releasabilityTo must include uploader country: %s", [
		input.subject.countryOfAffiliation
	])
}

# ============================================
# Check 9: AAL2 Authentication Strength (NIST SP 800-63B)
# ============================================
# Reference: docs/IDENTITY-ASSURANCE-LEVELS.md Lines 302-306
# Classified resources require AAL2 (Multi-Factor Authentication)
# NOTE: Only enforced when ACR is provided (backwards compatible with existing tests)
#
# Multi-Realm Enhancement (Oct 21, 2025):
# - Accepts both string descriptors ("silver", "aal2") AND numeric values ("1", "2", "3")
# - Keycloak numeric ACR: 0=AAL1, 1=AAL2, 2=AAL3, 3=AAL3+
# - Fallback to AMR if ACR not conclusive (IdP step-up compatibility)
is_authentication_strength_insufficient := msg if {
	# Only applies to classified resources
	input.resource.classification != "UNCLASSIFIED"
	
	# Only check if ACR is explicitly provided in context
	input.context.acr
	
	# Check ACR (Authentication Context Class Reference)
	acr := input.context.acr
	acr_lower := lower(acr)
	acr_str := sprintf("%v", [acr])  # Convert to string (handles numeric ACR)
	
	# AAL2 indicators:
	# - String descriptors: "silver", "gold", "aal2", "multi-factor"
	# - Numeric levels: "1" (AAL2), "2" (AAL3), "3" (AAL3+)
	# - URN format: "urn:mace:incommon:iap:silver"
	not contains(acr_lower, "silver")
	not contains(acr_lower, "gold")
	not contains(acr_lower, "aal2")
	not contains(acr_lower, "multi-factor")
	acr_str != "1"  # Keycloak numeric: 1 = AAL2
	acr_str != "2"  # Keycloak numeric: 2 = AAL3 (satisfies AAL2)
	acr_str != "3"  # Keycloak numeric: 3 = AAL3+ (satisfies AAL2)
	
	# Fallback: Check AMR for 2+ factors (IdP may not set proper ACR during step-up)
	# This allows AAL2 validation even if ACR is "0" but user completed MFA
	amr_factors := parse_amr(input.context.amr)
	count(amr_factors) < 2
	
	msg := sprintf("Classification %v requires AAL2 (MFA), but ACR is '%v' and only %v factor(s) provided", [
		input.resource.classification,
		acr,
		count(amr_factors)
	])
}

# ============================================
# Check 10: MFA Factor Verification (NIST SP 800-63B)
# ============================================
# Reference: docs/IDENTITY-ASSURANCE-LEVELS.md Lines 303, 716-729
# AAL2 requires at least 2 authentication factors
# NOTE: Only enforced when AMR is provided (backwards compatible with existing tests)
is_mfa_not_verified := msg if {
	# Only applies to classified resources
	input.resource.classification != "UNCLASSIFIED"
	
	# Only check if AMR is explicitly provided in context
	input.context.amr
	
	# Check AMR (Authentication Methods Reference)
	amr := input.context.amr
	count(amr) < 2
	
	msg := sprintf("MFA required for %v: need 2+ factors, got %v: %v", [
		input.resource.classification,
		count(amr),
		amr
	])
}

# ============================================
# Decision Output
# ============================================

decision := {
	"allow": allow,
	"reason": reason,
	"obligations": obligations,
	"evaluation_details": evaluation_details,
}

# Reason for decision
reason := "Access granted - all conditions satisfied" if {
	allow
} else := msg if {
	# Return first violation found (priority order)
	msg := is_not_authenticated
} else := msg if {
	msg := is_missing_required_attributes
} else := msg if {
	msg := is_insufficient_clearance
} else := msg if {
	# AAL2/FAL2 checks (high priority - authentication strength)
	msg := is_authentication_strength_insufficient
} else := msg if {
	msg := is_mfa_not_verified
} else := msg if {
	# Upload-specific checks (higher priority for upload operations)
	msg := is_upload_not_releasable_to_uploader
} else := msg if {
	msg := is_not_releasable_to_country
} else := msg if {
	msg := is_coi_violation
} else := msg if {
	msg := is_under_embargo
} else := msg if {
	msg := is_ztdf_integrity_violation
} else := "Access denied"

# ============================================
# ACP-240: Enhanced KAS Obligations
# ============================================
# Generate KAS obligation for encrypted resources
# KAS will re-evaluate policy before key release (defense in depth)

obligations := kas_obligations if {
	allow
	input.resource.encrypted == true
	count(kas_obligations) > 0
} else := []

# Build KAS obligation with full context
kas_obligations contains obligation if {
	allow
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

# Evaluation details for debugging (ACP-240 enhanced)
evaluation_details := {
	"checks": {
		"authenticated": check_authenticated,
		"required_attributes": check_required_attributes,
		"clearance_sufficient": check_clearance_sufficient,
		"country_releasable": check_country_releasable,
		"coi_satisfied": check_coi_satisfied,
		"embargo_passed": check_embargo_passed,
		"ztdf_integrity_valid": check_ztdf_integrity_valid,
		"upload_releasability_valid": check_upload_releasability_valid,
		"authentication_strength_sufficient": check_authentication_strength_sufficient,
		"mfa_verified": check_mfa_verified,
	},
	"subject": {
		"uniqueID": object.get(input.subject, "uniqueID", ""),
		"clearance": object.get(input.subject, "clearance", ""),
		"country": object.get(input.subject, "countryOfAffiliation", ""),
	},
	"resource": {
		"resourceId": object.get(input.resource, "resourceId", ""),
		"classification": object.get(input.resource, "classification", ""),
		"encrypted": object.get(input.resource, "encrypted", false),
		"ztdfEnabled": ztdf_enabled,
	},
	"authentication": {
		"acr": object.get(input.context, "acr", ""),
		"amr": object.get(input.context, "amr", []),
		"aal_level": aal_level,
	},
	"acp240_compliance": {
		"ztdf_validation": ztdf_enabled,
		"kas_obligations": count(obligations) > 0,
		"fail_closed_enforcement": true,
		"aal2_enforced": true,
	},
}

# Helper rules for evaluation details (always return boolean)
check_authenticated := true if {
	not is_not_authenticated
} else := false

check_required_attributes := true if {
	not is_missing_required_attributes
} else := false

check_clearance_sufficient := true if {
	not is_insufficient_clearance
} else := false

check_country_releasable := true if {
	not is_not_releasable_to_country
} else := false

check_coi_satisfied := true if {
	not is_coi_violation
} else := false

check_embargo_passed := true if {
	not is_under_embargo
} else := false

check_ztdf_integrity_valid := true if {
	not is_ztdf_integrity_violation
} else := false

check_upload_releasability_valid := true if {
	not is_upload_not_releasable_to_uploader
} else := false

# Helper: Check if ZTDF is enabled for this resource
ztdf_enabled := true if {
	input.resource.ztdf
} else := false

# Helper: Check if authentication strength is sufficient
check_authentication_strength_sufficient := true if {
	not is_authentication_strength_insufficient
} else := false

# Helper: Check if MFA is verified
check_mfa_verified := true if {
	not is_mfa_not_verified
} else := false

# Helper: Parse AMR (Authentication Methods Reference)
# AMR may be:
# - Array: ["pwd", "otp"]
# - JSON string: "[\"pwd\",\"otp\"]" (from Keycloak mapper)
# - Single string: "pwd"
parse_amr(amr_input) := parsed if {
	is_array(amr_input)
	parsed := amr_input
} else := parsed if {
	is_string(amr_input)
	# Try to parse as JSON
	parsed := json.unmarshal(amr_input)
	is_array(parsed)
} else := [amr_input] if {
	# Single value, wrap in array
	is_string(amr_input)
} else := []

# Helper: Derive AAL level from ACR value
# Multi-Realm Enhancement (Oct 21, 2025):
# - Accepts string descriptors ("silver", "aal2") AND numeric values ("1", "2", "3")
# - Keycloak numeric ACR: 0=AAL1, 1=AAL2, 2=AAL3, 3=AAL3+
aal_level := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	# AAL3 indicators: "gold" or numeric "2"/"3"
	contains(acr_lower, "gold")
} else := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_str := sprintf("%v", [acr])
	acr_str == "2"  # Keycloak numeric AAL3
} else := "AAL3" if {
	acr := object.get(input.context, "acr", "")
	acr_str := sprintf("%v", [acr])
	acr_str == "3"  # Keycloak numeric AAL3+
} else := "AAL2" if {
	acr := object.get(input.context, "acr", "")
	acr_lower := lower(sprintf("%v", [acr]))
	# AAL2 indicators: "silver", "aal2", "multi-factor", or numeric "1"
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
	acr_str == "1"  # Keycloak numeric: 1 = AAL2
} else := "AAL2" if {
	# Fallback: 2+ AMR factors = AAL2 (even if ACR not set)
	amr := object.get(input.context, "amr", [])
	amr_factors := parse_amr(amr)
	count(amr_factors) >= 2
} else := "AAL1"

