package dive.authorization_test

import rego.v1
import data.dive.authorization

# =============================================================================
# DIVE V3 Authorization Policy Tests
# =============================================================================
# Comprehensive test suite for ACP-240 / STANAG 4774/5636 compliance
# Target coverage: 80%+
# Categories:
#   1. Authentication tests
#   2. Required attributes tests
#   3. Clearance level tests (including equivalency)
#   4. Releasability tests
#   5. COI tests (ALL/ANY operators)
#   6. COI coherence tests
#   7. Embargo tests
#   8. ZTDF integrity tests
#   9. Upload releasability tests
#   10. AAL/MFA tests
#   11. KAS obligation tests
#   12. Integration tests
# =============================================================================

# =============================================================================
# 1. AUTHENTICATION TESTS
# =============================================================================

test_allow_authenticated_user if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z"
        }
    }
}

test_deny_unauthenticated_user if {
    not authorization.allow with input as {
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

test_deny_missing_authentication_field if {
    not authorization.allow with input as {
        "subject": {
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
# 2. REQUIRED ATTRIBUTES TESTS
# =============================================================================

test_deny_missing_uniqueID if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
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

test_deny_empty_uniqueID if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "",
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

test_deny_missing_clearance if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
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

test_deny_empty_clearance if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "",
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

test_deny_missing_country if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

test_deny_empty_country if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": ""
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

test_deny_invalid_country_code if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "US"  # Invalid: should be "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

test_deny_missing_resource_classification if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

test_deny_missing_releasabilityTo if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET"
        },
        "context": {}
    }
}

# =============================================================================
# 3. CLEARANCE LEVEL TESTS
# =============================================================================

test_allow_equal_clearance if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
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

test_allow_higher_clearance if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
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

test_deny_insufficient_clearance if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
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

test_allow_unclassified_access if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

test_deny_invalid_clearance_level if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SUPER_SECRET",  # Invalid clearance
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

# Restricted level tests
test_deny_unclassified_accessing_restricted if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "RESTRICTED",
            "releasabilityTo": ["USA"]
        },
        "context": {}
    }
}

# =============================================================================
# 4. RELEASABILITY TESTS
# =============================================================================

test_allow_country_in_releasability_list if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA", "GBR"]
        },
        "context": {}
    }
}

test_deny_country_not_in_releasability_list if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA", "GBR"]
        },
        "context": {}
    }
}

test_deny_empty_releasability_list if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": []
        },
        "context": {}
    }
}

test_allow_fvey_country if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-gbr-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "GBR"
        },
        "resource": {
            "resourceId": "doc-fvey",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"]
        },
        "context": {}
    }
}

# =============================================================================
# 5. COI TESTS (ALL/ANY operators)
# =============================================================================

# COI tests - user with NO COI can still access (COI is optional filter)
test_allow_user_without_coi_accessing_coi_resource if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
            # No acpCOI field - COI is optional
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"]
        },
        "context": {}
    }
}

test_allow_matching_coi_all_operator if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY", "NATO"],
            "coiOperator": "ALL"
        },
        "context": {}
    }
}

test_deny_missing_coi_all_operator if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"]  # Missing NATO
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY", "NATO"],
            "coiOperator": "ALL"
        },
        "context": {}
    }
}

test_allow_partial_coi_any_operator if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"]  # Only has FVEY
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY", "NATO"],
            "coiOperator": "ANY"
        },
        "context": {}
    }
}

test_deny_no_matching_coi_any_operator if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["AUKUS"]  # No match with FVEY or NATO
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY", "NATO"],
            "coiOperator": "ANY"
        },
        "context": {}
    }
}

# US-ONLY tests
test_allow_us_only_coi if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"]
        },
        "context": {}
    }
}

test_deny_us_only_with_foreign_sharing_coi if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"]  # Foreign sharing COI
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"]
        },
        "context": {}
    }
}

# =============================================================================
# 6. COI COHERENCE TESTS
# =============================================================================

test_deny_us_only_combined_with_foreign_coi if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY", "FVEY"]  # Invalid combination
        },
        "context": {}
    }
}

test_deny_eu_restricted_combined_with_nato_cosmic if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "acpCOI": ["EU-RESTRICTED", "NATO-COSMIC"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["DEU"],
            "COI": ["EU-RESTRICTED", "NATO-COSMIC"]  # Invalid combination
        },
        "context": {}
    }
}

test_deny_noforn_without_us_only_coi if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"],
            "caveats": ["NOFORN"]
        },
        "context": {}
    }
}

test_allow_valid_noforn_us_only if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["US-ONLY"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["US-ONLY"],
            "caveats": ["NOFORN"]
        },
        "context": {}
    }
}

