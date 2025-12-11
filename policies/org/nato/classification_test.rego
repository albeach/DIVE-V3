# Tests for NATO Classification Equivalency
# Package: dive.org.nato.classification_test

package dive.org.nato.classification_test

import rego.v1

import data.dive.org.nato.classification

# ============================================
# NATO Level Tests
# ============================================

test_nato_levels_unclassified if {
	classification.nato_levels["NATO_UNCLASSIFIED"] == 0
}

test_nato_levels_restricted if {
	classification.nato_levels["NATO_RESTRICTED"] == 1
}

test_nato_levels_confidential if {
	classification.nato_levels["NATO_CONFIDENTIAL"] == 2
}

test_nato_levels_secret if {
	classification.nato_levels["NATO_SECRET"] == 3
}

test_nato_levels_cosmic if {
	classification.nato_levels["COSMIC_TOP_SECRET"] == 4
}

# ============================================
# USA Classification Mapping Tests
# ============================================

test_usa_unclassified_maps_to_nato if {
	result := classification.get_nato_level("UNCLASSIFIED", "USA")
	result == "NATO_UNCLASSIFIED"
}

test_usa_confidential_maps_to_nato if {
	result := classification.get_nato_level("CONFIDENTIAL", "USA")
	result == "NATO_CONFIDENTIAL"
}

test_usa_secret_maps_to_nato if {
	result := classification.get_nato_level("SECRET", "USA")
	result == "NATO_SECRET"
}

test_usa_top_secret_maps_to_cosmic if {
	result := classification.get_nato_level("TOP SECRET", "USA")
	result == "COSMIC_TOP_SECRET"
}

test_usa_top_secret_underscore_maps_to_cosmic if {
	result := classification.get_nato_level("TOP_SECRET", "USA")
	result == "COSMIC_TOP_SECRET"
}

test_usa_fouo_maps_to_restricted if {
	result := classification.get_nato_level("FOUO", "USA")
	result == "NATO_RESTRICTED"
}

# ============================================
# French Classification Mapping Tests
# ============================================

test_fra_non_classifie_maps_to_nato if {
	result := classification.get_nato_level("NON CLASSIFIÉ", "FRA")
	result == "NATO_UNCLASSIFIED"
}

test_fra_confidentiel_defense_maps_to_nato if {
	result := classification.get_nato_level("CONFIDENTIEL DÉFENSE", "FRA")
	result == "NATO_CONFIDENTIAL"
}

test_fra_secret_defense_maps_to_nato if {
	result := classification.get_nato_level("SECRET DÉFENSE", "FRA")
	result == "NATO_SECRET"
}

test_fra_tres_secret_defense_maps_to_cosmic if {
	result := classification.get_nato_level("TRÈS SECRET DÉFENSE", "FRA")
	result == "COSMIC_TOP_SECRET"
}

test_fra_diffusion_restreinte_maps_to_restricted if {
	result := classification.get_nato_level("DIFFUSION RESTREINTE", "FRA")
	result == "NATO_RESTRICTED"
}

# ============================================
# German Classification Mapping Tests
# ============================================

test_deu_offen_maps_to_nato if {
	result := classification.get_nato_level("OFFEN", "DEU")
	result == "NATO_UNCLASSIFIED"
}

test_deu_vs_vertraulich_maps_to_confidential if {
	result := classification.get_nato_level("VS-VERTRAULICH", "DEU")
	result == "NATO_CONFIDENTIAL"
}

test_deu_geheim_maps_to_secret if {
	result := classification.get_nato_level("GEHEIM", "DEU")
	result == "NATO_SECRET"
}

test_deu_streng_geheim_maps_to_cosmic if {
	result := classification.get_nato_level("STRENG GEHEIM", "DEU")
	result == "COSMIC_TOP_SECRET"
}

# ============================================
# UK Classification Mapping Tests
# ============================================

test_gbr_unclassified_maps_to_nato if {
	result := classification.get_nato_level("UNCLASSIFIED", "GBR")
	result == "NATO_UNCLASSIFIED"
}

test_gbr_official_maps_to_restricted if {
	result := classification.get_nato_level("OFFICIAL", "GBR")
	result == "NATO_RESTRICTED"
}

test_gbr_secret_maps_to_nato if {
	result := classification.get_nato_level("SECRET", "GBR")
	result == "NATO_SECRET"
}

# ============================================
# Canadian Classification Mapping Tests
# ============================================

test_can_protected_a_maps_to_restricted if {
	result := classification.get_nato_level("PROTECTED A", "CAN")
	result == "NATO_RESTRICTED"
}

test_can_secret_maps_to_nato if {
	result := classification.get_nato_level("SECRET", "CAN")
	result == "NATO_SECRET"
}

