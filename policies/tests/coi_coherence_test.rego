# COI Coherence Policy Tests
# Package: dive.authorization.coi_validation_test
#
# Comprehensive tests for COI coherence validation.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.authorization.coi_validation_test

import rego.v1

import data.dive.authorization.coi_validation

# ============================================
# Mutual Exclusivity Tests
# ============================================

test_us_only_combined_with_fvey_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY", "FVEY"],
			"releasabilityTo": ["USA"],
		},
	}
	count(result) > 0
}

test_us_only_combined_with_nato_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY", "NATO"],
			"releasabilityTo": ["USA"],
		},
	}
	count(result) > 0
}

test_eu_restricted_with_nato_cosmic_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["EU-RESTRICTED", "NATO-COSMIC"],
			"releasabilityTo": ["FRA"],
		},
	}
	count(result) > 0
}

test_eu_restricted_with_us_only_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["EU-RESTRICTED", "US-ONLY"],
			"releasabilityTo": ["USA"],
		},
	}
	count(result) > 0
}

test_single_coi_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA", "GBR"],
		},
	}
	count(result) == 0
}

# ============================================
# Releasability Subset Tests
# ============================================

test_releasability_within_fvey_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA", "GBR", "CAN"],
		},
	}
	count(result) == 0
}

test_releasability_outside_fvey_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA", "GBR", "FRA"],
		},
	}
	count(result) > 0
}

test_releasability_within_nato_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["NATO"],
			"releasabilityTo": ["USA", "GBR", "FRA", "DEU"],
		},
	}
	count(result) == 0
}

test_releasability_outside_nato_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["NATO"],
			"releasabilityTo": ["USA", "JPN"],
		},
	}
	count(result) > 0
}

test_releasability_within_can_us_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["CAN-US"],
			"releasabilityTo": ["USA", "CAN"],
		},
	}
	count(result) == 0
}

test_releasability_outside_can_us_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["CAN-US"],
			"releasabilityTo": ["USA", "GBR"],
		},
	}
	count(result) > 0
}

# ============================================
# NOFORN Caveat Tests
# ============================================

test_noforn_with_us_only_and_usa_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY"],
			"releasabilityTo": ["USA"],
			"caveats": ["NOFORN"],
		},
	}
	count(result) == 0
}

test_noforn_with_multiple_cois_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY", "FVEY"],
			"releasabilityTo": ["USA"],
			"caveats": ["NOFORN"],
		},
	}
	count(result) > 0
}

test_noforn_with_wrong_coi_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA"],
			"caveats": ["NOFORN"],
		},
	}
	count(result) > 0
}

test_noforn_with_multiple_countries_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY"],
			"releasabilityTo": ["USA", "GBR"],
			"caveats": ["NOFORN"],
		},
	}
	count(result) > 0
}

test_noforn_with_wrong_country_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["US-ONLY"],
			"releasabilityTo": ["GBR"],
			"caveats": ["NOFORN"],
		},
	}
	count(result) > 0
}

# ============================================
# Subset/Superset Pair Tests (ANY operator)
# ============================================

test_can_us_and_fvey_with_any_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["CAN-US", "FVEY"],
			"releasabilityTo": ["USA", "CAN"],
			"coiOperator": "ANY",
		},
	}
	count(result) > 0
}

test_gbr_us_and_fvey_with_any_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["GBR-US", "FVEY"],
			"releasabilityTo": ["USA", "GBR"],
			"coiOperator": "ANY",
		},
	}
	count(result) > 0
}

test_aukus_and_fvey_with_any_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["AUKUS", "FVEY"],
			"releasabilityTo": ["USA", "GBR", "AUS"],
			"coiOperator": "ANY",
		},
	}
	count(result) > 0
}

test_nato_cosmic_and_nato_with_any_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["NATO-COSMIC", "NATO"],
			"releasabilityTo": ["USA", "GBR"],
			"coiOperator": "ANY",
		},
	}
	count(result) > 0
}

test_can_us_and_fvey_with_all_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["CAN-US", "FVEY"],
			"releasabilityTo": ["USA", "CAN"],
			"coiOperator": "ALL",
		},
	}
	count(result) == 0
}

# ============================================
# Empty Releasability Tests
# ============================================

test_empty_releasability_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": [],
		},
	}
	count(result) > 0
}

# ============================================
# Unknown COI Tests
# ============================================

test_unknown_coi_denied if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["UNKNOWN_COI"],
			"releasabilityTo": ["USA"],
		},
	}
	count(result) > 0
}

test_known_coi_allowed if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA"],
		},
	}
	count(result) == 0
}

