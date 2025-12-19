# ============================================
# Industry Access Control Test Suite
# ============================================
# Tests for organizationType and releasableToIndustry attributes
# Reference: ACP-240 Section 4.2 - Organization Type Access Control
#
# Test Matrix:
# | User OrgType | Resource releasableToIndustry | Expected |
# |--------------|-------------------------------|----------|
# | GOV          | false                         | ALLOW    |
# | GOV          | true                          | ALLOW    |
# | GOV          | not set (default false)       | ALLOW    |
# | MIL          | false                         | ALLOW    |
# | MIL          | true                          | ALLOW    |
# | MIL          | not set (default false)       | ALLOW    |
# | INDUSTRY     | false                         | DENY     |
# | INDUSTRY     | true                          | ALLOW    |
# | INDUSTRY     | not set (default false)       | DENY     |
# | not set (default GOV) | false               | ALLOW    |
# | not set (default GOV) | true                | ALLOW    |
# | not set (default GOV) | not set             | ALLOW    |

package dive.authorization_test

import rego.v1
import data.dive.authorization

# ============================================
# Base Test Input Helper
# ============================================

base_input := {
	"subject": {
		"authenticated": true,
		"uniqueID": "testuser@example.com",
		"clearance": "SECRET",
		"countryOfAffiliation": "USA",
	},
	"resource": {
		"resourceId": "doc-001",
		"classification": "SECRET",
		"releasabilityTo": ["USA", "DEU", "FRA"],
	},
	"action": {
		"operation": "read",
	},
	"context": {
		"currentTime": "2025-11-26T12:00:00Z",
	},
}

# ============================================
# Test 1: GOV user accessing gov-only resource (no releasableToIndustry set)
# Expected: ALLOW (default orgType=GOV, default releasableToIndustry=false)
# ============================================

test_gov_user_gov_only_resource_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "GOV",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 2: GOV user accessing industry-allowed resource
# Expected: ALLOW
# ============================================

test_gov_user_industry_allowed_resource_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "GOV",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 3: GOV user accessing resource with no releasableToIndustry set
# Expected: ALLOW (default releasableToIndustry=false, but GOV user allowed)
# ============================================

test_gov_user_no_industry_flag_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "GOV",
		}),
		# No releasableToIndustry set - defaults to false
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 4: MIL user accessing gov-only resource
# Expected: ALLOW (MIL treated same as GOV)
# ============================================

test_mil_user_gov_only_resource_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "MIL",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 5: MIL user accessing industry-allowed resource
# Expected: ALLOW
# ============================================

test_mil_user_industry_allowed_resource_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "MIL",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 6: INDUSTRY user accessing gov-only resource
# Expected: DENY
# ============================================

test_industry_user_gov_only_resource_deny if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	not authorization.allow with input as test_input
}

# ============================================
# Test 7: INDUSTRY user accessing industry-allowed resource
# Expected: ALLOW
# Note: USA industry_max_classification is SECRET, so SECRET resources are allowed
# ============================================

test_industry_user_industry_allowed_resource_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
			"countryOfAffiliation": "USA", # Explicit USA country (industry max = SECRET)
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 8: INDUSTRY user accessing resource with no releasableToIndustry set
# Expected: DENY (default releasableToIndustry=false)
# ============================================

test_industry_user_no_industry_flag_deny if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
		}),
		# No releasableToIndustry set - defaults to false
	})
	not authorization.allow with input as test_input
}

# ============================================
# Test 9: User with no organizationType (default GOV) accessing gov-only resource
# Expected: ALLOW (defaults to GOV)
# ============================================

test_default_org_type_gov_only_allow if {
	test_input := object.union(base_input, {
		# No organizationType set - defaults to GOV
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 10: User with no organizationType (default GOV) accessing industry-allowed resource
# Expected: ALLOW
# ============================================

test_default_org_type_industry_allowed_allow if {
	test_input := object.union(base_input, {
		# No organizationType set - defaults to GOV
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 11: Both attributes missing (full default behavior)
# Expected: ALLOW (default GOV user, default gov-only resource)
# ============================================

test_both_defaults_allow if {
	test_input := base_input # No organizationType, no releasableToIndustry
	authorization.allow with input as test_input
}

# ============================================
# Test 12: INDUSTRY user with proper clearance but gov-only resource
# Verifies that clearance alone doesn't override industry restriction
# Expected: DENY
# ============================================

test_industry_top_secret_gov_only_deny if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
			"clearance": "TOP_SECRET", # Even with TOP_SECRET clearance
		}),
		"resource": object.union(base_input.resource, {
			"classification": "SECRET", # Lower classification
			"releasableToIndustry": false, # But gov-only
		}),
	})
	not authorization.allow with input as test_input
}

# ============================================
# Test 13: Verify denial reason message for industry block
# ============================================

test_industry_denial_reason if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	reason := authorization.reason with input as test_input
	contains(reason, "Industry access denied")
}

# ============================================
# Test 14: Verify resolved_org_type helper for GOV
# ============================================

test_resolved_org_type_gov if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "GOV",
		}),
	})
	authorization.resolved_org_type == "GOV" with input as test_input
}

# ============================================
# Test 15: Verify resolved_org_type helper for INDUSTRY
# ============================================

test_resolved_org_type_industry if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
		}),
	})
	authorization.resolved_org_type == "INDUSTRY" with input as test_input
}

# ============================================
# Test 16: Verify resolved_org_type defaults to GOV when missing
# ============================================

