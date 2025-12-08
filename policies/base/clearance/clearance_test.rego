# Base Layer: Clearance Tests
# Tests for dive.base.clearance package

package dive.base.clearance_test

import rego.v1

import data.dive.base.clearance

# ============================================
# Clearance Rank Tests
# ============================================

test_clearance_rank_unclassified if {
	clearance.clearance_rank["UNCLASSIFIED"] == 0
}

test_clearance_rank_restricted if {
	clearance.clearance_rank["RESTRICTED"] == 1
}

test_clearance_rank_confidential if {
	clearance.clearance_rank["CONFIDENTIAL"] == 2
}

test_clearance_rank_secret if {
	clearance.clearance_rank["SECRET"] == 3
}

test_clearance_rank_top_secret if {
	clearance.clearance_rank["TOP_SECRET"] == 4
}

# ============================================
# Sufficient Clearance Tests
# ============================================

test_sufficient_equal_clearance if {
	clearance.sufficient("SECRET", "SECRET")
}

test_sufficient_higher_clearance if {
	clearance.sufficient("TOP_SECRET", "SECRET")
}

test_sufficient_highest_access_lowest if {
	clearance.sufficient("TOP_SECRET", "UNCLASSIFIED")
}

test_not_sufficient_lower_clearance if {
	not clearance.sufficient("SECRET", "TOP_SECRET")
}

test_not_sufficient_unclassified_to_secret if {
	not clearance.sufficient("UNCLASSIFIED", "SECRET")
}

test_restricted_can_access_unclassified if {
	clearance.sufficient("RESTRICTED", "UNCLASSIFIED")
}

test_unclassified_cannot_access_restricted if {
	not clearance.sufficient("UNCLASSIFIED", "RESTRICTED")
}

# ============================================
# Validation Tests
# ============================================

test_is_valid_secret if {
	clearance.is_valid("SECRET")
}

test_is_valid_top_secret if {
	clearance.is_valid("TOP_SECRET")
}

test_not_valid_invalid_clearance if {
	not clearance.is_valid("INVALID")
}

test_not_valid_empty if {
	not clearance.is_valid("")
}

test_not_valid_lowercase if {
	not clearance.is_valid("secret")
}

# ============================================
# Rank Function Tests
# ============================================

test_rank_secret_is_3 if {
	clearance.rank("SECRET") == 3
}

test_rank_invalid_is_negative_1 if {
	clearance.rank("INVALID") == -1
}

# ============================================
# Compare Function Tests
# ============================================

test_compare_equal if {
	clearance.compare("SECRET", "SECRET") == 0
}

test_compare_higher if {
	clearance.compare("TOP_SECRET", "SECRET") == 1
}

test_compare_lower if {
	clearance.compare("SECRET", "TOP_SECRET") == -1
}

# ============================================
# AAL Requirement Tests
# ============================================

test_aal_unclassified_requires_1 if {
	clearance.required_aal("UNCLASSIFIED") == 1
}

test_aal_restricted_requires_1 if {
	clearance.required_aal("RESTRICTED") == 1
}

test_aal_confidential_requires_2 if {
	clearance.required_aal("CONFIDENTIAL") == 2
}

test_aal_secret_requires_2 if {
	clearance.required_aal("SECRET") == 2
}

test_aal_top_secret_requires_3 if {
	clearance.required_aal("TOP_SECRET") == 3
}

# ============================================
# AAL Sufficient Tests
# ============================================

test_aal1_sufficient_for_unclassified if {
	clearance.aal_sufficient(1, "UNCLASSIFIED")
}

test_aal2_sufficient_for_secret if {
	clearance.aal_sufficient(2, "SECRET")
}

test_aal3_sufficient_for_top_secret if {
	clearance.aal_sufficient(3, "TOP_SECRET")
}

test_aal1_not_sufficient_for_secret if {
	not clearance.aal_sufficient(1, "SECRET")
}

test_aal2_not_sufficient_for_top_secret if {
	not clearance.aal_sufficient(2, "TOP_SECRET")
}

test_aal3_sufficient_for_all if {
	clearance.aal_sufficient(3, "UNCLASSIFIED")
	clearance.aal_sufficient(3, "CONFIDENTIAL")
	clearance.aal_sufficient(3, "SECRET")
	clearance.aal_sufficient(3, "TOP_SECRET")
}







