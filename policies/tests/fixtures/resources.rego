# Test Fixtures - Standard Test Resources
# Package: dive.tests.fixtures.resources
#
# Provides reusable, schema-compliant test resources for all OPA tests.
# Covers all classification levels, COI combinations, and edge cases.
#
# Version: 1.0.0
# Last Updated: 2026-01-30

package dive.tests.fixtures.resources

import rego.v1

# ============================================
# USA Resources
# ============================================

us_unclassified_doc := {
    "resourceId": "US-UNCLASS-001",
    "classification": "UNCLASSIFIED",
    "releasabilityTo": ["USA"],
    "COI": []
}

us_confidential_doc := {
    "resourceId": "US-CONF-001",
    "classification": "CONFIDENTIAL",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"]
}

us_secret_doc := {
    "resourceId": "US-SECRET-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"]
}

us_top_secret_doc := {
    "resourceId": "US-TS-001",
    "classification": "TOP_SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"]
}

# ============================================
# NATO Resources
# ============================================

nato_unclassified_doc := {
    "resourceId": "NATO-UNCLASS-001",
    "classification": "UNCLASSIFIED",
    "releasabilityTo": ["USA", "GBR", "FRA", "DEU", "CAN"],
    "COI": ["NATO"]
}

nato_confidential_doc := {
    "resourceId": "NATO-CONF-001",
    "classification": "CONFIDENTIAL",
    "releasabilityTo": ["USA", "GBR", "FRA", "DEU"],
    "COI": ["NATO"]
}

nato_secret_doc := {
    "resourceId": "NATO-SECRET-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR", "FRA", "DEU"],
    "COI": ["NATO"]
}

nato_cosmic_top_secret_doc := {
    "resourceId": "NATO-COSMIC-TS-001",
    "classification": "TOP_SECRET",
    "releasabilityTo": ["USA", "GBR", "FRA"],
    "COI": ["NATO-COSMIC"]
}

# ============================================
# FVEY Resources
# ============================================

fvey_secret_doc := {
    "resourceId": "FVEY-SECRET-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
    "COI": ["FVEY"]
}

fvey_top_secret_doc := {
    "resourceId": "FVEY-TS-001",
    "classification": "TOP_SECRET",
    "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
    "COI": ["FVEY"]
}

# ============================================
# Bilateral Resources
# ============================================

can_us_secret_doc := {
    "resourceId": "CAN-US-SECRET-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "CAN"],
    "COI": ["CAN-US"]
}

gbr_us_confidential_doc := {
    "resourceId": "GBR-US-CONF-001",
    "classification": "CONFIDENTIAL",
    "releasabilityTo": ["USA", "GBR"],
    "COI": ["GBR-US"]
}

# ============================================
# Encrypted Resources (KAS Required)
# ============================================

us_secret_encrypted_doc := {
    "resourceId": "US-SECRET-ENC-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"],
    "encrypted": true,
    "kasUrl": "https://kas-usa.dive.local:8080"
}

nato_secret_encrypted_doc := {
    "resourceId": "NATO-SECRET-ENC-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR", "FRA"],
    "COI": ["NATO"],
    "encrypted": true,
    "kasUrl": "https://kas-hub.dive.local:8080"
}

# ============================================
# Embargoed Resources
# ============================================

us_embargoed_future_doc := {
    "resourceId": "US-EMBARGO-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"],
    "creationDate": "2030-01-01T00:00:00Z"  # Future date
}

us_embargoed_past_doc := {
    "resourceId": "US-EMBARGO-002",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY"],
    "creationDate": "2020-01-01T00:00:00Z"  # Past date (valid)
}

# ============================================
# Multi-COI Resources
# ============================================

fvey_nato_doc := {
    "resourceId": "FVEY-NATO-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR", "CAN"],
    "COI": ["FVEY", "NATO"],
    "coiOperator": "ALL"  # Must have BOTH COIs
}

# ============================================
# Edge Case Resources
# ============================================

# Empty releasability (should always deny)
empty_releasability_doc := {
    "resourceId": "EMPTY-REL-001",
    "classification": "SECRET",
    "releasabilityTo": [],
    "COI": []
}

# No COI required
no_coi_doc := {
    "resourceId": "NO-COI-001",
    "classification": "CONFIDENTIAL",
    "releasabilityTo": ["USA", "GBR", "FRA"],
    "COI": []
}

# Unknown COI (should fail coherence check)
unknown_coi_doc := {
    "resourceId": "UNKNOWN-COI-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["UNKNOWN_COI"]
}

# Conflicting COI (US-ONLY + FVEY = coherence violation)
conflicting_coi_doc := {
    "resourceId": "CONFLICT-COI-001",
    "classification": "SECRET",
    "releasabilityTo": ["USA"],
    "COI": ["US-ONLY", "FVEY"]
}

# ============================================
# Admin Resources
# ============================================

admin_endpoint := {
    "resourceId": "admin-endpoint",
    "classification": "UNCLASSIFIED",
    "releasabilityTo": ["USA"],
    "COI": [],
    "resourceType": "admin"
}

metrics_endpoint := {
    "resourceId": "metrics-endpoint",
    "classification": "UNCLASSIFIED",
    "releasabilityTo": ["USA", "FRA", "GBR", "DEU"],
    "COI": []
}
