package dive.authorization_test

import rego.v1
import data.dive.authorization

# ============================================
# Upload Authorization Tests (Week 3.2)
# ============================================
# Test upload operation authorization:
# - User can only upload at or below their clearance
# - Upload releasability must include uploader's country

# Test 1: Upload allowed at user clearance level
test_upload_allowed_at_user_clearance if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-001"
		}
	}
	
	decision.allow == true
	decision.reason == "Access granted - all conditions satisfied"
}

# Test 2: Upload allowed below user clearance
test_upload_allowed_below_user_clearance if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-002"
		}
	}
	
	decision.allow == true
	decision.evaluation_details.checks.clearance_sufficient == true
}

# Test 3: Upload denied above user clearance
test_upload_denied_above_user_clearance if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "CONFIDENTIAL",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-003"
		}
	}
	
	decision.allow == false
	contains(decision.reason, "Insufficient clearance")
	decision.evaluation_details.checks.clearance_sufficient == false
}

# Test 4: Upload requires authentication
test_upload_requires_authentication if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": false,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-004"
		}
	}
	
	decision.allow == false
	decision.reason == "Subject is not authenticated"
}

# Test 5: Upload releasability must include uploader country
test_upload_releasability_includes_uploader_country if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["GBR", "CAN"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-005"
		}
	}
	
	decision.allow == false
	decision.reason == "Upload releasabilityTo must include uploader country: USA"
	decision.evaluation_details.checks.upload_releasability_valid == false
}

# Test 6: UNCLASSIFIED user can upload UNCLASSIFIED
test_unclassified_user_can_upload_unclassified if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "UNCLASSIFIED",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "UNCLASSIFIED",
			"releasabilityTo": ["USA", "GBR", "FRA"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-006"
		}
	}
	
	decision.allow == true
}

# Test 7: UNCLASSIFIED user cannot upload CONFIDENTIAL
test_unclassified_user_cannot_upload_confidential if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "UNCLASSIFIED",
			"countryOfAffiliation": "USA",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "CONFIDENTIAL",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-007"
		}
	}
	
	decision.allow == false
	contains(decision.reason, "Insufficient clearance")
	decision.evaluation_details.checks.clearance_sufficient == false
}

# Test 8: TOP_SECRET user can upload any level
test_topsecret_user_can_upload_any_level if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"]
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "TOP_SECRET",
			"releasabilityTo": ["USA"],
			"COI": ["FVEY"],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-008"
		}
	}
	
	decision.allow == true
}

# Test 9: Upload with COI validation
test_upload_with_coi_validation if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["FVEY"]
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
			"COI": ["FVEY"],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-009"
		}
	}
	
	decision.allow == true
}

# Test 10: Upload checks don't affect view operations
test_upload_checks_dont_affect_view_operations if {
	# View operation should not be affected by upload rules
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
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"COI": [],
			"encrypted": false
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-010"
		}
	}
	
	decision.allow == true
	# Upload releasability check should pass for non-upload operations
	decision.evaluation_details.checks.upload_releasability_valid == true
}

# Test 11: Multiple country releasability with uploader included
test_upload_multi_country_releasability_with_uploader if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "test.user",
			"clearance": "SECRET",
			"countryOfAffiliation": "CAN",
			"acpCOI": []
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "CAN", "GBR"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-011"
		}
	}
	
	decision.allow == true
}

# Test 12: French user uploading with France in releasability
test_french_user_upload_with_france_releasability if {
	decision := authorization.decision with input as {
		"subject": {
			"authenticated": true,
			"uniqueID": "jean.dupont",
			"clearance": "SECRET",
			"countryOfAffiliation": "FRA",
			"acpCOI": ["NATO-COSMIC"]
		},
		"action": {
			"operation": "upload"
		},
		"resource": {
			"resourceId": "pending-upload",
			"classification": "SECRET",
			"releasabilityTo": ["FRA", "DEU"],
			"COI": [],
			"encrypted": true
		},
		"context": {
			"currentTime": "2025-10-13T10:00:00Z",
			"sourceIP": "10.0.0.1",
			"deviceCompliant": true,
			"requestId": "test-012"
		}
	}
	
	decision.allow == true
}

