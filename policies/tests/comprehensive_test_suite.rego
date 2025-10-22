package dive.authorization

import rego.v1

# ============================================
# DIVE V3 Comprehensive Test Suite
# ============================================
# Tests: 41+ covering clearance, releasability, COI, embargo
# Test-driven development for Week 2

# ============================================
# Test Helper: Valid Base Input
# ============================================

valid_input := {
	"subject": {
		"authenticated": true,
		"uniqueID": "john.doe@mil",
		"clearance": "SECRET",
		"countryOfAffiliation": "USA",
		"acpCOI": ["NATO-COSMIC", "FVEY"],
	},
	"action": {"operation": "view"},
	"resource": {
		"resourceId": "doc-test-001",
		"classification": "CONFIDENTIAL",
		"releasabilityTo": ["USA", "GBR"],
		"COI": ["FVEY"],
		"creationDate": "2025-01-01T00:00:00Z",
		"encrypted": false,
	},
	"context": {
		"currentTime": "2025-10-15T14:30:00Z",
		"sourceIP": "10.0.1.50",
		"deviceCompliant": true,
		"requestId": "test-req-001",
	},
}

# ============================================
# Clearance × Classification Tests (16 tests)
# ============================================

# T-CC-01: UNCLASSIFIED user accessing UNCLASSIFIED resource - ALLOW
test_clearance_unclass_to_unclass if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "UNCLASSIFIED"}), "resource": object.union(valid_input.resource, {"classification": "UNCLASSIFIED"})})
}

# T-CC-02: UNCLASSIFIED user accessing CONFIDENTIAL resource - DENY
test_clearance_unclass_to_confid if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "UNCLASSIFIED"}), "resource": object.union(valid_input.resource, {"classification": "CONFIDENTIAL"})})
}

# T-CC-03: UNCLASSIFIED user accessing SECRET resource - DENY
test_clearance_unclass_to_secret if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "UNCLASSIFIED"}), "resource": object.union(valid_input.resource, {"classification": "SECRET"})})
}

# T-CC-04: UNCLASSIFIED user accessing TOP_SECRET resource - DENY
test_clearance_unclass_to_topsecret if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "UNCLASSIFIED"}), "resource": object.union(valid_input.resource, {"classification": "TOP_SECRET"})})
}

# T-CC-05: CONFIDENTIAL user accessing UNCLASSIFIED resource - ALLOW
test_clearance_confid_to_unclass if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "CONFIDENTIAL"}), "resource": object.union(valid_input.resource, {"classification": "UNCLASSIFIED"})})
}

# T-CC-06: CONFIDENTIAL user accessing CONFIDENTIAL resource - ALLOW
test_clearance_confid_to_confid if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "CONFIDENTIAL"}), "resource": object.union(valid_input.resource, {"classification": "CONFIDENTIAL"})})
}

# T-CC-07: CONFIDENTIAL user accessing SECRET resource - DENY
test_clearance_confid_to_secret if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "CONFIDENTIAL"}), "resource": object.union(valid_input.resource, {"classification": "SECRET"})})
}

# T-CC-08: CONFIDENTIAL user accessing TOP_SECRET resource - DENY
test_clearance_confid_to_topsecret if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "CONFIDENTIAL"}), "resource": object.union(valid_input.resource, {"classification": "TOP_SECRET"})})
}

# T-CC-09: SECRET user accessing UNCLASSIFIED resource - ALLOW
test_clearance_secret_to_unclass if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "SECRET"}), "resource": object.union(valid_input.resource, {"classification": "UNCLASSIFIED"})})
}

# T-CC-10: SECRET user accessing CONFIDENTIAL resource - ALLOW
test_clearance_secret_to_confid if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "SECRET"}), "resource": object.union(valid_input.resource, {"classification": "CONFIDENTIAL"})})
}

# T-CC-11: SECRET user accessing SECRET resource - ALLOW
test_clearance_secret_to_secret if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "SECRET"}), "resource": object.union(valid_input.resource, {"classification": "SECRET"})})
}

