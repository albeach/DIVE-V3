# Tenant Layer: United Kingdom Classification Mapping
# Package: dive.tenant.gbr.classification
#
# UK national classification system mapped to DIVE V3 standard and NATO equivalents.
# Reference: Government Security Classifications (GSC) Policy, April 2014
# Cabinet Office Security Policy Framework
#
# UK Classification Hierarchy (lowest to highest):
# - OFFICIAL
# - OFFICIAL-SENSITIVE (with handling instructions)
# - SECRET
# - TOP SECRET
#
# Note: UK OFFICIAL replaces the previous PROTECT/RESTRICTED levels.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.gbr.classification

import rego.v1

# ============================================
# UK Classification Levels (Numeric Ranks)
# ============================================
# Maps UK classifications to numeric ranks for comparison.

classification_rank := {
	# Unclassified / Official
	"UNCLASSIFIED": 0,
	"OFFICIAL": 1,
	"OFFICIAL-SENSITIVE": 1,
	"OFFICIAL: SENSITIVE": 1,
	"OFFICIAL - SENSITIVE": 1,
	# With handling instructions
	"OFFICIAL-SENSITIVE: COMMERCIAL": 1,
	"OFFICIAL-SENSITIVE: LOCSEN": 1,
	"OFFICIAL-SENSITIVE: PERSONAL": 1,
	# Secret
	"SECRET": 2,
	"UK SECRET": 2,
	# UK Eyes Only
	"UK EYES ONLY": 3,
	"UKEO": 3,
	# Top Secret
	"TOP SECRET": 4,
	"TOP_SECRET": 4,
	"UK TOP SECRET": 4,
	# Strap classifications
	"STRAP 1": 5,
	"STRAP 2": 5,
	"STRAP 3": 5,
}

# ============================================
# UK to DIVE V3 Standard Mapping
# ============================================
# Maps UK classification terminology to DIVE V3 internal format.

to_dive_standard := {
	# Unclassified / Official
	"UNCLASSIFIED": "UNCLASSIFIED",
	"OFFICIAL": "RESTRICTED",
	"OFFICIAL-SENSITIVE": "RESTRICTED",
	"OFFICIAL: SENSITIVE": "RESTRICTED",
	"OFFICIAL - SENSITIVE": "RESTRICTED",
	"OFFICIAL-SENSITIVE: COMMERCIAL": "RESTRICTED",
	"OFFICIAL-SENSITIVE: LOCSEN": "RESTRICTED",
	"OFFICIAL-SENSITIVE: PERSONAL": "RESTRICTED",
	# Secret
	"SECRET": "SECRET",
	"UK SECRET": "SECRET",
	"UK EYES ONLY": "SECRET",
	"UKEO": "SECRET",
	# Top Secret
	"TOP SECRET": "TOP_SECRET",
	"TOP_SECRET": "TOP_SECRET",
	"UK TOP SECRET": "TOP_SECRET",
	"STRAP 1": "TOP_SECRET",
	"STRAP 2": "TOP_SECRET",
	"STRAP 3": "TOP_SECRET",
}

# ============================================
# UK to NATO Equivalency Mapping
# ============================================
# Maps UK classifications to NATO standard levels per ACP-240.

to_nato_level := {
	# Unclassified
	"UNCLASSIFIED": "NATO_UNCLASSIFIED",
	# Restricted (OFFICIAL maps to NATO RESTRICTED)
	"OFFICIAL": "NATO_RESTRICTED",
	"OFFICIAL-SENSITIVE": "NATO_RESTRICTED",
	"OFFICIAL: SENSITIVE": "NATO_RESTRICTED",
	"OFFICIAL - SENSITIVE": "NATO_RESTRICTED",
	"OFFICIAL-SENSITIVE: COMMERCIAL": "NATO_RESTRICTED",
	"OFFICIAL-SENSITIVE: LOCSEN": "NATO_RESTRICTED",
	"OFFICIAL-SENSITIVE: PERSONAL": "NATO_RESTRICTED",
	# Secret
	"SECRET": "NATO_SECRET",
	"UK SECRET": "NATO_SECRET",
	"UK EYES ONLY": "NATO_SECRET",
	"UKEO": "NATO_SECRET",
	# Top Secret / COSMIC
	"TOP SECRET": "COSMIC_TOP_SECRET",
	"TOP_SECRET": "COSMIC_TOP_SECRET",
	"UK TOP SECRET": "COSMIC_TOP_SECRET",
	"STRAP 1": "COSMIC_TOP_SECRET",
	"STRAP 2": "COSMIC_TOP_SECRET",
	"STRAP 3": "COSMIC_TOP_SECRET",
}

