# Tenant Layer: USA Classification Mapping
# Package: dive.tenant.usa.classification
#
# U.S. national classification system mapped to DIVE V3 standard and NATO equivalents.
# Reference: EO 13526, NIST SP 800-53, DoD 5220.22-M
#
# U.S. Classification Hierarchy (lowest to highest):
# - UNCLASSIFIED (U)
# - CONTROLLED UNCLASSIFIED INFORMATION (CUI) / FOUO
# - CONFIDENTIAL (C)
# - SECRET (S)
# - TOP SECRET (TS)
# - TOP SECRET/SCI (TS/SCI)
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.usa.classification

import rego.v1

# ============================================
# USA Classification Levels (Numeric Ranks)
# ============================================
# Maps U.S. classifications to numeric ranks for comparison.

classification_rank := {
	"UNCLASSIFIED": 0,
	"U": 0,
	"CUI": 1,
	"FOUO": 1,
	"FOR OFFICIAL USE ONLY": 1,
	"CONTROLLED UNCLASSIFIED": 1,
	"CONFIDENTIAL": 2,
	"C": 2,
	"SECRET": 3,
	"S": 3,
	"TOP SECRET": 4,
	"TOP_SECRET": 4,
	"TS": 4,
	"TS/SCI": 5,
	"TOP SECRET/SCI": 5,
}

# ============================================
# USA to DIVE V3 Standard Mapping
# ============================================
# Maps U.S. classification terminology to DIVE V3 internal format.

to_dive_standard := {
	"UNCLASSIFIED": "UNCLASSIFIED",
	"U": "UNCLASSIFIED",
	"CUI": "RESTRICTED",
	"FOUO": "RESTRICTED",
	"FOR OFFICIAL USE ONLY": "RESTRICTED",
	"CONTROLLED UNCLASSIFIED": "RESTRICTED",
	"CONFIDENTIAL": "CONFIDENTIAL",
	"C": "CONFIDENTIAL",
	"SECRET": "SECRET",
	"S": "SECRET",
	"TOP SECRET": "TOP_SECRET",
	"TOP_SECRET": "TOP_SECRET",
	"TS": "TOP_SECRET",
	"TS/SCI": "TOP_SECRET",
	"TOP SECRET/SCI": "TOP_SECRET",
}

# ============================================
# USA to NATO Equivalency Mapping
# ============================================
# Maps U.S. classifications to NATO standard levels per ACP-240.

to_nato_level := {
	"UNCLASSIFIED": "NATO_UNCLASSIFIED",
	"U": "NATO_UNCLASSIFIED",
	"CUI": "NATO_RESTRICTED",
	"FOUO": "NATO_RESTRICTED",
	"FOR OFFICIAL USE ONLY": "NATO_RESTRICTED",
	"CONTROLLED UNCLASSIFIED": "NATO_RESTRICTED",
	"CONFIDENTIAL": "NATO_CONFIDENTIAL",
	"C": "NATO_CONFIDENTIAL",
	"SECRET": "NATO_SECRET",
	"S": "NATO_SECRET",
	"TOP SECRET": "COSMIC_TOP_SECRET",
	"TOP_SECRET": "COSMIC_TOP_SECRET",
	"TS": "COSMIC_TOP_SECRET",
	"TS/SCI": "COSMIC_TOP_SECRET",
	"TOP SECRET/SCI": "COSMIC_TOP_SECRET",
}

# ============================================
# NATO to USA Reverse Mapping
# ============================================
# Maps NATO levels back to U.S. equivalents for coalition operations.

from_nato_level := {
	"NATO_UNCLASSIFIED": "UNCLASSIFIED",
	"NATO_RESTRICTED": "FOUO",
	"NATO_CONFIDENTIAL": "CONFIDENTIAL",
	"NATO_SECRET": "SECRET",
	"COSMIC_TOP_SECRET": "TOP SECRET",
}

# ============================================
# Validation Functions
# ============================================

# Check if a classification is valid for USA
is_valid_classification(classification) if {
	upper_class := upper(classification)
	classification_rank[upper_class]
}

# Get numeric rank for comparison
get_rank(classification) := rank if {
	upper_class := upper(classification)
	rank := classification_rank[upper_class]
} else := -1

# Get DIVE V3 standard format
normalize(classification) := std if {
	upper_class := upper(classification)
	std := to_dive_standard[upper_class]
} else := null

# Get NATO equivalency
to_nato(classification) := nato if {
	upper_class := upper(classification)
	nato := to_nato_level[upper_class]
} else := null

# ============================================
# Comparison Functions
# ============================================

# Check if user clearance is sufficient for resource classification
is_clearance_sufficient(user_clearance, resource_classification) if {
	user_rank := get_rank(user_clearance)
	resource_rank := get_rank(resource_classification)
	user_rank >= 0
	resource_rank >= 0
	user_rank >= resource_rank
}

# Compare two USA classifications
compare(class_a, class_b) := result if {
	rank_a := get_rank(class_a)
	rank_b := get_rank(class_b)
	rank_a > rank_b
	result := 1
} else := result if {
	rank_a := get_rank(class_a)
	rank_b := get_rank(class_b)
	rank_a < rank_b
	result := -1
} else := 0

# ============================================
# SCI Handling
# ============================================
# Sensitive Compartmented Information requires additional controls.

is_sci_level(classification) if {
	upper_class := upper(classification)
	contains(upper_class, "SCI")
}

requires_compartment_check(classification) if {
	is_sci_level(classification)
}

# ============================================
# AAL Requirements for USA Classifications
# ============================================
# NIST SP 800-63B aligned authentication requirements.

aal_requirement := {
	"UNCLASSIFIED": 1,
	"CUI": 1,
	"FOUO": 1,
	"CONFIDENTIAL": 2,
	"SECRET": 2,
	"TOP SECRET": 3,
	"TOP_SECRET": 3,
	"TS/SCI": 3,
}

get_required_aal(classification) := aal if {
	upper_class := upper(classification)
	# First try exact match
	aal := aal_requirement[upper_class]
} else := aal if {
	# Try normalized version
	normalized := normalize(classification)
	normalized != null
	aal := aal_requirement[normalized]
} else := 3 # Default to highest for unknown

# ============================================
# Error Messages
# ============================================

invalid_classification_msg(classification) := msg if {
	msg := sprintf("Unrecognized U.S. classification: %s", [classification])
}

insufficient_clearance_msg(user_clearance, resource_classification) := msg if {
	msg := sprintf("Insufficient U.S. clearance: %s cannot access %s", [
		user_clearance,
		resource_classification,
	])
}

# ============================================
# All Valid USA Classifications
# ============================================

all_classifications := {c | classification_rank[c]}


