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
# Test 1: ZTDF Integrity - Missing Validation Flag
# ============================================
test_ztdf_integrity_missing_validation if {
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
			"resourceId": "doc-ztdf-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"policyHash": "abc123",
				"payloadHash": "def456",
				# Missing integrityValidated flag
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-001",
		},
	}

	not result.allow
	result.reason == "ZTDF integrity not validated (STANAG 4778 binding required)"
}

# ============================================
# Test 2: ZTDF Integrity - Validation Failed
# ============================================
test_ztdf_integrity_validation_failed if {
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
				"integrityValidated": false,  # Validation failed
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

	not result.allow
	result.reason == "ZTDF integrity validation failed (cryptographic binding compromised)"
}

# ============================================
# Test 3: ZTDF Integrity - Missing Policy Hash
# ============================================
test_ztdf_integrity_missing_policy_hash if {
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
			"resourceId": "doc-ztdf-003",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				# Missing policyHash (STANAG 4778 requirement)
				"payloadHash": "def456",
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-003",
		},
	}

	not result.allow
	result.reason == "ZTDF policy hash missing (STANAG 4778 binding required)"
}

# ============================================
# Test 4: ZTDF Integrity - Missing Payload Hash
# ============================================
test_ztdf_integrity_missing_payload_hash if {
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
			"resourceId": "doc-ztdf-004",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				# Missing payloadHash
			},
		},
		"context": {
			"currentTime": "2025-10-12T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-004",
		},
	}

	not result.allow
	result.reason == "ZTDF payload hash missing (integrity protection required)"
}

# ============================================
# Test 5: ZTDF Integrity - Valid (All Checks Pass)
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
# Test 7: KAS Obligation - Unencrypted Resource Has No KAS
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
# Test 8: KAS Obligation - Contains Policy Context
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
# Test 9: ACP-240 Compliance Metadata in Evaluation Details
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
# Test 10: Fail-Closed - ZTDF Integrity Blocks High Clearance
# ============================================
test_fail_closed_ztdf_blocks_high_clearance if {
	# Even TOP_SECRET user denied if ZTDF integrity fails
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
			"classification": "CONFIDENTIAL",  # Lower classification
			"releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
			"COI": ["FVEY"],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": false,  # Integrity violation!
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

	not result.allow
	result.reason == "ZTDF integrity validation failed (cryptographic binding compromised)"
	
	# Verify clearance was sufficient but integrity blocked
	result.evaluation_details.checks.clearance_sufficient == true
	result.evaluation_details.checks.country_releasable == true
	result.evaluation_details.checks.coi_satisfied == true
	result.evaluation_details.checks.ztdf_integrity_valid == false
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
# Test 12: KAS Obligation Denied User Gets No Obligation
# ============================================
test_kas_obligation_denied_user_no_obligation if {
	# User denied by clearance should not receive KAS obligation
	result := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "CONFIDENTIAL",  # Insufficient
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

	not result.allow
	
	# No obligations if access denied
	count(result.obligations) == 0
}

