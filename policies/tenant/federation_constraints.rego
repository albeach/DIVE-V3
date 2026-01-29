##########################################################################################
# Federation Constraints Policy Package
# Package: dive.tenant.federation_constraints
#
# Purpose: Implements bilateral federation constraints for spoke↔spoke access control.
#          Interprets data-driven tenant policies with effective-min logic.
#
# Phase 2, Task 2.1
# Date: 2026-01-28
##########################################################################################

package dive.tenant.federation_constraints

import rego.v1
import data.dive.base.clearance as base_clearance

##########################################################################################
# DATA LOADING
##########################################################################################

# Load active constraints from OPAL data
# Structure: federation_constraints[ownerTenant][partnerTenant] = {...}
active_constraints := data.federation_constraints.federation_constraints if {
	data.federation_constraints
	data.federation_constraints.federation_constraints
} else := {}

##########################################################################################
# UNILATERAL CONSTRAINT LOOKUP
##########################################################################################

# Get unilateral constraint (owner → partner)
# Returns null if no constraint exists
get_constraint(owner, partner) := constraint if {
	active_constraints[owner]
	constraint := active_constraints[owner][partner]
} else := null

##########################################################################################
# BILATERAL EFFECTIVE-MIN LOGIC
##########################################################################################

# Clearance rank mapping (from base_clearance, but inlined for direct access)
_clearance_rank := {
	"UNCLASSIFIED": 0,
	"RESTRICTED": 1,
	"CONFIDENTIAL": 2,
	"SECRET": 3,
	"TOP_SECRET": 4,
}

# Compute bilateral effective maximum classification
# Effective max = min(owner outbound, partner outbound)
#
# Example:
#   FRA→DEU: SECRET (level 3)
#   DEU→FRA: CONFIDENTIAL (level 2)
#   Effective: min(3, 2) = 2 = CONFIDENTIAL
effective_max_classification(owner, partner) := level if {
	owner_constraint := get_constraint(owner, partner)
	partner_constraint := get_constraint(partner, owner)

	# Both constraints must exist for bilateral effective-min
	owner_constraint != null
	partner_constraint != null

	owner_level := _clearance_rank[owner_constraint.maxClassification]
	partner_level := _clearance_rank[partner_constraint.maxClassification]

	# Take the minimum (most restrictive)
	min_level := min([owner_level, partner_level])

	# Convert back to level name
	level := _rank_to_level(min_level)
} else := null

# Helper: Convert numeric rank back to level name
_rank_to_level(rank) := "UNCLASSIFIED" if {
	rank == 0
} else := "RESTRICTED" if {
	rank == 1
} else := "CONFIDENTIAL" if {
	rank == 2
} else := "SECRET" if {
	rank == 3
} else := "TOP_SECRET" if {
	rank == 4
} else := null

##########################################################################################
# CLASSIFICATION CAP CHECK
##########################################################################################

# Check if resource classification is within bilateral effective cap
# Returns true if allowed, false if exceeds cap
check_classification_cap(owner, partner, resource_class) if {
	# Get effective max classification (bilateral min)
	effective_max := effective_max_classification(owner, partner)

	# If no effective max (no constraints), allow
	effective_max != null

	# Check if resource classification <= effective max (using rank comparison)
	effective_rank := _clearance_rank[effective_max]
	resource_rank := _clearance_rank[resource_class]
	effective_rank >= resource_rank
}

# If no constraints exist, allow (default permissive)
check_classification_cap(owner, partner, resource_class) if {
	effective_max := effective_max_classification(owner, partner)
	effective_max == null
}

# Violation message: classification cap exceeded
is_classification_cap_exceeded := msg if {
	# Extract tenant information
	owner_tenant := input.resource.ownerTenant
	partner_tenant := input.subject.countryOfAffiliation

	# Get constraints
	owner_constraint := get_constraint(owner_tenant, partner_tenant)
	partner_constraint := get_constraint(partner_tenant, owner_tenant)

	# Calculate effective max
	effective_max := effective_max_classification(owner_tenant, partner_tenant)

	# Check if resource classification exceeds effective max
	resource_class := input.resource.classification
	effective_max != null

	# Check using rank comparison
	effective_rank := _clearance_rank[effective_max]
	resource_rank := _clearance_rank[resource_class]
	effective_rank < resource_rank

	msg := sprintf(
		"Federation constraint violation: Resource classification %s exceeds bilateral effective-min cap %s (%s→%s allows %s, %s→%s allows %s)",
		[
			resource_class,
			effective_max,
			owner_tenant,
			partner_tenant,
			owner_constraint.maxClassification,
			partner_tenant,
			owner_tenant,
			partner_constraint.maxClassification,
		],
	)
}

##########################################################################################
# COI BILATERAL LOGIC (Deny Wins + Allowlist Intersection)
##########################################################################################

# Check if all resource COIs are allowed under bilateral constraints
# Returns true if allowed, false if denied
check_coi_allowed(owner, partner, resource_cois) if {
	# All resource COIs must pass bilateral check
	every resource_coi in resource_cois {
		_coi_allowed_bilateral(
			get_constraint(owner, partner),
			get_constraint(partner, owner),
			resource_coi,
		)
	}
}

# If no constraints exist, allow (default permissive)
check_coi_allowed(owner, partner, resource_cois) if {
	get_constraint(owner, partner) == null
	get_constraint(partner, owner) == null
}

