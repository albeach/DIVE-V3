# Tenant Layer: France Classification Mapping
# Package: dive.tenant.fra.classification
#
# French national classification system mapped to DIVE V3 standard and NATO equivalents.
# Reference: IGI 1300 (Instruction Générale Interministérielle n° 1300)
#
# French Classification Hierarchy (lowest to highest):
# - NON CLASSIFIÉ / NON PROTÉGÉ
# - DIFFUSION RESTREINTE (DR)
# - CONFIDENTIEL DÉFENSE (CD)
# - SECRET DÉFENSE (SD)
# - TRÈS SECRET DÉFENSE (TSD)
#
# Note: Accented and non-accented variants are both supported.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.fra.classification

import rego.v1

# ============================================
# French Classification Levels (Numeric Ranks)
# ============================================
# Maps French classifications to numeric ranks for comparison.
# Supports both accented (é, è) and non-accented (e) variants.

classification_rank := {
	# Unclassified variants
	"NON CLASSIFIÉ": 0,
	"NON CLASSIFIE": 0,
	"NON PROTÉGÉ": 0,
	"NON PROTEGE": 0,
	"NP": 0,
	# Restricted variants
	"DIFFUSION RESTREINTE": 1,
	"DR": 1,
	# Confidential variants
	"CONFIDENTIEL DÉFENSE": 2,
	"CONFIDENTIEL DEFENSE": 2,
	"CD": 2,
	# Secret variants
	"SECRET DÉFENSE": 3,
	"SECRET DEFENSE": 3,
	"SD": 3,
	# Top Secret variants
	"TRÈS SECRET DÉFENSE": 4,
	"TRES SECRET DEFENSE": 4,
	"TSD": 4,
	# Special Planning level (NATO equivalent)
	"TRÈS SECRET DÉFENSE - SPÉCIAL FRANCE": 5,
	"TRES SECRET DEFENSE - SPECIAL FRANCE": 5,
	"TSD-SF": 5,
}

# ============================================
# France to DIVE V3 Standard Mapping
# ============================================
# Maps French classification terminology to DIVE V3 internal format.

to_dive_standard := {
	# Unclassified
	"NON CLASSIFIÉ": "UNCLASSIFIED",
	"NON CLASSIFIE": "UNCLASSIFIED",
	"NON PROTÉGÉ": "UNCLASSIFIED",
	"NON PROTEGE": "UNCLASSIFIED",
	"NP": "UNCLASSIFIED",
	# Restricted
	"DIFFUSION RESTREINTE": "RESTRICTED",
	"DR": "RESTRICTED",
	# Confidential
	"CONFIDENTIEL DÉFENSE": "CONFIDENTIAL",
	"CONFIDENTIEL DEFENSE": "CONFIDENTIAL",
	"CD": "CONFIDENTIAL",
	# Secret
	"SECRET DÉFENSE": "SECRET",
	"SECRET DEFENSE": "SECRET",
	"SD": "SECRET",
	# Top Secret
	"TRÈS SECRET DÉFENSE": "TOP_SECRET",
	"TRES SECRET DEFENSE": "TOP_SECRET",
	"TSD": "TOP_SECRET",
	"TRÈS SECRET DÉFENSE - SPÉCIAL FRANCE": "TOP_SECRET",
	"TRES SECRET DEFENSE - SPECIAL FRANCE": "TOP_SECRET",
	"TSD-SF": "TOP_SECRET",
}

# ============================================
# France to NATO Equivalency Mapping
# ============================================
# Maps French classifications to NATO standard levels per ACP-240.

