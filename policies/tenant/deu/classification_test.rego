# Test Suite: Germany Classification Mapping
# Package: dive.tenant.deu.classification_test
#
# Tests for German national classification system (VSA) to DIVE V3 standard and NATO equivalents.
# Covers umlauted (ü) and non-umlauted (u) variants.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.deu.classification_test

import rego.v1

import data.dive.tenant.deu.classification

# ============================================
# Validation Tests
# ============================================

test_valid_offen if {
	classification.is_valid_classification("OFFEN")
}

test_valid_nicht_eingestuft if {
	classification.is_valid_classification("NICHT EINGESTUFT")
}

test_valid_vs_nfd_umlaut if {
	classification.is_valid_classification("VS-NUR FÜR DEN DIENSTGEBRAUCH")
}

test_valid_vs_nfd_no_umlaut if {
	classification.is_valid_classification("VS-NUR FUR DEN DIENSTGEBRAUCH")
}

test_valid_vs_nfd_abbreviation if {
	classification.is_valid_classification("VS-NFD")
}

test_valid_vs_vertraulich if {
	classification.is_valid_classification("VS-VERTRAULICH")
}

test_valid_vertraulich_no_prefix if {
	classification.is_valid_classification("VERTRAULICH")
}

test_valid_geheim if {
	classification.is_valid_classification("GEHEIM")
}

test_valid_streng_geheim if {
	classification.is_valid_classification("STRENG GEHEIM")
}

test_valid_amtlich_geheimgehalten if {
	classification.is_valid_classification("AMTLICH GEHEIMGEHALTEN")
}

test_invalid_classification if {
	not classification.is_valid_classification("INVALID")
}

# ============================================
# Rank Tests
# ============================================

test_rank_offen_is_0 if {
	classification.get_rank("OFFEN") == 0
}

test_rank_nicht_eingestuft_is_0 if {
	classification.get_rank("NICHT EINGESTUFT") == 0
}

test_rank_vs_nfd_is_1 if {
	classification.get_rank("VS-NUR FÜR DEN DIENSTGEBRAUCH") == 1
}

test_rank_vs_nfd_no_umlaut_is_1 if {
	classification.get_rank("VS-NUR FUR DEN DIENSTGEBRAUCH") == 1
}

test_rank_vs_nfd_abbrev_is_1 if {
	classification.get_rank("VS-NFD") == 1
}

test_rank_vs_vertraulich_is_2 if {
	classification.get_rank("VS-VERTRAULICH") == 2
}

test_rank_geheim_is_3 if {
	classification.get_rank("GEHEIM") == 3
}

test_rank_streng_geheim_is_4 if {
	classification.get_rank("STRENG GEHEIM") == 4
}

test_rank_amtlich_geheimgehalten_is_4 if {
	classification.get_rank("AMTLICH GEHEIMGEHALTEN") == 4
}

test_rank_invalid_is_negative if {
	classification.get_rank("INVALID") == -1
}

# ============================================
# DIVE V3 Standard Normalization Tests
# ============================================

test_normalize_offen_to_unclassified if {
	classification.normalize("OFFEN") == "UNCLASSIFIED"
}

test_normalize_nicht_eingestuft_to_unclassified if {
	classification.normalize("NICHT EINGESTUFT") == "UNCLASSIFIED"
}

test_normalize_vs_nfd_to_restricted if {
	classification.normalize("VS-NUR FÜR DEN DIENSTGEBRAUCH") == "RESTRICTED"
}

test_normalize_vs_nfd_abbrev_to_restricted if {
	classification.normalize("VS-NFD") == "RESTRICTED"
}

test_normalize_vs_vertraulich_to_confidential if {
	classification.normalize("VS-VERTRAULICH") == "CONFIDENTIAL"
}

test_normalize_geheim_to_secret if {
	classification.normalize("GEHEIM") == "SECRET"
}

test_normalize_streng_geheim_to_top_secret if {
	classification.normalize("STRENG GEHEIM") == "TOP_SECRET"
}

test_normalize_invalid_is_null if {
	classification.normalize("INVALID") == null
}

# ============================================
# NATO Equivalency Tests
# ============================================

test_nato_offen if {
	classification.to_nato("OFFEN") == "NATO_UNCLASSIFIED"
}

test_nato_vs_nfd if {
	classification.to_nato("VS-NUR FÜR DEN DIENSTGEBRAUCH") == "NATO_RESTRICTED"
}

test_nato_vs_nfd_abbrev if {
	classification.to_nato("VS-NFD") == "NATO_RESTRICTED"
}

test_nato_vs_vertraulich if {
	classification.to_nato("VS-VERTRAULICH") == "NATO_CONFIDENTIAL"
}

