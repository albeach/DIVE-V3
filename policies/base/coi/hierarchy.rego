# Base Layer: COI (Community of Interest) Hierarchy
# Package: dive.base.coi.hierarchy
#
# Implements hierarchical COI relationships where broader COI memberships
# automatically grant access to narrower, more restrictive COI-tagged resources.
#
# Example: User with NATO tag can access FRA-US (France-US bilateral) resources
#          because both France and USA are NATO members, making the bilateral
#          agreement a logical subset of NATO cooperation.
#
# Version: 2.0.0
# Date: 2026-01-25
# Enhancements:
# - Multi-level hierarchies (transitive closure)
# - Dynamic loading from MongoDB via OPAL
# - Conditional activation (time-based, context-based)
# - Hybrid approach (critical static + extended dynamic)

package dive.base.coi.hierarchy

import rego.v1

import data.dive.base.coi

# ============================================
# CRITICAL COI Hierarchy Definitions (Static)
# ============================================
# These are CRITICAL hierarchies that must always be available
# even if OPAL/MongoDB is unavailable. DO NOT remove these.

critical_static_hierarchy := {
	# NATO membership implies access to all bilateral agreements between NATO members
	"NATO": {
		"FRA-US", # France-US (both NATO members)
		"GBR-US", # UK-US (both NATO members)
		"DEU-US", # Germany-US (both NATO members)
		"CAN-US", # Canada-US (both NATO members)
	},
	# FVEY membership implies access to bilateral agreements between FVEY members
	"FVEY": {
		"CAN-US", # Canada-US (both FVEY)
		"GBR-US", # UK-US (both FVEY)
		"AUKUS", # Australia-UK-US (subset of FVEY)
	},
	# NATO-COSMIC is the highest NATO classification - includes all NATO relationships
	"NATO-COSMIC": {
		"NATO", # COSMIC includes regular NATO
		"FRA-US",
		"GBR-US",
		"DEU-US",
		"CAN-US",
	},
}

# ============================================
# Dynamic COI Hierarchy (from MongoDB via OPAL)
# ============================================
# Extended hierarchies loaded from MongoDB. These can be updated without code changes.
# Format: { "parent_coi": ["child1", "child2", ...] }

dynamic_coi_hierarchy := data.dive.coi_hierarchy if {
	data.dive.coi_hierarchy
	is_object(data.dive.coi_hierarchy)
	count(data.dive.coi_hierarchy) > 0
} else := {}

# Detailed hierarchy nodes with conditional metadata
# Format: { "coi_id": { children: [], conditional: {...}, ... } }
dynamic_coi_nodes := data.dive.coi_hierarchy_nodes if {
	data.dive.coi_hierarchy_nodes
	is_object(data.dive.coi_hierarchy_nodes)
	count(data.dive.coi_hierarchy_nodes) > 0
} else := {}

# ============================================
# Hybrid Hierarchy Merge
# ============================================
# Merge critical static + extended dynamic hierarchies
# Static takes precedence to ensure critical paths always work

merged_hierarchy := object.union(dynamic_coi_hierarchy, critical_static_hierarchy)

# Legacy: Maintain backward compatibility with v1 name
coi_hierarchy := merged_hierarchy

# ============================================
# Multi-Level COI Expansion (Transitive Closure)
# ============================================

# Expand user COIs with multi-level transitive closure (up to 5 levels)
# This allows NATO → EUCOM → FRA-US → Project-X type hierarchies
expand_user_cois_multilevel(user_cois) := effective if {
	# Start with direct COIs
	direct := {c | some c in user_cois}

	# Level 1: Direct children
	level1 := {child |
		some parent in direct
		some child in merged_hierarchy[parent]
	}

	# Level 2: Children of children
	level2 := {child |
		some parent in level1
		some child in merged_hierarchy[parent]
	}

	# Level 3: Children of level 2
	level3 := {child |
		some parent in level2
		some child in merged_hierarchy[parent]
	}

	# Level 4: Children of level 3
	level4 := {child |
		some parent in level3
		some child in merged_hierarchy[parent]
	}

	# Level 5: Children of level 4 (max depth)
	level5 := {child |
		some parent in level4
		some child in merged_hierarchy[parent]
	}

	# Combine all levels
	effective := direct | level1 | level2 | level3 | level4 | level5
}

