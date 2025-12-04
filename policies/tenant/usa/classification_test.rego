# Test Suite: USA Classification Mapping
# Package: dive.tenant.usa.classification_test
#
# Tests for USA national classification system to DIVE V3 standard and NATO equivalents.
# Covers all clearance levels, abbreviations, and edge cases.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.usa.classification_test

import rego.v1

import data.dive.tenant.usa.classification

# ============================================
# Validation Tests
# ============================================

test_valid_unclassified if {
	classification.is_valid_classification("UNCLASSIFIED")
}

test_valid_u_abbreviation if {
	classification.is_valid_classification("U")
}

test_valid_confidential if {
	classification.is_valid_classification("CONFIDENTIAL")
}

test_valid_secret if {
	classification.is_valid_classification("SECRET")
}

test_valid_top_secret if {
	classification.is_valid_classification("TOP SECRET")
}

test_valid_top_secret_underscore if {
	classification.is_valid_classification("TOP_SECRET")
}

test_valid_fouo if {
	classification.is_valid_classification("FOUO")
}

test_valid_ts_sci if {
	classification.is_valid_classification("TS/SCI")
}

test_invalid_classification if {
	not classification.is_valid_classification("INVALID")
}

test_invalid_lowercase if {
	# Function should handle case-insensitivity
	classification.is_valid_classification("secret")
}

# ============================================
# Rank Tests
# ============================================

test_rank_unclassified_is_0 if {
	classification.get_rank("UNCLASSIFIED") == 0
}

test_rank_u_is_0 if {
	classification.get_rank("U") == 0
}

test_rank_fouo_is_1 if {
	classification.get_rank("FOUO") == 1
}

test_rank_confidential_is_2 if {
	classification.get_rank("CONFIDENTIAL") == 2
}

test_rank_secret_is_3 if {
	classification.get_rank("SECRET") == 3
}

test_rank_top_secret_is_4 if {
	classification.get_rank("TOP SECRET") == 4
}

test_rank_ts_sci_is_5 if {
	classification.get_rank("TS/SCI") == 5
}

test_rank_invalid_is_negative if {
	classification.get_rank("INVALID") == -1
}

# ============================================
# DIVE V3 Standard Normalization Tests
# ============================================

test_normalize_unclassified if {
	classification.normalize("UNCLASSIFIED") == "UNCLASSIFIED"
}

test_normalize_u_to_unclassified if {
	classification.normalize("U") == "UNCLASSIFIED"
}

test_normalize_fouo_to_restricted if {
	classification.normalize("FOUO") == "RESTRICTED"
}

test_normalize_cui_to_restricted if {
	classification.normalize("CUI") == "RESTRICTED"
}

test_normalize_confidential if {
	classification.normalize("CONFIDENTIAL") == "CONFIDENTIAL"
}

test_normalize_secret if {
	classification.normalize("SECRET") == "SECRET"
}

test_normalize_top_secret if {
	classification.normalize("TOP SECRET") == "TOP_SECRET"
}

test_normalize_ts_sci_to_top_secret if {
	classification.normalize("TS/SCI") == "TOP_SECRET"
}

test_normalize_invalid_is_null if {
	classification.normalize("INVALID") == null
}

# ============================================
# NATO Equivalency Tests
# ============================================

test_nato_unclassified if {
	classification.to_nato("UNCLASSIFIED") == "NATO_UNCLASSIFIED"
}

test_nato_fouo if {
	classification.to_nato("FOUO") == "NATO_RESTRICTED"
}

test_nato_confidential if {
	classification.to_nato("CONFIDENTIAL") == "NATO_CONFIDENTIAL"
}

test_nato_secret if {
	classification.to_nato("SECRET") == "NATO_SECRET"
}

test_nato_top_secret if {
	classification.to_nato("TOP SECRET") == "COSMIC_TOP_SECRET"
}

test_nato_ts_sci if {
	classification.to_nato("TS/SCI") == "COSMIC_TOP_SECRET"
}

test_nato_invalid_is_null if {
	classification.to_nato("INVALID") == null
}

# ============================================
# Clearance Sufficiency Tests
# ============================================

test_ts_can_access_secret if {
	classification.is_clearance_sufficient("TOP SECRET", "SECRET")
}

test_ts_can_access_confidential if {
	classification.is_clearance_sufficient("TOP SECRET", "CONFIDENTIAL")
}

test_ts_can_access_unclassified if {
	classification.is_clearance_sufficient("TOP SECRET", "UNCLASSIFIED")
}

test_secret_can_access_secret if {
	classification.is_clearance_sufficient("SECRET", "SECRET")
}

test_secret_can_access_confidential if {
	classification.is_clearance_sufficient("SECRET", "CONFIDENTIAL")
}

test_secret_cannot_access_ts if {
	not classification.is_clearance_sufficient("SECRET", "TOP SECRET")
}

test_confidential_cannot_access_secret if {
	not classification.is_clearance_sufficient("CONFIDENTIAL", "SECRET")
}

test_unclassified_cannot_access_fouo if {
	not classification.is_clearance_sufficient("UNCLASSIFIED", "FOUO")
}

test_fouo_can_access_unclassified if {
	classification.is_clearance_sufficient("FOUO", "UNCLASSIFIED")
}

# ============================================
# Comparison Tests
# ============================================

test_compare_ts_greater_than_secret if {
	classification.compare("TOP SECRET", "SECRET") == 1
}

test_compare_secret_less_than_ts if {
	classification.compare("SECRET", "TOP SECRET") == -1
}

test_compare_secret_equal_secret if {
	classification.compare("SECRET", "SECRET") == 0
}

# ============================================
# SCI Handling Tests
# ============================================

test_ts_sci_is_sci_level if {
	classification.is_sci_level("TS/SCI")
}

test_ts_sci_requires_compartment_check if {
	classification.requires_compartment_check("TS/SCI")
}

test_secret_not_sci_level if {
	not classification.is_sci_level("SECRET")
}

test_secret_no_compartment_check if {
	not classification.requires_compartment_check("SECRET")
}

# ============================================
# AAL Requirements Tests
# ============================================

test_aal_unclassified_requires_1 if {
	classification.get_required_aal("UNCLASSIFIED") == 1
}

test_aal_fouo_requires_1 if {
	classification.get_required_aal("FOUO") == 1
}

test_aal_confidential_requires_2 if {
	classification.get_required_aal("CONFIDENTIAL") == 2
}

test_aal_secret_requires_2 if {
	classification.get_required_aal("SECRET") == 2
}

test_aal_top_secret_requires_3 if {
	classification.get_required_aal("TOP SECRET") == 3
}

test_aal_ts_sci_requires_3 if {
	classification.get_required_aal("TS/SCI") == 3
}

# ============================================
# Case Insensitivity Tests
# ============================================

test_lowercase_secret_valid if {
	classification.is_valid_classification("secret")
}

test_lowercase_secret_rank if {
	classification.get_rank("secret") == 3
}

test_mixed_case_normalize if {
	classification.normalize("Secret") == "SECRET"
}

# ============================================
# Error Message Tests
# ============================================

test_invalid_classification_message if {
	msg := classification.invalid_classification_msg("UNKNOWN")
	contains(msg, "UNKNOWN")
}

test_insufficient_clearance_message if {
	msg := classification.insufficient_clearance_msg("SECRET", "TOP SECRET")
	contains(msg, "SECRET")
	contains(msg, "TOP SECRET")
}




