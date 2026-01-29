##########################################################################################
# Federation Constraints Policy Tests
# Package: dive.tenant.federation_constraints_test
#
# Purpose: Test bilateral federation constraints (classification cap + COI logic)
#
# Phase 2, Task 2.4
# Date: 2026-01-28
##########################################################################################

package dive.tenant.federation_constraints_test

import rego.v1
import data.dive.tenant.federation_constraints

##########################################################################################
# TEST DATA
##########################################################################################

# Test data for bilateral SECRET/CONFIDENTIAL scenario
constraints_bilateral_secret_confidential := {
	"federation_constraints": {
		"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		"DEU": {"FRA": {"maxClassification": "CONFIDENTIAL", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
	},
}

# Test data for COI deny-wins scenario
constraints_coi_deny_wins := {
	"federation_constraints": {
		"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO", "FVEY"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": [], "deniedCOIs": ["NATO"], "relationshipType": "spoke_spoke"}},
	},
}

# Test data for allowlist intersection scenario
constraints_allowlist_intersection := {
	"federation_constraints": {
		"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO", "FVEY"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
	},
}

##########################################################################################
# TEST: BILATERAL EFFECTIVE-MIN CLASSIFICATION
##########################################################################################

test_effective_max_classification_bilateral if {
	# FRA→DEU allows SECRET, DEU→FRA allows CONFIDENTIAL
	# Effective max = min(SECRET, CONFIDENTIAL) = CONFIDENTIAL
	effective := federation_constraints.effective_max_classification("FRA", "DEU") with data.federation_constraints as constraints_bilateral_secret_confidential
	effective == "CONFIDENTIAL" # min(level 3, level 2) = level 2
}

test_effective_max_classification_symmetric if {
	# Both sides allow TOP_SECRET
	effective := federation_constraints.effective_max_classification("USA", "GBR") with data.federation_constraints as {
		"federation_constraints": {
			"USA": {"GBR": {"maxClassification": "TOP_SECRET"}},
			"GBR": {"USA": {"maxClassification": "TOP_SECRET"}},
		},
	}
	effective == "TOP_SECRET"
}

test_effective_max_classification_no_constraints if {
	# No constraints exist → returns null
	effective := federation_constraints.effective_max_classification("FRA", "DEU") with data.federation_constraints as {"federation_constraints": {}}
	effective == null
}

test_effective_max_classification_one_side_only if {
	# Only one side has constraint → returns null (bilateral required)
	effective := federation_constraints.effective_max_classification("FRA", "DEU") with data.federation_constraints as {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET"}},
		},
	}
	effective == null
}

##########################################################################################
# TEST: CLASSIFICATION CAP CHECK
##########################################################################################

test_check_classification_cap_within_limit if {
	# Resource CONFIDENTIAL, effective cap CONFIDENTIAL → ALLOW
	federation_constraints.check_classification_cap("FRA", "DEU", "CONFIDENTIAL") with data.federation_constraints as constraints_bilateral_secret_confidential
}

test_check_classification_cap_exceeds_limit if {
	# Resource SECRET, effective cap CONFIDENTIAL → DENY
	not federation_constraints.check_classification_cap("FRA", "DEU", "SECRET") with data.federation_constraints as constraints_bilateral_secret_confidential
}

test_check_classification_cap_no_constraints if {
	# No constraints → ALLOW (default permissive)
	federation_constraints.check_classification_cap("FRA", "DEU", "TOP_SECRET") with data.federation_constraints as {"federation_constraints": {}}
}

##########################################################################################
# TEST: COI DENY WINS
##########################################################################################

test_coi_deny_wins if {
	# FRA allows NATO, DEU denies NATO → DENY (deny wins)
	not federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO"]) with data.federation_constraints as constraints_coi_deny_wins
}

test_coi_both_allow if {
	# Both sides allow NATO → ALLOW
	federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO"]) with data.federation_constraints as constraints_bilateral_secret_confidential
}

