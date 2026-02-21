#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - End-to-End Authorization Testing Script
# =============================================================================
# Tests complete authorization workflow from authentication through decision
# Demonstrates PEP→PDP architecture with inline OPAL OPA
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# OPA Endpoint
OPA_URL="http://localhost:9181"

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     DIVE V3 End-to-End Authorization Testing Suite            ║${NC}"
echo -e "${CYAN}║     Phase 3: Complete PEP→PDP Workflow Validation             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper function to run a test
run_test() {
    local test_name="$1"
    local input_json="$2"
    local expected_allow="$3"
    local expected_reason_pattern="$4"

    ((TESTS_RUN++))
    echo -e "${BLUE}[TEST $TESTS_RUN]${NC} $test_name"

    # Make request
    response=$(curl -sf "$OPA_URL/v1/data/dive/authz/decision" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$input_json" 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  ${RED}✗ FAIL${NC} - No response from OPA"
        ((TESTS_FAILED++))
        return 1
    fi

    # Extract allow and reason
    allow=$(echo "$response" | jq -r '.result.allow')
    reason=$(echo "$response" | jq -r '.result.reason')

    # Check allow matches expected
    if [ "$allow" != "$expected_allow" ]; then
        echo -e "  ${RED}✗ FAIL${NC} - Expected allow=$expected_allow, got allow=$allow"
        echo -e "    Reason: $reason"
        ((TESTS_FAILED++))
        return 1
    fi

    # Check reason contains expected pattern (if provided)
    if [ -n "$expected_reason_pattern" ]; then
        if ! echo "$reason" | grep -q "$expected_reason_pattern"; then
            echo -e "  ${YELLOW}⚠ WARN${NC} - Reason doesn't match pattern: $expected_reason_pattern"
            echo -e "    Got: $reason"
        fi
    fi

    echo -e "  ${GREEN}✓ PASS${NC} - allow=$allow"
    echo -e "    Reason: $reason"
    ((TESTS_PASSED++))
    echo ""
}

# =============================================================================
# Test Suite 1: Basic Authorization (FVEY Coalition)
# =============================================================================

echo -e "${CYAN}═══ Test Suite 1: FVEY Coalition Authorization ═══${NC}"
echo ""

run_test \
    "USA user accessing USA CONFIDENTIAL document (ALLOW)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.usa@mil",
          "clearance": "SECRET",
          "countryOfAffiliation": "USA",
          "acpCOI": ["FVEY"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://usa-idp.dive25.com/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "usa-doc-001",
          "classification": "CONFIDENTIAL",
          "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
          "COI": ["FVEY"]
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "true" \
    "Access granted"

run_test \
    "UK user accessing FVEY SECRET document (ALLOW)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.gbr@mod.uk",
          "clearance": "TOP_SECRET",
          "countryOfAffiliation": "GBR",
          "acpCOI": ["FVEY", "NATO-COSMIC"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://gbr-idp.dive25.com/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "fvey-intel-001",
          "classification": "SECRET",
          "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
          "COI": ["FVEY"]
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "true" \
    "Access granted"

# =============================================================================
# Test Suite 2: Clearance Enforcement
# =============================================================================

echo -e "${CYAN}═══ Test Suite 2: Clearance Level Enforcement ═══${NC}"
echo ""

run_test \
    "CONFIDENTIAL clearance accessing SECRET document (DENY)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "lowclearance.user@mil",
          "clearance": "CONFIDENTIAL",
          "countryOfAffiliation": "USA",
          "acpCOI": [],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://usa-idp.dive25.com/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "classified-doc-001",
          "classification": "SECRET",
          "releasabilityTo": ["USA"],
          "COI": []
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "false" \
    "clearance"

run_test \
    "TOP_SECRET clearance accessing CONFIDENTIAL document (ALLOW)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "highclearance.user@mil",
          "clearance": "TOP_SECRET",
          "countryOfAffiliation": "USA",
          "acpCOI": [],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://usa-idp.dive25.com/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "normal-doc-001",
          "classification": "CONFIDENTIAL",
          "releasabilityTo": ["USA"],
          "COI": []
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "true" \
    "Access granted"

# =============================================================================
# Test Suite 3: Country Releasability
# =============================================================================

echo -e "${CYAN}═══ Test Suite 3: Country Releasability Enforcement ═══${NC}"
echo ""

run_test \
    "France user accessing USA-only document (DENY)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.fra@defense.gouv.fr",
          "clearance": "TOP_SECRET",
          "countryOfAffiliation": "FRA",
          "acpCOI": ["NATO-COSMIC"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://fra-idp.dive25.com/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "usa-only-doc-001",
          "classification": "SECRET",
          "releasabilityTo": ["USA"],
          "COI": []
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "false" \
    "Country"

run_test \
    "Germany user accessing NATO document (ALLOW)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.deu@bundeswehr.de",
          "clearance": "SECRET",
          "countryOfAffiliation": "DEU",
          "acpCOI": ["NATO-COSMIC"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://deu-idp.prosecurity.biz/realms/dive-v3-broker-usa"
        },
        "resource": {
          "resourceId": "nato-doc-001",
          "classification": "CONFIDENTIAL",
          "releasabilityTo": ["USA", "GBR", "FRA", "DEU", "ITA", "ESP", "POL"],
          "COI": ["NATO-COSMIC"]
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "true" \
    "Access granted"

# =============================================================================
# Test Suite 4: Authentication Enforcement
# =============================================================================

echo -e "${CYAN}═══ Test Suite 4: Authentication & Trust Enforcement ═══${NC}"
echo ""

run_test \
    "Unauthenticated user (DENY)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "anonymous.user@unknown",
          "clearance": "TOP_SECRET",
          "countryOfAffiliation": "USA",
          "authenticated": false
        },
        "resource": {
          "resourceId": "any-doc-001",
          "classification": "UNCLASSIFIED",
          "releasabilityTo": ["USA"]
        },
        "action": {"operation": "read"}
      }
    }' \
    "false" \
    "not authenticated"

run_test \
    "Untrusted issuer (DENY)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser@rogue.com",
          "clearance": "SECRET",
          "countryOfAffiliation": "USA",
          "authenticated": true,
          "issuer": "https://rogue-idp.badactor.com/realms/fake"
        },
        "resource": {
          "resourceId": "sensitive-doc-001",
          "classification": "CONFIDENTIAL",
          "releasabilityTo": ["USA"]
        },
        "action": {"operation": "read"}
      }
    }' \
    "false" \
    "Untrusted"

