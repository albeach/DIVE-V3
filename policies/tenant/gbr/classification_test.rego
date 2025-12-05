# Test Suite: UK Classification Mapping
# Package: dive.tenant.gbr.classification_test
#
# Tests for UK national classification system (GSC) to DIVE V3 standard and NATO equivalents.
# Covers OFFICIAL/OFFICIAL-SENSITIVE, SECRET, TOP SECRET levels.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.gbr.classification_test

import rego.v1

import data.dive.tenant.gbr.classification

# ============================================
# Validation Tests
# ============================================

test_valid_unclassified if {
	classification.is_valid_classification("UNCLASSIFIED")
}

test_valid_official if {
	classification.is_valid_classification("OFFICIAL")
}

test_valid_official_sensitive_hyphen if {
	classification.is_valid_classification("OFFICIAL-SENSITIVE")
}

test_valid_official_sensitive_colon if {
	classification.is_valid_classification("OFFICIAL: SENSITIVE")
}

test_valid_official_sensitive_commercial if {
	classification.is_valid_classification("OFFICIAL-SENSITIVE: COMMERCIAL")
}

test_valid_official_sensitive_locsen if {
	classification.is_valid_classification("OFFICIAL-SENSITIVE: LOCSEN")
}

test_valid_official_sensitive_personal if {
	classification.is_valid_classification("OFFICIAL-SENSITIVE: PERSONAL")
}

test_valid_secret if {
	classification.is_valid_classification("SECRET")
}

test_valid_uk_secret if {
	classification.is_valid_classification("UK SECRET")
}

test_valid_uk_eyes_only if {
	classification.is_valid_classification("UK EYES ONLY")
}

test_valid_top_secret if {
	classification.is_valid_classification("TOP SECRET")
}

test_valid_uk_top_secret if {
	classification.is_valid_classification("UK TOP SECRET")
}

test_valid_strap if {
	classification.is_valid_classification("STRAP 1")
}

test_invalid_classification if {
	not classification.is_valid_classification("INVALID")
}

# ============================================
# Rank Tests
# ============================================

test_rank_unclassified_is_0 if {
	classification.get_rank("UNCLASSIFIED") == 0
}

test_rank_official_is_1 if {
	classification.get_rank("OFFICIAL") == 1
}

test_rank_official_sensitive_is_1 if {
	classification.get_rank("OFFICIAL-SENSITIVE") == 1
}

test_rank_secret_is_2 if {
	classification.get_rank("SECRET") == 2
}

test_rank_uk_eyes_only_is_3 if {
	classification.get_rank("UK EYES ONLY") == 3
}

test_rank_top_secret_is_4 if {
	classification.get_rank("TOP SECRET") == 4
}

test_rank_strap_is_5 if {
	classification.get_rank("STRAP 1") == 5
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

test_normalize_official_to_restricted if {
	classification.normalize("OFFICIAL") == "RESTRICTED"
}

test_normalize_official_sensitive_to_restricted if {
	classification.normalize("OFFICIAL-SENSITIVE") == "RESTRICTED"
}

test_normalize_secret if {
	classification.normalize("SECRET") == "SECRET"
}

test_normalize_uk_eyes_only_to_secret if {
	classification.normalize("UK EYES ONLY") == "SECRET"
}

test_normalize_top_secret if {
	classification.normalize("TOP SECRET") == "TOP_SECRET"
}

test_normalize_strap_to_top_secret if {
	classification.normalize("STRAP 1") == "TOP_SECRET"
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

test_nato_official if {
	classification.to_nato("OFFICIAL") == "NATO_RESTRICTED"
}

test_nato_official_sensitive if {
	classification.to_nato("OFFICIAL-SENSITIVE") == "NATO_RESTRICTED"
}

test_nato_secret if {
	classification.to_nato("SECRET") == "NATO_SECRET"
}

test_nato_uk_eyes_only if {
	classification.to_nato("UK EYES ONLY") == "NATO_SECRET"
}

test_nato_top_secret if {
	classification.to_nato("TOP SECRET") == "COSMIC_TOP_SECRET"
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

test_ts_can_access_official if {
	classification.is_clearance_sufficient("TOP SECRET", "OFFICIAL")
}

test_secret_can_access_official_sensitive if {
	classification.is_clearance_sufficient("SECRET", "OFFICIAL-SENSITIVE")
}

test_secret_cannot_access_ts if {
	not classification.is_clearance_sufficient("SECRET", "TOP SECRET")
}

test_official_cannot_access_secret if {
	not classification.is_clearance_sufficient("OFFICIAL", "SECRET")
}

test_official_can_access_unclassified if {
	classification.is_clearance_sufficient("OFFICIAL", "UNCLASSIFIED")
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
# UK Eyes Only (UKEO) Handling Tests
# ============================================

test_uk_eyes_only_is_ukeo if {
	classification.is_uk_eyes_only("UK EYES ONLY")
}

test_ukeo_abbreviation_is_ukeo if {
	classification.is_uk_eyes_only("UKEO")
}

test_ukeo_requires_national_control if {
	classification.requires_national_control("UK EYES ONLY")
}

test_secret_not_ukeo if {
	not classification.is_uk_eyes_only("SECRET")
}

# ============================================
# STRAP Handling Tests
# ============================================

test_strap_1_is_strap_level if {
	classification.is_strap_level("STRAP 1")
}

test_strap_2_is_strap_level if {
	classification.is_strap_level("STRAP 2")
}

test_strap_3_is_strap_level if {
	classification.is_strap_level("STRAP 3")
}

test_strap_requires_compartment_check if {
	classification.requires_compartment_check("STRAP 1")
}

test_ts_not_strap_level if {
	not classification.is_strap_level("TOP SECRET")
}

# ============================================
# Handling Instructions Tests
# ============================================

test_get_handling_commercial if {
	classification.get_handling_instruction("OFFICIAL-SENSITIVE: COMMERCIAL") == "COMMERCIAL"
}

test_get_handling_locsen if {
	classification.get_handling_instruction("OFFICIAL-SENSITIVE: LOCSEN") == "LOCSEN"
}

test_get_handling_personal if {
	classification.get_handling_instruction("OFFICIAL-SENSITIVE: PERSONAL") == "PERSONAL"
}

test_get_handling_general if {
	classification.get_handling_instruction("OFFICIAL: SENSITIVE") == "GENERAL"
}

test_no_handling_for_secret if {
	classification.get_handling_instruction("SECRET") == null
}

# ============================================
# AAL Requirements Tests
# ============================================

test_aal_unclassified_requires_1 if {
	classification.get_required_aal("UNCLASSIFIED") == 1
}

test_aal_official_requires_1 if {
	classification.get_required_aal("OFFICIAL") == 1
}

test_aal_official_sensitive_requires_2 if {
	classification.get_required_aal("OFFICIAL-SENSITIVE") == 2
}

test_aal_secret_requires_2 if {
	classification.get_required_aal("SECRET") == 2
}

test_aal_top_secret_requires_3 if {
	classification.get_required_aal("TOP SECRET") == 3
}

# ============================================
# Case Insensitivity Tests
# ============================================

test_lowercase_secret_valid if {
	classification.is_valid_classification("secret")
}

# ============================================
# Error Message Tests
# ============================================

test_invalid_classification_message_uk if {
	msg := classification.invalid_classification_msg("UNKNOWN")
	contains(msg, "Unrecognised")
}