##########################################################################################
# TEST: COI ALLOWLIST INTERSECTION
##########################################################################################

test_coi_allowlist_intersection_pass if {
	# FRA allows [NATO, FVEY], DEU allows [NATO]
	# Resource COI [NATO] → ALLOW (in both allowlists)
	federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO"]) with data.federation_constraints as constraints_allowlist_intersection
}

test_coi_allowlist_intersection_fail if {
	# FRA allows [NATO, FVEY], DEU allows [NATO]
	# Resource COI [FVEY] → DENY (not in DEU's allowlist)
	not federation_constraints.check_coi_allowed("FRA", "DEU", ["FVEY"]) with data.federation_constraints as constraints_allowlist_intersection
}

test_coi_allowlist_intersection_multiple if {
	# FRA allows [NATO, FVEY], DEU allows [NATO]
	# Resource COI [NATO, FVEY] → DENY (FVEY not in DEU's allowlist)
	not federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO", "FVEY"]) with data.federation_constraints as constraints_allowlist_intersection
}

##########################################################################################
# TEST: COI MIXED ALLOWLIST
##########################################################################################

test_coi_one_allowlist_one_empty if {
	# FRA has allowlist [NATO], DEU has empty allowlist
	# Resource COI [NATO] → ALLOW (in FRA's allowlist)
	federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO"]) with data.federation_constraints as {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": []}},
			"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": [], "deniedCOIs": []}},
		},
	}
}

test_coi_one_allowlist_one_empty_fail if {
	# FRA has allowlist [NATO], DEU has empty allowlist
	# Resource COI [FVEY] → DENY (not in FRA's allowlist)
	not federation_constraints.check_coi_allowed("FRA", "DEU", ["FVEY"]) with data.federation_constraints as {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": []}},
			"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": [], "deniedCOIs": []}},
		},
	}
}

##########################################################################################
# TEST: NO CONSTRAINTS (DEFAULT PERMISSIVE)
##########################################################################################

test_no_constraints_allow_all if {
	# No constraints → allow all COIs (default permissive)
	federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO", "FVEY", "COSMIC"]) with data.federation_constraints as {"federation_constraints": {}}
}

##########################################################################################
# TEST: CONSTRAINT LOOKUP
##########################################################################################

test_get_constraint_exists if {
	constraint := federation_constraints.get_constraint("FRA", "DEU") with data.federation_constraints as constraints_bilateral_secret_confidential
	constraint.maxClassification == "SECRET"
}

test_get_constraint_not_exists if {
	constraint := federation_constraints.get_constraint("USA", "CAN") with data.federation_constraints as constraints_bilateral_secret_confidential
	constraint == null
}

##########################################################################################
# TEST: VIOLATION MESSAGES
##########################################################################################

test_classification_cap_exceeded_message if {
	# Test that violation message is generated correctly
	msg := federation_constraints.is_classification_cap_exceeded with input as {
		"subject": {"countryOfAffiliation": "DEU", "clearance": "SECRET"},
		"resource": {"ownerTenant": "FRA", "classification": "SECRET", "COI": ["NATO"]},
	} with data.federation_constraints as constraints_bilateral_secret_confidential

	# Should contain violation details
	contains(msg, "SECRET")
	contains(msg, "CONFIDENTIAL")
	contains(msg, "FRA")
	contains(msg, "DEU")
}

##########################################################################################
# TEST: EDGE CASES
##########################################################################################

test_empty_coi_array if {
	# Empty COI array → ALLOW (nothing to deny)
	federation_constraints.check_coi_allowed("FRA", "DEU", []) with data.federation_constraints as constraints_bilateral_secret_confidential
}

test_unilateral_constraint_only if {
	# Only FRA→DEU exists (no DEU→FRA)
	# Should use FRA's rules only
	federation_constraints.check_coi_allowed("FRA", "DEU", ["NATO"]) with data.federation_constraints as {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": []}},
		},
	}
}
