# DIVE V3 - Observability Integration Tests
# Phase 8: Observability & Alerting
#
# Tests to verify policy behavior for metrics and observability scenarios.
# Ensures authorization decisions are consistent for metrics collection.

package dive.tests.observability

import rego.v1
import data.dive.authz

# ============================================
# METRICS COLLECTION SCENARIOS
# ============================================

# Test: Authorized user accessing metrics endpoint
test_metrics_access_authorized if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "metrics-admin",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "metrics-endpoint",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA", "FRA", "GBR", "DEU"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z",
            "requestId": "test-metrics-001"
        }
    }
    result == true
}

# Test: Latency-sensitive decisions (no delays)
test_latency_sensitive_decision if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "latency-user",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "GBR",
            "acpCOI": ["NATO"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "latency-test-resource",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["GBR", "USA"],
            "COI": ["NATO"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == true
}

# ============================================
# CACHE SCENARIOS
# ============================================

# Test: Identical inputs should produce identical decisions (cache-friendly)
test_cache_determinism_allow if {
    test_input := {
        "subject": {
            "authenticated": true,
            "uniqueID": "cache-test-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "cache-test-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result1 := authz.allow with input as test_input
    result2 := authz.allow with input as test_input
    result1 == result2
}

test_cache_determinism_deny if {
    test_input := {
        "subject": {
            "authenticated": true,
            "uniqueID": "cache-test-user-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "DEU",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "cache-test-resource-2",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result1 := authz.allow with input as test_input
    result2 := authz.allow with input as test_input
    result1 == result2
    result1 == false
}

# ============================================
# FEDERATION SCENARIOS
# ============================================

# Test: Cross-tenant federation - USA to FRA
test_federation_usa_to_fra if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "usa-user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["NATO"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "fra-resource",
            "classification": "SECRET",
            "releasabilityTo": ["FRA", "USA"],
            "COI": ["NATO"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z",
            "federated": true,
            "sourceTenant": "USA",
            "targetTenant": "FRA"
        }
    }
    result == true
}

# Test: Cross-tenant federation - GBR to DEU
test_federation_gbr_to_deu if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "gbr-user@mod.uk",
            "clearance": "SECRET",
            "countryOfAffiliation": "GBR",
            "acpCOI": ["NATO"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "deu-resource",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["DEU", "GBR", "USA"],
            "COI": ["NATO"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z",
            "federated": true,
            "sourceTenant": "GBR",
            "targetTenant": "DEU"
        }
    }
    result == true
}

# Test: Federation denied - Country not in releasability
test_federation_denied_releasability if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "fra-user@defense.gouv.fr",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "us-only-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# ============================================
# COMPLIANCE SCENARIOS
# ============================================

# Test: ACP-240 compliant decision with all attributes
test_acp240_compliant_decision if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "compliance-user",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO-COSMIC"],
            "mfaVerified": true,
            "aal": 3
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "compliance-test-resource",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA", "GBR"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z",
            "requestId": "acp240-test-001"
        }
    }
    result == true
}

# Test: Embargo check for audit compliance
test_embargo_audit_compliance if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "embargo-test-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "embargoed-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"],
            "creationDate": "2026-01-01T00:00:00Z"
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# ============================================
# DENIAL REASON CATEGORIZATION TESTS
# ============================================

# Test: Denial reason - Insufficient clearance
test_denial_reason_clearance if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "low-clearance-user",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "ts-resource",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# Test: Denial reason - Not releasable
test_denial_reason_releasability if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "wrong-country-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "CAN",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "usa-only-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# Test: Denial reason - COI violation
test_denial_reason_coi if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "no-coi-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "coi-required-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# Test: Denial reason - Not authenticated
test_denial_reason_auth if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": false,
            "uniqueID": "anon-user"
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "any-resource",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == false
}

# ============================================
# KAS OBLIGATION SCENARIOS
# ============================================

# Test: Encrypted resource triggers KAS obligation
test_kas_obligation_encrypted if {
    decision := authz.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "kas-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "encrypted-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"],
            "encrypted": true
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    decision.allow == true
    count(decision.obligations) > 0
}

# Test: Unencrypted resource - no KAS obligation
test_no_kas_obligation_unencrypted if {
    decision := authz.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "no-kas-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "unencrypted-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    decision.allow == true
}

# ============================================
# EDGE CASES FOR METRICS ACCURACY
# ============================================

# Test: Empty COI array in resource
test_empty_resource_coi if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "any-coi-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "no-coi-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == true
}

# Test: Multiple COI memberships
test_multiple_coi_memberships if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "multi-coi-user",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO", "US-ONLY"],
            "mfaVerified": true,
            "aal": 3
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "fvey-resource",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == true
}

# Test: Classification boundary - exactly at clearance
test_classification_boundary if {
    result := authz.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "boundary-user",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "secret-resource",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-12-03T10:00:00Z"
        }
    }
    result == true
}
