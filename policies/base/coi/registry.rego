# Base Layer: COI (Community of Interest) Registry
# Package: dive.base.coi
#
# This is the SINGLE SOURCE OF TRUTH for COI membership definitions.
# COI membership determines which countries/organizations can access
# resources tagged with specific COI labels.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.coi

import rego.v1

# ============================================
# COI Membership Registry
# ============================================
# Maps COI names to the set of countries that are members.
# Country codes are ISO 3166-1 alpha-3.
#
# NOTE: In production, this should be loaded from OPAL data.
# This hardcoded version is the fallback/default.

default_coi_members := {
	# US-Only: Exclusively USA (no foreign sharing)
	"US-ONLY": {"USA"},
	# Bilateral agreements
	"CAN-US": {"CAN", "USA"},
	"GBR-US": {"GBR", "USA"},
	"FRA-US": {"FRA", "USA"},
	"DEU-US": {"DEU", "USA"},
	# Five Eyes Alliance
	"FVEY": {"USA", "GBR", "CAN", "AUS", "NZL"},
	# NATO Alliance (32 members as of 2024)
	"NATO": {
		"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE",
		"NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
		"TUR", "USA",
	},
	# NATO COSMIC (highest NATO classification)
	"NATO-COSMIC": {
		"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE",
		"NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
		"TUR", "USA",
	},
	# EU Restricted
	"EU-RESTRICTED": {
		"AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
		"DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
		"POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
	},
	# AUKUS (trilateral security pact)
	"AUKUS": {"AUS", "GBR", "USA"},
	# QUAD (Quadrilateral Security Dialogue)
	"QUAD": {"USA", "AUS", "IND", "JPN"},
	# Regional Commands
	"NORTHCOM": {"USA", "CAN", "MEX"},
	"EUCOM": {"USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"},
	"PACOM": {"USA", "JPN", "KOR", "AUS", "NZL", "PHL"},
	"CENTCOM": {"USA", "SAU", "ARE", "QAT", "KWT", "BHR", "JOR", "EGY"},
	"SOCOM": {"USA", "GBR", "CAN", "AUS", "NZL"},
	# Program-specific COIs (no country affiliation - membership-based)
	"Alpha": set(),
	"Beta": set(),
	"Gamma": set(),
}

# Use OPAL-provided data if available, otherwise use defaults
coi_members := data.coi_members if {
	data.coi_members
} else := default_coi_members

# ============================================
# COI Validation Functions
# ============================================

# Check if a COI is known/valid
is_valid_coi(coi) if {
	coi_members[coi]
}

# Get members of a COI (returns empty set if unknown)
members(coi) := coi_members[coi] if {
	coi_members[coi]
} else := set()

# Check if a country is a member of a COI
is_member(country, coi) if {
	country in coi_members[coi]
}

# ============================================
# COI Access Functions
# ============================================

# Check if user has COI access to resource (ALL mode)
# User must have ALL required COI tags
has_access_all(user_cois, resource_cois) if {
	count(resource_cois) == 0
}

has_access_all(user_cois, resource_cois) if {
	count(resource_cois) > 0
	required := {c | some c in resource_cois}
	has := {c | some c in user_cois}
	count(required - has) == 0
}

# Check if user has COI access to resource (ANY mode)
# User must have at least ONE matching COI tag
has_access_any(user_cois, resource_cois) if {
	count(resource_cois) == 0
}

has_access_any(user_cois, resource_cois) if {
	count(resource_cois) > 0
	required := {c | some c in resource_cois}
	has := {c | some c in user_cois}
	count(required & has) > 0
}

# Unified access check with operator
has_access(user_cois, resource_cois, operator) if {
	operator == "ALL"
	has_access_all(user_cois, resource_cois)
}

has_access(user_cois, resource_cois, operator) if {
	operator == "ANY"
	has_access_any(user_cois, resource_cois)
}

# Default to ALL if operator not specified
has_access(user_cois, resource_cois, operator) if {
	not operator
	has_access_all(user_cois, resource_cois)
}

# ============================================
# COI Country Membership Check
# ============================================
# Check if user's country is in the union of COI memberships

country_in_coi_union(country, resource_cois) if {
	count(resource_cois) == 0
}

country_in_coi_union(country, resource_cois) if {
	count(resource_cois) > 0
	union := {c |
		some coi in resource_cois
		some c in coi_members[coi]
	}
	country in union
}

# ============================================
# COI Coherence Checks
# ============================================
# Validate that COI assignments are logically consistent

# COIs that cannot be combined (mutually exclusive)
mutually_exclusive_cois := [
	["US-ONLY", "NATO"],
	["US-ONLY", "FVEY"],
	["US-ONLY", "EU-RESTRICTED"],
	["EU-RESTRICTED", "NATO-COSMIC"],
]

# Subset/superset pairs (problematic with ANY operator)
subset_superset_pairs := [
	["CAN-US", "FVEY"],
	["GBR-US", "FVEY"],
	["AUKUS", "FVEY"],
	["NATO-COSMIC", "NATO"],
]

# Check for mutual exclusivity violations
mutual_exclusivity_violation(cois) := msg if {
	some pair in mutually_exclusive_cois
	pair[0] in cois
	pair[1] in cois
	msg := sprintf("Mutually exclusive COIs: %s and %s cannot be combined", [pair[0], pair[1]])
}

# Check for subset/superset with ANY operator
subset_superset_violation(cois, operator) := msg if {
	operator == "ANY"
	some pair in subset_superset_pairs
	pair[0] in cois
	pair[1] in cois
	msg := sprintf("Subset+superset COIs %v invalid with ANY semantics", [pair])
}

# ============================================
# Error Messages
# ============================================

coi_access_denied_msg(user_cois, resource_cois, operator) := msg if {
	msg := sprintf("COI access denied: user COIs %v do not satisfy resource COIs %v (operator: %s)", [
		user_cois,
		resource_cois,
		operator,
	])
}

unknown_coi_msg(coi) := msg if {
	msg := sprintf("Unknown COI: %s", [coi])
}

