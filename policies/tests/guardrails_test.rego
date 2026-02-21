# =============================================================================
# DIVE V3 - Hub Guardrails Tests
# =============================================================================
#
# Test suite for the hub guardrails policy (dive.base.guardrails).
# These tests validate immutable security constraints enforced by the hub.
#
# Run tests: opa test policies/base/guardrails/ policies/tests/guardrails_test.rego -v
#
# Coverage targets:
# - Session duration limits
# - Token lifetime limits
# - MFA requirements
# - Clearance hierarchy validation
# - Clearance sufficiency checks
#
# Version: 1.0.0
# Last Updated: 2025-12-05
# =============================================================================

package dive.base.guardrails_test

import rego.v1

import data.dive.base.guardrails

# =============================================================================
# TEST FIXTURES
# =============================================================================

# Valid input with all required fields
valid_input := {
	"subject": {
		"uniqueID": "test-user-123",
		"clearance": "SECRET",
		"countryOfAffiliation": "USA",
		"mfa_used": true,
	},
	"resource": {
		"resourceId": "doc-123",
		"classification": "SECRET",
		"releasabilityTo": ["USA"],
	},
	"context": {
		"session_hours": 8,
		"token_lifetime_minutes": 30,
	},
}

# =============================================================================
# CLEARANCE HIERARCHY TESTS
# =============================================================================

test_clearance_levels_defined if {
	count(guardrails.clearance_levels) == 4
}

test_clearance_levels_order if {
	guardrails.clearance_levels[0] == "UNCLASSIFIED"
	guardrails.clearance_levels[1] == "CONFIDENTIAL"
	guardrails.clearance_levels[2] == "SECRET"
	guardrails.clearance_levels[3] == "TOP_SECRET"
}

test_valid_clearance_unclassified if {
	guardrails.is_valid_clearance("UNCLASSIFIED")
}

test_valid_clearance_confidential if {
	guardrails.is_valid_clearance("CONFIDENTIAL")
}

test_valid_clearance_secret if {
	guardrails.is_valid_clearance("SECRET")
}

test_valid_clearance_top_secret if {
	guardrails.is_valid_clearance("TOP_SECRET")
}

test_invalid_clearance_lowercase if {
	not guardrails.is_valid_clearance("secret")
}

test_invalid_clearance_garbage if {
	not guardrails.is_valid_clearance("INVALID")
}

test_invalid_clearance_empty if {
	not guardrails.is_valid_clearance("")
}

# =============================================================================
# CLEARANCE SUFFICIENCY TESTS
# =============================================================================

test_top_secret_access_secret_resource if {
	guardrails.has_sufficient_clearance("TOP_SECRET", "SECRET")
}

test_top_secret_access_confidential_resource if {
	guardrails.has_sufficient_clearance("TOP_SECRET", "CONFIDENTIAL")
}

test_top_secret_access_unclassified_resource if {
	guardrails.has_sufficient_clearance("TOP_SECRET", "UNCLASSIFIED")
}

test_secret_access_secret_resource if {
	guardrails.has_sufficient_clearance("SECRET", "SECRET")
}

test_secret_access_confidential_resource if {
	guardrails.has_sufficient_clearance("SECRET", "CONFIDENTIAL")
}

test_secret_denied_top_secret_resource if {
	not guardrails.has_sufficient_clearance("SECRET", "TOP_SECRET")
}

test_confidential_denied_secret_resource if {
	not guardrails.has_sufficient_clearance("CONFIDENTIAL", "SECRET")
}

test_unclassified_denied_confidential_resource if {
	not guardrails.has_sufficient_clearance("UNCLASSIFIED", "CONFIDENTIAL")
}

test_same_clearance_allowed if {
	guardrails.has_sufficient_clearance("CONFIDENTIAL", "CONFIDENTIAL")
	guardrails.has_sufficient_clearance("UNCLASSIFIED", "UNCLASSIFIED")
}

# =============================================================================
# GUARDRAIL CONSTANTS TESTS
# =============================================================================

test_max_session_hours_is_10 if {
	guardrails.max_session_hours == 10
}

test_max_token_lifetime_is_60 if {
	guardrails.max_token_lifetime_minutes == 60
}

test_mfa_required_above_unclassified if {
	guardrails.default_mfa_required_above == "UNCLASSIFIED"
}

test_min_audit_retention_is_90 if {
	guardrails.min_audit_retention_days == 90
}

# =============================================================================
# SESSION DURATION VIOLATION TESTS
# =============================================================================

test_session_at_limit_no_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 10},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "SESSION_TOO_LONG"}) == 0
}

test_session_below_limit_no_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 5},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "SESSION_TOO_LONG"}) == 0
}

test_session_exceeds_limit_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 11},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "SESSION_TOO_LONG"}) == 1
}

test_session_far_exceeds_limit_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 24},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	some v in violations
	v.code == "SESSION_TOO_LONG"
	v.severity == "critical"
}

# =============================================================================
# TOKEN LIFETIME VIOLATION TESTS
# =============================================================================

