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

default decision_reason := "Authorization check not evaluated"

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
# CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
# - UNCLASSIFIED users CANNOT access RESTRICTED content
# - RESTRICTED users CAN access UNCLASSIFIED content
# - Both remain AAL1 (no MFA required)
clearance_levels := ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]

# Clearance check
is_insufficient_clearance := msg if {
	clearance_map := {"UNCLASSIFIED": 0, "RESTRICTED": 0.5, "CONFIDENTIAL": 1, "SECRET": 2, "TOP_SECRET": 3}
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
# Cross-Instance Federated Search (Phase 4)
# ============================================
# Authorization rules for federated search across multiple instances
# Validates that federated resources can be accessed by the requesting user

# Federated search is allowed if:
# 1. User is authenticated
# 2. User has sufficient clearance for their max accessible level
# 3. User's country is in a valid federation agreement
# 4. The request includes valid origin realm information

default allow_federated_search := false

allow_federated_search if {
	not is_not_authenticated
	not is_issuer_not_trusted
	federated_search_enabled
}

# Check if federated search is enabled for this instance
federated_search_enabled if {
	input.context.federatedSearch == true
}

# Default: federated search allowed if not explicitly disabled
federated_search_enabled if {
	not input.context.federatedSearch == false
}

# Validate federated resource access
# A federated resource from another instance can be accessed if:
# 1. Basic ABAC checks pass
# 2. The origin realm is trusted
# 3. The user's country has a federation agreement with the origin realm

default allow_federated_resource := false

allow_federated_resource if {
	allow
	is_origin_realm_trusted
	has_federation_agreement
}

# Check if origin realm is trusted
is_origin_realm_trusted if {
	origin := input.resource.originRealm
	origin in trusted_origin_realms
}

# Default: local resources (no origin realm) are trusted
is_origin_realm_trusted if {
	not input.resource.originRealm
}

# Trusted origin realms (all DIVE V3 instances)
trusted_origin_realms := {"USA", "FRA", "GBR", "DEU", "CAN", "ITA", "ESP", "POL", "NLD"}

# Check federation agreement exists
# Default: true if no origin realm (local resource)
default has_federation_agreement := false

has_federation_agreement if {
	# If no origin realm, it's a local resource - always OK
	not input.resource.originRealm
}

has_federation_agreement if {
	user_country := input.subject.countryOfAffiliation
	origin := input.resource.originRealm
	origin  # Must have origin realm
	
	# Check if user's country has agreement with origin
	federation_matrix[user_country][_] == origin
}

has_federation_agreement if {
	user_country := input.subject.countryOfAffiliation
	origin := input.resource.originRealm
	origin  # Must have origin realm
	
	# Symmetric: check if origin has agreement with user's country
	federation_matrix[origin][_] == user_country
}

# Federation matrix: which countries can federate with which
# Based on existing federation agreements in DIVE V3
federation_matrix := {
	"USA": ["FRA", "GBR", "DEU", "CAN", "ITA", "ESP", "POL", "NLD"],
	"FRA": ["USA", "GBR", "DEU", "ITA", "ESP", "POL", "NLD"],
	"GBR": ["USA", "FRA", "DEU", "CAN", "ITA", "ESP", "POL", "NLD"],
	"DEU": ["USA", "FRA", "GBR", "ITA", "ESP", "POL", "NLD"],
	"CAN": ["USA", "GBR"],
	"ITA": ["USA", "FRA", "GBR", "DEU", "ESP", "POL", "NLD"],
	"ESP": ["USA", "FRA", "GBR", "DEU", "ITA", "POL", "NLD"],
	"POL": ["USA", "FRA", "GBR", "DEU", "ITA", "ESP", "NLD"],
	"NLD": ["USA", "FRA", "GBR", "DEU", "ITA", "ESP", "POL"],
}

# Federated search result filter
# Returns true if a federated resource should be included in search results
include_in_federated_results if {
	allow_federated_resource
}

# ============================================
# Decision Structure (Simplified for Rego v1)
# ============================================

decision := d if {
	d := {
		"allow": allow,
		"reason": decision_reason,
		"federatedSearchAllowed": allow_federated_search,
		"federatedResourceAllowed": allow_federated_resource,
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

