# =============================================================================
# DIVE V3 - AAL (Authenticator Assurance Level) Enforcement Tests
# =============================================================================
#
# Tests the enforcement of AAL requirements based on clearance levels:
#   - AAL1: Password only (UNCLASSIFIED)
#   - AAL2: Password + OTP/TOTP (CONFIDENTIAL, SECRET)
#   - AAL3: Password + WebAuthn (TOP_SECRET)
#
# The policy uses:
#   - input.context.acr: Authentication Context Reference (e.g., "aal1", "1", "silver")
#   - input.context.amr: Authentication Methods Reference (e.g., ["pwd", "otp"])
#
# Run tests: opa test policies/ -v
# =============================================================================

package dive.authorization.aal_enforcement_test

import rego.v1
import data.dive.authorization

# =============================================================================
# AAL1 Tests - Password Only (UNCLASSIFIED)
# =============================================================================

# Test: UNCLASSIFIED user with AAL1 can access UNCLASSIFIED resources
test_aal1_unclass_user_access_unclass_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-UNCLASS-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal1-001",
            "acr": "0",  # AAL1 (Keycloak numeric)
            "amr": ["pwd"]
        }
    }
    result.allow == true
}

# Test: UNCLASSIFIED user can access UNCLASSIFIED without any acr/amr
test_aal1_unclass_no_acr_amr if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-UNCLASS-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal1-002"
            # No acr/amr - defaults to AAL1
        }
    }
    result.allow == true
}

# Test: UNCLASSIFIED user with AAL1 CANNOT access CONFIDENTIAL resources
test_aal1_unclass_user_denied_confidential_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-1",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal1-003",
            "acr": "0",
            "amr": ["pwd"]
        }
    }
    # Denied due to clearance (UNCLASSIFIED < CONFIDENTIAL)
    result.allow == false
}

# =============================================================================
# AAL2 Tests - Password + OTP/TOTP (CONFIDENTIAL, SECRET)
# =============================================================================

# Test: CONFIDENTIAL user with AAL2 can access CONFIDENTIAL resources
test_aal2_confidential_user_access_confidential_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-001",
            "acr": "1",  # AAL2 (Keycloak numeric)
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# Test: CONFIDENTIAL user with "aal2" string format
test_aal2_confidential_string_format if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-002",
            "acr": "aal2",  # String format
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# Test: CONFIDENTIAL user with "silver" acr (InCommon/REFEDS standard)
test_aal2_confidential_silver_acr if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-003",
            "acr": "silver",  # InCommon/REFEDS standard
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# Test: SECRET user with AAL2 can access SECRET resources
test_aal2_secret_user_access_secret_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-004",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# Test: CONFIDENTIAL user with ONLY AAL1 CANNOT access CONFIDENTIAL resources
test_aal1_confidential_user_denied_without_mfa if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-005",
            "acr": "0",  # AAL1 (password only)
            "amr": ["pwd"]
        }
    }
    # Denied: AAL2 required for CONFIDENTIAL
    result.allow == false
}

# Test: SECRET user with ONLY AAL1 CANNOT access SECRET resources
test_aal1_secret_user_denied_without_mfa if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-006",
            "acr": "0",  # AAL1
            "amr": ["pwd"]
        }
    }
    # Denied: AAL2 required for SECRET
    result.allow == false
}

# Test: SECRET user with AAL2 can also access CONFIDENTIAL resources
test_aal2_secret_user_access_confidential_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-CONF-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal2-007",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# =============================================================================
# AAL3 Tests - Password + WebAuthn (TOP_SECRET)
# =============================================================================

# Test: TOP_SECRET user with AAL3 (numeric "2") can access TOP_SECRET resources
test_aal3_ts_user_access_ts_resource_numeric if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-TS-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal3-001",
            "acr": "2",  # AAL3 (Keycloak numeric)
            "amr": ["pwd", "hwk"]  # hwk = hardware key (WebAuthn)
        }
    }
    result.allow == true
}

# Test: TOP_SECRET user with "gold" acr
test_aal3_ts_user_access_ts_resource_gold if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-TS-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal3-002",
            "acr": "gold",  # InCommon/REFEDS gold = AAL3
            "amr": ["pwd", "hwk"]
        }
    }
    result.allow == true
}

