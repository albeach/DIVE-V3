package dive.federation_test

import rego.v1
import data.dive.federation

# ============================================
# Federation ABAC Policy - Comprehensive Tests
# Phase 3: Distributed Query Federation
# NATO Compliance: ACP-240 §5.4
# ============================================

# ============================================
# Test Data: Trusted Issuers (OPAL Mock Data)
# ============================================
# This data would normally be provided by OPAL from MongoDB
trusted_issuers := {
	"https://keycloak:8080/realms/dive-v3-broker": {
		"tenant": "USA",
		"enabled": true,
		"description": "DIVE V3 Hub Keycloak"
	},
	"https://keycloak-fra:8080/realms/dive-v3-broker-fra": {
		"tenant": "FRA",
		"enabled": true,
		"description": "France spoke Keycloak"
	},
	"https://keycloak-gbr:8080/realms/dive-v3-broker-gbr": {
		"tenant": "GBR",
		"enabled": true,
		"description": "UK spoke Keycloak"
	}
}

# ============================================
# Test Data: Federation Matrix (OPAL Mock Data)
# ============================================
# This data would normally be provided by OPAL from MongoDB
federation_matrix := {
	"USA": ["FRA", "GBR", "CAN", "DEU"],
	"FRA": ["USA", "GBR", "DEU"],
	"GBR": ["USA", "FRA", "CAN", "AUS", "NZL"],
	"CAN": ["USA", "GBR"],
	"DEU": ["USA", "FRA"]
}

# ============================================
# 1. Federated Search Authorization Tests
# ============================================

test_allow_federated_search_authenticated_user if {
    federation.allow_federated_search 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

test_deny_federated_search_unauthenticated if {
    not federation.allow_federated_search 
    with input as {
        "subject": {"mfaVerified": true,
            "aal": 2,
            "authenticated": false},
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

# ============================================
# 2. Federated Resource Access Tests
# ============================================

test_allow_federated_resource_usa_user_usa_origin if {
    federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

test_allow_federated_resource_cross_instance if {
    # USA user accessing FRA resource (USA-FRA have agreement)
    federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "FRA-DOC-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["FRA", "DEU", "USA"],
            "COI": ["NATO"],
            "originRealm": "FRA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

# ============================================
# 3. Origin Realm Trust Tests
# ============================================

test_trusted_origin_usa if {
    federation.is_origin_realm_trusted 
    with input as {
        "resource": {"originRealm": "USA"}
    }
}

test_trusted_origin_fra if {
    federation.is_origin_realm_trusted 
    with input as {
        "resource": {"originRealm": "FRA"}
    }
}

test_trusted_origin_gbr if {
    federation.is_origin_realm_trusted 
    with input as {
        "resource": {"originRealm": "GBR"}
    }
}

test_trusted_origin_deu if {
    federation.is_origin_realm_trusted 
    with input as {
        "resource": {"originRealm": "DEU"}
    }
}

test_local_resource_always_trusted if {
    # Resource without originRealm is considered local/trusted
    federation.is_origin_realm_trusted 
    with input as {
        "resource": {
            "resourceId": "LOCAL-DOC-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA", "FRA"],
            "COI": ["NATO"]
        }
    }
}

# ============================================
# 4. Federation Matrix Tests
# ============================================

test_federation_agreement_usa_fra if {
    federation.has_federation_agreement 
    with input as {
        "subject": {"countryOfAffiliation": "USA"},
        "resource": {"originRealm": "FRA"}
    }
    with data.dive.federation.federation_matrix as federation_matrix
}

test_federation_agreement_usa_gbr if {
    federation.has_federation_agreement 
    with input as {
        "subject": {"countryOfAffiliation": "USA"},
        "resource": {"originRealm": "GBR"}
    }
    with data.dive.federation.federation_matrix as federation_matrix
}

test_federation_agreement_usa_deu if {
    federation.has_federation_agreement 
    with input as {
        "subject": {"countryOfAffiliation": "USA"},
        "resource": {"originRealm": "DEU"}
    }
    with data.dive.federation.federation_matrix as federation_matrix
}

test_federation_agreement_fra_gbr if {
    federation.has_federation_agreement 
    with input as {
        "subject": {"countryOfAffiliation": "FRA"},
        "resource": {"originRealm": "GBR"}
    }
    with data.dive.federation.federation_matrix as federation_matrix
}

test_local_resource_no_agreement_needed if {
    # Local resources (no originRealm) don't need federation agreement
    federation.has_federation_agreement 
    with input as {
        "subject": {"countryOfAffiliation": "USA"},
        "resource": {
            "resourceId": "LOCAL-DOC-001",
            "classification": "CONFIDENTIAL"
        }
    }
    with data.dive.federation.federation_matrix as federation_matrix
}

# ============================================
# 5. Combined ABAC + Federation Tests
# ============================================

test_deny_federated_resource_insufficient_clearance if {
    # User with CONFIDENTIAL trying to access SECRET resource
    not federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-gbr-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "GBR",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

test_deny_federated_resource_not_releasable if {
    # FRA user trying to access USA-only resource
    not federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-fra-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "acpCOI": ["NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-999",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": [],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

test_deny_federated_resource_missing_coi if {
    # User without FVEY COI trying to access FVEY-only resource
    not federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-deu-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "DEU",
            "acpCOI": ["NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-888",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA", "DEU"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

# ============================================
# 6. Decision Structure Tests
# ============================================

test_decision_includes_federated_fields if {
    decision := federation.decision 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
    
    # Decision should include federated fields
    decision.federatedSearchAllowed == true
    decision.federatedResourceAllowed == true
}

test_decision_allow_true_when_all_pass if {
    decision := federation.decision 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
    
    decision.allow == true
}

test_decision_allow_false_when_not_authenticated if {
    decision := federation.decision 
    with input as {
        "subject": {"mfaVerified": true,
            "aal": 2,
            "authenticated": false},
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
    
    decision.allow == false
}

# ============================================
# 7. Include in Federated Results Tests
# ============================================

test_include_in_results_when_authorized if {
    federation.include_in_federated_results 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "USA-DOC-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

# ============================================
# 8. Edge Cases
# ============================================

test_handle_empty_releasability if {
    # Empty releasability should deny all
    not federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["NATO"],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "EMPTY-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": [],
            "COI": [],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}

test_handle_no_coi_requirement if {
    # Resources without COI should be accessible
    federation.allow_federated_resource 
    with input as {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "testuser-no-coi",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "NO-COI-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": [],
            "originRealm": "USA"
        },
        "context": {
            "currentTime": "2025-12-01T12:00:00Z",
            "acr": "aal2",
            "amr": ["pwd", "otp"],
            "federatedSearch": true
        }
    }
    with data.dive.federation.trusted_issuers as trusted_issuers
    with data.dive.federation.federation_matrix as federation_matrix
}
