# Base Layer: Country Code Validation
# Package: dive.base.country
#
# ISO 3166-1 alpha-3 country code validation.
# All country codes in DIVE V3 must use the 3-letter format.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.country

import rego.v1

# ============================================
# Valid ISO 3166-1 Alpha-3 Country Codes
# ============================================
# Complete list of all 249 officially assigned codes.

valid_country_codes := {
	# A
	"ABW", "AFG", "AGO", "AIA", "ALA", "ALB", "AND", "ARE", "ARG", "ARM",
	"ASM", "ATA", "ATF", "ATG", "AUS", "AUT", "AZE",
	# B
	"BDI", "BEL", "BEN", "BES", "BFA", "BGD", "BGR", "BHR", "BHS", "BIH",
	"BLM", "BLR", "BLZ", "BMU", "BOL", "BRA", "BRB", "BRN", "BTN", "BVT", "BWA",
	# C
	"CAF", "CAN", "CCK", "CHE", "CHL", "CHN", "CIV", "CMR", "COD", "COG",
	"COK", "COL", "COM", "CPV", "CRI", "CUB", "CUW", "CXR", "CYM", "CYP", "CZE",
	# D
	"DEU", "DJI", "DMA", "DNK", "DOM", "DZA",
	# E
	"ECU", "EGY", "ERI", "ESH", "ESP", "EST", "ETH",
	# F
	"FIN", "FJI", "FLK", "FRA", "FRO", "FSM",
	# G
	"GAB", "GBR", "GEO", "GGY", "GHA", "GIB", "GIN", "GLP", "GMB", "GNB",
	"GNQ", "GRC", "GRD", "GRL", "GTM", "GUF", "GUM", "GUY",
	# H
	"HKG", "HMD", "HND", "HRV", "HTI", "HUN",
	# I
	"IDN", "IMN", "IND", "IOT", "IRL", "IRN", "IRQ", "ISL", "ISR", "ITA",
	# J
	"JAM", "JEY", "JOR", "JPN",
	# K
	"KAZ", "KEN", "KGZ", "KHM", "KIR", "KNA", "KOR", "KWT",
	# L
	"LAO", "LBN", "LBR", "LBY", "LCA", "LIE", "LKA", "LSO", "LTU", "LUX", "LVA",
	# M
	"MAC", "MAF", "MAR", "MCO", "MDA", "MDG", "MDV", "MEX", "MHL", "MKD",
	"MLI", "MLT", "MMR", "MNE", "MNG", "MNP", "MOZ", "MRT", "MSR", "MTQ",
	"MUS", "MWI", "MYS", "MYT",
	# N
	"NAM", "NCL", "NER", "NFK", "NGA", "NIC", "NIU", "NLD", "NOR", "NPL",
	"NRU", "NZL",
	# O
	"OMN",
	# P
	"PAK", "PAN", "PCN", "PER", "PHL", "PLW", "PNG", "POL", "PRI", "PRK",
	"PRT", "PRY", "PSE", "PYF",
	# Q
	"QAT",
	# R
	"REU", "ROU", "RUS", "RWA",
	# S
	"SAU", "SDN", "SEN", "SGP", "SGS", "SHN", "SJM", "SLB", "SLE", "SLV",
	"SMR", "SOM", "SPM", "SRB", "SSD", "STP", "SUR", "SVK", "SVN", "SWE",
	"SWZ", "SXM", "SYC", "SYR",
	# T
	"TCA", "TCD", "TGO", "THA", "TJK", "TKL", "TKM", "TLS", "TON", "TTO",
	"TUN", "TUR", "TUV", "TWN", "TZA",
	# U
	"UGA", "UKR", "UMI", "URY", "USA", "UZB",
	# V
	"VAT", "VCT", "VEN", "VGB", "VIR", "VNM", "VUT",
	# W
	"WLF", "WSM",
	# Y
	"YEM",
	# Z
	"ZAF", "ZMB", "ZWE",
}

# ============================================
# Validation Functions
# ============================================

# Check if a country code is valid
is_valid(code) if {
	code in valid_country_codes
}

# Validate that all countries in a list are valid
all_valid(countries) if {
	every country in countries {
		is_valid(country)
	}
}

# Find invalid countries in a list
invalid_countries(countries) := invalid if {
	invalid := {c | some c in countries; not is_valid(c)}
}

# ============================================
# Common Country Groupings
# ============================================

# Core DIVE V3 deployment countries
dive_core_countries := {"USA", "FRA", "GBR", "DEU", "CAN"}

# NATO member countries
nato_countries := {
	"ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA",
	"DEU", "GBR", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE",
	"NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
	"TUR", "USA",
}

# Five Eyes countries
fvey_countries := {"USA", "GBR", "CAN", "AUS", "NZL"}

# EU member countries
eu_countries := {
	"AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
	"DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
	"POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
}

# ============================================
# Grouping Checks
# ============================================

is_nato_member(code) if {
	code in nato_countries
}

is_fvey_member(code) if {
	code in fvey_countries
}

is_eu_member(code) if {
	code in eu_countries
}

is_dive_core(code) if {
	code in dive_core_countries
}

# ============================================
# Error Messages
# ============================================

invalid_country_msg(code) := msg if {
	msg := sprintf("Invalid country code: %s (must be ISO 3166-1 alpha-3)", [code])
}

invalid_countries_msg(codes) := msg if {
	invalid := invalid_countries(codes)
	count(invalid) > 0
	msg := sprintf("Invalid country codes: %v", [invalid])
}





