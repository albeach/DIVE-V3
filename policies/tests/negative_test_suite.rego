package dive.authorization_test

import rego.v1
import data.dive.authorization

# ==============================================================================
# Negative Test Suite (Week 3)
# ==============================================================================
# This test suite verifies that the OPA policy correctly DENIES access for:
# - Invalid attribute values (clearance levels, country codes)
# - Missing required attributes
# - Malformed data structures (COI, releasabilityTo)
# - Edge cases (null values, empty arrays, wrong types)
# - Boundary conditions (future dates, expired tokens)
#
# All tests should result in allow = false
# Target: 20+ negative test cases
# ==============================================================================

# ------------------------------------------------------------------------------
# Category 1: Invalid Clearance Levels (5 tests)
# ------------------------------------------------------------------------------

test_deny_invalid_clearance_super_secret if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SUPER_SECRET",  # Invalid level
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_clearance_public if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "PUBLIC",  # Invalid level
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_clearance_lowercase if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "secret",  # Lowercase not valid
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_clearance_numeric if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "LEVEL_3",  # Invalid format
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_clearance_null if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": null,  # Null clearance
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 2: Invalid Country Codes (5 tests)
# ------------------------------------------------------------------------------

test_deny_invalid_country_code_us if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "US",  # Should be USA (ISO 3166-1 alpha-3)
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["US"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_country_code_fr if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "FR",  # Should be FRA
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["FR"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_country_numeric if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "840",  # Numeric code not accepted
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["840"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_country_lowercase if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "usa",  # Lowercase not valid
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["usa"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_country_null if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": null,  # Null country
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 3: Missing Required Attributes (4 tests)
# ------------------------------------------------------------------------------

test_deny_missing_uniqueID if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            # uniqueID missing
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_missing_clearance if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            # clearance missing
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_missing_country if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            # countryOfAffiliation missing
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_empty_uniqueID if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "",  # Empty string
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 4: Empty/Invalid releasabilityTo (3 tests)
# ------------------------------------------------------------------------------

test_deny_empty_releasabilityTo if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": [],  # Empty array = no countries allowed
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_null_releasabilityTo if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": null,  # Null releasability
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_invalid_releasabilityTo_contains_invalid_code if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "INVALID"],  # Contains invalid country code
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 5: Malformed COI Arrays (2 tests)
# ------------------------------------------------------------------------------

test_deny_coi_not_array_string if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": "FVEY"  # String instead of array
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_coi_numeric if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": [1, 2, 3]  # Numbers instead of strings
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 6: Future Embargo Dates (2 tests)
# ------------------------------------------------------------------------------

test_deny_future_embargo_one_day if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "creationDate": "2025-10-16T14:30:00Z"  # Tomorrow
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"  # Today
        }
    }
}

test_deny_future_embargo_far_future if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "creationDate": "2030-01-01T00:00:00Z"  # 5 years in future
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 7: Authentication Edge Cases (2 tests)
# ------------------------------------------------------------------------------

test_deny_not_authenticated if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": false,  # Not authenticated
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_missing_authenticated_field if {
    not authorization.allow with input as {
        "subject": {
            # authenticated field missing entirely
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ------------------------------------------------------------------------------
# Category 8: Boundary Conditions (2 tests)
# ------------------------------------------------------------------------------

test_deny_clearance_empty_string if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "",  # Empty string clearance
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

test_deny_country_empty_string if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "test@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "",  # Empty string country
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-1",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# ==============================================================================
# Summary: 22 negative test cases covering:
# - Invalid clearance levels (5)
# - Invalid country codes (5)
# - Missing required attributes (4)
# - Empty/invalid releasabilityTo (3)
# - Malformed COI arrays (2)
# - Future embargo dates (2)
# - Authentication edge cases (2)
# - Boundary conditions (2)
#
# All tests verify that allow = false for invalid/missing/malformed inputs.
# ==============================================================================


