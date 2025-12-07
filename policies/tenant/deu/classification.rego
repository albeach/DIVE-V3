# Tenant Layer: Germany Classification Mapping
# Package: dive.tenant.deu.classification
#
# German national classification system mapped to DIVE V3 standard and NATO equivalents.
# Reference: Verschlusssachenanweisung (VSA) - Classified Information Regulation
# Bundesamt für Sicherheit in der Informationstechnik (BSI)
#
# German Classification Hierarchy (lowest to highest):
# - OFFEN (Open)
# - VS-NUR FÜR DEN DIENSTGEBRAUCH (VS-NfD) - For Official Use Only
# - VS-VERTRAULICH - Confidential
# - GEHEIM - Secret
# - STRENG GEHEIM - Top Secret
#
# Note: Both umlauted (ü) and non-umlauted (u) variants are supported.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.tenant.deu.classification

import rego.v1

# ============================================
# German Classification Levels (Numeric Ranks)
# ============================================
# Maps German classifications to numeric ranks for comparison.

classification_rank := {
	# Open/Unclassified
	"OFFEN": 0,
	"NICHT EINGESTUFT": 0,
	"UNCLASSIFIED": 0,
	# VS-NfD (For Official Use Only)
	"VS-NUR FÜR DEN DIENSTGEBRAUCH": 1,
	"VS-NUR FUR DEN DIENSTGEBRAUCH": 1,
	"VS-NFD": 1,
	"VS NUR FÜR DEN DIENSTGEBRAUCH": 1,
	"VS NUR FUR DEN DIENSTGEBRAUCH": 1,
	"NURFÜRDENDIENSTGEBRAUCH": 1,
	"NURFURDENDIENSTGEBRAUCH": 1,
	# Confidential
	"VS-VERTRAULICH": 2,
	"VS VERTRAULICH": 2,
	"VERTRAULICH": 2,
	# Secret
	"GEHEIM": 3,
	# Top Secret
	"STRENG GEHEIM": 4,
	# German-specific caveats
	"AMTLICH GEHEIMGEHALTEN": 4,
	"STRENG GEHEIM - AMTLICH GEHEIMGEHALTEN": 5,
}

# ============================================
# Germany to DIVE V3 Standard Mapping
# ============================================
# Maps German classification terminology to DIVE V3 internal format.

to_dive_standard := {
	# Open/Unclassified
	"OFFEN": "UNCLASSIFIED",
	"NICHT EINGESTUFT": "UNCLASSIFIED",
	"UNCLASSIFIED": "UNCLASSIFIED",
	# VS-NfD maps to RESTRICTED
	"VS-NUR FÜR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"VS-NUR FUR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"VS-NFD": "RESTRICTED",
	"VS NUR FÜR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"VS NUR FUR DEN DIENSTGEBRAUCH": "RESTRICTED",
	"NURFÜRDENDIENSTGEBRAUCH": "RESTRICTED",
	"NURFURDENDIENSTGEBRAUCH": "RESTRICTED",
	# Confidential
	"VS-VERTRAULICH": "CONFIDENTIAL",
	"VS VERTRAULICH": "CONFIDENTIAL",
	"VERTRAULICH": "CONFIDENTIAL",
	# Secret
	"GEHEIM": "SECRET",
	# Top Secret
	"STRENG GEHEIM": "TOP_SECRET",
	"AMTLICH GEHEIMGEHALTEN": "TOP_SECRET",
	"STRENG GEHEIM - AMTLICH GEHEIMGEHALTEN": "TOP_SECRET",
}

# ============================================
# Germany to NATO Equivalency Mapping
# ============================================
# Maps German classifications to NATO standard levels per ACP-240.

