# Base Layer: Country Code Tests
# Package: dive.base.country_test
#
# Comprehensive tests for ISO 3166-1 alpha-3 country validation.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.country_test

import rego.v1

import data.dive.base.country

# ============================================
# Valid Country Code Tests
# ============================================

test_is_valid_usa if {
	country.is_valid("USA")
}

test_is_valid_fra if {
	country.is_valid("FRA")
}

test_is_valid_gbr if {
	country.is_valid("GBR")
}

test_is_valid_deu if {
	country.is_valid("DEU")
}

test_is_valid_can if {
	country.is_valid("CAN")
}

test_is_valid_aus if {
	country.is_valid("AUS")
}

test_is_valid_nzl if {
	country.is_valid("NZL")
}

test_is_valid_jpn if {
	country.is_valid("JPN")
}

test_is_valid_kor if {
	country.is_valid("KOR")
}

test_is_valid_ind if {
	country.is_valid("IND")
}

# ============================================
# Invalid Country Code Tests
# ============================================

test_invalid_two_letter_code if {
	not country.is_valid("US")
}

test_invalid_two_letter_fr if {
	not country.is_valid("FR")
}

test_invalid_two_letter_gb if {
	not country.is_valid("GB")
}

test_invalid_two_letter_de if {
	not country.is_valid("DE")
}

test_invalid_lowercase if {
	not country.is_valid("usa")
}

test_invalid_mixed_case if {
	not country.is_valid("Usa")
}

test_invalid_empty_string if {
	not country.is_valid("")
}

test_invalid_fake_code if {
	not country.is_valid("XXX")
}

test_invalid_numeric if {
	not country.is_valid("123")
}

test_invalid_special_chars if {
	not country.is_valid("US!")
}

# ============================================
# All Valid Tests
# ============================================

test_all_valid_dive_core if {
	country.all_valid(["USA", "FRA", "GBR", "DEU", "CAN"])
}

test_all_valid_fvey if {
	country.all_valid(["USA", "GBR", "CAN", "AUS", "NZL"])
}

test_all_valid_single if {
	country.all_valid(["USA"])
}

test_all_valid_empty_list if {
	country.all_valid([])
}

test_all_valid_fails_with_invalid if {
	not country.all_valid(["USA", "XXX", "GBR"])
}

test_all_valid_fails_with_lowercase if {
	not country.all_valid(["USA", "fra", "GBR"])
}

# ============================================
# Invalid Countries Tests
# ============================================

test_invalid_countries_empty_for_valid if {
	result := country.invalid_countries(["USA", "FRA", "GBR"])
	count(result) == 0
}

test_invalid_countries_finds_one if {
	result := country.invalid_countries(["USA", "XXX", "GBR"])
	count(result) == 1
	"XXX" in result
}

test_invalid_countries_finds_multiple if {
	result := country.invalid_countries(["USA", "XXX", "YYY", "GBR"])
	count(result) == 2
	"XXX" in result
	"YYY" in result
}

test_invalid_countries_finds_two_letter if {
	result := country.invalid_countries(["USA", "US", "FR"])
	count(result) == 2
}

# ============================================
# NATO Member Tests
# ============================================

test_is_nato_member_usa if {
	country.is_nato_member("USA")
}

test_is_nato_member_gbr if {
	country.is_nato_member("GBR")
}

test_is_nato_member_fra if {
	country.is_nato_member("FRA")
}

test_is_nato_member_deu if {
	country.is_nato_member("DEU")
}

test_is_nato_member_can if {
	country.is_nato_member("CAN")
}

test_is_nato_member_fin if {
	country.is_nato_member("FIN")
}

test_is_nato_member_swe if {
	country.is_nato_member("SWE")
}

test_not_nato_member_rus if {
	not country.is_nato_member("RUS")
}

test_not_nato_member_chn if {
	not country.is_nato_member("CHN")
}

test_not_nato_member_jpn if {
	not country.is_nato_member("JPN")
}

# ============================================
# FVEY Member Tests
# ============================================

test_is_fvey_member_usa if {
	country.is_fvey_member("USA")
}

test_is_fvey_member_gbr if {
	country.is_fvey_member("GBR")
}

test_is_fvey_member_can if {
	country.is_fvey_member("CAN")
}

test_is_fvey_member_aus if {
	country.is_fvey_member("AUS")
}

test_is_fvey_member_nzl if {
	country.is_fvey_member("NZL")
}

test_not_fvey_member_fra if {
	not country.is_fvey_member("FRA")
}

test_not_fvey_member_deu if {
	not country.is_fvey_member("DEU")
}

test_not_fvey_member_jpn if {
	not country.is_fvey_member("JPN")
}

# ============================================
# EU Member Tests
# ============================================

test_is_eu_member_fra if {
	country.is_eu_member("FRA")
}

test_is_eu_member_deu if {
	country.is_eu_member("DEU")
}

test_is_eu_member_ita if {
	country.is_eu_member("ITA")
}

test_is_eu_member_esp if {
	country.is_eu_member("ESP")
}

test_is_eu_member_nld if {
	country.is_eu_member("NLD")
}

test_not_eu_member_gbr if {
	not country.is_eu_member("GBR")
}

test_not_eu_member_usa if {
	not country.is_eu_member("USA")
}

test_not_eu_member_nor if {
	not country.is_eu_member("NOR")
}

# ============================================
# DIVE Core Tests
# ============================================

test_is_dive_core_usa if {
	country.is_dive_core("USA")
}

test_is_dive_core_fra if {
	country.is_dive_core("FRA")
}

test_is_dive_core_gbr if {
	country.is_dive_core("GBR")
}

test_is_dive_core_deu if {
	country.is_dive_core("DEU")
}

test_is_dive_core_can if {
	country.is_dive_core("CAN")
}

test_not_dive_core_aus if {
	not country.is_dive_core("AUS")
}

test_not_dive_core_nzl if {
	not country.is_dive_core("NZL")
}

test_not_dive_core_ita if {
	not country.is_dive_core("ITA")
}

# ============================================
# Error Message Tests
# ============================================

test_invalid_country_msg if {
	msg := country.invalid_country_msg("XXX")
	contains(msg, "XXX")
	contains(msg, "Invalid country code")
	contains(msg, "ISO 3166-1 alpha-3")
}

test_invalid_countries_msg_single if {
	msg := country.invalid_countries_msg(["USA", "XXX", "GBR"])
	contains(msg, "XXX")
}

test_invalid_countries_msg_multiple if {
	msg := country.invalid_countries_msg(["XXX", "YYY"])
	contains(msg, "Invalid country codes")
}

# ============================================
# NATO Country Set Tests
# ============================================

test_nato_countries_includes_all_current_members if {
	count(country.nato_countries) >= 31
}

test_fvey_countries_has_five_members if {
	count(country.fvey_countries) == 5
}

test_eu_countries_has_27_members if {
	count(country.eu_countries) == 27
}

test_dive_core_has_five_countries if {
	count(country.dive_core_countries) == 5
}









