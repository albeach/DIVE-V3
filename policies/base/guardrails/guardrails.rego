# =============================================================================
# DIVE V3 - Hub Guardrails (Immutable Base Policies)
# =============================================================================
#
# These policies are enforced by the Hub and CANNOT be overridden by spokes.
# Spokes can ADD restrictions but cannot WEAKEN these guardrails.
#
# Pushed to all spokes via OPAL.
# Signed by Hub's policy signing key.
#
# Version: 1.0.0
# Last Updated: 2025-12-04
# =============================================================================

package dive.base.guardrails

import rego.v1

# =============================================================================
# IMMUTABLE CONSTANTS
# =============================================================================

# Clearance hierarchy (cannot be modified)
clearance_levels := ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]

clearance_rank := {
	"UNCLASSIFIED": 0,
	"CONFIDENTIAL": 1,
	"SECRET": 2,
	"TOP_SECRET": 3,
}

# Classification that requires MFA (spokes can only make this stricter)
default_mfa_required_above := "UNCLASSIFIED"

# Maximum session duration in hours (spokes can only make this shorter)
max_session_hours := 10

# Maximum token lifetime in minutes
max_token_lifetime_minutes := 60

# Minimum audit retention days
min_audit_retention_days := 90

# =============================================================================
# GUARDRAIL ENFORCEMENT
# =============================================================================

# Check if a clearance level is valid
is_valid_clearance(level) if {
	level in clearance_levels
}

# Check if subject has sufficient clearance for resource
has_sufficient_clearance(subject_clearance, resource_classification) if {
	clearance_rank[subject_clearance] >= clearance_rank[resource_classification]
}

# =============================================================================
# GUARDRAIL VIOLATIONS
# =============================================================================
# These produce violations if spokes try to bypass guardrails
# guardrail_violations is a set that collects all policy violations

# Violation: Session duration exceeds maximum
guardrail_violations contains violation if {
	input.context.session_hours > max_session_hours
	violation := {
		"code": "SESSION_TOO_LONG",
		"message": sprintf("Session duration %d hours exceeds maximum %d hours", [
			input.context.session_hours,
			max_session_hours,
		]),
		"severity": "critical",
	}
}

# Violation: Token lifetime exceeds maximum
guardrail_violations contains violation if {
	input.context.token_lifetime_minutes > max_token_lifetime_minutes
	violation := {
		"code": "TOKEN_LIFETIME_TOO_LONG",
		"message": sprintf("Token lifetime %d minutes exceeds maximum %d minutes", [
			input.context.token_lifetime_minutes,
			max_token_lifetime_minutes,
		]),
		"severity": "critical",
	}
}

# Violation: MFA not used for classified access
guardrail_violations contains violation if {
	resource_classification := input.resource.classification
	clearance_rank[resource_classification] > clearance_rank[default_mfa_required_above]
	not input.subject.mfa_used
	violation := {
		"code": "MFA_REQUIRED",
		"message": sprintf("MFA required for %s access", [resource_classification]),
		"severity": "critical",
	}
}

# Violation: Invalid clearance level claimed
guardrail_violations contains violation if {
	not is_valid_clearance(input.subject.clearance)
	violation := {
		"code": "INVALID_CLEARANCE",
		"message": sprintf("Invalid clearance level: %s", [input.subject.clearance]),
		"severity": "critical",
	}
}

# Violation: Insufficient clearance
guardrail_violations contains violation if {
	not has_sufficient_clearance(input.subject.clearance, input.resource.classification)
	violation := {
		"code": "INSUFFICIENT_CLEARANCE",
		"message": sprintf("Clearance %s insufficient for %s resource", [
			input.subject.clearance,
			input.resource.classification,
		]),
		"severity": "critical",
	}
}

# =============================================================================
# HUB↔SPOKE FEDERATION PROTECTION (Phase 2)
# =============================================================================
# CRITICAL GUARDRAILS: Prevent tenants from tampering with hub↔spoke constraints
# These guardrails protect against backend RBAC bypass attempts.
# Even if a spoke admin bypasses MongoDB write permissions, OPA will deny access.