to_nato_level := {
	# Unclassified
	"OFFEN": "NATO_UNCLASSIFIED",
	"NICHT EINGESTUFT": "NATO_UNCLASSIFIED",
	"UNCLASSIFIED": "NATO_UNCLASSIFIED",
	# Restricted
	"VS-NUR FÜR DEN DIENSTGEBRAUCH": "NATO_RESTRICTED",
	"VS-NUR FUR DEN DIENSTGEBRAUCH": "NATO_RESTRICTED",
	"VS-NFD": "NATO_RESTRICTED",
	"VS NUR FÜR DEN DIENSTGEBRAUCH": "NATO_RESTRICTED",
	"VS NUR FUR DEN DIENSTGEBRAUCH": "NATO_RESTRICTED",
	"NURFÜRDENDIENSTGEBRAUCH": "NATO_RESTRICTED",
	"NURFURDENDIENSTGEBRAUCH": "NATO_RESTRICTED",
	# Confidential
	"VS-VERTRAULICH": "NATO_CONFIDENTIAL",
	"VS VERTRAULICH": "NATO_CONFIDENTIAL",
	"VERTRAULICH": "NATO_CONFIDENTIAL",
	# Secret
	"GEHEIM": "NATO_SECRET",
	# Top Secret / COSMIC
	"STRENG GEHEIM": "COSMIC_TOP_SECRET",
	"AMTLICH GEHEIMGEHALTEN": "COSMIC_TOP_SECRET",
	"STRENG GEHEIM - AMTLICH GEHEIMGEHALTEN": "COSMIC_TOP_SECRET",
}

# ============================================
# NATO to Germany Reverse Mapping
# ============================================
# Maps NATO levels back to German equivalents for coalition operations.

from_nato_level := {
	"NATO_UNCLASSIFIED": "OFFEN",
	"NATO_RESTRICTED": "VS-NUR FÜR DEN DIENSTGEBRAUCH",
	"NATO_CONFIDENTIAL": "VS-VERTRAULICH",
	"NATO_SECRET": "GEHEIM",
	"COSMIC_TOP_SECRET": "STRENG GEHEIM",
}

# ============================================
# Validation Functions
# ============================================

# Check if a classification is valid for Germany
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

# Compare two German classifications
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
# Amtlich Geheimgehalten (AG) Handling
# ============================================
# Amtlich Geheimgehalten requires additional national controls.

is_amtlich_geheimgehalten(classification) if {
	upper_class := upper(classification)
	contains(upper_class, "AMTLICH GEHEIMGEHALTEN")
}

requires_national_control(classification) if {
	is_amtlich_geheimgehalten(classification)
}

# ============================================
# VS Classification Prefix Handling
# ============================================
# VS (Verschlusssache) prefix indicates classified material.

is_vs_classified(classification) if {
	upper_class := upper(classification)
	startswith(upper_class, "VS")
}

extract_vs_level(classification) := level if {
	is_vs_classified(classification)
	upper_class := upper(classification)
	# Remove VS- prefix
	parts := split(upper_class, "-")
	count(parts) >= 2
	level := concat("-", array.slice(parts, 1, count(parts)))
} else := classification

# ============================================
# AAL Requirements for German Classifications
# ============================================
# BSI TR-03107 aligned authentication requirements.

aal_requirement := {
	"OFFEN": 1,
	"NICHT EINGESTUFT": 1,
	"VS-NUR FÜR DEN DIENSTGEBRAUCH": 1,
	"VS-NUR FUR DEN DIENSTGEBRAUCH": 1,
	"VS-NFD": 1,
	"VS-VERTRAULICH": 2,
	"VERTRAULICH": 2,
	"GEHEIM": 2,
	"STRENG GEHEIM": 3,
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
	msg := sprintf("Unbekannte deutsche Klassifizierung: %s", [classification])
}

insufficient_clearance_msg(user_clearance, resource_classification) := msg if {
	msg := sprintf("Unzureichende Ermächtigung: %s kann nicht auf %s zugreifen", [
		user_clearance,
		resource_classification,
	])
}

# ============================================
# All Valid German Classifications
# ============================================

all_classifications := {c | classification_rank[c]}