# =============================================================================
# 7. EMBARGO TESTS
# =============================================================================

test_allow_resource_past_embargo if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "creationDate": "2025-01-01T00:00:00Z"  # Past date
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z"
        }
    }
}

test_deny_resource_under_embargo if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "creationDate": "2030-01-01T00:00:00Z"  # Future date
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z"
        }
    }
}

test_allow_within_clock_skew_tolerance if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "creationDate": "2025-11-25T12:03:00Z"  # 3 minutes in future (within 5 min tolerance)
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z"
        }
    }
}

# =============================================================================
# 8. ZTDF INTEGRITY TESTS
# =============================================================================

test_allow_ztdf_valid_integrity if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "ztdf": {
                "integrityValidated": true,
                "policyHash": "sha256:abc123",
                "payloadHash": "sha256:def456"
            }
        },
        "context": {}
    }
}

test_deny_ztdf_failed_integrity if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "ztdf": {
                "integrityValidated": false,
                "policyHash": "sha256:abc123",
                "payloadHash": "sha256:def456"
            }
        },
        "context": {}
    }
}

test_deny_ztdf_missing_policy_hash if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "ztdf": {
                "integrityValidated": true,
                "payloadHash": "sha256:def456"
                # Missing policyHash
            }
        },
        "context": {}
    }
}

test_deny_ztdf_missing_payload_hash if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "ztdf": {
                "integrityValidated": true,
                "policyHash": "sha256:abc123"
                # Missing payloadHash
            }
        },
        "context": {}
    }
}

# =============================================================================
# 9. UPLOAD RELEASABILITY TESTS
# =============================================================================

test_allow_upload_releasable_to_uploader if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "action": {
            "operation": "upload"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"]  # Includes uploader's country
        },
        "context": {}
    }
}

test_deny_upload_not_releasable_to_uploader if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "action": {
            "operation": "upload"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["FRA", "GBR"]  # Does NOT include USA
        },
        "context": {}
    }
}

# =============================================================================
# 10. AAL/MFA TESTS
# =============================================================================

test_allow_unclassified_no_mfa if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "acr": "0",
            "amr": ["pwd"]
        }
    }
}

test_allow_classified_with_aal2 if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
}

test_allow_classified_with_silver_acr if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "acr": "silver",
            "amr": ["pwd", "otp"]
        }
    }
}

test_deny_classified_without_mfa_factors if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "acr": "0",  # AAL1
            "amr": ["pwd"]  # Only 1 factor
        }
    }
}

# =============================================================================
# 11. KAS OBLIGATION TESTS
# =============================================================================

test_kas_obligation_for_encrypted_resource if {
    count(authorization.obligations) > 0 with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-encrypted",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "encrypted": true
        },
        "context": {}
    }
}

test_no_kas_obligation_for_unencrypted_resource if {
    count(authorization.obligations) == 0 with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "encrypted": false
        },
        "context": {}
    }
}

test_kas_obligation_type if {
    oblig := authorization.obligations[_] with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA"
        },
        "resource": {
            "resourceId": "doc-encrypted",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "encrypted": true
        },
        "context": {}
    }
    oblig.type == "kas"
    oblig.action == "request_key"
}

# =============================================================================
# 12. INTEGRATION TESTS - MULTI-NATION COALITION
# =============================================================================

test_fvey_coalition_access if {
    # GBR user accessing FVEY resource
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-gbr-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "GBR",
            "acpCOI": ["FVEY"]
        },
        "resource": {
            "resourceId": "fvey-intel",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        },
        "context": {}
    }
}

test_nato_coalition_access if {
    # DEU user accessing NATO resource
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-deu-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "acpCOI": ["NATO"]
        },
        "resource": {
            "resourceId": "nato-ops",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "DEU", "FRA", "GBR", "ITA", "ESP", "POL"],
            "COI": ["NATO"]
        },
        "context": {}
    }
}

test_cross_coalition_denied if {
    # USA user trying to access EU-RESTRICTED without membership
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"]  # No EU-RESTRICTED
        },
        "resource": {
            "resourceId": "eu-doc",
            "classification": "SECRET",
            "releasabilityTo": ["DEU", "FRA"],  # USA not included
            "COI": ["EU-RESTRICTED"]
        },
        "context": {}
    }
}

test_decision_structure if {
    d := authorization.decision with input as {
        "subject": {
            "authenticated": true,
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
    d.allow == true
    d.reason == "Access granted - all conditions satisfied"
}

test_evaluation_details_present if {
    details := authorization.evaluation_details with input as {
        "subject": {
            "authenticated": true,
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
    details.checks.authenticated == true
    details.checks.clearance_sufficient == true
}