# Single-level expansion (v1 compatibility)
expand_user_cois(user_cois) := effective if {
	# Use multi-level if feature enabled
	enabled := object.get(data.dive.feature_flags, "multilevel_hierarchy", true)
	enabled == true
	effective := expand_user_cois_multilevel(user_cois)
} else := effective if {
	# Fallback to single-level expansion
	direct := {c | some c in user_cois}
	implied := {child |
		some parent_coi in user_cois
		some child in merged_hierarchy[parent_coi]
	}
	effective := direct | implied
}

# ============================================
# Conditional Hierarchy Activation
# ============================================

# Check if hierarchy relationship is active based on conditions
is_hierarchy_active(parent, child) if {
	# Static hierarchies are always active
	child in critical_static_hierarchy[parent]
}

is_hierarchy_active(parent, child) if {
	# Dynamic hierarchy without conditions
	node := dynamic_coi_nodes[parent]
	child in node.children
	not node.conditional
}

is_hierarchy_active(parent, child) if {
	# Dynamic hierarchy with time window
	node := dynamic_coi_nodes[parent]
	child in node.children
	window := node.conditional.timeWindow

	# Parse timestamps
	current := time.parse_rfc3339_ns(input.context.currentTime)
	start := time.parse_rfc3339_ns(window.start)
	end := time.parse_rfc3339_ns(window.end)

	# Check time window
	current >= start
	current <= end
}

is_hierarchy_active(parent, child) if {
	# Dynamic hierarchy with classification requirement
	node := dynamic_coi_nodes[parent]
	child in node.children
	required_class := node.conditional.classification

	# Check if resource classification matches
	input.resource.classification == required_class
}

is_hierarchy_active(parent, child) if {
	# Dynamic hierarchy with operation requirement
	node := dynamic_coi_nodes[parent]
	child in node.children
	required_op := node.conditional.operation

	# Check if operation matches
	input.action.operation == required_op
}

is_hierarchy_active(parent, child) if {
	# Dynamic hierarchy with custom context expression
	node := dynamic_coi_nodes[parent]
	child in node.children
	context_expr := node.conditional.context

	# Evaluate context condition
	eval_context_condition(context_expr)
}

# Evaluate context condition expressions
eval_context_condition(expr) if {
	expr == "classification:TOP_SECRET"
	input.resource.classification == "TOP_SECRET"
}

eval_context_condition(expr) if {
	expr == "classification:SECRET"
	input.resource.classification in ["SECRET", "TOP_SECRET"]
}

eval_context_condition(expr) if {
	expr == "operation:read"
	input.action.operation == "read"
}

eval_context_condition(expr) if {
	expr == "operation:write"
	input.action.operation in ["write", "update", "delete"]
}

# ============================================
# Conditional COI Expansion
# ============================================

# Expand user COIs with conditional checks
expand_user_cois_conditional(user_cois) := effective if {
	# Get base expansion
	base := expand_user_cois_multilevel(user_cois)

	# Filter based on active conditionals
	effective := {coi |
		some coi in base
		# Check if this COI was granted via an active hierarchy
		some parent in user_cois
		is_hierarchy_active(parent, coi)
	} | {coi | some coi in user_cois} # Always include direct COIs
}

# ============================================
# Hierarchy-Aware Access Check (Enhanced)
# ============================================

# Check if user has effective access to resource COIs (ALL mode with hierarchy)
# User must have ALL required COI tags (after hierarchy expansion)
has_hierarchical_access_all(user_cois, resource_cois) if {
	count(resource_cois) == 0
}

has_hierarchical_access_all(user_cois, resource_cois) if {
	count(resource_cois) > 0
	required := {c | some c in resource_cois}

	# Use conditional expansion if enabled
	effective := expand_user_cois_conditional(user_cois)

	count(required - effective) == 0
}

# Check if user has effective access to resource COIs (ANY mode with hierarchy)
# User must have at least ONE matching COI tag (after hierarchy expansion)
has_hierarchical_access_any(user_cois, resource_cois) if {
	count(resource_cois) == 0
}

has_hierarchical_access_any(user_cois, resource_cois) if {
	count(resource_cois) > 0
	required := {c | some c in resource_cois}

	# Use conditional expansion if enabled
	effective := expand_user_cois_conditional(user_cois)

	count(required & effective) > 0
}

# Unified hierarchy-aware access check
has_hierarchical_access(user_cois, resource_cois, operator) if {
	operator == "ALL"
	has_hierarchical_access_all(user_cois, resource_cois)
}

