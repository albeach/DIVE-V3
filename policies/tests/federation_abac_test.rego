package dive.federation_test

import rego.v1
import data.dive.federation

# =============================================================================
# Federation ABAC Policy Tests (ADatP-5663)
# =============================================================================
# Tests for AAL, token lifetime, issuer trust, and MFA verification
# =============================================================================

# =============================================================================
# 1. BASIC AUTHENTICATION TESTS
# =============================================================================

test_allow_authenticated_user if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_unauthenticated_user if {
    not federation.allow with input as {
        "subject": {
            "authenticated": false,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

# =============================================================================
# 2. AAL LEVEL TESTS
# =============================================================================

test_allow_aal1_for_unclassified if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "0",  # AAL1
            "amr": ["pwd"]
        }
    }
}

test_deny_aal1_for_confidential if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "0",  # AAL1 - insufficient
            "amr": ["pwd"]
        }
    }
}

test_allow_aal2_for_secret if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_aal2_for_top_secret if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",  # AAL2 - insufficient for TOP_SECRET
            "amr": ["pwd", "otp"]
        }
    }
}

# String format ACR tests
test_allow_aal2_string_format if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "aal2",  # String format
            "amr": ["pwd", "otp"]
        }
    }
}

# =============================================================================
# 3. TOKEN LIFETIME TESTS
# =============================================================================

test_allow_fresh_token if {
    # auth_time = 1764072000 is Nov 25, 2025 12:00:00 UTC
    # currentTime = 2025-11-25T12:05:00Z is 5 mins later (within 15 min threshold)
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa",
            "auth_time": 1764072000  # Nov 25, 2025 12:00:00 UTC
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:05:00Z",  # 5 mins after auth
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_expired_token if {
    # auth_time = 1764064800 is Nov 25, 2025 10:00:00 UTC (2 hours before currentTime)
    # currentTime = 2025-11-25T12:00:00Z (1764072000)
    # Difference = 7200 seconds (2 hours) > 900 seconds (15 min threshold)
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa",
            "auth_time": 1764064800  # Nov 25, 2025 10:00:00 UTC
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",  # Nov 25, 2025 12:00:00 UTC
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

# =============================================================================
# 4. ISSUER TRUST TESTS
# =============================================================================

test_allow_trusted_issuer_usa if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

test_allow_trusted_issuer_broker if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "issuer": "https://keycloak:8080/realms/dive-v3-broker"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["FRA", "USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_untrusted_issuer if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-unknown",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://malicious-idp.com/realms/fake"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

# =============================================================================
# 5. MFA VERIFICATION TESTS
# =============================================================================

test_allow_mfa_with_otp if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
}

test_allow_mfa_with_hwtoken if {
    federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "hwtoken"]
        }
    }
}

test_deny_aal2_without_mfa_factor if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",  # Claims AAL2
            "amr": ["pwd", "email"]  # No MFA factor (email is not MFA)
        }
    }
}

test_deny_aal2_with_single_factor if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",  # Claims AAL2
            "amr": ["pwd"]  # Only 1 factor
        }
    }
}

# =============================================================================
# 6. SHARED ABAC RULES TESTS
# =============================================================================

test_deny_insufficient_clearance if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_country_not_releasable if {
    not federation.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "issuer": "https://keycloak:8080/realms/dive-v3-deu"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA"]  # DEU not included
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
}

# =============================================================================
# 7. DECISION STRUCTURE TESTS
# =============================================================================

test_decision_structure_allow if {
    d := federation.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "issuer": "https://keycloak:8080/realms/dive-v3-usa"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
    d.allow == true
}

test_decision_structure_deny if {
    d := federation.decision with input as {
        "subject": {
            "authenticated": false,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
    d.allow == false
}