# =============================================================================
# Test Suite 5: COI (Community of Interest) Enforcement
# =============================================================================

echo -e "${CYAN}═══ Test Suite 5: Community of Interest (COI) Enforcement ═══${NC}"
echo ""

run_test \
    "User with FVEY accessing FVEY document (ALLOW)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.can@forces.gc.ca",
          "clearance": "SECRET",
          "countryOfAffiliation": "CAN",
          "acpCOI": ["FVEY", "CAN-US"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://keycloak:8080/realms/dive-v3-can"
        },
        "resource": {
          "resourceId": "fvey-ops-001",
          "classification": "SECRET",
          "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
          "COI": ["FVEY"]
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "true" \
    "Access granted"

run_test \
    "User without required COI (DENY)" \
    '{
      "input": {
        "subject": {
          "uniqueID": "testuser.pol@wp.mil.pl",
          "clearance": "SECRET",
          "countryOfAffiliation": "POL",
          "acpCOI": ["NATO-COSMIC"],
          "authenticated": true,
          "acr": "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
          "amr": ["pwd", "mfa"],
          "issuer": "https://keycloak:8080/realms/dive-v3-pol"
        },
        "resource": {
          "resourceId": "fvey-exclusive-001",
          "classification": "SECRET",
          "releasabilityTo": ["POL", "USA"],
          "COI": ["FVEY"]
        },
        "action": {"operation": "read"},
        "context": {"currentTime": "2026-01-13T17:00:00Z"}
      }
    }' \
    "false" \
    "COI"

# =============================================================================
# Summary
# =============================================================================

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Test Suite Summary                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Tests:  ${TESTS_RUN}"
echo -e "${GREEN}Passed:       ${TESTS_PASSED}${NC}"
echo -e "${RED}Failed:       ${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}End-to-End Authorization Workflow: OPERATIONAL${NC}"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo -e "${YELLOW}Review failures above for details${NC}"
    exit 1
fi
