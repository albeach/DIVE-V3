# Base Layer: Clearance Hierarchy
# Package: dive.base.clearance
# 
# This is the SINGLE SOURCE OF TRUTH for clearance level definitions.
# All other policies must import this package for clearance comparisons.
#
# ACP-240 / NATO STANAG 4774 compliant clearance hierarchy.
# 
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.base.clearance

import rego.v1

# ============================================
# Clearance Level Definitions
# ============================================
# Numeric ranking for comparison operations.
# Higher number = higher clearance level.

clearance_rank := {
	"UNCLASSIFIED": 0,
	"RESTRICTED": 1,
	"CONFIDENTIAL": 2,
	"SECRET": 3,
	"TOP_SECRET": 4,
}

# Valid clearance levels (for validation)
valid_clearances := {"UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"}

# ============================================
# Clearance Comparison Functions
# ============================================

# Check if user clearance is sufficient for resource classification
# Returns: true if user can access resource
sufficient(user_clearance, resource_classification) if {
	user_rank := clearance_rank[user_clearance]
	resource_rank := clearance_rank[resource_classification]
	user_rank >= resource_rank
}

# Check if clearance is valid
is_valid(clearance) if {
	clearance in valid_clearances
}

# Get numeric rank for a clearance level
# Returns: numeric rank or -1 if invalid
rank(clearance) := clearance_rank[clearance] if {
	clearance in valid_clearances
} else := -1

# Compare two clearances
# Returns: -1 if a < b, 0 if a == b, 1 if a > b
compare(clearance_a, clearance_b) := -1 if {
	rank(clearance_a) < rank(clearance_b)
} else := 1 if {
	rank(clearance_a) > rank(clearance_b)
} else := 0

# ============================================
# AAL (Authentication Assurance Level) Requirements
# ============================================
# NIST SP 800-63B compliance: Higher classifications require stronger authentication.
#
# AAL1: Single factor (password only) - UNCLASSIFIED, RESTRICTED
# AAL2: Multi-factor (password + OTP/push) - CONFIDENTIAL, SECRET
# AAL3: Hardware-backed multi-factor (hardware key) - TOP_SECRET

required_aal(classification) := 1 if {
	classification == "UNCLASSIFIED"
} else := 1 if {
	classification == "RESTRICTED"
} else := 2 if {
	classification == "CONFIDENTIAL"
} else := 2 if {
	classification == "SECRET"
} else := 3 if {
	classification == "TOP_SECRET"
} else := 2  # Default: require AAL2 for unknown classifications (fail-secure)

# Check if user's AAL meets requirement for classification
aal_sufficient(user_aal, classification) if {
	required := required_aal(classification)
	user_aal >= required
}

# ============================================
# Error Messages
# ============================================

# Generate clearance insufficient error message
insufficient_clearance_msg(user_clearance, resource_classification) := msg if {
	msg := sprintf("Access denied: Your clearance (%s) is below the required %s classification for this resource", [
		user_clearance,
		resource_classification,
	])
}

# Generate invalid clearance error message
invalid_clearance_msg(clearance) := msg if {
	msg := sprintf("Unrecognized clearance level '%s'. Valid levels are: %v", [
		clearance,
		valid_clearances,
	])
}

# Generate AAL insufficient error message
aal_insufficient_msg(user_aal, classification) := msg if {
	required := required_aal(classification)
	msg := sprintf("Stronger authentication required: You are at Authentication Assurance Level %d, but %s-classified resources require Level %d", [
		user_aal,
		classification,
		required,
	])
}
