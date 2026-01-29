##########################################################################################
# Authorization Entrypoint Federation Constraints Tests
# Package: dive.authz_federation_constraints_test
#
# Purpose: Test end-to-end federation constraints integration in authz entrypoint
#
# Phase 2, Task 2.4
# Date: 2026-01-28
##########################################################################################

package dive.authz_federation_constraints_test

import rego.v1
import data.dive.authz

##########################################################################################
# TEST DATA
##########################################################################################

input_deu_user_fra_resource := {
	"subject": {
		"authenticated": true,
		"uniqueID": "user-deu@dive.nato.int",
		"clearance": "SECRET",
		"countryOfAffiliation": "DEU",
		"acpCOI": ["NATO"],
		"issuer": "https://keycloak-deu:8443/realms/dive-v3-broker-deu",
		"aal_level": 2,
		"mfa_used": true,
	},
	"action": {"operation": "GET"},
	"resource": {
		"resourceId": "fra-doc-123",
		"classification": "SECRET",
		"ownerTenant": "FRA",
		"releasabilityTo": ["FRA", "DEU"],
		"COI": ["NATO"],
	},
	"context": {
		"currentTime": "2026-01-28T12:00:00Z",
		"tenant": "FRA",
		"acr": "urn:mace:incommon:iap:silver",
	},
}

input_fra_user_accessing_hub := {
	"subject": {
		"issuer": "https://keycloak-fra:8443/realms/dive-v3-broker-fra",
		"uniqueID": "user-fra@dive.nato.int",
		"clearance": "SECRET",
		"countryOfAffiliation": "FRA",
		"authenticated": true,
		"acpCOI": ["NATO"],
		"aal_level": 2,
		"mfa_used": true,
	},
	"resource": {
		"resourceId": "hub-doc-123",
		"classification": "SECRET",
		"ownerTenant": "HUB",
		"releasabilityTo": ["HUB", "FRA"],
		"COI": ["NATO"],
	},
	"context": {
		"tenant": "HUB",
		"currentTime": "2026-01-28T12:00:00Z",
	},
	"action": {"operation": "GET"},
}

constraints_fra_secret_deu_confidential := {
	"federation_constraints": {
		"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		"DEU": {"FRA": {"maxClassification": "CONFIDENTIAL", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
	},
}