# ============================================
# DIVE V3 Level Mapping Tests
# ============================================

test_nato_to_dive_unclassified if {
	result := classification.get_dive_level("UNCLASSIFIED", "USA")
	result == "UNCLASSIFIED"
}

test_nato_to_dive_confidential if {
	result := classification.get_dive_level("CONFIDENTIAL", "USA")
	result == "CONFIDENTIAL"
}

test_nato_to_dive_secret if {
	result := classification.get_dive_level("SECRET", "USA")
	result == "SECRET"
}

test_nato_to_dive_top_secret if {
	result := classification.get_dive_level("TOP_SECRET", "USA")
	result == "TOP_SECRET"
}

test_fra_to_dive_secret if {
	result := classification.get_dive_level("SECRET DÉFENSE", "FRA")
	result == "SECRET"
}

test_deu_to_dive_confidential if {
	result := classification.get_dive_level("VS-VERTRAULICH", "DEU")
	result == "CONFIDENTIAL"
}

# ============================================
# Clearance Sufficiency Tests
# ============================================

test_clearance_sufficient_same_level if {
	classification.is_clearance_sufficient("SECRET", "USA", "SECRET", "USA")
}

test_clearance_sufficient_higher_level if {
	classification.is_clearance_sufficient("TOP_SECRET", "USA", "SECRET", "USA")
}

test_clearance_sufficient_cross_nation_equal if {
	# USA SECRET should access FRA SECRET DÉFENSE (both map to NATO_SECRET)
	classification.is_clearance_sufficient("SECRET", "USA", "SECRET DÉFENSE", "FRA")
}

test_clearance_sufficient_cross_nation_higher if {
	# USA TOP_SECRET should access DEU GEHEIM (NATO_SECRET)
	classification.is_clearance_sufficient("TOP_SECRET", "USA", "GEHEIM", "DEU")
}

test_clearance_insufficient_lower_level if {
	not classification.is_clearance_sufficient("CONFIDENTIAL", "USA", "SECRET", "USA")
}

test_clearance_insufficient_cross_nation if {
	# FRA CONFIDENTIEL DÉFENSE (NATO_CONFIDENTIAL) cannot access USA SECRET (NATO_SECRET)
	not classification.is_clearance_sufficient("CONFIDENTIEL DÉFENSE", "FRA", "SECRET", "USA")
}

test_clearance_usa_ts_can_access_deu_streng_geheim if {
	# Both map to COSMIC_TOP_SECRET
	classification.is_clearance_sufficient("TOP_SECRET", "USA", "STRENG GEHEIM", "DEU")
}

test_clearance_gbr_official_cannot_access_secret if {
	# GBR OFFICIAL (NATO_RESTRICTED) cannot access SECRET (NATO_SECRET)
	not classification.is_clearance_sufficient("OFFICIAL", "GBR", "SECRET", "USA")
}

# ============================================
# Recognition Tests
# ============================================

test_recognized_usa_secret if {
	classification.is_recognized("SECRET", "USA")
}

test_recognized_fra_secret_defense if {
	classification.is_recognized("SECRET DÉFENSE", "FRA")
}

test_not_recognized_invalid if {
	not classification.is_recognized("SUPER_SECRET", "USA")
}

test_not_recognized_unknown_country if {
	not classification.is_recognized("SECRET", "XYZ")
}

# ============================================
# NATO Direct Level Tests
# ============================================

test_valid_nato_level_secret if {
	classification.is_valid_nato("NATO SECRET")
}

test_valid_nato_level_cosmic if {
	classification.is_valid_nato("COSMIC TOP SECRET")
}

test_invalid_nato_level if {
	not classification.is_valid_nato("INVALID_LEVEL")
}

# ============================================
# Supported Countries Tests
# ============================================

test_supported_countries_includes_usa if {
	"USA" in classification.supported_countries
}

test_supported_countries_includes_fra if {
	"FRA" in classification.supported_countries
}

test_supported_countries_includes_deu if {
	"DEU" in classification.supported_countries
}

test_supported_countries_includes_gbr if {
	"GBR" in classification.supported_countries
}

# ============================================
# Error Message Tests
# ============================================

test_unrecognized_msg_format if {
	msg := classification.unrecognized_classification_msg("UNKNOWN", "USA")
	contains(msg, "UNKNOWN")
	contains(msg, "USA")
}

test_insufficient_msg_format if {
	msg := classification.insufficient_clearance_msg("CONFIDENTIAL", "USA", "SECRET", "USA")
	contains(msg, "CONFIDENTIAL")
	contains(msg, "SECRET")
	contains(msg, "USA")
}