test_resolved_org_type_default_gov if {
	test_input := base_input # No organizationType
	authorization.resolved_org_type == "GOV" with input as test_input
}

# ============================================
# Test 17: Verify resolved_industry_allowed helper for true
# ============================================

test_resolved_industry_allowed_true if {
	test_input := object.union(base_input, {
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	authorization.resolved_industry_allowed == true with input as test_input
}

# ============================================
# Test 18: Verify resolved_industry_allowed helper for false
# ============================================

test_resolved_industry_allowed_false if {
	test_input := object.union(base_input, {
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": false,
		}),
	})
	authorization.resolved_industry_allowed == false with input as test_input
}

# ============================================
# Test 19: Verify resolved_industry_allowed defaults to false when missing
# ============================================

test_resolved_industry_allowed_default_false if {
	test_input := base_input # No releasableToIndustry
	authorization.resolved_industry_allowed == false with input as test_input
}

# ============================================
# Test 20: Verify evaluation_details includes industry fields
# ============================================

test_evaluation_details_industry_fields if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
		}),
		"resource": object.union(base_input.resource, {
			"releasableToIndustry": true,
		}),
	})
	details := authorization.evaluation_details with input as test_input
	details.subject.organizationType == "INDUSTRY"
	details.resource.releasableToIndustry == true
	details.checks.industry_access_allowed == true
}

# ============================================
# Test 21: INDUSTRY user from DEU accessing USA/DEU releasable CONFIDENTIAL resource
# Cross-country industry scenario
# Expected: ALLOW (DEU in releasabilityTo, industry allowed, resource <= DEU industry cap)
# Note: DEU industry_max_classification is CONFIDENTIAL, so resource must be <= CONFIDENTIAL
# ============================================

test_industry_user_deu_cross_country_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
			"countryOfAffiliation": "DEU",
			"clearance": "CONFIDENTIAL",
		}),
		"resource": object.union(base_input.resource, {
			"classification": "CONFIDENTIAL", # Must be <= DEU industry cap (CONFIDENTIAL)
			"releasabilityTo": ["USA", "DEU"],
			"releasableToIndustry": true,
		}),
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 22: INDUSTRY user from DEU accessing USA-only resource
# Cross-country restriction
# Expected: DENY (DEU not in releasabilityTo)
# ============================================

test_industry_user_deu_usa_only_deny if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INDUSTRY",
			"countryOfAffiliation": "DEU",
		}),
		"resource": object.union(base_input.resource, {
			"releasabilityTo": ["USA"],
			"releasableToIndustry": true, # Even though industry allowed
		}),
	})
	not authorization.allow with input as test_input
}

# ============================================
# Test 23: Invalid organizationType defaults to GOV
# ============================================

test_invalid_org_type_defaults_gov if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "INVALID_TYPE",
		}),
	})
	authorization.resolved_org_type == "GOV" with input as test_input
}

# ============================================
# Test 24: Empty string organizationType defaults to GOV
# ============================================

test_empty_org_type_defaults_gov if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "",
		}),
	})
	authorization.resolved_org_type == "GOV" with input as test_input
}

# ============================================
# Test 25: All checks pass for GOV user
# Comprehensive test ensuring industry check doesn't break other checks
# ============================================

test_comprehensive_gov_all_checks_pass if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.smith@mil.gov",
			"clearance": "TOP_SECRET",
			"countryOfAffiliation": "USA",
			"organizationType": "GOV",
			"acpCOI": ["NATO-COSMIC"],
		},
		"resource": {
			"resourceId": "nato-doc-001",
			"classification": "SECRET",
			"releasabilityTo": ["USA", "GBR", "DEU"],
			"COI": ["NATO-COSMIC"],
			"releasableToIndustry": false,
		},
		"action": {"operation": "read"},
		"context": {"currentTime": "2025-11-26T12:00:00Z"},
	}
	authorization.allow with input as test_input
	details := authorization.evaluation_details with input as test_input
	details.checks.industry_access_allowed == true
}

# ============================================
# Test 26: INDUSTRY user blocked even with all other checks passing
# Ensures industry check is enforced independently
# ============================================

test_comprehensive_industry_blocked_despite_other_checks if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "contractor@abc-llc.de",
			"clearance": "SECRET",
			"countryOfAffiliation": "DEU",
			"organizationType": "INDUSTRY",
			"acpCOI": ["NATO"],
		},
		"resource": {
			"resourceId": "nato-doc-002",
			"classification": "CONFIDENTIAL", # Lower than user clearance
			"releasabilityTo": ["USA", "DEU", "FRA"], # DEU included
			"COI": ["NATO"], # User has matching COI
			"releasableToIndustry": false, # But gov-only
		},
		"action": {"operation": "read"},
		"context": {"currentTime": "2025-11-26T12:00:00Z"},
	}
	not authorization.allow with input as test_input
	reason := authorization.reason with input as test_input
	contains(reason, "Industry access denied")
}

# ============================================
# Test 27: MIL user with no releasableToIndustry set
# ============================================

test_mil_no_industry_flag_allow if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "MIL",
		}),
		# No releasableToIndustry - defaults to false, but MIL allowed
	})
	authorization.allow with input as test_input
}

# ============================================
# Test 28: Decision output includes industry check result
# ============================================

test_decision_includes_industry_check if {
	test_input := object.union(base_input, {
		"subject": object.union(base_input.subject, {
			"organizationType": "GOV",
		}),
	})
	decision := authorization.decision with input as test_input
	decision.allow == true
}
