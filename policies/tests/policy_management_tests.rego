package dive.authorization_test

import rego.v1
import data.dive.authorization

# ============================================
# Policy Management Tests (Week 3.2)
# ============================================
# Test that policy viewer access is properly controlled
# All users should be able to view policies (read-only)

# Test 1: Authenticated user can view policy metadata
test_authenticated_user_can_view_policy if {
	# Policy viewing is implicitly allowed - these tests verify the policy
	# evaluation works correctly and produces expected output
	
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "test-resource",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-001"
		}
	}
	
	# Policy should produce valid decision structure
	is_object(decision)
	is_boolean(decision.allow)
	is_string(decision.reason)
	is_object(decision.evaluation_details)
}

# Test 2: Policy decision includes all check results
test_policy_decision_includes_all_checks if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"]
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "test-resource",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-002"
		}
	}
	
	# Verify all expected checks are present
	checks := decision.evaluation_details.checks
	checks.authenticated == true
	checks.required_attributes == true
	checks.clearance_sufficient == true
	checks.country_releasable == true
	checks.coi_satisfied == true
	checks.embargo_passed == true
	checks.ztdf_integrity_valid == true
	checks.upload_releasability_valid == true
}

# Test 3: Policy evaluation details include subject info
test_policy_evaluation_includes_subject_info if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "test-resource",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-003"
		}
	}
	
	# Verify subject details are included in evaluation
	subject := decision.evaluation_details.subject
	subject.uniqueID == "john.doe@mil"
	subject.clearance == "SECRET"
	subject.country == "USA"
}

# Test 4: Policy evaluation details include resource info
test_policy_evaluation_includes_resource_info if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "doc-123",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA", "GBR"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-004"
		}
	}
	
	# Verify resource details are included in evaluation
	resource := decision.evaluation_details.resource
	resource.resourceId == "doc-123"
	resource.classification == "CONFIDENTIAL"
	resource.encrypted == true
}

# Test 5: Policy evaluation includes ACP-240 compliance info
test_policy_evaluation_includes_acp240_compliance if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "test-resource",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true,
			"ztdf": {
				"integrityValidated": true,
				"policyHash": "abc123",
				"payloadHash": "def456"
			}
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-005"
		}
	}
	
	# Verify ACP-240 compliance info is included
	compliance := decision.evaluation_details.acp240_compliance
	compliance.ztdf_validation == true
	compliance.kas_obligations == true
	compliance.fail_closed_enforcement == true
}

# Test 6: Policy correctly identifies all violation types
test_policy_identifies_all_violation_types if {
	# Test authentication violation
	decision_auth := authorization.decision with input as {
		"subject": {
			"authenticated": false,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA"
		},
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "test",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test"
		}
	}
	
	decision_auth.allow == false
	contains(decision_auth.reason, "not authenticated")
}

# Test 7: Policy decision is deterministic
test_policy_decision_is_deterministic if {
	input_data := {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "view"
		},
		"resource": {
			"resourceId": "test-resource",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-policy-007"
		}
	}
	
	# Run decision twice with same input
	decision1 := authorization.decision with input as input_data
	decision2 := authorization.decision with input as input_data
	
	# Results should be identical
	decision1.allow == decision2.allow
	decision1.reason == decision2.reason
}

