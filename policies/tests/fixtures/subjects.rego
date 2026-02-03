# Test Fixtures - Standard Test Subjects
# Package: dive.tests.fixtures.subjects
#
# Provides reusable, schema-compliant test subjects for all OPA tests.
# Ensures consistency and reduces maintenance burden when schema evolves.
#
# Version: 1.0.0
# Last Updated: 2026-01-30

package dive.tests.fixtures.subjects

import rego.v1

# ============================================
# USA Test Subjects
# ============================================

us_unclassified_user := {
    "uniqueID": "testuser-us-unclass",
    "clearance": "UNCLASSIFIED",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": false,
    "aal": 1,
    "acpCOI": []
}

us_confidential_user := {
    "uniqueID": "testuser-us-conf",
    "clearance": "CONFIDENTIAL",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["US-ONLY"]
}

us_secret_user := {
    "uniqueID": "testuser-us-secret",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["US-ONLY", "FVEY"]
}

us_top_secret_user := {
    "uniqueID": "testuser-us-ts",
    "clearance": "TOP_SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 3,
    "acpCOI": ["US-ONLY", "FVEY", "NATO"]
}

# ============================================
# France (FRA) Test Subjects
# ============================================

fra_secret_user := {
    "uniqueID": "testuser-fra-secret",
    "clearance": "SECRET",
    "countryOfAffiliation": "FRA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["NATO"],
    "issuer": "https://keycloak.fra.dive.local/realms/dive-v3-broker"
}

fra_confidential_user := {
    "uniqueID": "testuser-fra-conf",
    "clearance": "CONFIDENTIAL",
    "countryOfAffiliation": "FRA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["NATO"],
    "issuer": "https://keycloak.fra.dive.local/realms/dive-v3-broker"
}

# ============================================
# Germany (DEU) Test Subjects
# ============================================

deu_secret_user := {
    "uniqueID": "testuser-deu-secret",
    "clearance": "SECRET",
    "countryOfAffiliation": "DEU",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["NATO"],
    "issuer": "https://keycloak.deu.dive.local/realms/dive-v3-broker"
}

# ============================================
# Great Britain (GBR) Test Subjects
# ============================================

gbr_secret_user := {
    "uniqueID": "testuser-gbr-secret",
    "clearance": "SECRET",
    "countryOfAffiliation": "GBR",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["NATO", "FVEY"],
    "issuer": "https://keycloak.gbr.dive.local/realms/dive-v3-broker"
}

# ============================================
# Canada (CAN) Test Subjects
# ============================================

can_secret_user := {
    "uniqueID": "testuser-can-secret",
    "clearance": "SECRET",
    "countryOfAffiliation": "CAN",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["CAN-US", "FVEY"],
    "issuer": "https://keycloak.can.dive.local/realms/dive-v3-broker"
}

# ============================================
# Industry Test Subjects
# ============================================

industry_confidential_user := {
    "uniqueID": "bob.contractor@techcorp.com",
    "clearance": "CONFIDENTIAL",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": [],
    "industry": true,
    "issuer": "https://keycloak.industry.dive.local/realms/dive-v3-broker"
}

industry_secret_user := {
    "uniqueID": "alice.engineer@defensecontractor.com",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["US-ONLY"],
    "industry": true,
    "issuer": "https://keycloak.industry.dive.local/realms/dive-v3-broker"
}

# ============================================
# Admin Test Subjects
# ============================================

hub_admin_user := {
    "uniqueID": "admin-hub@dive.local",
    "clearance": "TOP_SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 3,
    "acpCOI": ["US-ONLY"],
    "roles": ["hub-admin"]
}

spoke_admin_usa_user := {
    "uniqueID": "admin-usa@mil",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": true,
    "aal": 2,
    "acpCOI": ["US-ONLY"],
    "roles": ["spoke-admin"]
}

# ============================================
# Edge Case Test Subjects
# ============================================

# Unauthenticated user
unauthenticated_user := {
    "uniqueID": "anonymous",
    "authenticated": false
}

# Missing clearance
no_clearance_user := {
    "uniqueID": "testuser-no-clearance",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": false,
    "aal": 1
}

# No MFA (should fail for classified)
no_mfa_user := {
    "uniqueID": "testuser-no-mfa",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "authenticated": true,
    "mfaVerified": false,
    "aal": 1,
    "acpCOI": []
}
