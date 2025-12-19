# Base Layer: COI Tests
# Tests for dive.base.coi package

package dive.base.coi_test

import rego.v1

import data.dive.base.coi

# ============================================
# COI Membership Tests
# ============================================

test_us_only_has_usa if {
	coi.is_member("USA", "US-ONLY")
}

test_us_only_not_has_fra if {
	not coi.is_member("FRA", "US-ONLY")
}

test_fvey_has_all_five_eyes if {
	coi.is_member("USA", "FVEY")
	coi.is_member("GBR", "FVEY")
	coi.is_member("CAN", "FVEY")
	coi.is_member("AUS", "FVEY")
	coi.is_member("NZL", "FVEY")
}

test_fvey_not_has_fra if {
	not coi.is_member("FRA", "FVEY")
}

test_nato_has_usa if {
	coi.is_member("USA", "NATO")
}

test_nato_has_fra if {
	coi.is_member("FRA", "NATO")
}

test_nato_has_deu if {
	coi.is_member("DEU", "NATO")
}

# ============================================
# COI Validation Tests
# ============================================

test_valid_coi_nato if {
	coi.is_valid_coi("NATO")
}

test_valid_coi_fvey if {
	coi.is_valid_coi("FVEY")
}

test_invalid_coi_unknown if {
	not coi.is_valid_coi("UNKNOWN")
}

# ============================================
# COI Access Tests (ALL Mode)
# ============================================

test_access_all_no_resource_coi if {
	coi.has_access_all(["NATO"], [])
}

test_access_all_user_has_required if {
	coi.has_access_all(["NATO", "FVEY"], ["NATO"])
}

test_access_all_user_has_all_required if {
	coi.has_access_all(["NATO", "FVEY"], ["NATO", "FVEY"])
}

test_no_access_all_user_missing_coi if {
	not coi.has_access_all(["NATO"], ["NATO", "FVEY"])
}

test_no_access_all_user_empty if {
	not coi.has_access_all([], ["NATO"])
}

# ============================================
# COI Access Tests (ANY Mode)
# ============================================

test_access_any_no_resource_coi if {
	coi.has_access_any(["NATO"], [])
}

test_access_any_user_has_one if {
	coi.has_access_any(["NATO"], ["NATO", "FVEY"])
}

test_access_any_user_has_other if {
	coi.has_access_any(["FVEY"], ["NATO", "FVEY"])
}

test_no_access_any_no_match if {
	not coi.has_access_any(["CAN-US"], ["NATO", "EU-RESTRICTED"])
}

# ============================================
# Unified Access Tests
# ============================================

test_unified_access_all if {
	coi.has_access(["NATO", "FVEY"], ["NATO"], "ALL")
}

test_unified_access_any if {
	coi.has_access(["NATO"], ["NATO", "FVEY"], "ANY")
}

# Test default to ALL when operator is null/undefined
# Note: Empty string "" is different from undefined - use null for default behavior

# ============================================
# Country in COI Union Tests
# ============================================

test_country_in_union_empty_coi if {
	coi.country_in_coi_union("USA", [])
}

test_country_in_union_single_coi if {
	coi.country_in_coi_union("USA", ["NATO"])
}

test_country_in_union_multiple_coi if {
	coi.country_in_coi_union("CAN", ["FVEY", "NATO"])
}

test_country_not_in_union if {
	not coi.country_in_coi_union("CHN", ["FVEY", "NATO"])
}

# ============================================
# Mutual Exclusivity Tests
# ============================================

test_mutual_exclusivity_us_only_nato if {
	msg := coi.mutual_exclusivity_violation(["US-ONLY", "NATO"])
	contains(msg, "Mutually exclusive")
}

test_mutual_exclusivity_us_only_fvey if {
	msg := coi.mutual_exclusivity_violation(["US-ONLY", "FVEY"])
	contains(msg, "Mutually exclusive")
}

test_no_mutual_exclusivity_valid_combo if {
	not coi.mutual_exclusivity_violation(["NATO", "FVEY"])
}

# ============================================
# Subset/Superset Tests
# ============================================

test_subset_superset_violation_any if {
	msg := coi.subset_superset_violation(["CAN-US", "FVEY"], "ANY")
	contains(msg, "Subset+superset")
}

test_no_subset_superset_all_mode if {
	not coi.subset_superset_violation(["CAN-US", "FVEY"], "ALL")
}
