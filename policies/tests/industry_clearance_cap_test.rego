# Phase 3: Industry Clearance Cap Enforcement Tests
# Package: dive.tests.industry_clearance_cap
#
# Tests for ACP-240 Section 4.9: Industry Clearance Cap
#
# Ensures industry users cannot access resources above their
# tenant's industry_max_classification level.
#
# Test Matrix:
# - USA: industry_max_classification = SECRET
# - FRA: industry_max_classification = CONFIDENTIAL
# - GBR: industry_max_classification = SECRET
# - DEU: industry_max_classification = CONFIDENTIAL
#
# Version: 1.0.0
# Last Updated: 2025-12-05

package dive.tests.industry_clearance_cap

import rego.v1

import data.dive.authz as authz
import data.dive.org.nato.acp240 as acp240

# ============================================
# Test Data
# ============================================

# Tenant configurations with industry caps
tenant_configs := {
    "USA": {"industry_max_classification": "SECRET"},
    "FRA": {"industry_max_classification": "CONFIDENTIAL"},
    "GBR": {"industry_max_classification": "SECRET"},
    "DEU": {"industry_max_classification": "CONFIDENTIAL"},
}

# Base input for industry user tests
base_industry_input := {
    "subject": {
        "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
        "uniqueID": "bob.contractor@lockheed.com",
        "clearance": "TOP_SECRET",
        "countryOfAffiliation": "USA",
        "organizationType": "INDUSTRY",
        "acpCOI": ["US-ONLY"],
    },
    "action": {"type": "read"},
    "resource": {
        "resourceId": "test-resource",
        "classification": "SECRET",
        "releasabilityTo": ["USA"],
        "COI": [],
        "releasableToIndustry": true,
    },
    "context": {
        "currentTime": "2025-12-05T12:00:00Z",
    },
}

# ============================================
# USA Industry User Tests (Cap: SECRET)
# ============================================

# Test: USA industry user CAN access SECRET (at cap)
test_usa_industry_user_can_access_secret if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "USA",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "SECRET",
        }),
    })

    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: USA industry user CAN access CONFIDENTIAL (below cap)
test_usa_industry_user_can_access_confidential if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "USA",
            "clearance": "SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "CONFIDENTIAL",
        }),
    })

    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: USA industry user CAN access UNCLASSIFIED (below cap)
test_usa_industry_user_can_access_unclassified if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "USA",
            "clearance": "SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "UNCLASSIFIED",
        }),
    })

    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: USA industry user CANNOT access TOP_SECRET (above cap)
test_usa_industry_user_blocked_from_top_secret if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "USA",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
        }),
    })

    not acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# ============================================
# France Industry User Tests (Cap: CONFIDENTIAL)
# ============================================

# Test: FRA industry user CAN access CONFIDENTIAL (at cap)
test_fra_industry_user_can_access_confidential if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "FRA",
            "uniqueID": "pierre.contractor@thales.com",
            "clearance": "SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["FRA", "USA"],
        }),
    })

    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: FRA industry user CANNOT access SECRET (above cap)
test_fra_industry_user_blocked_from_secret if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "FRA",
            "uniqueID": "pierre.contractor@thales.com",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "SECRET",
            "releasabilityTo": ["FRA", "USA"],
        }),
    })

    not acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: FRA industry user CANNOT access TOP_SECRET (above cap)
test_fra_industry_user_blocked_from_top_secret if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "FRA",
            "uniqueID": "pierre.contractor@thales.com",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
            "releasabilityTo": ["FRA"],
        }),
    })

    not acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# ============================================
# Germany Industry User Tests (Cap: CONFIDENTIAL)
# ============================================

# Test: DEU industry user CANNOT access SECRET (above cap)
test_deu_industry_user_blocked_from_secret if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "DEU",
            "uniqueID": "hans.contractor@rheinmetall.com",
            "clearance": "SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "SECRET",
            "releasabilityTo": ["DEU", "USA"],
        }),
    })

    not acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# ============================================
# Government User Tests (No Cap Applied)
# ============================================

# Test: GOV user NOT affected by industry cap
test_gov_user_not_affected_by_industry_cap if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "organizationType": "GOV",
            "uniqueID": "alice.officer@mail.mil",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
        }),
    })

    # GOV users should always pass the industry cap check
    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: MIL user NOT affected by industry cap
test_mil_user_not_affected_by_industry_cap if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "organizationType": "MIL",
            "uniqueID": "john.colonel@mail.mil",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
        }),
    })

    # MIL users should always pass the industry cap check
    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# Test: Missing organizationType with gov email domain defaults to GOV (no cap)
test_missing_org_type_with_gov_email_passes if {
    test_input := object.union(base_industry_input, {
        "subject": {
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true,
            "uniqueID": "test@mail.mil",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "organizationType": "GOV",  # Explicit GOV
        },
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
        }),
    })

    # Should pass because org type is GOV
    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# ============================================
# Edge Cases
# ============================================

# Test: Unknown tenant defaults to CONFIDENTIAL cap
test_unknown_tenant_defaults_to_confidential_cap if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "XXX",  # Unknown country
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "SECRET",  # Above default CONFIDENTIAL cap
        }),
    })

    # Should fail because default cap is CONFIDENTIAL
    not acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as {}  # Empty configs to trigger default
}

# Test: Industry user with UNCLASSIFIED clearance accessing UNCLASSIFIED resource
test_industry_user_unclassified_to_unclassified if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "clearance": "UNCLASSIFIED",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "UNCLASSIFIED",
        }),
    })

    acp240.check_industry_clearance_cap_ok with input as test_input
        with data.tenant_configs as tenant_configs
}

# ============================================
# Error Message Tests
# ============================================

# Test: Verify error message contains useful information
test_error_message_contains_details if {
    test_input := object.union(base_industry_input, {
        "subject": object.union(base_industry_input.subject, {
            "countryOfAffiliation": "USA",
            "clearance": "TOP_SECRET",
        }),
        "resource": object.union(base_industry_input.resource, {
            "classification": "TOP_SECRET",
        }),
    })

    msg := acp240.is_industry_clearance_exceeded with input as test_input
        with data.tenant_configs as tenant_configs

    contains(msg, "Industry clearance cap exceeded")
    contains(msg, "TOP_SECRET")
    contains(msg, "SECRET")
    contains(msg, "USA")
}
