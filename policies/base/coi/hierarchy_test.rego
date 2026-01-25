# COI Hierarchy Tests
# Package: dive.base.coi.hierarchy
#
# Test suite for hierarchical COI access control
# Validates that broader COI memberships grant access to narrower COIs
#
# Version: 1.0.0
# Date: 2026-01-25

package dive.base.coi.hierarchy

import rego.v1

# ============================================
# Test: COI Expansion
# ============================================

test_expand_nato_includes_bilaterals if {
	user_cois := ["NATO"]
	effective := expand_user_cois(user_cois)

	# NATO should expand to include bilateral agreements
	"NATO" in effective
	"FRA-US" in effective
	"GBR-US" in effective
	"DEU-US" in effective
	"CAN-US" in effective
}

test_expand_fvey_includes_bilaterals if {
	user_cois := ["FVEY"]
	effective := expand_user_cois(user_cois)

	# FVEY should expand to include FVEY bilateral agreements
	"FVEY" in effective
	"CAN-US" in effective
	"GBR-US" in effective
	"AUKUS" in effective
}

test_expand_multiple_cois if {
	user_cois := ["NATO", "FVEY"]
	effective := expand_user_cois(user_cois)

	# Should include both direct and implied COIs
	"NATO" in effective
	"FVEY" in effective
	"FRA-US" in effective # from NATO
	"GBR-US" in effective # from both NATO and FVEY
	"CAN-US" in effective # from both NATO and FVEY
	"DEU-US" in effective # from NATO
	"AUKUS" in effective # from FVEY
}

test_expand_no_children if {
	user_cois := ["US-ONLY"]
	effective := expand_user_cois(user_cois)

	# US-ONLY has no children - only itself
	effective == {"US-ONLY"}
}

test_expand_empty_cois if {
	user_cois := []
	effective := expand_user_cois(user_cois)

	# Empty input returns empty set
	effective == set()
}

# ============================================
# Test: Hierarchical Access (ALL operator)
# ============================================

