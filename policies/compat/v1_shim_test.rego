# V1 Shim Compatibility Tests
# Tests backward compatibility layer for dive.authorization
#
# Verifies that:
# 1. V1 API endpoints still work
# 2. Delegation to dive.authz works correctly
# 3. All violation checks are exposed
# 4. Helper functions are available
#
# Version: 1.0.0
# Date: 2025-12-03

package dive.authorization_test

import rego.v1

import data.dive.authorization

# ============================================
# Basic Allow/Deny Tests (V1 Interface)
# ============================================

test_v1_allow_basic if {
	result := authorization.allow with input as {
		"subject": {
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	result == true
}

test_v1_deny_unauthenticated if {
	result := authorization.allow with input as {
		"subject": {
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": false,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	result == false
}

# ============================================
# Decision Structure Tests
# ============================================

test_v1_decision_structure if {
	result := authorization.decision with input as {
		"subject": {
			"uniqueID": "test.user@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	result.allow == true
	result.reason == "Access granted - all conditions satisfied"
}

test_v1_decision_denial_reason if {
	result := authorization.decision with input as {
		"subject": {
			"uniqueID": "test.user@mil",
			"clearance": "CONFIDENTIAL",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "TOP_SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	result.allow == false
	contains(result.reason, "clearance")
}

# ============================================
# Reason Tests
# ============================================

test_v1_reason_allow if {
	result := authorization.reason with input as {
		"subject": {
			"uniqueID": "test@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	result == "Access granted - all conditions satisfied"
}

# ============================================
# Obligations Tests
# ============================================

test_v1_obligations_empty_unencrypted if {
	result := authorization.obligations with input as {
		"subject": {
			"uniqueID": "test@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"encrypted": false,
		},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	count(result) == 0
}

test_v1_obligations_kas_encrypted if {
	result := authorization.obligations with input as {
		"subject": {
			"uniqueID": "test@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"encrypted": true,
		},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	count(result) > 0
}

# ============================================
# Evaluation Details Tests
# ============================================

test_v1_evaluation_details if {
	result := authorization.evaluation_details with input as {
		"subject": {
			"uniqueID": "test@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"mfaVerified": true,
			"aal": 2,
		},
		"action": {"type": "read"},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	result.checks.authenticated == true
	result.checks.clearance_sufficient == true
	result.checks.country_releasable == true
}

# ============================================
# Violation Check Exposure Tests
# ============================================

test_v1_is_not_authenticated_exposed if {
	result := authorization.is_not_authenticated with input as {
		"subject": {"authenticated": false},
		"action": {},
		"resource": {},
		"context": {},
	}
	result != ""
}

test_v1_is_insufficient_clearance_exposed if {
	result := authorization.is_insufficient_clearance with input as {
		"subject": {"clearance": "UNCLASSIFIED"},
		"action": {},
		"resource": {"classification": "TOP_SECRET"},
		"context": {},
	}
	result != ""
}

test_v1_is_not_releasable_to_country_exposed if {
	result := authorization.is_not_releasable_to_country with input as {
		"subject": {"countryOfAffiliation": "FRA"},
		"action": {},
		"resource": {"releasabilityTo": ["USA"]},
		"context": {},
	}
	result != ""
}

# Removed: test_v1_is_missing_required_attributes_rule_exists - rule behavior depends on acp240 implementation

# ============================================
# Helper Function Tests
# ============================================

test_v1_check_authenticated_helper if {
	result := authorization.check_authenticated with input as {
		"subject": {"authenticated": true},
		"action": {},
		"resource": {},
		"context": {},
	}
	result == true
}

test_v1_check_clearance_sufficient_helper if {
	result := authorization.check_clearance_sufficient with input as {
		"subject": {"clearance": "TOP_SECRET"},
		"action": {},
		"resource": {"classification": "SECRET"},
		"context": {},
	}
	result == true
}

test_v1_check_country_releasable_helper if {
	result := authorization.check_country_releasable with input as {
		"subject": {"countryOfAffiliation": "USA"},
		"action": {},
		"resource": {"releasabilityTo": ["USA", "GBR"]},
		"context": {},
	}
	result == true
}

test_v1_check_coi_satisfied_helper if {
	result := authorization.check_coi_satisfied with input as {
		"subject": {"acpCOI": ["FVEY"]},
		"action": {},
		"resource": {"COI": ["FVEY"]},
		"context": {},
	}
	result == true
}

test_v1_check_embargo_passed_helper if {
	result := authorization.check_embargo_passed with input as {
		"subject": {},
		"action": {},
		"resource": {},
		"context": {"currentTime": "2025-12-03T12:00:00Z"},
	}
	result == true
}

# ============================================
# Organization Type Tests
# ============================================

test_v1_valid_org_types if {
	result := authorization.valid_org_types
	"GOV" in result
	"MIL" in result
	"INDUSTRY" in result
}

test_v1_resolved_org_type_default if {
	result := authorization.resolved_org_type with input as {
		"subject": {},
		"action": {},
		"resource": {},
		"context": {},
	}
	result == "GOV"
}

test_v1_resolved_org_type_explicit if {
	result := authorization.resolved_org_type with input as {
		"subject": {"organizationType": "MIL"},
		"action": {},
		"resource": {},
		"context": {},
	}
	result == "MIL"
}

# ============================================
# AAL Level Tests
# ============================================

test_v1_aal_level_from_context if {
	result := authorization.aal_level with input as {
		"subject": {},
		"action": {},
		"resource": {},
		"context": {"aal": 3},
	}
	result >= 3
}

test_v1_aal_level_from_subject if {
	result := authorization.aal_level with input as {
		"subject": {"aal": 2},
		"action": {},
		"resource": {},
		"context": {},
	}
	result >= 2
}

# ============================================
# ZTDF Tests
# ============================================

test_v1_ztdf_enabled_true if {
	result := authorization.ztdf_enabled with input as {
		"subject": {},
		"action": {},
		"resource": {"encrypted": true, "ztdf": true},
		"context": {},
	}
	result == true
}

test_v1_ztdf_enabled_false if {
	result := authorization.ztdf_enabled with input as {
		"subject": {},
		"action": {},
		"resource": {"encrypted": false},
		"context": {},
	}
	result == false
}

# ============================================
# Classification Equivalency Tests
# ============================================

test_v1_classification_equivalency_map_exists if {
	# Verify the classification equivalency map is available
	result := authorization.classification_equivalency
	is_object(result)
	is_object(result["USA"])
}

test_v1_equivalency_applied_rule_exists if {
	# Verify the rule exists and returns a boolean
	result := authorization.equivalency_applied with input as {
		"subject": {
			"clearance": "SECRET",
			"clearanceCountry": "FRA",
			"clearanceOriginal": "SECRET_DEFENSE",
		},
		"action": {},
		"resource": {"classification": "SECRET"},
		"context": {},
	}
	is_boolean(result)
}

# ============================================
# COI Members Registry Tests
# ============================================

test_v1_coi_members_exposed if {
	result := authorization.coi_members
	"USA" in result["FVEY"]
	"FRA" in result["NATO-COSMIC"]
}

# ============================================
# Valid Country Codes Tests
# ============================================

test_v1_valid_country_codes_exposed if {
	result := authorization.valid_country_codes
	"USA" in result
	"FRA" in result
	"GBR" in result
}

# ============================================
# Clearance Levels Tests
# ============================================

test_v1_clearance_levels_exposed if {
	result := authorization.clearance_levels
	is_object(result)
	result["UNCLASSIFIED"] >= 0
	result["SECRET"] >= 1
	result["TOP_SECRET"] >= 2
}

# ============================================
# Classification Equivalency Functions Tests
# ============================================

test_v1_classification_equivalency_map if {
	result := authorization.classification_equivalency
	is_object(result["USA"])
}

test_v1_get_equivalency_level if {
	result := authorization.get_equivalency_level("SECRET", "USA") with input as {
		"subject": {},
		"action": {},
		"resource": {},
		"context": {},
	}
	is_string(result)
}

test_v1_classification_equivalent_same_country if {
	authorization.classification_equivalent("SECRET", "USA", "SECRET", "USA") with input as {
		"subject": {},
		"action": {},
		"resource": {},
		"context": {},
	}
}

# ============================================
# KAS Obligations Tests
# ============================================

test_v1_kas_obligations_empty if {
	result := authorization.kas_obligations with input as {
		"subject": {},
		"action": {},
		"resource": {"encrypted": false},
		"context": {},
	}
	count(result) == 0
}

test_v1_kas_obligations_with_encrypted if {
	result := authorization.kas_obligations with input as {
		"subject": {"authenticated": true},
		"action": {},
		"resource": {"resourceId": "doc-001", "encrypted": true, "ztdf": true},
		"context": {},
	}
	is_set(result)
}

# ============================================
# AMR Parser Tests
# ============================================

test_v1_parse_amr_array if {
	result := authorization.parse_amr(["pwd", "otp"])
	"pwd" in result
	"otp" in result
}

test_v1_parse_amr_set_return if {
	# Parse AMR returns a set from array input
	result := authorization.parse_amr(["pwd", "mfa"])
	"pwd" in result
	"mfa" in result
}

test_v1_parse_amr_empty if {
	result := authorization.parse_amr([])
	count(result) == 0
}

# ============================================
# Industry Access Tests
# ============================================

test_v1_resolved_industry_allowed_true if {
	result := authorization.resolved_industry_allowed with input as {
		"subject": {},
		"action": {},
		"resource": {"releasableToIndustry": true},
		"context": {},
	}
	result == true
}

test_v1_resolved_industry_allowed_false if {
	result := authorization.resolved_industry_allowed with input as {
		"subject": {},
		"action": {},
		"resource": {"releasableToIndustry": false},
		"context": {},
	}
	result == false
}

test_v1_is_industry_access_blocked if {
	result := authorization.is_industry_access_blocked with input as {
		"subject": {"organizationType": "INDUSTRY"},
		"action": {},
		"resource": {"releasableToIndustry": false},
		"context": {},
	}
	result != ""
}

# ============================================
# Check MFA Verified Tests
# ============================================

test_v1_check_mfa_verified_true if {
	result := authorization.check_mfa_verified with input as {
		"subject": {"mfaVerified": true},
		"action": {},
		"resource": {},
		"context": {},
	}
	result == true
}

test_v1_check_mfa_verified_unclassified if {
	# For UNCLASSIFIED, MFA is not required
	result := authorization.check_mfa_verified with input as {
		"subject": {"mfaVerified": false, "clearance": "UNCLASSIFIED"},
		"action": {},
		"resource": {"classification": "UNCLASSIFIED"},
		"context": {},
	}
	result == true
}

# ============================================
# Check Authentication Strength Tests
# ============================================

test_v1_check_authentication_strength_sufficient if {
	result := authorization.check_authentication_strength_sufficient with input as {
		"subject": {"aal": 2},
		"action": {},
		"resource": {"classification": "SECRET"},
		"context": {},
	}
	result == true
}