# T-CC-12: SECRET user accessing TOP_SECRET resource - DENY
test_clearance_secret_to_topsecret if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "SECRET"}), "resource": object.union(valid_input.resource, {"classification": "TOP_SECRET"})})
}

# T-CC-13: TOP_SECRET user accessing UNCLASSIFIED resource - ALLOW
test_clearance_topsecret_to_unclass if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "TOP_SECRET"}), "resource": object.union(valid_input.resource, {"classification": "UNCLASSIFIED"})})
}

# T-CC-14: TOP_SECRET user accessing CONFIDENTIAL resource - ALLOW
test_clearance_topsecret_to_confid if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "TOP_SECRET"}), "resource": object.union(valid_input.resource, {"classification": "CONFIDENTIAL"})})
}

# T-CC-15: TOP_SECRET user accessing SECRET resource - ALLOW
test_clearance_topsecret_to_secret if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "TOP_SECRET"}), "resource": object.union(valid_input.resource, {"classification": "SECRET"})})
}

# T-CC-16: TOP_SECRET user accessing TOP_SECRET resource - ALLOW
test_clearance_topsecret_to_topsecret if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "TOP_SECRET"}), "resource": object.union(valid_input.resource, {"classification": "TOP_SECRET"})})
}

# ============================================
# Country × Releasability Tests (10 tests)
# ============================================

# T-CR-01: USA user accessing USA-releasable resource - ALLOW
test_releasability_usa_to_usa if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "USA"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA"]})})
}

# T-CR-02: USA user accessing FRA-only resource - DENY
test_releasability_usa_to_fra if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "USA"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["FRA"]})})
}

# T-CR-03: FRA user accessing FRA-releasable resource - ALLOW
test_releasability_fra_to_fra if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "FRA"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["FRA"], "COI": []})})
}

# T-CR-04: CAN user accessing CAN-releasable resource - ALLOW
test_releasability_can_to_can if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "CAN"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["CAN"], "COI": []})})
}

# T-CR-05: USA user accessing multi-country resource [USA, GBR, FRA] - ALLOW
test_releasability_usa_to_multi if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "USA", "acpCOI": ["NATO"]}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA", "GBR", "FRA"], "COI": ["NATO"]})})
}

# T-CR-06: GBR user accessing multi-country resource [USA, GBR] - ALLOW
test_releasability_gbr_to_multi if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "GBR"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA", "GBR"]})})
}

# T-CR-07: DEU user accessing USA-only resource - DENY
test_releasability_deu_to_usa if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "DEU"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA"]})})
}

# T-CR-08: Any user accessing empty releasabilityTo - DENY
test_releasability_empty_list if {
	not allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"releasabilityTo": []})})
}

# T-CR-09: FVEY countries accessing FVEY resource - ALLOW (USA)
test_releasability_fvey_usa if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "USA"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"]})})
}

# T-CR-10: FVEY countries accessing FVEY resource - ALLOW (GBR)
test_releasability_fvey_gbr if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "GBR"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"]})})
}

# ============================================
# Community of Interest (COI) Tests (9 tests)
# ============================================

# T-COI-01: User with FVEY accessing FVEY resource - ALLOW
test_coi_fvey_match if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["FVEY"]}), "resource": object.union(valid_input.resource, {"COI": ["FVEY"]})})
}

# T-COI-02: User with NATO-COSMIC accessing NATO-COSMIC resource - ALLOW
test_coi_nato_match if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["NATO-COSMIC"], "countryOfAffiliation": "USA"}), "resource": object.union(valid_input.resource, {"COI": ["NATO-COSMIC"], "releasabilityTo": ["USA"]})})
}

# T-COI-03: User with FVEY accessing US-ONLY resource - DENY
test_coi_fvey_to_usonly if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["FVEY"], "countryOfAffiliation": "USA"}), "resource": object.union(valid_input.resource, {"COI": ["US-ONLY"], "releasabilityTo": ["USA"]})})
}

