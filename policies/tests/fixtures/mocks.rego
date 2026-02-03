# Test Fixtures - Mock Data for Federation & External Dependencies
# Package: dive.tests.fixtures.mocks
#
# Provides mock data for external data dependencies required by policies.
# Prevents "undefined" errors when testing high-level authorization entrypoints.
#
# Version: 1.0.0
# Last Updated: 2026-01-30

package dive.tests.fixtures.mocks

import rego.v1

# ============================================
# Empty Mocks (No Federation)
# ============================================

# Use for tests that don't involve federation
empty_federation := {}
empty_trusted_issuers := {}

# ============================================
# USA ↔ FRA Federation
# ============================================

usa_fra_federation_matrix := {
    "USA": {
        "FRA": {
            "enabled": true,
            "trust_level": "high",
            "max_classification": "SECRET",
            "allowed_cois": ["NATO"]
        }
    },
    "FRA": {
        "USA": {
            "enabled": true,
            "trust_level": "high",
            "max_classification": "SECRET",
            "allowed_cois": ["NATO"]
        }
    }
}

usa_fra_trusted_issuers := {
    "https://keycloak.usa.dive.local/realms/dive-v3-broker": {
        "tenant": "USA",
        "enabled": true,
        "trust_level": "high"
    },
    "https://keycloak.fra.dive.local/realms/dive-v3-broker": {
        "tenant": "FRA",
        "enabled": true,
        "trust_level": "high"
    }
}

# ============================================
# Multi-Tenant Federation (USA, FRA, GBR, DEU)
# ============================================

full_federation_matrix := {
    "USA": {
        "FRA": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"},
        "GBR": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "DEU": {"enabled": true, "trust_level": "medium", "max_classification": "SECRET"},
        "CAN": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"}
    },
    "FRA": {
        "USA": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"},
        "GBR": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"},
        "DEU": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"}
    },
    "GBR": {
        "USA": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "FRA": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"},
        "CAN": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "AUS": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"}
    },
    "DEU": {
        "USA": {"enabled": true, "trust_level": "medium", "max_classification": "SECRET"},
        "FRA": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"}
    },
    "CAN": {
        "USA": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "GBR": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"}
    }
}

full_trusted_issuers := {
    "https://keycloak.usa.dive.local/realms/dive-v3-broker": {"tenant": "USA", "enabled": true},
    "https://keycloak.fra.dive.local/realms/dive-v3-broker": {"tenant": "FRA", "enabled": true},
    "https://keycloak.gbr.dive.local/realms/dive-v3-broker": {"tenant": "GBR", "enabled": true},
    "https://keycloak.deu.dive.local/realms/dive-v3-broker": {"tenant": "DEU", "enabled": true},
    "https://keycloak.can.dive.local/realms/dive-v3-broker": {"tenant": "CAN", "enabled": true},
    "https://keycloak.industry.dive.local/realms/dive-v3-broker": {"tenant": "USA", "enabled": true, "industry": true}
}

# ============================================
# Test Helpers
# ============================================

# Standard context for most tests
standard_context := {
    "currentTime": "2025-11-25T12:00:00Z",
    "requestId": "test-request-001"
}

# Context with federation enabled
federated_context(source_tenant, target_tenant) := context if {
    context := {
        "currentTime": "2025-11-25T12:00:00Z",
        "requestId": "test-request-fed-001",
        "federated": true,
        "sourceTenant": source_tenant,
        "targetTenant": target_tenant
    }
}

# Standard action
read_action := {"type": "read"}
write_action := {"type": "write"}
delete_action := {"type": "delete"}

# ============================================
# Mock COI Members (for coi_validation tests)
# ============================================

mock_coi_members := {
    "US-ONLY": ["USA"],
    "FVEY": ["USA", "GBR", "CAN", "AUS", "NZL"],
    "NATO": [
        "USA", "GBR", "FRA", "DEU", "ITA", "ESP", "POL", "CAN",
        "TUR", "NLD", "BEL", "NOR", "DNK", "PRT", "CZE", "HUN",
        "GRC", "SVK", "BGR", "SVN", "EST", "LVA", "LTU", "HRV",
        "ROU", "ALB", "MNE", "MKD", "FIN", "SWE", "ISL"
    ],
    "NATO-COSMIC": ["USA", "GBR", "FRA", "DEU", "ITA"],
    "CAN-US": ["USA", "CAN"],
    "GBR-US": ["USA", "GBR"],
    "AUKUS": ["USA", "GBR", "AUS"],
    "QUAD": ["USA", "AUS", "IND", "JPN"],
    "EU-RESTRICTED": [
        "FRA", "DEU", "ITA", "ESP", "POL", "NLD", "BEL",
        "GRC", "PRT", "CZE", "HUN", "SWE", "AUT", "DNK",
        "FIN", "SVK", "IRL", "HRV", "LTU", "SVN", "LVA",
        "EST", "CYP", "LUX", "MLT", "BGR", "ROU"
    ],
    "Alpha": [],  # No affiliation
    "Beta": []    # No affiliation
}