test_token_at_limit_no_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": 60},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "TOKEN_LIFETIME_TOO_LONG"}) == 0
}

test_token_below_limit_no_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": 30},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "TOKEN_LIFETIME_TOO_LONG"}) == 0
}

test_token_exceeds_limit_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": 61},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "TOKEN_LIFETIME_TOO_LONG"}) == 1
}

test_token_far_exceeds_limit_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": 120},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	some v in violations
	v.code == "TOKEN_LIFETIME_TOO_LONG"
	v.severity == "critical"
}

# =============================================================================
# MFA REQUIREMENT TESTS
# =============================================================================

test_mfa_not_required_for_unclassified if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": false},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "MFA_REQUIRED"}) == 0
}

test_mfa_required_for_confidential_without_mfa if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "CONFIDENTIAL", "mfa_used": false},
		"resource": {"classification": "CONFIDENTIAL"},
	}
	count({v | v := violations[_]; v.code == "MFA_REQUIRED"}) == 1
}

test_mfa_required_for_secret_without_mfa if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "SECRET", "mfa_used": false},
		"resource": {"classification": "SECRET"},
	}
	some v in violations
	v.code == "MFA_REQUIRED"
	v.severity == "critical"
}

test_mfa_satisfied_for_secret_with_mfa if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "SECRET", "mfa_used": true},
		"resource": {"classification": "SECRET"},
	}
	count({v | v := violations[_]; v.code == "MFA_REQUIRED"}) == 0
}

test_mfa_required_for_top_secret_without_mfa if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "TOP_SECRET", "mfa_used": false},
		"resource": {"classification": "TOP_SECRET"},
	}
	count({v | v := violations[_]; v.code == "MFA_REQUIRED"}) == 1
}

# =============================================================================
# INVALID CLEARANCE VIOLATION TESTS
# =============================================================================

test_invalid_clearance_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "INVALID", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	some v in violations
	v.code == "INVALID_CLEARANCE"
	v.severity == "critical"
}

test_lowercase_clearance_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "secret", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "INVALID_CLEARANCE"}) == 1
}

# =============================================================================
# INSUFFICIENT CLEARANCE VIOLATION TESTS
# =============================================================================

test_insufficient_clearance_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "CONFIDENTIAL", "mfa_used": true},
		"resource": {"classification": "SECRET"},
	}
	some v in violations
	v.code == "INSUFFICIENT_CLEARANCE"
	v.severity == "critical"
}

test_unclassified_accessing_top_secret_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "TOP_SECRET"},
	}
	some v in violations
	v.code == "INSUFFICIENT_CLEARANCE"
}

# =============================================================================
# GUARDRAILS PASS TESTS
# =============================================================================

test_guardrails_pass_valid_access if {
	guardrails.guardrails_pass with input as valid_input
}

test_guardrails_fail_session_exceeded if {
	not guardrails.guardrails_pass with input as {
		"context": {"session_hours": 24},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
}

test_guardrails_enforced_with_valid_input if {
	guardrails.guardrails_enforced with input as valid_input
}

test_guardrails_not_enforced_with_violations if {
	not guardrails.guardrails_enforced with input as {
		"context": {"session_hours": 24},
		"subject": {"clearance": "INVALID", "mfa_used": false},
		"resource": {"classification": "TOP_SECRET"},
	}
}

# =============================================================================
# MULTIPLE VIOLATIONS TESTS
# =============================================================================

test_multiple_violations_detected if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 24, "token_lifetime_minutes": 120},
		"subject": {"clearance": "INVALID", "mfa_used": false},
		"resource": {"classification": "TOP_SECRET"},
	}

	# Should have: SESSION_TOO_LONG, TOKEN_LIFETIME_TOO_LONG, INVALID_CLEARANCE
	# Note: INSUFFICIENT_CLEARANCE won't trigger because clearance is invalid
	# MFA_REQUIRED won't trigger because we can't determine if MFA is needed for invalid clearance
	count(violations) >= 3
}

test_all_critical_violations if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 24, "token_lifetime_minutes": 120},
		"subject": {"clearance": "CONFIDENTIAL", "mfa_used": false},
		"resource": {"classification": "SECRET"},
	}

	# All violations should be critical
	critical_violations := {v | v := violations[_]; v.severity == "critical"}
	count(critical_violations) == count(violations)
}

# =============================================================================
# POLICY INFO TESTS
# =============================================================================

test_metadata_exists if {
	guardrails.metadata["package"] == "dive.base.guardrails"
	guardrails.metadata.version == "1.0.0"
	guardrails.metadata.source == "hub"
	guardrails.metadata.immutable == true
}

# =============================================================================
# EDGE CASE TESTS
# =============================================================================

test_missing_context_no_session_violation if {
	violations := guardrails.guardrail_violations with input as {
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "SESSION_TOO_LONG"}) == 0
}

test_zero_session_hours_no_violation if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 0},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	count({v | v := violations[_]; v.code == "SESSION_TOO_LONG"}) == 0
}
