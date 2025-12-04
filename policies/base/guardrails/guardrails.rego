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

default guardrail_violations := []

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
# METADATA
# =============================================================================

metadata := {
	"package": "dive.base.guardrails",
	"version": "1.0.0",
	"source": "hub",
	"immutable": true,
	"description": "Hub-enforced guardrails that spokes cannot override",
}

