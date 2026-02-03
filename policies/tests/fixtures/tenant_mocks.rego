# Mock Tenant Data for Testing
# Package: dive.tests.fixtures.tenant_mocks
#
# Provides mock tenant configuration data for testing tenant.base functionality.
#
# Version: 1.0.0
# Last Updated: 2026-01-30

package dive.tests.fixtures.tenant_mocks

import rego.v1

# Full tenant configuration mock
full_tenant_config := {
    "USA": {
        "country": "USA",
        "enabled": true,
        "issuer": "https://usa-idp.dive25.com/realms/dive-v3-broker",
        "max_classification": "TOP_SECRET",
        "federation_partners": ["FRA", "GBR", "DEU", "CAN"]
    },
    "FRA": {
        "country": "FRA",
        "enabled": true,
        "issuer": "https://fra-idp.dive25.com/realms/dive-v3-broker",
        "max_classification": "SECRET",
        "federation_partners": ["USA", "GBR", "DEU"]
    },
    "GBR": {
        "country": "GBR",
        "enabled": true,
        "issuer": "https://gbr-idp.dive25.com/realms/dive-v3-broker",
        "max_classification": "TOP_SECRET",
        "federation_partners": ["USA", "FRA", "DEU", "CAN", "AUS"]
    },
    "DEU": {
        "country": "DEU",
        "enabled": true,
        "issuer": "https://deu-idp.dive25.com/realms/dive-v3-broker",
        "max_classification": "SECRET",
        "federation_partners": ["USA", "FRA", "GBR"]
    },
    "CAN": {
        "country": "CAN",
        "enabled": true,
        "issuer": "https://can-idp.dive25.com/realms/dive-v3-broker",
        "max_classification": "TOP_SECRET",
        "federation_partners": ["USA", "GBR"]
    }
}

# Trusted issuers map (issuer URL → tenant config)
trusted_issuers_map := {
    "https://usa-idp.dive25.com/realms/dive-v3-broker": {
        "tenant": "USA",
        "country": "USA",
        "enabled": true
    },
    "https://fra-idp.dive25.com/realms/dive-v3-broker": {
        "tenant": "FRA",
        "country": "FRA",
        "enabled": true
    },
    "https://gbr-idp.dive25.com/realms/dive-v3-broker": {
        "tenant": "GBR",
        "country": "GBR",
        "enabled": true
    },
    "https://deu-idp.dive25.com/realms/dive-v3-broker": {
        "tenant": "DEU",
        "country": "DEU",
        "enabled": true
    },
    "https://can-idp.dive25.com/realms/dive-v3-broker": {
        "tenant": "CAN",
        "country": "CAN",
        "enabled": true
    },
    "http://localhost:8443/realms/dive-v3-broker": {
        "tenant": "USA",
        "country": "USA",
        "enabled": true
    }
}

# Federation matrix (source → target → config)
federation_matrix_full := {
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
        "DEU": {"enabled": true, "trust_level": "medium", "max_classification": "SECRET"},
        "CAN": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "AUS": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"}
    },
    "DEU": {
        "USA": {"enabled": true, "trust_level": "medium", "max_classification": "SECRET"},
        "FRA": {"enabled": true, "trust_level": "high", "max_classification": "SECRET"},
        "GBR": {"enabled": true, "trust_level": "medium", "max_classification": "SECRET"}
    },
    "CAN": {
        "USA": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"},
        "GBR": {"enabled": true, "trust_level": "high", "max_classification": "TOP_SECRET"}
    }
}
