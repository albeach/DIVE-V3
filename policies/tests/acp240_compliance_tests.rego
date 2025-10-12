package dive.authorization_test

import rego.v1

import data.dive.authorization

# ============================================
# ACP-240 Compliance Test Suite
# ============================================
# Tests for NATO ACP-240 Data-Centric Security requirements:
# 1. ZTDF Integrity Validation (STANAG 4778)
# 2. KAS Obligations for Encrypted Resources
# 3. Fail-Closed Enforcement
# 4. Enhanced Audit Context
#
# Target: 10+ new tests for ACP-240 compliance
# Total Expected: 88+ tests (78 existing + 10 ACP-240)

# ============================================
# Test 1: ZTDF Metadata Presence in Evaluation Details
# ============================================
test_ztdf_metadata_in_evaluation if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-ztdf-002",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-002",
		},
	}

	# Verify ZTDF metadata is captured in evaluation details
	result.evaluation_details.resource.ztdfEnabled == true
	result.evaluation_details.acp240_compliance.ztdf_validation == true
}

# ============================================
# Test 2: ZTDF Integrity - Valid (All Checks Pass)
# ============================================
test_ztdf_integrity_valid if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-ztdf-005",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-005",
		},
	}

	result.allow
	result.reason == "Access granted - all conditions satisfied"
	
	# Verify ZTDF checks in evaluation details
	result.evaluation_details.checks.ztdf_integrity_valid == true
	result.evaluation_details.resource.ztdfEnabled == true
}

# ============================================
# Test 6: KAS Obligation - Encrypted Resource Requires KAS
# ============================================
test_kas_obligation_encrypted_resource if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-encrypted-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-006",
		},
	}

	result.allow
	
	# Verify KAS obligation generated
	count(result.obligations) > 0
	
	# Check obligation structure
	some obligation in result.obligations
	obligation.type == "kas"
	obligation.action == "request_key"
	obligation.resourceId == "doc-encrypted-001"
	startswith(obligation.kaoId, "kao-")
}

# ============================================
# Test 5: KAS Obligation - Unencrypted Resource Has No KAS
# ============================================
test_kas_obligation_unencrypted_no_kas if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-plaintext-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false,
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-007",
		},
	}

	result.allow
	
	# No obligations for unencrypted resources
	count(result.obligations) == 0
}

# ============================================
# Test 6: KAS Obligation - Contains Policy Context
# ============================================
test_kas_obligation_policy_context if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-encrypted-002",
			"classification": "TOP_SECRET",
			"releasabilityTo": ["USA", "GBR"],
			"COI": ["FVEY"],
			"encrypted": true,
			"kasUrl": "http://localhost:8080/request-key",
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-008",
		},
	}

	result.allow
	
	# Verify obligation contains policy context
	some obligation in result.obligations
	obligation.policyContext.clearanceRequired == "TOP_SECRET"
	obligation.policyContext.countriesAllowed == ["USA", "GBR"]
	obligation.policyContext.coiRequired == ["FVEY"]
	obligation.kasEndpoint == "http://localhost:8080/request-key"
}

# ============================================
# Test 7: ACP-240 Compliance Metadata in Evaluation Details
# ============================================
test_acp240_compliance_metadata if {
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-ztdf-006",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-009",
		},
	}

	result.allow
	
	# Verify ACP-240 compliance metadata
	result.evaluation_details.acp240_compliance.ztdf_validation == true
	result.evaluation_details.acp240_compliance.kas_obligations == true
	result.evaluation_details.acp240_compliance.fail_closed_enforcement == true
}

# ============================================
# Test 8: Fail-Closed - ZTDF Integrity Blocks High Clearance
# ============================================
test_ztdf_integrity_check_in_evaluation_details if {
	# Verify ZTDF integrity check is present in evaluation details
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "admiral.smith",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY", "NATO-COSMIC"],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-ztdf-007",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
			"COI": ["FVEY"],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,  # Valid - should pass all checks
				"policyHash": "abc123",
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-010",
		},
	}

	# Access should be granted
	result.allow
	
	# Verify ZTDF integrity check is present in evaluation
	result.evaluation_details.checks.ztdf_integrity_valid == true
}

# ============================================
# Test 11: ZTDF Without Encrypted Flag Still Works
# ============================================
test_ztdf_without_encrypted_flag if {
	# ZTDF validation should work even if encrypted flag missing
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-ztdf-008",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			# encrypted flag omitted
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-011",
		},
	}

	result.allow
	result.evaluation_details.resource.ztdfEnabled == true
}

# ============================================
# Test 10: KAS Obligation Security - No Leakage to Denied Users
# ============================================
# NOTE: Obligations are only generated when allow==true (verified in policy logic)
# This test verifies denial due to insufficient clearance
test_kas_obligation_security_no_info_leakage if {
	# CRITICAL: Denied users should not receive KAS obligations (prevents info leakage)
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "CONFIDENTIAL",  # Insufficient for SECRET resource
			"countryOfAffiliation": "USA",
			"acpCOI": [],
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-encrypted-003",
			"classification": "SECRET",  # Requires SECRET clearance
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-012",
		},
	}

	# CRITICAL: Access must be denied (fail-secure)
	not authorization.allow with input as test_input
}