# Helper: Check if a single COI is allowed bilaterally
# Rules:
# 1. Deny wins: If either side denies the COI, deny
# 2. Allowlist intersection: If both specify allowlists, require both to allow
# 3. Mixed allowlist: If only one side has allowlist, use that
# 4. No allowlist: If neither has allowlist, allow all COIs (unless denied)
_coi_allowed_bilateral(owner_constraint, partner_constraint, coi) if {
	# Both constraints must exist
	owner_constraint != null
	partner_constraint != null

	# 1. DENY WINS: Check if either side denies the COI
	not coi in object.get(owner_constraint, "deniedCOIs", [])
	not coi in object.get(partner_constraint, "deniedCOIs", [])

	# Get allowlists
	owner_allowed := object.get(owner_constraint, "allowedCOIs", [])
	partner_allowed := object.get(partner_constraint, "allowedCOIs", [])

	# 2. ALLOWLIST INTERSECTION: If both have allowlists, require both to allow
	_coi_passes_allowlist_check(owner_allowed, partner_allowed, coi)
}

# If only one constraint exists, use that one's rules
_coi_allowed_bilateral(owner_constraint, partner_constraint, coi) if {
	owner_constraint != null
	partner_constraint == null

	# Check owner's deny and allow lists
	not coi in object.get(owner_constraint, "deniedCOIs", [])
	_coi_in_allowlist_or_empty(object.get(owner_constraint, "allowedCOIs", []), coi)
}

_coi_allowed_bilateral(owner_constraint, partner_constraint, coi) if {
	owner_constraint == null
	partner_constraint != null

	# Check partner's deny and allow lists
	not coi in object.get(partner_constraint, "deniedCOIs", [])
	_coi_in_allowlist_or_empty(object.get(partner_constraint, "allowedCOIs", []), coi)
}

# If neither constraint exists, allow
_coi_allowed_bilateral(owner_constraint, partner_constraint, coi) if {
	owner_constraint == null
	partner_constraint == null
}

# Helper: Check allowlist intersection logic
_coi_passes_allowlist_check(owner_allowed, partner_allowed, coi) if {
	# Case 1: Both have allowlists → require intersection (both must allow)
	count(owner_allowed) > 0
	count(partner_allowed) > 0
	coi in owner_allowed
	coi in partner_allowed
}

_coi_passes_allowlist_check(owner_allowed, partner_allowed, coi) if {
	# Case 2: Only owner has allowlist → require COI in owner's list
	count(owner_allowed) > 0
	count(partner_allowed) == 0
	coi in owner_allowed
}

_coi_passes_allowlist_check(owner_allowed, partner_allowed, coi) if {
	# Case 3: Only partner has allowlist → require COI in partner's list
	count(owner_allowed) == 0
	count(partner_allowed) > 0
	coi in partner_allowed
}

_coi_passes_allowlist_check(owner_allowed, partner_allowed, coi) if {
	# Case 4: Neither has allowlist → allow all (subject to deny check already done)
	count(owner_allowed) == 0
	count(partner_allowed) == 0
}

# Helper: Check if COI is in allowlist or allowlist is empty
_coi_in_allowlist_or_empty(allowlist, coi) if {
	count(allowlist) == 0
}

_coi_in_allowlist_or_empty(allowlist, coi) if {
	count(allowlist) > 0
	coi in allowlist
}

# Violation message: COI not allowed
is_coi_not_allowed := msg if {
	owner_tenant := input.resource.ownerTenant
	partner_tenant := input.subject.countryOfAffiliation
	resource_cois := object.get(input.resource, "COI", [])

	# Find first COI that's not allowed
	some resource_coi in resource_cois
	not _coi_allowed_bilateral(
		get_constraint(owner_tenant, partner_tenant),
		get_constraint(partner_tenant, owner_tenant),
		resource_coi,
	)

	owner_constraint := get_constraint(owner_tenant, partner_tenant)
	partner_constraint := get_constraint(partner_tenant, owner_tenant)

	# Determine reason
	reason := _coi_denial_reason(owner_constraint, partner_constraint, resource_coi)

	msg := sprintf(
		"Federation constraint violation: COI '%s' not allowed for %s→%s federation. Reason: %s",
		[resource_coi, partner_tenant, owner_tenant, reason],
	)
}

# Helper: Determine COI denial reason
_coi_denial_reason(owner_constraint, partner_constraint, coi) := reason if {
	# Check if denied by owner
	coi in object.get(owner_constraint, "deniedCOIs", [])
	reason := sprintf("Owner explicitly denies this COI", [])
} else := reason if {
	# Check if denied by partner
	coi in object.get(partner_constraint, "deniedCOIs", [])
	reason := sprintf("Partner explicitly denies this COI", [])
} else := reason if {
	# Check if not in allowlist intersection
	owner_allowed := object.get(owner_constraint, "allowedCOIs", [])
	partner_allowed := object.get(partner_constraint, "allowedCOIs", [])

	# Both have allowlists but COI not in both
	count(owner_allowed) > 0
	count(partner_allowed) > 0
	_not_in_both_allowlists(coi, owner_allowed, partner_allowed)

	reason := sprintf("Not in bilateral allowlist intersection (owner allows: %v, partner allows: %v)", [owner_allowed, partner_allowed])
} else := "Not in allowlist"

# Helper: Check if COI is not in both allowlists
_not_in_both_allowlists(coi, owner_allowed, partner_allowed) if {
	not coi in owner_allowed
}

_not_in_both_allowlists(coi, owner_allowed, partner_allowed) if {
	not coi in partner_allowed
}

##########################################################################################
# SUMMARY FUNCTIONS FOR DEBUGGING
##########################################################################################

# Get all active constraints (for debugging/admin UI)
all_constraints := active_constraints

# Get constraint count
constraint_count := count if {
	count := sum([count(partners) | some owner, partners in active_constraints])
}