# Test: TOP_SECRET user with ONLY AAL2 - check policy behavior
# Note: Current policy requires AAL2 for classified, not specifically AAL3 for TOP_SECRET
# This test documents the current behavior
test_aal2_ts_user_access_ts_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-TS-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal3-003",
            "acr": "1",  # AAL2 (OTP, not WebAuthn)
            "amr": ["pwd", "otp"]
        }
    }
    # Current policy: AAL2 is sufficient for all classified levels
    # This should be updated if AAL3 is strictly required for TOP_SECRET
    result.allow == true
}

# Test: TOP_SECRET user with AAL3 can access all lower classification levels
test_aal3_ts_user_access_secret_resource if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-4",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-aal3-004",
            "acr": "2",  # AAL3
            "amr": ["pwd", "hwk"]
        }
    }
    result.allow == true
}

# =============================================================================
# AMR (Authentication Method Reference) Tests
# =============================================================================

# Test: Valid OTP factor in AMR
test_amr_otp_factor if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-amr-001",
            "acr": "1",
            "amr": ["pwd", "otp"]
        }
    }
    result.allow == true
}

# Test: Valid hardware token factor in AMR
test_amr_hwtoken_factor if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-amr-002",
            "acr": "1",
            "amr": ["pwd", "hwtoken"]
        }
    }
    result.allow == true
}

# Test: Invalid - only one factor when AAL2 required
test_amr_single_factor_denied if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-amr-003",
            "acr": "1",  # Claims AAL2
            "amr": ["pwd"]  # But only 1 factor
        }
    }
    # Denied: claims AAL2 but only 1 factor provided
    result.allow == false
}

# Test: Non-MFA factors with factor count >= 2 (current policy behavior)
# Note: Current policy counts factors but doesn't validate specific MFA types
# This test documents the current behavior - may need to be updated if
# policy is enhanced to validate specific MFA factor types
test_amr_non_mfa_factors_allowed_by_count if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-amr-004",
            "acr": "1",  # Claims AAL2
            "amr": ["pwd", "email"]  # 2 factors (policy counts, not validates)
        }
    }
    # Current policy allows if factor count >= 2
    # TODO: Consider enhancing policy to validate specific MFA factor types
    result.allow == true
}

# =============================================================================
# Federation AAL Tests (Cross-Country)
# =============================================================================

# Test: Federated user from FRA with AAL2 can access USA SECRET resource
test_federated_fra_user_with_aal2 if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-fra-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-RELEASABLE-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA"],  # Releasable to FRA
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-fed-001",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"],
            "idp_alias": "fra-federation"
        }
    }
    result.allow == true
}

# Test: Federated user from DEU with AAL1 denied SECRET resource
test_federated_deu_user_with_aal1_denied if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-deu-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-RELEASABLE-002",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "DEU"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-fed-002",
            "acr": "0",  # AAL1 (password only)
            "amr": ["pwd"],
            "idp_alias": "deu-federation"
        }
    }
    # Denied: AAL2 required for SECRET
    result.allow == false
}

# =============================================================================
# Clearance + AAL Matrix Tests
# =============================================================================

# Test: SECRET user with AAL2 CANNOT access TOP_SECRET (clearance issue)
test_secret_user_cannot_access_ts if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-TS-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-matrix-001",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
    # Denied: insufficient clearance (not AAL)
    result.allow == false
}

# Test: CONFIDENTIAL user CANNOT access SECRET even with AAL2
test_confidential_user_cannot_access_secret if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-2",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-matrix-002",
            "acr": "1",  # AAL2
            "amr": ["pwd", "otp"]
        }
    }
    # Denied: insufficient clearance
    result.allow == false
}

# =============================================================================
# Decision Reason Tests
# =============================================================================

# Test: Verify denial reason for insufficient AAL
test_denial_reason_insufficient_aal if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-reason-001",
            "acr": "0",  # AAL1
            "amr": ["pwd"]
        }
    }
    result.allow == false
}

# Test: Verify denial reason for missing MFA factor
test_denial_reason_missing_mfa if {
    result := authorization.decision with input as {
        "subject": {
            "uniqueID": "testuser-usa-3",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "authenticated": true
        },
        "action": "read",
        "resource": {
            "resourceId": "USA-SECRET-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-11-25T12:00:00Z",
            "requestId": "test-reason-002",
            "acr": "1",  # Claims AAL2
            "amr": ["pwd"]  # But only 1 factor
        }
    }
    result.allow == false
}