has_hierarchical_access(user_cois, resource_cois, operator) if {
	operator == "ANY"
	has_hierarchical_access_any(user_cois, resource_cois)
}

# Default to ALL if operator not specified or empty
has_hierarchical_access(user_cois, resource_cois, operator) if {
	not operator
	has_hierarchical_access_all(user_cois, resource_cois)
}

has_hierarchical_access(user_cois, resource_cois, operator) if {
	operator == ""
	has_hierarchical_access_all(user_cois, resource_cois)
}

# ============================================
# Hierarchy Validation Functions
# ============================================

# Get the full expanded COI set for debugging/logging
get_effective_cois(user_cois) := effective if {
	effective := expand_user_cois_conditional(user_cois)
}

# Check if a specific implied access is granted
grants_implied_access(user_cois, target_coi) if {
	effective := expand_user_cois_conditional(user_cois)
	target_coi in effective
}

# List all parent COIs that grant access to a target COI
parent_cois_granting_access(user_cois, target_coi) := parents if {
	parents := {parent |
		some parent in user_cois
		some child in merged_hierarchy[parent]
		child == target_coi
		is_hierarchy_active(parent, target_coi)
	}
}

# ============================================
# Hierarchy Path Computation
# ============================================

# Compute all paths from user COI to resource COI
compute_hierarchy_paths(user_cois, resource_cois) := paths if {
	paths := [path |
		some user_coi in user_cois
		some resource_coi in resource_cois
		path := find_path(user_coi, resource_coi, [user_coi])
		path != []
	]
}

# Find path from parent to child (depth-first search)
find_path(current, target, visited) := path if {
	current == target
	path := visited
} else := path if {
	# Explore children
	some child in merged_hierarchy[current]
	not contains(visited, child)
	is_hierarchy_active(current, child)
	path := find_path(child, target, array.concat(visited, [child]))
} else := []

# Helper: Check if array contains element
contains(arr, elem) if {
	some x in arr
	x == elem
}

# ============================================
# Hierarchy Explanation for Decision Logging (Enhanced)
# ============================================

# Generate explanation for why hierarchical access was granted
hierarchy_explanation(user_cois, resource_cois) := msg if {
	# Find which parent COIs granted access to which resource COIs
	implications := [implication |
		some resource_coi in resource_cois
		some user_coi in user_cois
		resource_coi in merged_hierarchy[user_coi]
		is_hierarchy_active(user_coi, resource_coi)
		implication := sprintf("%s implies %s", [user_coi, resource_coi])
	]

	count(implications) > 0
	msg := concat("; ", implications)
}

hierarchy_explanation(user_cois, resource_cois) := "" if {
	# No hierarchical implications
	implications := [implication |
		some resource_coi in resource_cois
		some user_coi in user_cois
		resource_coi in merged_hierarchy[user_coi]
		is_hierarchy_active(user_coi, resource_coi)
		implication := sprintf("%s implies %s", [user_coi, resource_coi])
	]
	count(implications) == 0
}

# ============================================
# Audit Metadata Generation
# ============================================

# Generate comprehensive audit metadata for decision logging
hierarchy_audit_metadata(user_cois, resource_cois) := metadata if {
	effective := expand_user_cois_conditional(user_cois)

	# Find granting parents
	granting := {parent |
		some parent in user_cois
		some resource_coi in resource_cois
		resource_coi in merged_hierarchy[parent]
		is_hierarchy_active(parent, resource_coi)
	}

	# Compute hierarchy paths
	paths := compute_hierarchy_paths(user_cois, resource_cois)

	# Check if multi-level expansion was used
	direct := {c | some c in user_cois}
	level1 := {child |
		some parent in direct
		some child in merged_hierarchy[parent]
	}
	multi_level := count(effective - direct - level1) > 0

	metadata := {
		"effective_cois": effective,
		"granting_parents": granting,
		"hierarchy_paths": paths,
		"expansion_applied": count(effective) > count(user_cois),
		"multi_level_expansion": multi_level,
	}
}

# ============================================
# Backward Compatibility
# ============================================

# This module provides hierarchical COI access checks.
# The original flat COI checks remain in dive.base.coi.registry
# Policies can import and use either module based on requirements:
#
# - data.dive.base.coi for flat/non-hierarchical checks
# - data.dive.base.coi.hierarchy for hierarchical checks
#
# Version History:
# - v1.0.0: Basic single-level hierarchy
# - v2.0.0: Multi-level + dynamic loading + conditional activation
