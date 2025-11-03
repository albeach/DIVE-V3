package dive.federation

import rego.v1

# ============================================
# Federation ABAC Policy (ADatP-5663 Focused)
# ============================================
# Emphasizes identity federation and authentication assurance
# Based on ADatP-5663 (Identity, Credential and Access Management)
#
# Key Focus Areas:
# - Authenticator Assurance Level (AAL) enforcement
# - Token lifetime validation (auth_time)
# - Issuer trust validation
# - MFA verification (amr claims)
# - Federation-specific attributes
#
# Default deny pattern (fail-secure)

default allow := false

decision_reason := "Authorization check not evaluated"

# ============================================
# Main Authorization Rule
# ============================================

allow if {
	not is_not_authenticated
	not is_insufficient_aal
	not is_token_expired
	not is_issuer_not_trusted
	not is_mfa_not_verified
	# Also check basic ABAC (reuse from shared)
	not is_insufficient_clearance
	not is_not_releasable_to_country
	not is_coi_violation
}

# ============================================
# Federation-Specific Violations (ADatP-5663)
# ============================================

# Authentication Check
is_not_authenticated := msg if {
	not input.subject.authenticated
	msg := "Subject is not authenticated"
}

# AAL Enforcement (ADatP-5663 §5.1.2, NIST SP 800-63B)
# FIX (Nov 3, 2025): Changed to use input.context.acr instead of input.subject.acr
# Backend passes acr/amr/auth_time in context field (authz.middleware.ts:1328-1332)
is_insufficient_aal := msg if {
	required_aal := get_required_aal(input.resource.classification)
	user_aal := parse_aal(input.context.acr)
	user_aal < required_aal
	msg := sprintf("Insufficient AAL: user AAL%v < required AAL%v for %s", [user_aal, required_aal, input.resource.classification])
}

# AAL mapping function
get_required_aal(classification) := 1 if classification == "UNCLASSIFIED" else := 2 if classification in ["CONFIDENTIAL", "SECRET"] else := 3 if classification == "TOP_SECRET" else := 1  # Default to AAL1

# Parse AAL from acr claim
# Support both numeric ("0", "1", "2") and string formats ("aal1", "aal2", "aal3")
# Backend normalization (backend/src/middleware/authz.middleware.ts:464-501):
#   normalizeACR() returns: 0=AAL1, 1=AAL2, 2=AAL3
#   Then converted to string: String(normalizedAAL) → "0", "1", "2"
# FIX (Nov 3, 2025): Correct mapping - "0"=AAL1, "1"=AAL2, "2"=AAL3
parse_aal(acr) := 1 if lower(acr) in ["aal1", "0"] else := 2 if lower(acr) in ["aal2", "1"] else := 3 if lower(acr) in ["aal3", "2"] else := 0

# Token Lifetime Check (ADatP-5663 §5.1.3)
is_token_expired := msg if {
	input.subject.auth_time
	current_time_unix := to_unix_seconds(input.context.currentTime)
	auth_time_unix := input.subject.auth_time
	lifetime_seconds := current_time_unix - auth_time_unix
	lifetime_seconds > 900  # 15 minutes (ADatP-5663 token lifetime)
	msg := sprintf("Token expired: %v seconds since authentication (max 900)", [lifetime_seconds])
}

# Helper: Convert ISO 8601 to Unix seconds
to_unix_seconds(iso_time) := seconds if {
	ns := time.parse_rfc3339_ns(iso_time)
	seconds := ns / 1000000000
}

# Issuer Trust Validation (ADatP-5663 §3.8)
trusted_issuers := {
	"https://keycloak:8080/realms/dive-v3-usa",
	"https://keycloak:8080/realms/dive-v3-fra",
	"https://keycloak:8080/realms/dive-v3-can",
	"https://keycloak:8080/realms/dive-v3-deu",
	"https://keycloak:8080/realms/dive-v3-gbr",
	"https://keycloak:8080/realms/dive-v3-ita",
	"https://keycloak:8080/realms/dive-v3-esp",
	"https://keycloak:8080/realms/dive-v3-pol",
	"https://keycloak:8080/realms/dive-v3-nld",
	"https://keycloak:8080/realms/dive-v3-industry",
	"https://keycloak:8080/realms/dive-v3-broker",
	# Localhost variants (for development)
	"http://localhost:8081/realms/dive-v3-usa",
	"http://localhost:8081/realms/dive-v3-broker",
}

is_issuer_not_trusted := msg if {
	issuer := input.subject.issuer
	not issuer in trusted_issuers
	msg := sprintf("Issuer %s not in trusted federation", [issuer])
}

# MFA Verification (ADatP-5663 §5.1.2)
# FIX (Nov 3, 2025): Changed to use input.context.acr/amr
is_mfa_not_verified := msg if {
	# If AAL2+ is claimed, verify MFA factors present
	user_aal := parse_aal(input.context.acr)
	user_aal >= 2
	amr := input.context.amr
	# AAL2 requires at least 2 factors
	count(amr) < 2
	msg := sprintf("AAL2 claimed but only %v auth factors provided", [count(amr)])
}

is_mfa_not_verified := msg if {
	# If AAL2+ is claimed, verify OTP or similar
	user_aal := parse_aal(input.context.acr)
	user_aal >= 2
	amr := input.context.amr
	# Must include MFA factor (otp, hwtoken, etc.)
	not "otp" in amr
	not "hwtoken" in amr
	not "sms" in amr
	msg := "AAL2 claimed but no MFA factor (otp/hwtoken/sms) in amr"
}

# ============================================
# Shared ABAC Rules (from unified policy)
# ============================================
# These are used by both 5663 and 240 policies

# Clearance hierarchy
clearance_levels := ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]

# Clearance check
is_insufficient_clearance := msg if {
	clearance_map := {"UNCLASSIFIED": 0, "CONFIDENTIAL": 1, "SECRET": 2, "TOP_SECRET": 3}
	user_level := clearance_map[input.subject.clearance]
	resource_level := clearance_map[input.resource.classification]
	user_level < resource_level
	msg := sprintf("Insufficient clearance: %s < %s", [input.subject.clearance, input.resource.classification])
}

is_insufficient_clearance := msg if {
	not input.subject.clearance
	msg := "Missing clearance attribute"
}

# Releasability check
is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) == 0
	msg := "Resource has empty releasabilityTo (denies all)"
}

is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) > 0
	not input.subject.countryOfAffiliation in input.resource.releasabilityTo
	msg := sprintf("Country %s not in releasabilityTo: %v", [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

# COI check
is_coi_violation := msg if {
	count(input.resource.COI) > 0
	user_coi := {c | some c in input.subject.acpCOI}
	resource_coi := {c | some c in input.resource.COI}
	intersection := user_coi & resource_coi
	count(intersection) == 0
	msg := sprintf("No COI intersection: user %v, resource %v", [input.subject.acpCOI, input.resource.COI])
}

# ============================================
# Decision Structure (Simplified for Rego v1)
# ============================================

decision := d if {
	d := {
		"allow": allow,
		"reason": decision_reason,
	}
}

decision_reason := "All federation and ABAC conditions satisfied" if {
	allow
}

decision_reason := violation_message if {
	not allow
	violation_message := concat("; ", [
		is_not_authenticated,
		is_insufficient_aal,
		is_token_expired,
		is_issuer_not_trusted,
		is_mfa_not_verified,
		is_insufficient_clearance,
		is_not_releasable_to_country,
		is_coi_violation,
	])
}

