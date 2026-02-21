package dive.authorization.coi_validation

import rego.v1

# ============================================
# COI Coherence Validation Policy (OPA)
# ============================================
# Enforces NATO ACP-240 / STANAG 4774/5636 COI and Releasability Coherence
#
# Implements:
# 1. COI mutual exclusivity (US-ONLY ⊥ foreign-sharing COIs)
# 2. COI superset/subset conflicts (when operator=ANY)
# 3. Releasability ⊆ COI membership (prevents over-release)
# 4. Caveat enforcement (NOFORN → US-ONLY + REL USA only)
# 5. STANAG compliance (label integrity)
#
# Date: October 21, 2025
# Pattern: Fail-closed with deny[] violations

# ============================================
# COI Membership Registry
# ============================================

coi_members := {
	"US-ONLY": {"USA"},
	"CAN-US": {"CAN", "USA"},
	"GBR-US": {"GBR", "USA"},
	"FRA-US": {"FRA", "USA"},
	"FVEY": {"USA", "GBR", "CAN", "AUS", "NZL"},
	"NATO": {
		"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD",
		"MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "USA",
	},
	"NATO-COSMIC": {
		# COSMIC TOP SECRET is NATO's highest classification - all NATO members
		"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD",
		"MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "USA",
	},
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
	"SOCOM": {"USA", "GBR", "CAN", "AUS", "NZL"}, # FVEY special ops
	"Alpha": set(), # No country affiliation
	"Beta": set(), # No country affiliation
	"Gamma": set(), # No country affiliation
}

# ============================================
# Subset/Superset Pairs
# ============================================

subset_superset_pairs := [
	["CAN-US", "FVEY"],
	["GBR-US", "FVEY"],
	["AUKUS", "FVEY"],
	["NATO-COSMIC", "NATO"],
]

# ============================================
# VIOLATION 1: Mutual Exclusivity
# ============================================

deny contains msg if {
	"US-ONLY" in input.resource.COI
	some x in input.resource.COI
	x != "US-ONLY"
	msg := sprintf("Invalid resource marking: US-ONLY cannot be combined with '%s' because US-ONLY restricts access to the United States only", [x])
}

deny contains msg if {
	"EU-RESTRICTED" in input.resource.COI
	some x in input.resource.COI
	x == "NATO-COSMIC"
	msg := "Invalid resource marking: EU-RESTRICTED and NATO-COSMIC communities cannot be combined as they have conflicting membership requirements"
}

deny contains msg if {
	"EU-RESTRICTED" in input.resource.COI
	some x in input.resource.COI
	x == "US-ONLY"
	msg := "Invalid resource marking: EU-RESTRICTED and US-ONLY communities cannot be combined as they have conflicting membership requirements"
}

# ============================================
# VIOLATION 2: Releasability ⊆ COI Membership
# ============================================

# COIs with no country affiliation (membership-based only)
no_affiliation_cois := {"Alpha", "Beta", "Gamma"}

deny contains msg if {
	# Compute union of all COI member countries (excluding no-affiliation COIs)
	union := {c | 
		some resource_coi in input.resource.COI
		not resource_coi in no_affiliation_cois
		some c in coi_members[resource_coi]
	}

	# Only check if union is not empty (i.e., there are country-based COIs)
	count(union) > 0

	# Check if releasabilityTo ⊆ union
	some r in input.resource.releasabilityTo
	not r in union

	msg := sprintf("Country %s is listed in the release markings but is not a member of any assigned community: %v", [r, union])
}

# ============================================
# VIOLATION 3: NOFORN Caveat Enforcement
# ============================================

deny contains msg if {
	"NOFORN" in input.resource.caveats
	count(input.resource.COI) != 1
	msg := "NOFORN violation: Resources marked NOFORN must have exactly one community assignment: US-ONLY"
}

deny contains msg if {
	"NOFORN" in input.resource.caveats
	count(input.resource.COI) == 1
	input.resource.COI[0] != "US-ONLY"
	msg := "NOFORN violation: Resources marked NOFORN must be assigned to the US-ONLY community"
}

deny contains msg if {
	"NOFORN" in input.resource.caveats
	count(input.resource.releasabilityTo) != 1
	msg := "NOFORN violation: Resources marked NOFORN must be releasable to exactly one country: USA"
}

deny contains msg if {
	"NOFORN" in input.resource.caveats
	count(input.resource.releasabilityTo) == 1
	input.resource.releasabilityTo[0] != "USA"
	msg := "NOFORN violation: Resources marked NOFORN must be releasable only to USA"
}

# ============================================
# VIOLATION 4: Subset/Superset (ANY operator)
# ============================================

deny contains msg if {
	input.resource.coiOperator == "ANY"
	some pair in subset_superset_pairs
	pair[0] in input.resource.COI
	pair[1] in input.resource.COI
	msg := sprintf("Invalid resource marking: %v are subset/superset communities — using both with ANY operator would unintentionally widen access", [pair])
}

# ============================================
# VIOLATION 5: Empty Releasability
# ============================================

deny contains msg if {
	count(input.resource.releasabilityTo) == 0
	msg := "This resource has no release markings (empty releasability list) — access is denied to all countries"
}

# ============================================
# VIOLATION 6: Unknown COI
# ============================================

deny contains msg if {
	some coi in input.resource.COI
	not coi_members[coi]
	msg := sprintf("Unknown COI: '%s' is not a recognized Community of Interest and cannot be validated", [coi])
}

# ============================================
# Subject COI Evaluation (with operator support)
# ============================================

# Helper: Check if subject has required COI access
subject_has_coi_access if {
	count(input.resource.COI) == 0 # No COI required
}

subject_has_coi_access if {
	input.resource.coiOperator == "ALL"
	# Subject must have ALL required COIs
	required := {c | some c in input.resource.COI}
	has := {c | some c in input.subject.acpCOI}
	count(required - has) == 0
}

subject_has_coi_access if {
	input.resource.coiOperator == "ANY"
	# Subject must have ANY required COI
	required := {c | some c in input.resource.COI}
	has := {c | some c in input.subject.acpCOI}
	count(required & has) > 0
}

# Default operator to ALL if not specified
subject_has_coi_access if {
	not input.resource.coiOperator
	# Default: Subject must have ALL required COIs
	required := {c | some c in input.resource.COI}
	has := {c | some c in input.subject.acpCOI}
	count(required - has) == 0
}

# ============================================
# Integration with Main Policy
# ============================================

# Export for use in main authorization policy
is_coi_coherence_violation := msg if {
	count(deny) > 0
	msg := concat("; ", deny)
}

# Allow if no violations and subject has COI access
allow if {
	count(deny) == 0
	subject_has_coi_access
}

# Permit decision (for standalone use)
permit if allow

# Deny decision (for standalone use)
deny_decision := {
	"allowed": false,
	"reason": concat("; ", deny),
	"violations": deny,
} if count(deny) > 0

# Permit decision (for standalone use)
permit_decision := {
	"allowed": true,
	"reason": "All community of interest coherence checks passed",
	"coiOperator": input.resource.coiOperator,
} if allow

