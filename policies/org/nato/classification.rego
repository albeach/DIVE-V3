# Organization Layer: NATO Classification Equivalency
# Package: dive.org.nato.classification
#
# ACP-240 Section 4.3: Classification equivalency mapping between
# national classification systems and NATO standard levels.
#
# This module provides the SINGLE SOURCE OF TRUTH for mapping national
# classifications (e.g., French "SECRET DÉFENSE", German "GEHEIM") to
# NATO standard levels for interoperability in coalition operations.
#
# Reference: ACP-240, STANAG 4774/5636
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.org.nato.classification

import rego.v1

# ============================================
# NATO Standard Classification Levels
# ============================================
# NATO classification hierarchy (lowest to highest):
# 1. NATO UNCLASSIFIED
# 2. NATO RESTRICTED
# 3. NATO CONFIDENTIAL
# 4. NATO SECRET
# 5. COSMIC TOP SECRET

nato_levels := {
	"NATO_UNCLASSIFIED": 0,
	"NATO_RESTRICTED": 1,
	"NATO_CONFIDENTIAL": 2,
	"NATO_SECRET": 3,
	"COSMIC_TOP_SECRET": 4,
}

# Valid NATO classification values
valid_nato_classifications := {
	"NATO_UNCLASSIFIED",
	"NATO_RESTRICTED",
	"NATO_CONFIDENTIAL",
	"NATO_SECRET",
	"COSMIC_TOP_SECRET",
}

# ============================================
# National to NATO Classification Mapping
# ============================================
# Maps each nation's classification terminology to NATO equivalents.
# Uses uppercase for consistency (input should be normalized).
#
# NOTE: Full classification equivalency data is loaded from:
#   1. OPAL (data.classification_equivalency) at runtime
#   2. classification_equivalency.json during opa test
#
# This fallback covers FVEY + NATO only — for resilience when
# neither OPAL nor the JSON file is available.

default_classification_equivalency := {
	"USA": {
		"UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"RESTRICTED": "NATO_RESTRICTED",
		"FOUO": "NATO_RESTRICTED",
		"CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"SECRET": "NATO_SECRET",
		"TOP SECRET": "COSMIC_TOP_SECRET",
		"TOP_SECRET": "COSMIC_TOP_SECRET",
	},
	"GBR": {
		"UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"OFFICIAL": "NATO_RESTRICTED",
		"OFFICIAL-SENSITIVE": "NATO_RESTRICTED",
		"CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"SECRET": "NATO_SECRET",
		"TOP SECRET": "COSMIC_TOP_SECRET",
		"TOP_SECRET": "COSMIC_TOP_SECRET",
	},
	"CAN": {
		"UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"PROTECTED A": "NATO_RESTRICTED",
		"PROTECTED B": "NATO_RESTRICTED",
		"PROTECTED C": "NATO_CONFIDENTIAL",
		"CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"SECRET": "NATO_SECRET",
		"TOP SECRET": "COSMIC_TOP_SECRET",
		"TOP_SECRET": "COSMIC_TOP_SECRET",
	},
	"AUS": {
		"UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"OFFICIAL": "NATO_RESTRICTED",
		"OFFICIAL: SENSITIVE": "NATO_RESTRICTED",
		"PROTECTED": "NATO_CONFIDENTIAL",
		"CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"SECRET": "NATO_SECRET",
		"TOP SECRET": "COSMIC_TOP_SECRET",
		"TOP_SECRET": "COSMIC_TOP_SECRET",
	},
	"NZL": {
		"UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"IN-CONFIDENCE": "NATO_RESTRICTED",
		"SENSITIVE": "NATO_RESTRICTED",
		"CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"SECRET": "NATO_SECRET",
		"TOP SECRET": "COSMIC_TOP_SECRET",
		"TOP_SECRET": "COSMIC_TOP_SECRET",
	},
	"NATO": {
		"NATO UNCLASSIFIED": "NATO_UNCLASSIFIED",
		"NATO RESTRICTED": "NATO_RESTRICTED",
		"NATO CONFIDENTIAL": "NATO_CONFIDENTIAL",
		"NATO SECRET": "NATO_SECRET",
		"COSMIC TOP SECRET": "COSMIC_TOP_SECRET",
	},
}

