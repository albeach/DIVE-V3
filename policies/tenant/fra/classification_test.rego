# Test Suite: France Classification Mapping
# Package: dive.tenant.fra.classification_test
#
# Tests for French national classification system (IGI 1300) to DIVE V3 standard and NATO equivalents.
# Covers accented and non-accented variants.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.fra.classification_test

import rego.v1

import data.dive.tenant.fra.classification

# ============================================
# Validation Tests
# ============================================

test_valid_non_classifie_accented if {
	classification.is_valid_classification("NON CLASSIFIÉ")
}

test_valid_non_classifie_no_accent if {
	classification.is_valid_classification("NON CLASSIFIE")
}

test_valid_diffusion_restreinte if {
	classification.is_valid_classification("DIFFUSION RESTREINTE")
}

test_valid_dr_abbreviation if {
	classification.is_valid_classification("DR")
}

test_valid_confidentiel_defense_accented if {
	classification.is_valid_classification("CONFIDENTIEL DÉFENSE")
}

test_valid_confidentiel_defense_no_accent if {
	classification.is_valid_classification("CONFIDENTIEL DEFENSE")
}

test_valid_secret_defense_accented if {
	classification.is_valid_classification("SECRET DÉFENSE")
}

test_valid_secret_defense_no_accent if {
	classification.is_valid_classification("SECRET DEFENSE")
}

test_valid_tres_secret_defense_accented if {
	classification.is_valid_classification("TRÈS SECRET DÉFENSE")
}

test_valid_tres_secret_defense_no_accent if {
	classification.is_valid_classification("TRES SECRET DEFENSE")
}

test_valid_tsd_abbreviation if {
	classification.is_valid_classification("TSD")
}

test_invalid_classification if {
	not classification.is_valid_classification("INVALID")
}

# ============================================
# Rank Tests
# ============================================

test_rank_non_classifie_is_0 if {
	classification.get_rank("NON CLASSIFIÉ") == 0
}

test_rank_non_classifie_no_accent_is_0 if {
	classification.get_rank("NON CLASSIFIE") == 0
}

test_rank_np_is_0 if {
	classification.get_rank("NP") == 0
}

test_rank_diffusion_restreinte_is_1 if {
	classification.get_rank("DIFFUSION RESTREINTE") == 1
}

test_rank_confidentiel_defense_is_2 if {
	classification.get_rank("CONFIDENTIEL DÉFENSE") == 2
}

test_rank_secret_defense_is_3 if {
	classification.get_rank("SECRET DÉFENSE") == 3
}

test_rank_tres_secret_defense_is_4 if {
	classification.get_rank("TRÈS SECRET DÉFENSE") == 4
}

test_rank_tsd_sf_is_5 if {
	classification.get_rank("TSD-SF") == 5
}

test_rank_invalid_is_negative if {
	classification.get_rank("INVALID") == -1
}

# ============================================
# DIVE V3 Standard Normalization Tests
# ============================================

test_normalize_non_classifie_to_unclassified if {
	classification.normalize("NON CLASSIFIÉ") == "UNCLASSIFIED"
}

test_normalize_diffusion_restreinte_to_restricted if {
	classification.normalize("DIFFUSION RESTREINTE") == "RESTRICTED"
}

test_normalize_confidentiel_defense_to_confidential if {
	classification.normalize("CONFIDENTIEL DÉFENSE") == "CONFIDENTIAL"
}

test_normalize_secret_defense_to_secret if {
	classification.normalize("SECRET DÉFENSE") == "SECRET"
}

test_normalize_tres_secret_defense_to_top_secret if {
	classification.normalize("TRÈS SECRET DÉFENSE") == "TOP_SECRET"
}

test_normalize_invalid_is_null if {
	classification.normalize("INVALID") == null
}

# ============================================
# NATO Equivalency Tests
# ============================================

test_nato_non_classifie if {
	classification.to_nato("NON CLASSIFIÉ") == "NATO_UNCLASSIFIED"
}

test_nato_diffusion_restreinte if {
	classification.to_nato("DIFFUSION RESTREINTE") == "NATO_RESTRICTED"
}