# T-COI-04: User with multiple COI [FVEY, NATO-COSMIC] accessing FVEY - ALLOW
test_coi_multi_user_single_resource if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["FVEY", "NATO-COSMIC"]}), "resource": object.union(valid_input.resource, {"COI": ["FVEY"], "releasabilityTo": ["USA", "GBR"]})})
}

# T-COI-05: User with single COI [FVEY] accessing multi-COI resource [FVEY, NATO-COSMIC] - DENY (needs ALL COIs)
test_coi_single_user_multi_resource if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["FVEY"]}), "resource": object.union(valid_input.resource, {"COI": ["FVEY", "NATO-COSMIC"], "releasabilityTo": ["USA"]})})
}

# T-COI-06: User with no COI accessing resource with COI - DENY
test_coi_no_coi_user if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": []}), "resource": object.union(valid_input.resource, {"COI": ["FVEY"], "releasabilityTo": ["USA", "GBR"]})})
}

# T-COI-07: User with COI accessing resource with no COI - ALLOW (no restriction)
test_coi_no_coi_resource if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["FVEY"]}), "resource": object.union(valid_input.resource, {"COI": [], "releasabilityTo": ["USA", "GBR"]})})
}

# T-COI-08: User with CAN-US accessing resource with CAN-US - ALLOW
test_coi_can_us_match if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"acpCOI": ["CAN-US"], "countryOfAffiliation": "CAN"}), "resource": object.union(valid_input.resource, {"COI": ["CAN-US"], "releasabilityTo": ["CAN", "USA"]})})
}

# T-COI-09: User missing acpCOI attribute accessing resource with COI - DENY
test_coi_missing_attribute if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
		},
		"action": {"operation": "view"},
		"resource": object.union(valid_input.resource, {"COI": ["FVEY"]}),
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# ============================================
# Embargo Date Tests (6 tests)
# ============================================

# T-EMB-01: Accessing resource with past creationDate - ALLOW
test_embargo_past_date if {
	allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"creationDate": "2025-01-01T00:00:00Z"}), "context": object.union(valid_input.context, {"currentTime": "2025-10-15T14:30:00Z"})})
}

# T-EMB-02: Accessing resource with future creationDate - DENY
test_embargo_future_date if {
	not allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"creationDate": "2025-12-01T00:00:00Z"}), "context": object.union(valid_input.context, {"currentTime": "2025-10-15T14:30:00Z"})})
}

# T-EMB-03: Accessing resource with creationDate = currentTime - ALLOW
test_embargo_exact_time if {
	allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"creationDate": "2025-10-15T14:30:00Z"}), "context": object.union(valid_input.context, {"currentTime": "2025-10-15T14:30:00Z"})})
}

# T-EMB-04: Clock skew tolerance - 4 minutes before creation - ALLOW (within ±5min)
test_embargo_clock_skew_allow if {
	allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"creationDate": "2025-10-15T14:34:00Z"}), "context": object.union(valid_input.context, {"currentTime": "2025-10-15T14:30:00Z"})})
}

# T-EMB-05: Clock skew tolerance - 6 minutes before creation - DENY (outside ±5min)
test_embargo_clock_skew_deny if {
	not allow with input as object.union(valid_input, {"resource": object.union(valid_input.resource, {"creationDate": "2025-10-15T14:36:00Z"}), "context": object.union(valid_input.context, {"currentTime": "2025-10-15T14:30:00Z"})})
}

# T-EMB-06: Resource without creationDate - ALLOW (no embargo)
test_embargo_no_creation_date if {
	test_resource := object.remove(valid_input.resource, ["creationDate"])
	allow with input as object.union(valid_input, {"resource": test_resource})
}

# ============================================
# Missing Attributes Tests (5 tests)
# ============================================