# Use OPAL-provided data if available, otherwise use defaults
classification_equivalency := data.classification_equivalency if {
	data.classification_equivalency
}

classification_equivalency := default_classification_equivalency if {
	not data.classification_equivalency
}

# ============================================
# NATO to DIVE V3 Standard Mapping
# ============================================
# Maps NATO levels to DIVE V3 internal standard format.
# This provides compatibility with the base clearance package.

nato_to_dive := {
	"NATO_UNCLASSIFIED": "UNCLASSIFIED",
	"NATO_RESTRICTED": "RESTRICTED",
	"NATO_CONFIDENTIAL": "CONFIDENTIAL",
	"NATO_SECRET": "SECRET",
	"COSMIC_TOP_SECRET": "TOP_SECRET",
}

# ============================================
# Equivalency Functions
# ============================================

# Get NATO equivalency level for a national classification
# Returns: NATO standard level or null if not found
get_nato_level(classification, country) := nato_level if {
	# Try country-specific mapping first
	classification_equivalency[country]
	upper_class := upper(classification)
	nato_level := classification_equivalency[country][upper_class]
} else := nato_level if {
	# Try direct NATO level (already in NATO format)
	upper_class := upper(classification)
	nato_class := replace(replace(upper_class, " ", "_"), "-", "_")
	valid_nato_classifications[nato_class]
	nato_level := nato_class
} else := null

# Get DIVE V3 standard level from national classification
# Returns: DIVE V3 level (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
get_dive_level(classification, country) := dive_level if {
	nato_level := get_nato_level(classification, country)
	nato_level != null
	dive_level := nato_to_dive[nato_level]
} else := null

# Check if user clearance is equivalent to or higher than resource classification
# Supports both national classifications and NATO standard levels
is_clearance_sufficient(user_clearance, user_country, resource_classification, resource_country) if {
	# Get NATO equivalency levels
	user_nato := get_nato_level(user_clearance, user_country)
	resource_nato := get_nato_level(resource_classification, resource_country)

	# Both must resolve to NATO levels
	user_nato != null
	resource_nato != null

	# Compare NATO numeric levels
	nato_levels[user_nato] >= nato_levels[resource_nato]
}

# Check if classification is recognized for a country
is_recognized(classification, country) if {
	get_nato_level(classification, country) != null
}

# ============================================
# Validation Functions
# ============================================

# Check if a classification is valid NATO level
is_valid_nato(classification) if {
	upper_class := upper(classification)
	nato_class := replace(replace(upper_class, " ", "_"), "-", "_")
	valid_nato_classifications[nato_class]
}

# List all countries with classification mappings
supported_countries := countries if {
	countries := {country | classification_equivalency[country]}
}

# Get all classifications for a country
classifications_for_country(country) := classifications if {
	country_map := classification_equivalency[country]
	classifications := {class | country_map[class]}
} else := set()

# ============================================
# Error Messages
# ============================================

unrecognized_classification_msg(classification, country) := msg if {
	msg := sprintf("Unrecognized classification '%s' for country %s", [
		classification,
		country,
	])
}

insufficient_clearance_msg(user_clearance, user_country, resource_classification, resource_country) := msg if {
	user_nato := get_nato_level(user_clearance, user_country)
	resource_nato := get_nato_level(resource_classification, resource_country)
	msg := sprintf("Insufficient clearance: %s (%s) < %s (%s) [NATO: %s < %s]", [
		user_clearance,
		user_country,
		resource_classification,
		resource_country,
		user_nato,
		resource_nato,
	])
}
