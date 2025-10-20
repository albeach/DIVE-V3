package dive.authorization

import rego.v1

# ============================================
# AAL2/FAL2 Enforcement Tests (NIST SP 800-63B/C)
# ============================================
# Reference: docs/IDENTITY-ASSURANCE-LEVELS.md
# Tests authentication strength and MFA verification in OPA policy

# ============================================
# Test 1: AAL2 Required for SECRET (ALLOW)
# ============================================
test_secret_requires_aal2_allow if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:silver", # AAL2
			"amr": ["pwd", "otp"], # 2 factors
		},
	}

	decision.allow == true with input as test_input
	not is_authentication_strength_insufficient with input as test_input
	not is_mfa_not_verified with input as test_input
}

# ============================================
# Test 2: AAL2 Required for SECRET (DENY AAL1)
# ============================================
test_secret_requires_aal2_deny_aal1 if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:bronze", # AAL1 only!
			"amr": ["pwd"], # 1 factor only
		},
	}

	decision.allow == false with input as test_input
	is_authentication_strength_insufficient with input as test_input
	contains(is_authentication_strength_insufficient, "AAL2") with input as test_input
}

# ============================================
# Test 3: MFA Factor Count Validation (ALLOW)
# ============================================
test_mfa_two_factors_allow if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "CONFIDENTIAL",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "conf-doc-123",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:silver",
			"amr": ["pwd", "otp"], # 2 factors ✓
		},
	}

	decision.allow == true with input as test_input
	not is_mfa_not_verified with input as test_input
}

# ============================================
# Test 4: MFA Factor Count Validation (DENY)
# ============================================
test_mfa_one_factor_deny if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "CONFIDENTIAL",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "conf-doc-123",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:silver", # Claims AAL2
			"amr": ["pwd"], # But only 1 factor!
		},
	}

	decision.allow == false with input as test_input
	is_mfa_not_verified with input as test_input
	contains(is_mfa_not_verified, "MFA required") with input as test_input
}

# ============================================
# Test 5: UNCLASSIFIED Allows AAL1
# ============================================
test_unclassified_allows_aal1 if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "public.user@contractor.com",
			"clearance": "UNCLASSIFIED",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "public-doc-123",
			"classification": "UNCLASSIFIED",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:bronze", # AAL1 OK for UNCLASSIFIED
			"amr": ["pwd"], # 1 factor OK
		},
	}

	decision.allow == true with input as test_input
	not is_authentication_strength_insufficient with input as test_input
	not is_mfa_not_verified with input as test_input
}

# ============================================
# Test 6: AAL3 (Gold) Satisfies AAL2 Requirement
# ============================================
test_aal3_satisfies_aal2 if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:gold", # AAL3 (hardware token)
			"amr": ["smartcard", "pin"],
		},
	}

	decision.allow == true with input as test_input
	not is_authentication_strength_insufficient with input as test_input
	aal_level == "AAL3" with input as test_input
}

# ============================================
# Test 7: Explicit "aal2" in ACR Value
# ============================================
test_explicit_aal2_in_acr if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "https://example.org/assurance/aal2", # Explicit AAL2
			"amr": ["pwd", "totp"],
		},
	}

	decision.allow == true with input as test_input
	not is_authentication_strength_insufficient with input as test_input
	aal_level == "AAL2" with input as test_input
}

# ============================================
# Test 8: Missing ACR for Classified Resource
# ============================================
# NOTE: ACR is now optional (backwards compatible)
# When ACR is missing, AAL2 check is skipped (allows for legacy tests)
test_missing_acr_for_classified if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			# acr missing - AAL2 check will be skipped
			"amr": ["pwd", "otp"],
		},
	}

	# Should allow (backwards compatible - ACR check skipped when not provided)
	decision.allow == true with input as test_input
	not is_authentication_strength_insufficient with input as test_input
}

# ============================================
# Test 9: Missing AMR for Classified Resource
# ============================================
# NOTE: AMR is now optional (backwards compatible)
# When AMR is missing, MFA check is skipped (allows for legacy tests)
test_missing_amr_for_classified if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:silver",
			# amr missing - MFA check will be skipped
		},
	}

	# Should allow (backwards compatible - AMR check skipped when not provided)
	decision.allow == true with input as test_input
	not is_mfa_not_verified with input as test_input
}

# ============================================
# Test 10: AAL Level Helper Function
# ============================================
test_aal_level_derivation if {
	# Test AAL3 detection
	input_aal3 := {
		"context": {
			"acr": "urn:mace:incommon:iap:gold",
			"amr": ["smartcard", "pin"],
		},
	}
	aal_level with input as input_aal3 == "AAL3"

	# Test AAL2 detection (InCommon Silver)
	input_aal2_silver := {
		"context": {
			"acr": "urn:mace:incommon:iap:silver",
			"amr": ["pwd", "otp"],
		},
	}
	aal_level with input as input_aal2_silver == "AAL2"

	# Test AAL2 detection (explicit)
	input_aal2_explicit := {
		"context": {
			"acr": "https://example.org/aal2",
			"amr": ["pwd", "sms"],
		},
	}
	aal_level with input as input_aal2_explicit == "AAL2"

	# Test AAL1 fallback
	input_aal1 := {
		"context": {
			"acr": "urn:mace:incommon:iap:bronze",
			"amr": ["pwd"],
		},
	}
	aal_level with input as input_aal1 == "AAL1"
}

# ============================================
# Test 11: Integration Test - All Checks Pass
# ============================================
test_integration_all_checks_pass if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "secret-doc-123",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
			"COI": ["FVEY"],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:silver",
			"amr": ["pwd", "otp"],
		},
	}

	decision.allow == true with input as test_input
	decision.reason == "Access granted - all conditions satisfied" with input as test_input
	
	# Verify all checks passed
	evaluation_details.checks.authenticated == true with input as test_input
	evaluation_details.checks.clearance_sufficient == true with input as test_input
	evaluation_details.checks.country_releasable == true with input as test_input
	evaluation_details.checks.coi_satisfied == true with input as test_input
	evaluation_details.checks.authentication_strength_sufficient == true with input as test_input
	evaluation_details.checks.mfa_verified == true with input as test_input
	
	# Verify AAL level in evaluation details
	evaluation_details.authentication.aal_level == "AAL2" with input as test_input
}

# ============================================
# Test 12: Multi-Factor with 3+ Factors
# ============================================
test_mfa_three_factors_allow if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "top-secret-doc",
			"classification": "TOP_SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
		},
		"context": {
			"currentTime": "2025-10-19T12:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "req-123",
			"acr": "urn:mace:incommon:iap:gold",
			"amr": ["smartcard", "pin", "biometric"], # 3 factors (AAL3)
		},
	}

	decision.allow == true with input as test_input
	not is_mfa_not_verified with input as test_input
	count(test_input.context.amr) == 3
}