# T-ATTR-01: Missing uniqueID - DENY
test_missing_unique_id if {
	test_input := {
		"subject": {
			"authenticated": true,
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"acpCOI": ["NATO-COSMIC", "FVEY"],
		},
		"action": {"operation": "view"},
		"resource": valid_input.resource,
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# T-ATTR-02: Missing clearance - DENY
test_missing_clearance if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"countryOfAffiliation": "USA",
			"acpCOI": ["NATO-COSMIC", "FVEY"],
		},
		"action": {"operation": "view"},
		"resource": valid_input.resource,
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# T-ATTR-03: Missing countryOfAffiliation - DENY
test_missing_country if {
	test_input := {
		"subject": {
			"authenticated": true,
			"uniqueID": "john.doe@mil",
			"clearance": "SECRET",
			"acpCOI": ["NATO-COSMIC", "FVEY"],
		},
		"action": {"operation": "view"},
		"resource": valid_input.resource,
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# T-ATTR-04: Missing resource classification - DENY
test_missing_classification if {
	test_input := {
		"subject": valid_input.subject,
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-test-001",
			"releasabilityTo": ["USA", "GBR"],
			"COI": ["FVEY"],
			"creationDate": "2025-01-01T00:00:00Z",
			"encrypted": false,
		},
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# T-ATTR-05: Missing resource releasabilityTo - DENY
test_missing_releasability if {
	test_input := {
		"subject": valid_input.subject,
		"action": {"operation": "view"},
		"resource": {
			"resourceId": "doc-test-001",
			"classification": "CONFIDENTIAL",
			"COI": ["FVEY"],
			"creationDate": "2025-01-01T00:00:00Z",
			"encrypted": false,
		},
		"context": valid_input.context,
	}
	not allow with input as test_input
}

# ============================================
# Authentication Tests (2 tests)
# ============================================

# T-AUTH-01: Authenticated user - ALLOW
test_authenticated if {
	allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"authenticated": true})})
}

# T-AUTH-02: Unauthenticated user - DENY
test_not_authenticated if {
	not allow with input as object.union(valid_input, {"subject": object.union(valid_input.subject, {"authenticated": false})})
}

# ============================================
# Obligations Tests (2 tests)
# ============================================

# T-OBL-01: Encrypted resource generates KAS obligation - ALLOW with obligation
test_encrypted_resource_obligation if {
	test_input := object.union(valid_input, {"resource": object.union(valid_input.resource, {"encrypted": true})})
	allow with input as test_input
	count(obligations) >= 1 with input as test_input
	# Week 3.1: Enhanced KAS obligations with type "kas" instead of "kas_key_required"
	some obligation in obligations with input as test_input
	obligation.type == "kas"
}

# T-OBL-02: Non-encrypted resource has no obligations
test_non_encrypted_no_obligation if {
	test_input := object.union(valid_input, {"resource": object.union(valid_input.resource, {"encrypted": false})})
	allow with input as test_input
	count(obligations) == 0 with input as test_input
}

# ============================================
# Decision Reason Tests (3 tests)
# ============================================

# T-REASON-01: Successful access includes success reason
test_reason_allow if {
	test_input := valid_input
	allow with input as test_input
	reason == "Access granted - all conditions satisfied" with input as test_input
}

# T-REASON-02: Insufficient clearance includes specific reason
test_reason_insufficient_clearance if {
	test_input := object.union(valid_input, {"subject": object.union(valid_input.subject, {"clearance": "CONFIDENTIAL"}), "resource": object.union(valid_input.resource, {"classification": "SECRET"})})
	not allow with input as test_input
	startswith(reason, "Insufficient clearance") with input as test_input
}

# T-REASON-03: Country mismatch includes specific reason
test_reason_country_mismatch if {
	test_input := object.union(valid_input, {"subject": object.union(valid_input.subject, {"countryOfAffiliation": "DEU"}), "resource": object.union(valid_input.resource, {"releasabilityTo": ["USA"]})})
	not allow with input as test_input
	startswith(reason, "Country") with input as test_input
}

