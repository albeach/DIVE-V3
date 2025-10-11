package dive.authorization

import rego.v1

# ============================================
# DIVE V3 Authorization Policy - Week 2
# ============================================
# Coalition ICAM Authorization Policy
# Based on ACP-240 and NATO STANAG 4774/5636
# Implements: Clearance, Releasability, COI, Embargo checks
# Pattern: Fail-secure with is_not_a_* violations

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
	not is_under_embargo
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

# Check 5: Community of Interest (COI)
is_coi_violation := msg if {
	# If resource has COI, user must have at least one matching COI
	count(input.resource.COI) > 0

	# Get user COI (default to empty array if missing)
	user_coi := object.get(input.subject, "acpCOI", [])

	# Check for intersection
	intersection := {coi | some coi in user_coi; coi in input.resource.COI}
	count(intersection) == 0

	msg := sprintf("No COI intersection: user COI %v does not intersect resource COI %v", [
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
	# Return first violation found
	msg := is_not_authenticated
} else := msg if {
	msg := is_missing_required_attributes
} else := msg if {
	msg := is_insufficient_clearance
} else := msg if {
	msg := is_not_releasable_to_country
} else := msg if {
	msg := is_coi_violation
} else := msg if {
	msg := is_under_embargo
} else := "Access denied"

# Obligations (e.g., call KAS for encrypted resources)
obligations := [{"type": "kas_key_required", "resourceId": input.resource.resourceId}] if {
	allow
	input.resource.encrypted == true
} else := []

# Evaluation details for debugging
evaluation_details := {
	"checks": {
		"authenticated": check_authenticated,
		"required_attributes": check_required_attributes,
		"clearance_sufficient": check_clearance_sufficient,
		"country_releasable": check_country_releasable,
		"coi_satisfied": check_coi_satisfied,
		"embargo_passed": check_embargo_passed,
	},
	"subject": {
		"uniqueID": object.get(input.subject, "uniqueID", ""),
		"clearance": object.get(input.subject, "clearance", ""),
		"country": object.get(input.subject, "countryOfAffiliation", ""),
	},
	"resource": {
		"resourceId": object.get(input.resource, "resourceId", ""),
		"classification": object.get(input.resource, "classification", ""),
	},
}

# Helper rules for evaluation details
check_authenticated if {
	not is_not_authenticated
}

check_required_attributes if {
	not is_missing_required_attributes
}

check_clearance_sufficient if {
	not is_insufficient_clearance
}

check_country_releasable if {
	not is_not_releasable_to_country
}

check_coi_satisfied if {
	not is_coi_violation
}

check_embargo_passed if {
	not is_under_embargo
}