test_hierarchical_all_nato_user_fra_us_resource if {
	# User with NATO should access FRA-US resource
	user_cois := ["NATO"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_fvey_user_can_us_resource if {
	# User with FVEY should access CAN-US resource
	user_cois := ["FVEY"]
	resource_cois := ["CAN-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_nato_fvey_user_gbr_us_resource if {
	# User with NATO+FVEY should access GBR-US resource
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["GBR-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_admin_usa_multi_bilateral if {
	# Real scenario: admin-usa with NATO+FVEY accessing FRA-US resource
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_deny_missing_parent if {
	# User without NATO should NOT access FRA-US
	user_cois := ["US-ONLY"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_deny_partial_match if {
	# User with NATO should NOT access resource requiring FRA-US + EU-RESTRICTED
	# (NATO grants FRA-US but not EU-RESTRICTED)
	user_cois := ["NATO"]
	resource_cois := ["FRA-US", "EU-RESTRICTED"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

test_hierarchical_all_empty_resource_cois if {
	# Empty resource COI should always allow
	user_cois := ["NATO"]
	resource_cois := []
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Hierarchical Access (ANY operator)
# ============================================

test_hierarchical_any_nato_user_fra_us_resource if {
	# User with NATO should access resource tagged FRA-US (ANY mode)
	user_cois := ["NATO"]
	resource_cois := ["FRA-US"]
	operator := "ANY"

	has_hierarchical_access_any(user_cois, resource_cois)
}

test_hierarchical_any_nato_user_multi_bilateral if {
	# User with NATO accessing resource with FRA-US OR GBR-US (ANY mode)
	user_cois := ["NATO"]
	resource_cois := ["FRA-US", "GBR-US"]
	operator := "ANY"

	has_hierarchical_access_any(user_cois, resource_cois)
}

test_hierarchical_any_fvey_user_nato_resource if {
	# User with FVEY should NOT access NATO-only resource (ANY mode)
	# NATO is broader than FVEY, so hierarchy doesn't apply in reverse
	user_cois := ["FVEY"]
	resource_cois := ["NATO"]
	operator := "ANY"

	not has_hierarchical_access_any(user_cois, resource_cois)
}

test_hierarchical_any_deny_no_match if {
	# User with US-ONLY should NOT access FRA-US (no hierarchical relationship)
	user_cois := ["US-ONLY"]
	resource_cois := ["FRA-US"]
	operator := "ANY"

	not has_hierarchical_access_any(user_cois, resource_cois)
}

# ============================================
# Test: Unified Access Check
# ============================================

test_unified_all_operator if {
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	has_hierarchical_access(user_cois, resource_cois, operator)
}

test_unified_any_operator if {
	user_cois := ["FVEY"]
	resource_cois := ["CAN-US", "DEU-US"]
	operator := "ANY"

	# FVEY grants CAN-US, so ANY is satisfied
	has_hierarchical_access(user_cois, resource_cois, operator)
}

test_unified_default_operator if {
	# No operator specified - defaults to ALL
	user_cois := ["NATO"]
	resource_cois := ["FRA-US"]

	has_hierarchical_access(user_cois, resource_cois, "")
}

# ============================================
# Test: Complex Scenarios
# ============================================

test_scenario_admin_usa_accessing_fra_us if {
	# Real-world scenario: admin-usa with NATO+FVEY accessing FRA-US bilateral doc
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	# Should ALLOW (NATO grants FRA-US)
	has_hierarchical_access_all(user_cois, resource_cois)

	# Verify expansion worked
	effective := expand_user_cois(user_cois)
	"FRA-US" in effective
}

test_scenario_admin_usa_accessing_multi_bilateral if {
	# admin-usa accessing resource with multiple bilateral COIs
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["FRA-US", "GBR-US"]
	operator := "ALL"

	# Should ALLOW (NATO grants both FRA-US and GBR-US)
	has_hierarchical_access_all(user_cois, resource_cois)
}

test_scenario_fvey_user_cannot_access_deu_us if {
	# FVEY user trying to access DEU-US bilateral
	# Germany is NOT a FVEY member, so this should DENY
	user_cois := ["FVEY"]
	resource_cois := ["DEU-US"]
	operator := "ALL"

	# Should DENY (FVEY does not grant DEU-US)
	not has_hierarchical_access_all(user_cois, resource_cois)
}

test_scenario_eucom_user_accessing_fra_us if {
	# EUCOM (regional command) user accessing FRA-US
	user_cois := ["EUCOM"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	# Should ALLOW (EUCOM includes FRA-US in its AOR)
	has_hierarchical_access_all(user_cois, resource_cois)
}

test_scenario_contractor_with_bilateral_only if {
	# Contractor with explicit FRA-US tag (no NATO/FVEY)
	user_cois := ["FRA-US"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	# Should ALLOW (direct match, no hierarchy needed)
	has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Hierarchy Explanation
# ============================================

test_explanation_nato_grants_fra_us if {
	user_cois := ["NATO"]
	resource_cois := ["FRA-US"]

	explanation := hierarchy_explanation(user_cois, resource_cois)
	explanation == "NATO implies FRA-US"
}

test_explanation_multiple_implications if {
	user_cois := ["NATO", "FVEY"]
	resource_cois := ["CAN-US"]

	explanation := hierarchy_explanation(user_cois, resource_cois)

	# Both NATO and FVEY grant CAN-US
	contains(explanation, "NATO implies CAN-US")
	contains(explanation, "FVEY implies CAN-US")
}

test_explanation_no_implications if {
	user_cois := ["US-ONLY"]
	resource_cois := ["US-ONLY"]

	explanation := hierarchy_explanation(user_cois, resource_cois)
	explanation == ""
}

# ============================================
# Test: Grants Implied Access
# ============================================

test_grants_fra_us_via_nato if {
	user_cois := ["NATO"]
	target_coi := "FRA-US"

	grants_implied_access(user_cois, target_coi)
}

test_does_not_grant_deu_us_via_fvey if {
	user_cois := ["FVEY"]
	target_coi := "DEU-US"

	not grants_implied_access(user_cois, target_coi)
}

test_grants_can_us_via_multiple_parents if {
	user_cois := ["NATO", "FVEY", "NORTHCOM"]
	target_coi := "CAN-US"

	# All three grant CAN-US
	grants_implied_access(user_cois, target_coi)

	# Verify all parents are identified
	parents := parent_cois_granting_access(user_cois, target_coi)
	"NATO" in parents
	"FVEY" in parents
	"NORTHCOM" in parents
}

# ============================================
# Test: Edge Cases
# ============================================

test_hierarchy_does_not_create_loops if {
	# Ensure hierarchy doesn't create circular dependencies
	user_cois := ["FRA-US"]
	effective := expand_user_cois(user_cois)

	# Should only contain FRA-US itself (no parent-child loop)
	effective == {"FRA-US"}
}

test_hierarchy_preserves_direct_tags if {
	# User with direct tags should still have them after expansion
	user_cois := ["FRA-US", "GBR-US"]
	effective := expand_user_cois(user_cois)

	"FRA-US" in effective
	"GBR-US" in effective
}

test_hierarchy_with_unknown_coi if {
	# User with unknown COI should not cause errors
	user_cois := ["UNKNOWN-COI"]
	effective := expand_user_cois(user_cois)

	# Should just contain the unknown COI itself
	effective == {"UNKNOWN-COI"}
}

# ============================================
# Test: NATO-COSMIC Hierarchy
# ============================================

test_nato_cosmic_grants_regular_nato if {
	user_cois := ["NATO-COSMIC"]
	resource_cois := ["NATO"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_nato_cosmic_grants_all_bilaterals if {
	user_cois := ["NATO-COSMIC"]
	resource_cois := ["FRA-US", "GBR-US", "DEU-US", "CAN-US"]
	operator := "ALL"

	# COSMIC clearance grants access to all NATO bilaterals
	has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: AUKUS Hierarchy
# ============================================

test_aukus_grants_gbr_us if {
	user_cois := ["AUKUS"]
	resource_cois := ["GBR-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_fvey_grants_aukus if {
	# FVEY includes AUKUS (Australia, UK, US are all FVEY members)
	user_cois := ["FVEY"]
	resource_cois := ["AUKUS"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Regional Command Hierarchies
# ============================================

test_eucom_grants_european_bilaterals if {
	user_cois := ["EUCOM"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_eucom_grants_gbr_us if {
	user_cois := ["EUCOM"]
	resource_cois := ["GBR-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_eucom_grants_deu_us if {
	user_cois := ["EUCOM"]
	resource_cois := ["DEU-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_northcom_grants_can_us if {
	user_cois := ["NORTHCOM"]
	resource_cois := ["CAN-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_northcom_does_not_grant_fra_us if {
	# NORTHCOM (North America) should NOT grant FRA-US (Europe)
	user_cois := ["NORTHCOM"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Mutual Exclusivity Respected
# ============================================

test_us_only_does_not_grant_bilaterals if {
	# US-ONLY should NOT grant access to bilateral agreements
	user_cois := ["US-ONLY"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

test_us_only_does_not_grant_nato if {
	# US-ONLY should NOT grant access to NATO resources
	user_cois := ["US-ONLY"]
	resource_cois := ["NATO"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Hierarchy Does Not Work in Reverse
# ============================================

test_bilateral_does_not_grant_nato if {
	# Having FRA-US should NOT grant access to NATO resources
	# (hierarchy only works downward: broad → narrow, not narrow → broad)
	user_cois := ["FRA-US"]
	resource_cois := ["NATO"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

test_bilateral_does_not_grant_fvey if {
	# Having CAN-US should NOT grant access to FVEY resources
	user_cois := ["CAN-US"]
	resource_cois := ["FVEY"]
	operator := "ALL"

	not has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Test: Parent COI Identification
# ============================================

test_parent_cois_single_parent if {
	user_cois := ["EUCOM"]
	target_coi := "FRA-US"

	parents := parent_cois_granting_access(user_cois, target_coi)
	parents == {"EUCOM"}
}

test_parent_cois_multiple_parents if {
	user_cois := ["NATO", "EUCOM"]
	target_coi := "FRA-US"

	parents := parent_cois_granting_access(user_cois, target_coi)

	# Both NATO and EUCOM grant FRA-US
	"NATO" in parents
	"EUCOM" in parents
	count(parents) == 2
}

test_parent_cois_no_parents if {
	user_cois := ["US-ONLY"]
	target_coi := "FRA-US"

	parents := parent_cois_granting_access(user_cois, target_coi)
	count(parents) == 0
}

# ============================================
# Test: Real-World Scenarios
# ============================================

test_real_world_admin_usa_dashboard if {
	# admin-usa (NATO + FVEY) viewing dashboard with mixed resources
	user_cois := ["NATO", "FVEY"]

	# Can access NATO resource
	has_hierarchical_access_all(user_cois, ["NATO"])

	# Can access FVEY resource
	has_hierarchical_access_all(user_cois, ["FVEY"])

	# Can access FRA-US bilateral
	has_hierarchical_access_all(user_cois, ["FRA-US"])

	# Can access GBR-US bilateral
	has_hierarchical_access_all(user_cois, ["GBR-US"])

	# Can access CAN-US bilateral
	has_hierarchical_access_all(user_cois, ["CAN-US"])

	# Can access DEU-US bilateral
	has_hierarchical_access_all(user_cois, ["DEU-US"])

	# CANNOT access US-ONLY (mutually exclusive)
	not has_hierarchical_access_all(user_cois, ["US-ONLY"])
}

test_real_world_french_officer if {
	# French officer with NATO tag accessing FRA-US doc
	user_cois := ["NATO"]
	resource_cois := ["FRA-US"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_real_world_fvey_analyst if {
	# Five Eyes analyst accessing AUKUS resource
	user_cois := ["FVEY"]
	resource_cois := ["AUKUS"]
	operator := "ALL"

	has_hierarchical_access_all(user_cois, resource_cois)
}

test_real_world_contractor_limited if {
	# Contractor with only FRA-US bilateral (no broader access)
	user_cois := ["FRA-US"]

	# Can access FRA-US
	has_hierarchical_access_all(user_cois, ["FRA-US"])

	# Cannot access NATO (no upward hierarchy)
	not has_hierarchical_access_all(user_cois, ["NATO"])

	# Cannot access FVEY
	not has_hierarchical_access_all(user_cois, ["FVEY"])

	# Cannot access other bilaterals
	not has_hierarchical_access_all(user_cois, ["GBR-US"])
}