test_nato_geheim if {
	classification.to_nato("GEHEIM") == "NATO_SECRET"
}

test_nato_streng_geheim if {
	classification.to_nato("STRENG GEHEIM") == "COSMIC_TOP_SECRET"
}

test_nato_invalid_is_null if {
	classification.to_nato("INVALID") == null
}

# ============================================
# Clearance Sufficiency Tests
# ============================================

test_streng_geheim_can_access_geheim if {
	classification.is_clearance_sufficient("STRENG GEHEIM", "GEHEIM")
}

test_streng_geheim_can_access_vs_vertraulich if {
	classification.is_clearance_sufficient("STRENG GEHEIM", "VS-VERTRAULICH")
}

test_geheim_can_access_vs_vertraulich if {
	classification.is_clearance_sufficient("GEHEIM", "VS-VERTRAULICH")
}

test_geheim_cannot_access_streng_geheim if {
	not classification.is_clearance_sufficient("GEHEIM", "STRENG GEHEIM")
}

test_vs_nfd_cannot_access_vs_vertraulich if {
	not classification.is_clearance_sufficient("VS-NFD", "VS-VERTRAULICH")
}

test_vs_vertraulich_can_access_vs_nfd if {
	classification.is_clearance_sufficient("VS-VERTRAULICH", "VS-NFD")
}

# ============================================
# Comparison Tests
# ============================================

test_compare_streng_geheim_greater_than_geheim if {
	classification.compare("STRENG GEHEIM", "GEHEIM") == 1
}

test_compare_geheim_less_than_streng_geheim if {
	classification.compare("GEHEIM", "STRENG GEHEIM") == -1
}

test_compare_geheim_equal_geheim if {
	classification.compare("GEHEIM", "GEHEIM") == 0
}

# ============================================
# Amtlich Geheimgehalten (AG) Handling Tests
# ============================================

test_amtlich_geheimgehalten_is_ag if {
	classification.is_amtlich_geheimgehalten("AMTLICH GEHEIMGEHALTEN")
}

test_streng_geheim_ag_is_ag if {
	classification.is_amtlich_geheimgehalten("STRENG GEHEIM - AMTLICH GEHEIMGEHALTEN")
}

test_ag_requires_national_control if {
	classification.requires_national_control("AMTLICH GEHEIMGEHALTEN")
}

test_geheim_not_ag if {
	not classification.is_amtlich_geheimgehalten("GEHEIM")
}

# ============================================
# VS Classification Prefix Handling Tests
# ============================================

test_vs_nfd_is_vs_classified if {
	classification.is_vs_classified("VS-NUR FÜR DEN DIENSTGEBRAUCH")
}

test_vs_vertraulich_is_vs_classified if {
	classification.is_vs_classified("VS-VERTRAULICH")
}

test_vs_nfd_abbreviation_is_vs_classified if {
	classification.is_vs_classified("VS-NFD")
}

test_offen_not_vs_classified if {
	not classification.is_vs_classified("OFFEN")
}

test_geheim_not_vs_classified if {
	not classification.is_vs_classified("GEHEIM")
}

# ============================================
# AAL Requirements Tests
# ============================================

test_aal_offen_requires_1 if {
	classification.get_required_aal("OFFEN") == 1
}

test_aal_vs_nfd_requires_1 if {
	classification.get_required_aal("VS-NFD") == 1
}

test_aal_vs_vertraulich_requires_2 if {
	classification.get_required_aal("VS-VERTRAULICH") == 2
}

test_aal_geheim_requires_2 if {
	classification.get_required_aal("GEHEIM") == 2
}

test_aal_streng_geheim_requires_3 if {
	classification.get_required_aal("STRENG GEHEIM") == 3
}

# ============================================
# Case Insensitivity Tests
# ============================================

test_lowercase_geheim_valid if {
	classification.is_valid_classification("geheim")
}

# ============================================
# Umlaut Variants Tests
# ============================================

test_umlaut_vs_nfd_normalize_matches_no_umlaut if {
	classification.normalize("VS-NUR FÜR DEN DIENSTGEBRAUCH") == classification.normalize("VS-NUR FUR DEN DIENSTGEBRAUCH")
}

test_umlaut_vs_nfd_rank_matches_no_umlaut if {
	classification.get_rank("VS-NUR FÜR DEN DIENSTGEBRAUCH") == classification.get_rank("VS-NUR FUR DEN DIENSTGEBRAUCH")
}

# ============================================
# Error Message Tests
# ============================================

test_invalid_classification_message_german if {
	msg := classification.invalid_classification_msg("UNKNOWN")
	contains(msg, "Unbekannte")
}










