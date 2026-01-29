##########################################################################################
# Hub Federation Guardrails Tests
# Package: dive.base.guardrails_hub_federation_test
#
# Purpose: Test hub↔spoke federation tampering detection guardrails
#
# Phase 2, Task 2.4
# Date: 2026-01-28
##########################################################################################

package dive.base.guardrails_hub_federation_test

import rego.v1
import data.dive.base.guardrails

##########################################################################################
# TEST DATA
##########################################################################################

input_fra_user_accessing_hub := {
	"subject": {
		"issuer": "https://keycloak-fra:8443/realms/dive-v3-broker-fra",
		"uniqueID": "user-fra@dive.nato.int",
		"clearance": "SECRET",
		"countryOfAffiliation": "FRA",
	},
	"resource": {
		"resourceId": "hub-doc-123",
		"classification": "SECRET",
		"ownerTenant": "HUB",
	},
	"context": {
		"tenant": "HUB",
		"currentTime": "2026-01-28T12:00:00Z",
	},
}

constraints_hub_tampering := {
	"federation_constraints": {
		"FRA": {
			"HUB": {
				"maxClassification": "TOP_SECRET",
				"relationshipType": "hub_spoke",
				"modifiedBy": "admin-fra@dive.nato.int", # NOT super_admin
			},
		},
	},
}

constraints_hub_legitimate := {
	"federation_constraints": {
		"FRA": {
			"HUB": {
				"maxClassification": "TOP_SECRET",
				"relationshipType": "hub_spoke",
				"modifiedBy": "super_admin@dive.nato.int", # Valid super_admin
			},
		},
	},
}

constraints_invalid_hub_spoke := {
	"federation_constraints": {
		"FRA": {
			"DEU": {
				"maxClassification": "SECRET",
				"relationshipType": "hub_spoke", # WRONG: neither FRA nor DEU is HUB
			},
		},
	},
}

constraints_hub_wrong_type := {
	"federation_constraints": {
		"HUB": {
			"USA": {
				"maxClassification": "TOP_SECRET",
				"relationshipType": "spoke_spoke", # WRONG: should be hub_spoke
			},
		},
	},
}

##########################################################################################
# TEST: HUB↔SPOKE TAMPERING DETECTION
##########################################################################################

test_hub_federation_tampering_detected if {
	# Scenario: FRA admin modified hub↔spoke constraint
	violations := guardrails.guardrail_violations with input as input_fra_user_accessing_hub with data.federation_constraints as constraints_hub_tampering

	count(violations) > 0

	# Verify violation details
	violation := [v | some v in violations; v.code == "HUB_FEDERATION_TAMPERING"][0]
	violation.severity == "critical"
	violation.subject_tenant == "FRA"
	violation.modifier == "admin-fra@dive.nato.int"
}

test_hub_federation_legitimate_modification if {
	# Scenario: super_admin legitimately modified hub↔spoke constraint
	violations := guardrails.guardrail_violations with input as input_fra_user_accessing_hub with data.federation_constraints as constraints_hub_legitimate

	# No tampering violations
	tampering_violations := [v | some v in violations; v.code == "HUB_FEDERATION_TAMPERING"]
	count(tampering_violations) == 0
}

test_hub_federation_no_constraint if {
	# Scenario: No hub↔spoke constraint exists (no violation)
	violations := guardrails.guardrail_violations with input as input_fra_user_accessing_hub with data.federation_constraints as {"federation_constraints": {}}

	tampering_violations := [v | some v in violations; v.code == "HUB_FEDERATION_TAMPERING"]
	count(tampering_violations) == 0
}

##########################################################################################
# TEST: INVALID HUB_SPOKE RELATIONSHIP
##########################################################################################

test_invalid_hub_spoke_relationship if {
	# Scenario: FRA→DEU claims hub_spoke but neither is HUB
	violations := guardrails.guardrail_violations with data.federation_constraints as constraints_invalid_hub_spoke

	count(violations) > 0

	violation := [v | some v in violations; v.code == "INVALID_HUB_SPOKE_RELATIONSHIP"][0]
	violation.severity == "critical"
	violation.owner == "FRA"
	violation.partner == "DEU"
}

test_valid_hub_spoke_relationship if {
	# Scenario: HUB→USA with hub_spoke type (valid)
	violations := guardrails.guardrail_violations with data.federation_constraints as {
		"federation_constraints": {
			"HUB": {
				"USA": {
					"maxClassification": "TOP_SECRET",
					"relationshipType": "hub_spoke",
					"modifiedBy": "super_admin@dive.nato.int",
				},
			},
		},
	}

	# No invalid relationship violations
	invalid_violations := [v | some v in violations; v.code == "INVALID_HUB_SPOKE_RELATIONSHIP"]
	count(invalid_violations) == 0
}

##########################################################################################
# TEST: HUB TENANT WRONG TYPE
##########################################################################################

test_hub_tenant_wrong_type if {
	# Scenario: HUB→USA with spoke_spoke type (should be hub_spoke)
	violations := guardrails.guardrail_violations with data.federation_constraints as constraints_hub_wrong_type

	count(violations) > 0

	violation := [v | some v in violations; v.code == "HUB_TENANT_WRONG_TYPE"][0]
	violation.severity == "critical"
}

##########################################################################################
# TEST: HELPER FUNCTIONS
##########################################################################################

test_extract_tenant_from_issuer_fra if {
	tenant := guardrails._extract_tenant_from_issuer("https://keycloak-fra:8443/realms/dive-v3-broker-fra")
	tenant == "FRA"
}

test_extract_tenant_from_issuer_usa if {
	tenant := guardrails._extract_tenant_from_issuer("https://localhost:8443/realms/dive-v3-broker-usa")
	tenant == "USA"
}

test_extract_tenant_from_issuer_invalid if {
	tenant := guardrails._extract_tenant_from_issuer("https://invalid.url/realms/something")
	tenant == "UNKNOWN"
}

test_is_super_admin_true if {
	guardrails._is_super_admin("super_admin@dive.nato.int")
}

test_is_super_admin_hyphen if {
	guardrails._is_super_admin("super-admin@dive.nato.int")
}

test_is_super_admin_contains if {
	guardrails._is_super_admin("my-super_admin-user@dive.nato.int")
}

test_is_super_admin_false if {
	not guardrails._is_super_admin("admin-fra@dive.nato.int")
}

##########################################################################################
# TEST: GUARDRAILS PASS CHECK
##########################################################################################

test_guardrails_pass_when_no_violations if {
	# Provide complete valid input to avoid triggering other guardrails
	guardrails.guardrails_pass with input as {
		"subject": {
			"clearance": "SECRET",
			"mfa_used": true,  # Avoid MFA_REQUIRED violation
		},
		"resource": {"classification": "CONFIDENTIAL"},  # Lower than subject clearance
		"context": {},
	} with data.federation_constraints as {"federation_constraints": {}}
}

test_guardrails_fail_when_tampering if {
	not guardrails.guardrails_pass with input as input_fra_user_accessing_hub with data.federation_constraints as constraints_hub_tampering
}