to_nato_level := {
	# Unclassified
	"NON CLASSIFIÉ": "NATO_UNCLASSIFIED",
	"NON CLASSIFIE": "NATO_UNCLASSIFIED",
	"NON PROTÉGÉ": "NATO_UNCLASSIFIED",
	"NON PROTEGE": "NATO_UNCLASSIFIED",
	"NP": "NATO_UNCLASSIFIED",
	# Restricted
	"DIFFUSION RESTREINTE": "NATO_RESTRICTED",
	"DR": "NATO_RESTRICTED",
	# Confidential
	"CONFIDENTIEL DÉFENSE": "NATO_CONFIDENTIAL",
	"CONFIDENTIEL DEFENSE": "NATO_CONFIDENTIAL",
	"CD": "NATO_CONFIDENTIAL",
	# Secret
	"SECRET DÉFENSE": "NATO_SECRET",
	"SECRET DEFENSE": "NATO_SECRET",
	"SD": "NATO_SECRET",
	# Top Secret
	"TRÈS SECRET DÉFENSE": "COSMIC_TOP_SECRET",
	"TRES SECRET DEFENSE": "COSMIC_TOP_SECRET",
	"TSD": "COSMIC_TOP_SECRET",
	"TRÈS SECRET DÉFENSE - SPÉCIAL FRANCE": "COSMIC_TOP_SECRET",
	"TRES SECRET DEFENSE - SPECIAL FRANCE": "COSMIC_TOP_SECRET",
	"TSD-SF": "COSMIC_TOP_SECRET",
}

# ============================================
# NATO to France Reverse Mapping
# ============================================
# Maps NATO levels back to French equivalents for coalition operations.

from_nato_level := {
	"NATO_UNCLASSIFIED": "NON CLASSIFIÉ",
	"NATO_RESTRICTED": "DIFFUSION RESTREINTE",
	"NATO_CONFIDENTIAL": "CONFIDENTIEL DÉFENSE",
	"NATO_SECRET": "SECRET DÉFENSE",
	"COSMIC_TOP_SECRET": "TRÈS SECRET DÉFENSE",
}

# ============================================
# Validation Functions
# ============================================

# Check if a classification is valid for France
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

# Compare two French classifications
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
# Special France (SF) Handling
# ============================================
# Spécial France designation requires additional controls.

is_special_france(classification) if {
	upper_class := upper(classification)
	contains(upper_class, "SPECIAL FRANCE")
}

is_special_france(classification) if {
	upper_class := upper(classification)
	contains(upper_class, "SPÉCIAL FRANCE")
}

is_special_france(classification) if {
	upper_class := upper(classification)
	upper_class == "TSD-SF"
}

requires_national_control(classification) if {
	is_special_france(classification)
}

# ============================================
# AAL Requirements for French Classifications
# ============================================
# ANSSI aligned authentication requirements.

aal_requirement := {
	"NON CLASSIFIÉ": 1,
	"NON CLASSIFIE": 1,
	"NON PROTÉGÉ": 1,
	"NON PROTEGE": 1,
	"DIFFUSION RESTREINTE": 1,
	"CONFIDENTIEL DÉFENSE": 2,
	"CONFIDENTIEL DEFENSE": 2,
	"SECRET DÉFENSE": 2,
	"SECRET DEFENSE": 2,
	"TRÈS SECRET DÉFENSE": 3,
	"TRES SECRET DEFENSE": 3,
}

get_required_aal(classification) := aal if {
	upper_class := upper(classification)
	aal := aal_requirement[upper_class]
} else := aal if {
	# Try normalized version
	normalized := normalize(classification)
	normalized != null
	# Map DIVE standard to AAL
	aal := {
		"UNCLASSIFIED": 1,
		"RESTRICTED": 1,
		"CONFIDENTIAL": 2,
		"SECRET": 2,
		"TOP_SECRET": 3,
	}[normalized]
} else := 3 # Default to highest for unknown

# ============================================
# Error Messages
# ============================================

invalid_classification_msg(classification) := msg if {
	msg := sprintf("Classification française non reconnue: %s", [classification])
}

insufficient_clearance_msg(user_clearance, resource_classification) := msg if {
	msg := sprintf("Habilitation insuffisante: %s ne peut pas accéder à %s", [
		user_clearance,
		resource_classification,
	])
}

# ============================================
# All Valid French Classifications
# ============================================

all_classifications := {c | classification_rank[c]}