test_nato_confidentiel_defense if {
	classification.to_nato("CONFIDENTIEL DÉFENSE") == "NATO_CONFIDENTIAL"
}

test_nato_secret_defense if {
	classification.to_nato("SECRET DÉFENSE") == "NATO_SECRET"
}

test_nato_tres_secret_defense if {
	classification.to_nato("TRÈS SECRET DÉFENSE") == "COSMIC_TOP_SECRET"
}

test_nato_invalid_is_null if {
	classification.to_nato("INVALID") == null
}

# ============================================
# Clearance Sufficiency Tests
# ============================================

test_tsd_can_access_secret_defense if {
	classification.is_clearance_sufficient("TRÈS SECRET DÉFENSE", "SECRET DÉFENSE")
}

test_secret_defense_can_access_confidentiel if {
	classification.is_clearance_sufficient("SECRET DÉFENSE", "CONFIDENTIEL DÉFENSE")
}

test_secret_defense_cannot_access_tsd if {
	not classification.is_clearance_sufficient("SECRET DÉFENSE", "TRÈS SECRET DÉFENSE")
}

test_diffusion_restreinte_cannot_access_confidentiel if {
	not classification.is_clearance_sufficient("DIFFUSION RESTREINTE", "CONFIDENTIEL DÉFENSE")
}

test_confidentiel_defense_can_access_dr if {
	classification.is_clearance_sufficient("CONFIDENTIEL DÉFENSE", "DIFFUSION RESTREINTE")
}

# ============================================
# Comparison Tests
# ============================================

test_compare_tsd_greater_than_sd if {
	classification.compare("TRÈS SECRET DÉFENSE", "SECRET DÉFENSE") == 1
}

test_compare_sd_less_than_tsd if {
	classification.compare("SECRET DÉFENSE", "TRÈS SECRET DÉFENSE") == -1
}

test_compare_sd_equal_sd if {
	classification.compare("SECRET DÉFENSE", "SECRET DÉFENSE") == 0
}

# ============================================
# Special France (SF) Handling Tests
# ============================================

test_tsd_sf_is_special_france if {
	classification.is_special_france("TSD-SF")
}

test_tres_secret_special_france_is_sf if {
	classification.is_special_france("TRÈS SECRET DÉFENSE - SPÉCIAL FRANCE")
}

test_tsd_sf_requires_national_control if {
	classification.requires_national_control("TSD-SF")
}

test_secret_defense_not_special_france if {
	not classification.is_special_france("SECRET DÉFENSE")
}

# ============================================
# AAL Requirements Tests
# ============================================

test_aal_non_classifie_requires_1 if {
	classification.get_required_aal("NON CLASSIFIÉ") == 1
}

test_aal_diffusion_restreinte_requires_1 if {
	classification.get_required_aal("DIFFUSION RESTREINTE") == 1
}

test_aal_confidentiel_defense_requires_2 if {
	classification.get_required_aal("CONFIDENTIEL DÉFENSE") == 2
}

test_aal_secret_defense_requires_2 if {
	classification.get_required_aal("SECRET DÉFENSE") == 2
}

test_aal_tres_secret_defense_requires_3 if {
	classification.get_required_aal("TRÈS SECRET DÉFENSE") == 3
}

# ============================================
# Case Insensitivity Tests
# ============================================

test_lowercase_secret_defense_valid if {
	classification.is_valid_classification("secret defense")
}

# ============================================
# Abbreviation Tests
# ============================================

test_abbreviation_dr_normalize if {
	classification.normalize("DR") == "RESTRICTED"
}

test_abbreviation_cd_normalize if {
	classification.normalize("CD") == "CONFIDENTIAL"
}

test_abbreviation_sd_normalize if {
	classification.normalize("SD") == "SECRET"
}

test_abbreviation_tsd_normalize if {
	classification.normalize("TSD") == "TOP_SECRET"
}

# ============================================
# Error Message Tests
# ============================================

test_invalid_classification_message_french if {
	msg := classification.invalid_classification_msg("UNKNOWN")
	contains(msg, "française")
}





