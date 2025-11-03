package dive.authorization

import rego.v1

# ============================================
# Clearance Normalization Tests
# ============================================
# Tests for clearanceOriginal attribute tracking
# Validates that country-specific clearances are properly handled
# Last Updated: October 28, 2025

# ============================================
# Spanish Clearance Normalization Tests
# ============================================

test_spanish_secret_clearance_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "carlos.garcia@mil.es",
            "clearance": "SECRET",  # Normalized by backend
            "clearanceOriginal": "SECRETO",  # Original Spanish clearance
            "countryOfAffiliation": "ESP",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["ESP", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12345"
        }
    }
}

test_spanish_alto_secreto_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "isabel.general@mil.es",
            "clearance": "TOP_SECRET",  # Normalized
            "clearanceOriginal": "ALTO SECRETO",  # Original Spanish
            "countryOfAffiliation": "ESP",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-002",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["ESP"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12346"
        }
    }
}

# ============================================
# French Clearance Normalization Tests
# ============================================

test_french_secret_defense_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "pierre.dubois@defense.gouv.fr",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "SECRET DEFENSE",  # Original French
            "countryOfAffiliation": "FRA",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-003",
            "classification": "SECRET",
            "releasabilityTo": ["FRA", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12347"
        }
    }
}

test_french_tres_secret_defense_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "sophie.general@defense.gouv.fr",
            "clearance": "TOP_SECRET",  # Normalized
            "clearanceOriginal": "TRES SECRET DEFENSE",  # Original French
            "countryOfAffiliation": "FRA",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-004",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["FRA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12348"
        }
    }
}

# ============================================
# German Clearance Normalization Tests
# ============================================

test_german_geheim_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "hans.mueller@bundeswehr.org",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "GEHEIM",  # Original German
            "countryOfAffiliation": "DEU",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-005",
            "classification": "SECRET",
            "releasabilityTo": ["DEU", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12349"
        }
    }
}

test_german_streng_geheim_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "lisa.general@bundeswehr.org",
            "clearance": "TOP_SECRET",  # Normalized
            "clearanceOriginal": "STRENG GEHEIM",  # Original German
            "countryOfAffiliation": "DEU",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-006",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["DEU"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12350"
        }
    }
}

# ============================================
# Italian Clearance Normalization Tests
# ============================================

test_italian_segreto_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "marco.rossi@difesa.it",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "SEGRETO",  # Original Italian
            "countryOfAffiliation": "ITA",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-007",
            "classification": "SECRET",
            "releasabilityTo": ["ITA", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12351"
        }
    }
}

# ============================================
# Dutch Clearance Normalization Tests
# ============================================

test_dutch_geheim_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "pieter.devries@defensie.nl",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "GEHEIM",  # Original Dutch
            "countryOfAffiliation": "NLD",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-008",
            "classification": "SECRET",
            "releasabilityTo": ["NLD", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12352"
        }
    }
}

# ============================================
# Polish Clearance Normalization Tests
# ============================================

test_polish_tajny_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "jan.kowalski@mon.gov.pl",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "TAJNY",  # Original Polish
            "countryOfAffiliation": "POL",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-009",
            "classification": "SECRET",
            "releasabilityTo": ["POL", "USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12353"
        }
    }
}

# ============================================
# UK Clearance Normalization Tests
# ============================================

test_uk_official_sensitive_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "emma.jones@mod.uk",
            "clearance": "CONFIDENTIAL",  # Normalized
            "clearanceOriginal": "OFFICIAL-SENSITIVE",  # Original UK
            "countryOfAffiliation": "GBR",
            "authenticated": true,
            "acpCOI": ["FVEY"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-010",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["GBR", "USA"],
            "COI": ["FVEY"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12354"
        }
    }
}

# ============================================
# Canadian Clearance Normalization Tests
# ============================================

test_canadian_protected_b_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "emily.tremblay@forces.gc.ca",
            "clearance": "CONFIDENTIAL",  # Normalized
            "clearanceOriginal": "PROTECTED B",  # Original Canadian
            "countryOfAffiliation": "CAN",
            "authenticated": true,
            "acpCOI": ["CAN-US", "FVEY"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-011",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["CAN", "USA"],
            "COI": ["FVEY"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12355"
        }
    }
}

# ============================================
# Industry Clearance Normalization Tests
# ============================================

test_industry_sensitive_with_original if {
    allow with input as {
        "subject": {
            "uniqueID": "bob.contractor@lockheed.com",
            "clearance": "SECRET",  # Normalized
            "clearanceOriginal": "SENSITIVE",  # Original Industry
            "countryOfAffiliation": "USA",
            "authenticated": true,
            "acpCOI": [],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-012",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12356"
        }
    }
}

# ============================================
# Missing clearanceOriginal Tests (Should Still Work)
# ============================================

test_missing_clearance_original_still_works if {
    allow with input as {
        "subject": {
            "uniqueID": "test.user@usa.mil",
            "clearance": "SECRET",  # Standard clearance
            # NO clearanceOriginal - should still work
            "countryOfAffiliation": "USA",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-013",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12357"
        }
    }
}

# ============================================
# Cross-Country Releasability Tests
# ============================================

test_multi_country_releasability_with_original_clearances if {
    allow with input as {
        "subject": {
            "uniqueID": "hans.mueller@bundeswehr.org",
            "clearance": "SECRET",  # Normalized from German GEHEIM
            "clearanceOriginal": "GEHEIM",
            "countryOfAffiliation": "DEU",
            "authenticated": true,
            "acpCOI": ["NATO-COSMIC"],
            "aal": 2,
            "amr": ["pwd", "otp"]
        },
        "resource": {
            "resourceId": "doc-014",
            "classification": "SECRET",
            "releasabilityTo": ["DEU", "FRA", "GBR", "USA"],  # Multi-country
            "COI": ["NATO-COSMIC"],
            "creationDate": "2024-01-01T00:00:00Z",
            "encrypted": false
        },
        "action": {"type": "read"},
        "context": {
            "currentTime": "2025-10-28T12:00:00Z",
            "requestId": "req-12358"
        }
    }
}