# ============================================
# Subject COI Access Tests
# ============================================

test_subject_coi_access_empty_required if {
	coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": [],
		},
		"subject": {
			"acpCOI": [],
		},
	}
}

test_subject_coi_access_all_operator_pass if {
	coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": ["FVEY", "NATO"],
			"coiOperator": "ALL",
		},
		"subject": {
			"acpCOI": ["FVEY", "NATO", "CAN-US"],
		},
	}
}

test_subject_coi_access_all_operator_fail if {
	not coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": ["FVEY", "NATO"],
			"coiOperator": "ALL",
		},
		"subject": {
			"acpCOI": ["FVEY"],
		},
	}
}

test_subject_coi_access_any_operator_pass if {
	coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": ["FVEY", "NATO"],
			"coiOperator": "ANY",
		},
		"subject": {
			"acpCOI": ["FVEY"],
		},
	}
}

test_subject_coi_access_any_operator_fail if {
	not coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": ["FVEY", "NATO"],
			"coiOperator": "ANY",
		},
		"subject": {
			"acpCOI": ["CAN-US"],
		},
	}
}

test_subject_coi_access_default_all_operator if {
	coi_validation.subject_has_coi_access with input as {
		"resource": {
			"COI": ["FVEY"],
		},
		"subject": {
			"acpCOI": ["FVEY"],
		},
	}
}

# ============================================
# Allow/Permit Tests
# ============================================

test_allow_when_no_violations_and_coi_access if {
	coi_validation.allow with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA", "GBR"],
		},
		"subject": {
			"acpCOI": ["FVEY"],
		},
	}
}

test_deny_when_violations_exist if {
	not coi_validation.allow with input as {
		"resource": {
			"COI": ["UNKNOWN_COI"],
			"releasabilityTo": ["USA"],
		},
		"subject": {
			"acpCOI": [],
		},
	}
}

test_permit_alias_for_allow if {
	coi_validation.permit with input as {
		"resource": {
			"COI": ["FVEY"],
			"releasabilityTo": ["USA"],
		},
		"subject": {
			"acpCOI": ["FVEY"],
		},
	}
}

test_deny_decision_denied if {
	result := coi_validation.deny_decision with input as {
		"resource": {
			"COI": ["UNKNOWN_COI"],
			"releasabilityTo": ["USA"],
		},
		"subject": {
			"acpCOI": [],
		},
	}
	result.allowed == false
}

# ============================================
# COI Members Registry Tests
# ============================================

test_coi_members_us_only_has_usa if {
	"USA" in coi_validation.coi_members["US-ONLY"]
}

test_coi_members_fvey_has_five_countries if {
	count(coi_validation.coi_members["FVEY"]) == 5
}

test_coi_members_nato_has_32_countries if {
	count(coi_validation.coi_members["NATO"]) == 32
}

test_coi_members_alpha_is_empty if {
	count(coi_validation.coi_members["Alpha"]) == 0
}

# ============================================
# No Affiliation COI Tests
# ============================================

test_alpha_coi_allowed_with_any_releasability if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["Alpha"],
			"releasabilityTo": ["USA", "JPN", "CHN"],
		},
	}
	count(result) == 0
}

test_beta_coi_allowed_with_any_releasability if {
	result := coi_validation.deny with input as {
		"resource": {
			"COI": ["Beta"],
			"releasabilityTo": ["FRA", "DEU"],
		},
	}
	count(result) == 0
}

# ============================================
# Integration Coherence Violation Tests
# ============================================

test_coi_coherence_violation_message if {
	msg := coi_validation.is_coi_coherence_violation with input as {
		"resource": {
			"COI": ["UNKNOWN_COI"],
			"releasabilityTo": ["USA"],
		},
	}
	contains(msg, "Unknown COI")
}

# ============================================
# Regional Command COI Tests
# ============================================

test_aukus_coi_members if {
	"USA" in coi_validation.coi_members["AUKUS"]
	"GBR" in coi_validation.coi_members["AUKUS"]
	"AUS" in coi_validation.coi_members["AUKUS"]
}

test_quad_coi_members if {
	"USA" in coi_validation.coi_members["QUAD"]
	"AUS" in coi_validation.coi_members["QUAD"]
	"IND" in coi_validation.coi_members["QUAD"]
	"JPN" in coi_validation.coi_members["QUAD"]
}

test_northcom_coi_members if {
	"USA" in coi_validation.coi_members["NORTHCOM"]
	"CAN" in coi_validation.coi_members["NORTHCOM"]
	"MEX" in coi_validation.coi_members["NORTHCOM"]
}