# Violation: Hub↔spoke federation constraint was modified by non-super_admin
guardrail_violations contains violation if {
	# Subject is from a spoke (has issuer, not local auth)
	input.subject.issuer

	# Extract subject's tenant from issuer
	subject_tenant := _extract_tenant_from_issuer(input.subject.issuer)
	subject_tenant != "HUB"
	subject_tenant != "UNKNOWN"

	# Resource is from hub or current tenant is hub
	resource_tenant := object.get(input.context, "tenant", "USA")
	resource_tenant == "HUB"

	# Check federation constraint for subject→hub relationship
	data.federation_constraints.federation_constraints[subject_tenant]
	constraint := data.federation_constraints.federation_constraints[subject_tenant]["HUB"]
	constraint.relationshipType == "hub_spoke"

	# Verify modifier was NOT a super_admin
	modifiedBy := object.get(constraint, "modifiedBy", "")
	not _is_super_admin(modifiedBy)

	violation := {
		"code": "HUB_FEDERATION_TAMPERING",
		"message": sprintf(
			"Hub↔spoke federation constraint for %s was modified by non-super_admin: %s. This is a critical security violation.",
			[subject_tenant, modifiedBy],
		),
		"severity": "critical",
		"subject_tenant": subject_tenant,
		"modifier": modifiedBy,
		"constraint_type": "hub_spoke",
	}
}

# Violation: Constraint claims hub_spoke but involves non-HUB tenant
guardrail_violations contains violation if {
	# Check all constraints for invalid hub_spoke relationships
	data.federation_constraints.federation_constraints
	some owner, partners in data.federation_constraints.federation_constraints
	some partner, constraint in partners

	# Constraint claims to be hub_spoke
	constraint.relationshipType == "hub_spoke"

	# But neither side is actually HUB
	owner != "HUB"
	partner != "HUB"

	violation := {
		"code": "INVALID_HUB_SPOKE_RELATIONSHIP",
		"message": sprintf(
			"Constraint %s→%s claims relationshipType='hub_spoke' but neither side is HUB",
			[owner, partner],
		),
		"severity": "critical",
		"owner": owner,
		"partner": partner,
	}
}

# Violation: HUB tenant involved but relationshipType is spoke_spoke
guardrail_violations contains violation if {
	data.federation_constraints.federation_constraints
	some owner, partners in data.federation_constraints.federation_constraints
	some partner, constraint in partners

	# One side is HUB
	_involves_hub_tenant(owner, partner)

	# But relationshipType is spoke_spoke (should be hub_spoke)
	constraint.relationshipType == "spoke_spoke"

	violation := {
		"code": "HUB_TENANT_WRONG_TYPE",
		"message": sprintf(
			"Constraint %s→%s involves HUB but has relationshipType='spoke_spoke' (should be 'hub_spoke')",
			[owner, partner],
		),
		"severity": "critical",
		"owner": owner,
		"partner": partner,
	}
}

# Helper: Extract tenant from issuer URL
_extract_tenant_from_issuer(issuer) := tenant if {
	# Example: https://keycloak-fra:8443/realms/dive-v3-broker-fra
	regex.match(`/realms/dive-v3-broker-([a-z]{3})`, issuer)
	matches := regex.find_all_string_submatch_n(`/realms/dive-v3-broker-([a-z]{3})`, issuer, -1)
	count(matches) > 0
	count(matches[0]) > 1
	tenant_lower := matches[0][1]
	tenant := upper(tenant_lower)
} else := "UNKNOWN"

# Helper: Check if user is super_admin
_is_super_admin(modifiedBy) if {
	contains(modifiedBy, "super_admin")
}

_is_super_admin(modifiedBy) if {
	contains(modifiedBy, "super-admin")
}

_is_super_admin(modifiedBy) if {
	# Email pattern: super_admin@dive.nato.int
	regex.match(`super[_-]?admin@`, modifiedBy)
}

# Helper: Check if owner or partner is HUB
_involves_hub_tenant(owner, partner) if {
	owner == "HUB"
}

_involves_hub_tenant(owner, partner) if {
	partner == "HUB"
}

# =============================================================================
# GUARDRAIL PASS CHECK
# =============================================================================

# All guardrails pass (no violations)
guardrails_pass if {
	count(guardrail_violations) == 0
}

# For spokes to import and check
default guardrails_enforced := false

guardrails_enforced if {
	guardrails_pass
}

# =============================================================================
# POLICY INFO
# =============================================================================

metadata := {
	"package": "dive.base.guardrails",
	"version": "1.0.0",
	"source": "hub",
	"immutable": true,
	"description": "Hub-enforced guardrails that spokes cannot override",
}
