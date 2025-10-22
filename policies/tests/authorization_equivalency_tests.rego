package dive.authorization

import rego.v1

# ============================================
# Authorization Tests: Cross-Nation Classification Equivalency
# ============================================
# ACP-240 Section 4.3: Classification Equivalency
# Tests authorization decisions using national classifications
# Target: 15+ tests covering allow/deny scenarios
#
# Test Matrix:
# - German user (GEHEIM) accessing US document (SECRET) → ALLOW
# - French user (SECRET DÉFENSE) accessing German document (GEHEIM) → ALLOW
# - Polish user (TAJNE) accessing US document (SECRET) → ALLOW
# - UK user (CONFIDENTIAL) accessing German document (GEHEIM) → DENY
# - Italian user (SEGRETO) accessing Spanish document (SECRETO) → ALLOW
# - Cross-nation denials with original classification messages

# ============================================
# Test 1: German user (GEHEIM) → US SECRET document (ALLOW)
# ============================================
test_german_user_us_secret_allow if {
    decision := get_decision_with_equivalency(
        "testuser-deu@mil",
        "GEHEIM",
        "DEU",
        "SECRET",
        "USA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "GEHEIM",
            "clearanceCountry": "DEU",
            "countryOfAffiliation": "DEU",
            "acpCOI": ["NATO"]
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-us-001",
            "classification": "SECRET",
            "originalClassification": "SECRET",
            "originalCountry": "USA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["USA", "DEU"],
            "COI": [],  # No COI required for this test
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-001"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 2: French user (SECRET DÉFENSE) → German GEHEIM document (ALLOW)
# ============================================
test_french_user_german_geheim_allow if {
    decision := get_decision_with_equivalency(
        "testuser-fra@mil",
        "SECRET DÉFENSE",
        "FRA",
        "GEHEIM",
        "DEU"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "SECRET DÉFENSE",
            "clearanceCountry": "FRA",
            "countryOfAffiliation": "FRA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-deu-001",
            "classification": "SECRET",
            "originalClassification": "GEHEIM",
            "originalCountry": "DEU",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["DEU", "FRA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-002"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 3: Polish user (TAJNE) → US SECRET document (ALLOW)
# ============================================
test_polish_user_us_secret_allow if {
    decision := get_decision_with_equivalency(
        "testuser-pol@mil",
        "TAJNE",
        "POL",
        "SECRET",
        "USA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-pol@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "TAJNE",
            "clearanceCountry": "POL",
            "countryOfAffiliation": "POL",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-us-002",
            "classification": "SECRET",
            "originalClassification": "SECRET",
            "originalCountry": "USA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["USA", "POL"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-003"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 4: UK user (CONFIDENTIAL) → German GEHEIM document (DENY)
# ============================================
test_uk_confidential_german_geheim_deny if {
    decision := get_decision_with_equivalency(
        "testuser-gbr@mil",
        "CONFIDENTIAL",
        "GBR",
        "GEHEIM",
        "DEU"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-gbr@mil",
            "clearance": "CONFIDENTIAL",
            "clearanceOriginal": "CONFIDENTIAL",
            "clearanceCountry": "GBR",
            "countryOfAffiliation": "GBR",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-deu-002",
            "classification": "SECRET",
            "originalClassification": "GEHEIM",
            "originalCountry": "DEU",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["DEU", "GBR"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-004"
        }
    }
    
    decision.allow == false
    contains(decision.reason, "Insufficient clearance")
    contains(decision.reason, "GBR")  # Country code in message
    contains(decision.reason, "CONFIDENTIAL")  # Original clearance
    contains(decision.reason, "DEU")  # Resource country
    contains(decision.reason, "GEHEIM")  # Original classification
}

# ============================================
# Test 5: Italian user (SEGRETO) → Spanish SECRETO document (ALLOW)
# ============================================
test_italian_segreto_spanish_secreto_allow if {
    decision := get_decision_with_equivalency(
        "testuser-ita@mil",
        "SEGRETO",
        "ITA",
        "SECRETO",
        "ESP"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-ita@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "SEGRETO",
            "clearanceCountry": "ITA",
            "countryOfAffiliation": "ITA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-esp-001",
            "classification": "SECRET",
            "originalClassification": "SECRETO",
            "originalCountry": "ESP",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["ESP", "ITA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-005"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 6: Australian user (TOP SECRET) → US TOP SECRET (ALLOW)
# ============================================
test_australian_top_secret_us_allow if {
    decision := get_decision_with_equivalency(
        "testuser-aus@mil",
        "TOP SECRET",
        "AUS",
        "TOP SECRET",
        "USA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-aus@mil",
            "clearance": "TOP_SECRET",
            "clearanceOriginal": "TOP SECRET",
            "clearanceCountry": "AUS",
            "countryOfAffiliation": "AUS",
            "acpCOI": ["FVEY"]
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-us-003",
            "classification": "TOP_SECRET",
            "originalClassification": "TOP SECRET",
            "originalCountry": "USA",
            "natoEquivalent": "COSMIC_TOP_SECRET",
            "releasabilityTo": ["USA", "AUS", "GBR", "CAN", "NZL"],
            "COI": ["FVEY"],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-006"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 7: German user (STRENG GEHEIM) → French TRÈS SECRET DÉFENSE (ALLOW)
# ============================================
test_german_streng_geheim_french_tres_secret_allow if {
    decision := get_decision_with_equivalency(
        "testuser-deu@mil",
        "STRENG GEHEIM",
        "DEU",
        "TRÈS SECRET DÉFENSE",
        "FRA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu@mil",
            "clearance": "TOP_SECRET",
            "clearanceOriginal": "STRENG GEHEIM",
            "clearanceCountry": "DEU",
            "countryOfAffiliation": "DEU",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-fra-001",
            "classification": "TOP_SECRET",
            "originalClassification": "TRÈS SECRET DÉFENSE",
            "originalCountry": "FRA",
            "natoEquivalent": "COSMIC_TOP_SECRET",
            "releasabilityTo": ["FRA", "DEU"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-007"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 8: Canadian user (SECRET) → Polish TAJNE (ALLOW)
# ============================================
test_canadian_secret_polish_tajne_allow if {
    decision := get_decision_with_equivalency(
        "testuser-can@mil",
        "SECRET",
        "CAN",
        "TAJNE",
        "POL"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-can@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "SECRET",
            "clearanceCountry": "CAN",
            "countryOfAffiliation": "CAN",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-pol-001",
            "classification": "SECRET",
            "originalClassification": "TAJNE",
            "originalCountry": "POL",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["POL", "CAN"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-008"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 9: Dutch user (GEHEIM) → US SECRET (ALLOW)
# ============================================
test_dutch_geheim_us_secret_allow if {
    decision := get_decision_with_equivalency(
        "testuser-nld@mil",
        "GEHEIM",
        "NLD",
        "SECRET",
        "USA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-nld@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "GEHEIM",
            "clearanceCountry": "NLD",
            "countryOfAffiliation": "NLD",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-us-004",
            "classification": "SECRET",
            "originalClassification": "SECRET",
            "originalCountry": "USA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["USA", "NLD"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-009"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 10: New Zealand user (CONFIDENTIAL) → Italian SEGRETO (DENY)
# ============================================
test_nzl_confidential_italian_segreto_deny if {
    decision := get_decision_with_equivalency(
        "testuser-nzl@mil",
        "CONFIDENTIAL",
        "NZL",
        "SEGRETO",
        "ITA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-nzl@mil",
            "clearance": "CONFIDENTIAL",
            "clearanceOriginal": "CONFIDENTIAL",
            "clearanceCountry": "NZL",
            "countryOfAffiliation": "NZL",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-ita-001",
            "classification": "SECRET",
            "originalClassification": "SEGRETO",
            "originalCountry": "ITA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["ITA", "NZL"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-010"
        }
    }
    
    decision.allow == false
    contains(decision.reason, "Insufficient clearance")
    contains(decision.reason, "NZL")
    contains(decision.reason, "CONFIDENTIAL")
}

# ============================================
# Test 11: US user (UNCLASSIFIED) → German OFFEN (ALLOW)
# ============================================
test_us_unclassified_german_offen_allow if {
    decision := get_decision_with_equivalency(
        "testuser-usa@mil",
        "UNCLASSIFIED",
        "USA",
        "OFFEN",
        "DEU"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa@mil",
            "clearance": "UNCLASSIFIED",
            "clearanceOriginal": "UNCLASSIFIED",
            "clearanceCountry": "USA",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-deu-003",
            "classification": "UNCLASSIFIED",
            "originalClassification": "OFFEN",
            "originalCountry": "DEU",
            "natoEquivalent": "UNCLASSIFIED",
            "releasabilityTo": ["DEU", "USA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-011"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 12: French user (CONFIDENTIEL DÉFENSE) → UK CONFIDENTIAL (ALLOW)
# ============================================
test_french_confidentiel_uk_confidential_allow if {
    decision := get_decision_with_equivalency(
        "testuser-fra@mil",
        "CONFIDENTIEL DÉFENSE",
        "FRA",
        "CONFIDENTIAL",
        "GBR"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra@mil",
            "clearance": "CONFIDENTIAL",
            "clearanceOriginal": "CONFIDENTIEL DÉFENSE",
            "clearanceCountry": "FRA",
            "countryOfAffiliation": "FRA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-gbr-001",
            "classification": "CONFIDENTIAL",
            "originalClassification": "CONFIDENTIAL",
            "originalCountry": "GBR",
            "natoEquivalent": "CONFIDENTIAL",
            "releasabilityTo": ["GBR", "FRA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-012"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 13: Spanish user (CONFIDENCIAL) → German GEHEIM (DENY)
# ============================================
test_spanish_confidencial_german_geheim_deny if {
    decision := get_decision_with_equivalency(
        "testuser-esp@mil",
        "CONFIDENCIAL",
        "ESP",
        "GEHEIM",
        "DEU"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-esp@mil",
            "clearance": "CONFIDENTIAL",
            "clearanceOriginal": "CONFIDENCIAL",
            "clearanceCountry": "ESP",
            "countryOfAffiliation": "ESP",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-deu-004",
            "classification": "SECRET",
            "originalClassification": "GEHEIM",
            "originalCountry": "DEU",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["DEU", "ESP"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-013"
        }
    }
    
    decision.allow == false
    contains(decision.reason, "Insufficient clearance")
    contains(decision.reason, "ESP")
    contains(decision.reason, "CONFIDENCIAL")
}

# ============================================
# Test 14: UK user (TOP SECRET) → Canadian TOP SECRET (ALLOW)
# ============================================
test_uk_top_secret_canadian_top_secret_allow if {
    decision := get_decision_with_equivalency(
        "testuser-gbr@mil",
        "TOP SECRET",
        "GBR",
        "TOP SECRET",
        "CAN"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-gbr@mil",
            "clearance": "TOP_SECRET",
            "clearanceOriginal": "TOP SECRET",
            "clearanceCountry": "GBR",
            "countryOfAffiliation": "GBR",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-can-001",
            "classification": "TOP_SECRET",
            "originalClassification": "TOP SECRET",
            "originalCountry": "CAN",
            "natoEquivalent": "COSMIC_TOP_SECRET",
            "releasabilityTo": ["CAN", "GBR"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-014"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 15: Polish user (ŚCIŚLE TAJNE) → Italian SEGRETISSIMO (ALLOW)
# ============================================
test_polish_scisle_tajne_italian_segretissimo_allow if {
    decision := get_decision_with_equivalency(
        "testuser-pol@mil",
        "ŚCIŚLE TAJNE",
        "POL",
        "SEGRETISSIMO",
        "ITA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-pol@mil",
            "clearance": "TOP_SECRET",
            "clearanceOriginal": "ŚCIŚLE TAJNE",
            "clearanceCountry": "POL",
            "countryOfAffiliation": "POL",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-ita-002",
            "classification": "TOP_SECRET",
            "originalClassification": "SEGRETISSIMO",
            "originalCountry": "ITA",
            "natoEquivalent": "COSMIC_TOP_SECRET",
            "releasabilityTo": ["ITA", "POL"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-015"
        }
    }
    
    decision.allow == true
    contains(decision.reason, "Access granted")
}

# ============================================
# Test 16: US user (SECRET) → French SECRET DÉFENSE (releasability DENY)
# ============================================
test_us_secret_french_secret_releasability_deny if {
    decision := get_decision_with_equivalency(
        "testuser-usa@mil",
        "SECRET",
        "USA",
        "SECRET DÉFENSE",
        "FRA"
    ) with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa@mil",
            "clearance": "SECRET",
            "clearanceOriginal": "SECRET",
            "clearanceCountry": "USA",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-fra-002",
            "classification": "SECRET",
            "originalClassification": "SECRET DÉFENSE",
            "originalCountry": "FRA",
            "natoEquivalent": "SECRET",
            "releasabilityTo": ["FRA", "DEU"],  # USA NOT included
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-016"
        }
    }
    
    decision.allow == false
    contains(decision.reason, "Country USA not in releasabilityTo")
}

# ============================================
# Test 17: Backward compatibility - No original classification (ALLOW)
# ============================================
test_backward_compatibility_no_original_allow if {
    allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa@mil",
            "clearance": "SECRET",
            # No clearanceOriginal or clearanceCountry
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-legacy-001",
            "classification": "CONFIDENTIAL",
            # No originalClassification or originalCountry
            "releasabilityTo": ["USA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-017"
        }
    }
}

# ============================================
# Test 18: Backward compatibility - No original classification (DENY)
# ============================================
test_backward_compatibility_no_original_deny if {
    not allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa@mil",
            "clearance": "CONFIDENTIAL",
            # No clearanceOriginal or clearanceCountry
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-legacy-002",
            "classification": "SECRET",
            # No originalClassification or originalCountry
            "releasabilityTo": ["USA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-018"
        }
    }
    
    # Verify reason is correct
    test_decision := decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa@mil",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "action": {
            "operation": "read"
        },
        "resource": {
            "resourceId": "doc-legacy-002",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-22T12:00:00Z",
            "requestId": "req-018"
        }
    }
    
    test_decision.allow == false
    contains(test_decision.reason, "Insufficient clearance")
}

# ============================================
# Helper function for testing
# ============================================
get_decision_with_equivalency(user_id, user_clearance, user_country, resource_class, resource_country) := result if {
    result := decision
}

