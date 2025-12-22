# Tests for Unified Authorization Entrypoint
# Package: dive.authz_test

package dive.authz_test

import rego.v1

import data.dive.authz

# ============================================
# Basic Allow/Deny Tests
# ============================================

test_allow_authenticated_usa_user if {
	authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
		},
		"context": {
			"currentTime": "2025-12-03T10:00:00Z",
		},
	}
}

test_deny_unauthenticated_user if {
	not authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": false,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
}

test_deny_insufficient_clearance if {
	not authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "CONFIDENTIAL",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
}

test_deny_country_not_in_releasability if {
	not authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@fra.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "FRA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR"],
		},
		"context": {},
	}
}

# ============================================
# Decision Structure Tests
# ============================================

test_decision_structure_allow if {
	decision := authz.decision with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	decision.allow == true
	decision.reason == "Access granted - all conditions satisfied"
	is_array(decision.obligations)
}

test_decision_structure_deny if {
	decision := authz.decision with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": false,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	decision.allow == false
	contains(decision.reason, "not authenticated")
}

# ============================================
# Evaluation Details Tests
# ============================================

test_evaluation_details_structure if {
	details := authz.evaluation_details with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
	# Check checks section
	details.checks.authenticated == true
	details.checks.required_attributes == true
	details.checks.clearance_sufficient == true
	# Check subject section
	details.subject.uniqueID == "testuser@usa.mil"
	details.subject.clearance == "SECRET"
	# Check resource section
	details.resource.resourceId == "doc-001"
}

# ============================================
# Federation Tests via Entrypoint
# ============================================

test_allow_local_auth_no_issuer if {
	authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
}

test_allow_trusted_issuer if {
	authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"issuer": "https://usa-idp.dive25.com/realms/dive-v3-broker",
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {
			"tenant": "USA",
		},
	}
}

test_allow_federated_fra_user_on_usa_resource if {
	authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@france.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "FRA",
			"authenticated": true,
			"issuer": "https://fra-idp.dive25.com/realms/dive-v3-broker",
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "FRA"],
		},
		"context": {
			"tenant": "USA",
		},
	}
}

test_deny_untrusted_issuer if {
	not authz.allow with input as {
		"subject": {
			"uniqueID": "hacker@evil.com",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
			"issuer": "https://evil.example.com/realms/fake",
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
		},
		"context": {},
	}
}

# ============================================
# KAS Obligations Tests
# ============================================

test_kas_obligation_for_encrypted_resource if {
	obligations := authz.obligations with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"encrypted": true,
		},
		"context": {},
	}
	count(obligations) > 0
	obligations[0].type == "kas"
}

test_no_obligation_for_unencrypted_resource if {
	obligations := authz.obligations with input as {
		"subject": {
			"uniqueID": "testuser@usa.mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA"],
			"encrypted": false,
		},
		"context": {},
	}
	count(obligations) == 0
}

# ============================================
# Cross-Nation Classification Equivalency Tests
# ============================================

test_cross_nation_equivalency_fra_to_usa if {
	authz.allow with input as {
		"subject": {
			"uniqueID": "testuser@france.mil",
			"clearance": "SECRET",
			"clearanceOriginal": "SECRET DÉFENSE",
			"clearanceCountry": "FRA",
			"countryOfAffiliation": "FRA",
			"authenticated": true,
		},
		"resource": {
			"resourceId": "doc-001",
			"classification": "SECRET",
			"originalClassification": "SECRET",
			"originalCountry": "USA",
			"releasabilityTo": ["USA", "FRA"],
		},
		"context": {},
	}
}

# ============================================
# Backward Compatibility Tests
# ============================================

test_backward_compat_is_not_authenticated if {
	msg := authz.is_not_authenticated with input.subject.authenticated as false
	contains(msg, "not authenticated")
}

test_backward_compat_is_insufficient_clearance if {
	msg := authz.is_insufficient_clearance with input as {
		"subject": {
			"clearance": "CONFIDENTIAL",
			"authenticated": true,
		},
		"resource": {
			"classification": "SECRET",
		},
	}
	contains(msg, "Insufficient clearance")
}