# ============================================
# NATO to UK Reverse Mapping
# ============================================
# Maps NATO levels back to UK equivalents for coalition operations.

from_nato_level := {
	"NATO_UNCLASSIFIED": "UNCLASSIFIED",
	"NATO_RESTRICTED": "OFFICIAL",
	"NATO_CONFIDENTIAL": "OFFICIAL-SENSITIVE",
	"NATO_SECRET": "SECRET",
	"COSMIC_TOP_SECRET": "TOP SECRET",
}

# ============================================
# Validation Functions
# ============================================

# Check if a classification is valid for UK
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

# Compare two UK classifications
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
# UK Eyes Only (UKEO) Handling
# ============================================
# UK Eyes Only requires national control.

is_uk_eyes_only(classification) if {
	upper_class := upper(classification)
	upper_class == "UK EYES ONLY"
}

is_uk_eyes_only(classification) if {
	upper_class := upper(classification)
	upper_class == "UKEO"
}

requires_national_control(classification) if {
	is_uk_eyes_only(classification)
}

# ============================================
# STRAP Handling
# ============================================
# STRAP classifications require additional compartment controls.

is_strap_level(classification) if {
	upper_class := upper(classification)
	startswith(upper_class, "STRAP")
}

requires_compartment_check(classification) if {
	is_strap_level(classification)
}

# ============================================
# Official-Sensitive Handling Instructions
# ============================================
# Extract handling instruction from OFFICIAL-SENSITIVE classification.

get_handling_instruction(classification) := instruction if {
	upper_class := upper(classification)
	startswith(upper_class, "OFFICIAL-SENSITIVE:")
	parts := split(upper_class, ":")
	count(parts) >= 2
	instruction := trim_space(parts[1])
} else := instruction if {
	upper_class := upper(classification)
	startswith(upper_class, "OFFICIAL: SENSITIVE")
	instruction := "GENERAL"
} else := null

# ============================================
# AAL Requirements for UK Classifications
# ============================================
# NCSC aligned authentication requirements.

aal_requirement := {
	"UNCLASSIFIED": 1,
	"OFFICIAL": 1,
	"OFFICIAL-SENSITIVE": 2,
	"SECRET": 2,
	"UK SECRET": 2,
	"TOP SECRET": 3,
	"TOP_SECRET": 3,
}

get_required_aal(classification) := aal if {
	upper_class := upper(classification)
	aal := aal_requirement[upper_class]
} else := aal if {
	# Try normalized version
	normalized := normalize(classification)
	normalized != null
	aal := {
		"UNCLASSIFIED": 1,
		"RESTRICTED": 2,
		"CONFIDENTIAL": 2,
		"SECRET": 2,
		"TOP_SECRET": 3,
	}[normalized]
} else := 3 # Default to highest for unknown

# ============================================
# Error Messages
# ============================================

invalid_classification_msg(classification) := msg if {
	msg := sprintf("Unrecognised UK classification: %s", [classification])
}

insufficient_clearance_msg(user_clearance, resource_classification) := msg if {
	msg := sprintf("Insufficient UK clearance: %s cannot access %s", [
		user_clearance,
		resource_classification,
	])
}

# ============================================
# All Valid UK Classifications
# ============================================

all_classifications := {c | classification_rank[c]}




