# =============================================================================
# DIVE V3 - Policy Bundle Tests
# =============================================================================
#
# Test suite for policy bundle verification and distribution.
# Tests verify that bundles are correctly structured and policies
# are properly scoped for spoke distribution.
#
# Run tests: opa test policies/ -v
#
# @version 1.0.0
# @date 2025-12-05
# =============================================================================

package dive.bundle_test

import rego.v1

import data.dive.base.guardrails
import data.dive.authorization

# =============================================================================
# BUNDLE METADATA TESTS
# =============================================================================

test_guardrails_metadata_present if {
	guardrails.metadata.package == "dive.base.guardrails"
	guardrails.metadata.version == "1.0.0"
	guardrails.metadata.source == "hub"
}

test_guardrails_is_immutable if {
	guardrails.metadata.immutable == true
}

# =============================================================================
# POLICY ROOT TESTS
# =============================================================================

test_base_guardrails_clearance_levels_defined if {
	count(guardrails.clearance_levels) == 4
	guardrails.clearance_levels[0] == "UNCLASSIFIED"
	guardrails.clearance_levels[3] == "TOP_SECRET"
}

test_base_guardrails_limits_defined if {
	guardrails.max_session_hours > 0
	guardrails.max_token_lifetime_minutes > 0
	guardrails.min_audit_retention_days > 0
}

# =============================================================================
# BUNDLE SCOPE FILTERING TESTS
# =============================================================================

# Test that base policies are always included
test_base_policies_always_included if {
	# Verify guardrails are accessible
	guardrails.is_valid_clearance("SECRET")
}

# Test clearance hierarchy is enforced
test_clearance_hierarchy_enforced if {
	guardrails.has_sufficient_clearance("TOP_SECRET", "SECRET")
	guardrails.has_sufficient_clearance("SECRET", "CONFIDENTIAL")
	not guardrails.has_sufficient_clearance("CONFIDENTIAL", "SECRET")
}

# =============================================================================
# BUNDLE CONTENT VALIDATION TESTS
# =============================================================================

# Test that guardrail violations are properly structured
test_guardrail_violation_structure if {
	violations := guardrails.guardrail_violations with input as {
		"context": {"session_hours": 24},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}

	# Verify violation structure
	some v in violations
	v.code == "SESSION_TOO_LONG"
	v.severity == "critical"
	contains(v.message, "exceeds maximum")
}

# Test that valid inputs pass guardrails
test_valid_input_passes_guardrails if {
	guardrails.guardrails_pass with input as {
		"context": {"session_hours": 8, "token_lifetime_minutes": 30},
		"subject": {"clearance": "SECRET", "mfa_used": true},
		"resource": {"classification": "CONFIDENTIAL"},
	}
}

# =============================================================================
# BUNDLE INTEGRITY TESTS
# =============================================================================

# Test that all required guardrail rules exist
test_all_guardrail_rules_present if {
	# Test is_valid_clearance
	guardrails.is_valid_clearance("UNCLASSIFIED")

	# Test has_sufficient_clearance
	guardrails.has_sufficient_clearance("SECRET", "SECRET")

	# Test guardrail_violations is a set
	violations := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	is_set(violations)

	# Test guardrails_pass
	guardrails.guardrails_pass with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}

	# Test guardrails_enforced
	guardrails.guardrails_enforced with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
}

# =============================================================================
# BUNDLE DISTRIBUTION TESTS
# =============================================================================

# Test that guardrails are independently evaluable
# (They should work without data dependencies)
test_guardrails_no_data_dependencies if {
	# Guardrails should work with minimal input
	result := guardrails.is_valid_clearance("SECRET")
	result == true
}

# Test constants are within expected ranges
test_guardrail_constants_reasonable if {
	guardrails.max_session_hours >= 1
	guardrails.max_session_hours <= 24
	guardrails.max_token_lifetime_minutes >= 15
	guardrails.max_token_lifetime_minutes <= 120
	guardrails.min_audit_retention_days >= 30
}

# =============================================================================
# BUNDLE VERSION COMPATIBILITY TESTS
# =============================================================================

# Test that policy version info is accessible
test_policy_version_accessible if {
	guardrails.metadata.version != ""
}

# Test that policy package is correctly named
test_policy_package_naming if {
	guardrails.metadata.package == "dive.base.guardrails"
}

# =============================================================================
# SCOPE-SPECIFIC POLICY TESTS
# =============================================================================

# Test base scope always provides guardrails
test_base_scope_provides_guardrails if {
	# When scope is "policy:base", guardrails must be available
	guardrails.clearance_levels != null
	guardrails.max_session_hours != null
}

# Test guardrail violations are collected correctly
test_multiple_violations_collected if {
	violations := guardrails.guardrail_violations with input as {
		"context": {
			"session_hours": 24,
			"token_lifetime_minutes": 120,
		},
		"subject": {"clearance": "INVALID", "mfa_used": false},
		"resource": {"classification": "SECRET"},
	}

	# Should have multiple violations
	count(violations) >= 2
}

# =============================================================================
# BUNDLE SECURITY TESTS
# =============================================================================

# Test that MFA requirements are enforced
test_mfa_requirements_enforced if {
	# MFA not required for UNCLASSIFIED
	violations_unclass := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": false},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	not mfa_violation_exists(violations_unclass)

	# MFA required for CONFIDENTIAL and above
	violations_conf := guardrails.guardrail_violations with input as {
		"context": {},
		"subject": {"clearance": "CONFIDENTIAL", "mfa_used": false},
		"resource": {"classification": "CONFIDENTIAL"},
	}
	mfa_violation_exists(violations_conf)
}

# Helper: check if MFA violation exists
mfa_violation_exists(violations) if {
	some v in violations
	v.code == "MFA_REQUIRED"
}

# Test that session limits are enforced
test_session_limits_enforced if {
	# At limit - should pass
	violations_at_limit := guardrails.guardrail_violations with input as {
		"context": {"session_hours": guardrails.max_session_hours},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	not session_violation_exists(violations_at_limit)

	# Over limit - should fail
	violations_over_limit := guardrails.guardrail_violations with input as {
		"context": {"session_hours": guardrails.max_session_hours + 1},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	session_violation_exists(violations_over_limit)
}

# Helper: check if session violation exists
session_violation_exists(violations) if {
	some v in violations
	v.code == "SESSION_TOO_LONG"
}

# Test that token limits are enforced
test_token_limits_enforced if {
	# At limit - should pass
	violations_at_limit := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": guardrails.max_token_lifetime_minutes},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	not token_violation_exists(violations_at_limit)

	# Over limit - should fail
	violations_over_limit := guardrails.guardrail_violations with input as {
		"context": {"token_lifetime_minutes": guardrails.max_token_lifetime_minutes + 1},
		"subject": {"clearance": "UNCLASSIFIED", "mfa_used": true},
		"resource": {"classification": "UNCLASSIFIED"},
	}
	token_violation_exists(violations_over_limit)
}

# Helper: check if token violation exists
token_violation_exists(violations) if {
	some v in violations
	v.code == "TOKEN_LIFETIME_TOO_LONG"
}