constraints_nato_standard := {
	"federation_constraints": {
		"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
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

constraints_invalid_hub_spoke := {
	"federation_constraints": {
		"FRA": {
			"DEU": {
				"maxClassification": "SECRET",
				"relationshipType": "hub_spoke", # WRONG: neither is HUB
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

trusted_issuers_data := {
	"trusted_issuers": {
		"https://keycloak-deu:8443/realms/dive-v3-broker-deu": {
			"tenant": "DEU",
			"country": "DEU",
			"enabled": true,
		},
		"https://keycloak-fra:8443/realms/dive-v3-broker-fra": {
			"tenant": "FRA",
			"country": "FRA",
			"enabled": true,
		},
	},
}

federation_matrix_data := {
	"federation_matrix": {
		"FRA": ["DEU", "USA", "GBR"],
		"DEU": ["FRA", "USA", "GBR"],
	},
}

##########################################################################################
# TEST: ALLOW WHEN CONSTRAINTS PASS
##########################################################################################

test_allow_when_classification_within_cap if {
	# DEU user → FRA resource (CONFIDENTIAL, within CONFIDENTIAL cap)
	input_confidential := object.union(input_deu_user_fra_resource, {
		"resource": object.union(input_deu_user_fra_resource.resource, {"classification": "CONFIDENTIAL"}),
	})

	decision := authz.decision with input as input_confidential with data.federation_constraints as constraints_fra_secret_deu_confidential with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == true
	contains(decision.reason, "granted")
}

test_allow_when_both_allow_secret if {
	# DEU user → FRA resource (SECRET, both sides allow SECRET)
	decision := authz.decision with input as input_deu_user_fra_resource with data.federation_constraints as constraints_nato_standard with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == true
}

##########################################################################################
# TEST: DENY WHEN CLASSIFICATION CAP EXCEEDED
##########################################################################################

test_deny_when_classification_cap_exceeded if {
	# DEU user → FRA resource (SECRET, but effective cap is CONFIDENTIAL)
	decision := authz.decision with input as input_deu_user_fra_resource with data.federation_constraints as constraints_fra_secret_deu_confidential with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "CONFIDENTIAL")
	contains(decision.reason, "SECRET")
}

##########################################################################################
# TEST: DENY WHEN COI NOT ALLOWED
##########################################################################################

test_deny_when_coi_denied if {
	# DEU denies FVEY COI
	input_fvey := object.union(input_deu_user_fra_resource, {
		"resource": object.union(input_deu_user_fra_resource.resource, {
			"classification": "CONFIDENTIAL",
			"COI": ["FVEY"],
		}),
	})

	constraints_coi_deny := {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO", "FVEY"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
			"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": [], "deniedCOIs": ["FVEY"], "relationshipType": "spoke_spoke"}},
		},
	}

	decision := authz.decision with input as input_fvey with data.federation_constraints as constraints_coi_deny with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "FVEY")
	contains(decision.reason, "not allowed")
}

test_deny_when_coi_not_in_allowlist_intersection if {
	# FRA allows [NATO, FVEY], DEU allows [NATO]
	# Resource COI [FVEY] → DENY
	input_fvey := object.union(input_deu_user_fra_resource, {
		"resource": object.union(input_deu_user_fra_resource.resource, {
			"classification": "CONFIDENTIAL",
			"COI": ["FVEY"],
		}),
	})

	constraints_allowlist := {
		"federation_constraints": {
			"FRA": {"DEU": {"maxClassification": "SECRET", "allowedCOIs": ["NATO", "FVEY"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
			"DEU": {"FRA": {"maxClassification": "SECRET", "allowedCOIs": ["NATO"], "deniedCOIs": [], "relationshipType": "spoke_spoke"}},
		},
	}

	decision := authz.decision with input as input_fvey with data.federation_constraints as constraints_allowlist with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "not allowed")
}

##########################################################################################
# TEST: HUB TAMPERING CRITICAL VIOLATION
##########################################################################################

test_deny_hub_tampering_critical if {
	# Scenario: FRA user accessing hub with tampered constraint
	decision := authz.decision with input as input_fra_user_accessing_hub with data.federation_constraints as constraints_hub_tampering with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "CRITICAL SECURITY VIOLATION")
}

##########################################################################################
# TEST: INVALID HUB_SPOKE RELATIONSHIP
##########################################################################################

test_deny_invalid_hub_spoke_relationship if {
	# Scenario: FRA→DEU claims hub_spoke (invalid)
	decision := authz.decision with input as input_deu_user_fra_resource with data.federation_constraints as constraints_invalid_hub_spoke with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "CRITICAL SECURITY VIOLATION")
}

##########################################################################################
# TEST: HUB TENANT WRONG TYPE
##########################################################################################

test_deny_hub_tenant_wrong_type if {
	# Scenario: HUB→USA with spoke_spoke type (should be hub_spoke)
	input_hub := {
		"subject": {
			"authenticated": true,
			"uniqueID": "user-usa@dive.nato.int",
			"clearance": "SECRET",
			"countryOfAffiliation": "USA",
			"issuer": "https://localhost:8443/realms/dive-v3-broker-usa",
			"aal_level": 2,
			"mfa_used": true,
		},
		"action": {"operation": "GET"},
		"resource": {
			"resourceId": "hub-doc-456",
			"classification": "SECRET",
			"ownerTenant": "HUB",
			"releasabilityTo": ["HUB", "USA"],
			"COI": ["NATO"],
		},
		"context": {
			"tenant": "HUB",
			"currentTime": "2026-01-28T12:00:00Z",
		},
	}

	decision := authz.decision with input as input_hub with data.federation_constraints as constraints_hub_wrong_type with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == false
	contains(decision.reason, "CRITICAL SECURITY VIOLATION")
}

##########################################################################################
# TEST: EVALUATION DETAILS
##########################################################################################

test_evaluation_details_include_guardrails if {
	decision := authz.decision with input as input_deu_user_fra_resource with data.federation_constraints as constraints_nato_standard with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	# Evaluation details should include new checks
	decision.evaluation_details.checks.guardrails_pass != null
	decision.evaluation_details.checks.federation_constraints_classification != null
	decision.evaluation_details.checks.federation_constraints_coi != null
}

##########################################################################################
# TEST: NO CONSTRAINTS (DEFAULT PERMISSIVE)
##########################################################################################

test_allow_when_no_constraints if {
	# No constraints exist → Allow (default permissive)
	input_no_constraints := object.union(input_deu_user_fra_resource, {
		"resource": object.union(input_deu_user_fra_resource.resource, {"classification": "CONFIDENTIAL"}),
	})

	decision := authz.decision with input as input_no_constraints with data.federation_constraints as {"federation_constraints": {}} with data.trusted_issuers as trusted_issuers_data with data.federation_matrix as federation_matrix_data

	decision.allow == true
}
