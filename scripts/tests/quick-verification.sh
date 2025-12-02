#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Quick Verification Summary
# =============================================================================
# Quick checks to verify core functionality is working
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  DIVE V3 - Quick Verification Summary                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 1: Authentication
echo -e "${BLUE}[1/5]${NC} Testing Authentication..."
source ./scripts/sync-gcp-secrets.sh usa >/dev/null 2>&1
CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-usa --project=dive25 2>/dev/null)
TOKEN=$(curl -sk -X POST "https://usa-idp.dive25.com/realms/dive-v3-broker/protocol/openid-connect/token" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=dive-v3-client-broker" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "username=testuser-usa-1" \
    --data-urlencode "password=TestUser2025!Pilot" \
    --data-urlencode "scope=openid profile email" \
    --max-time 10 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)

if [ -n "$TOKEN" ]; then
    echo -e "  ${GREEN}✅ Authentication working${NC}"
else
    echo -e "  ${RED}❌ Authentication failed${NC}"
    exit 1
fi

# Test 2: Local Search
echo -e "${BLUE}[2/5]${NC} Testing Local Search..."
SEARCH_RESULT=$(curl -sk -X POST "https://usa-api.dive25.com/api/resources/search" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"query":"","pagination":{"limit":5}}' \
    --max-time 10 2>/dev/null)

TOTAL_COUNT=$(echo "$SEARCH_RESULT" | jq -r '.totalCount // .totalResults // (.results | length) // 0' 2>/dev/null)
RESULTS_COUNT=$(echo "$SEARCH_RESULT" | jq -r '.results | length // 0' 2>/dev/null)
if [ "$RESULTS_COUNT" -gt 0 ] || [ "$TOTAL_COUNT" -gt 0 ]; then
    echo -e "  ${GREEN}✅ Local search working (${RESULTS_COUNT} results returned)${NC}"
else
    ERROR=$(echo "$SEARCH_RESULT" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$ERROR" ]; then
        echo -e "  ${RED}❌ Local search failed: ${ERROR}${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Local search returned no results (may be OK)${NC}"
    fi
fi

# Test 3: Federated Search
echo -e "${BLUE}[3/5]${NC} Testing Federated Search..."
FED_RESULT=$(curl -sk -X POST "https://usa-api.dive25.com/api/resources/federated-query" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"query":"","instances":["USA"],"pagination":{"limit":5}}' \
    --max-time 15 2>/dev/null)

FED_TOTAL=$(echo "$FED_RESULT" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
if [ "$FED_TOTAL" -gt 0 ]; then
    echo -e "  ${GREEN}✅ Federated search working (${FED_TOTAL} accessible resources)${NC}"
else
    echo -e "  ${RED}❌ Federated search failed${NC}"
fi

# Test 4: OPA Connectivity
echo -e "${BLUE}[4/5]${NC} Testing OPA Connectivity..."
OPA_URL="${OPA_URL:-http://localhost:8181}"
if curl -sk "${OPA_URL}/health" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅ OPA is accessible${NC}"
    
    # Test a simple policy decision
    OPA_RESULT=$(curl -sk -X POST "${OPA_URL}/v1/data/dive/authorization/decision" \
        -H "Content-Type: application/json" \
        -d '{
            "input": {
                "subject": {
                    "uniqueID": "test",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "test",
                    "classification": "UNCLASSIFIED",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        --max-time 5 2>/dev/null)
    
    OPA_ALLOW=$(echo "$OPA_RESULT" | jq -r '.result.allow // false' 2>/dev/null)
    if [ "$OPA_ALLOW" = "true" ]; then
        echo -e "  ${GREEN}✅ OPA policy evaluation working${NC}"
    else
        echo -e "  ${YELLOW}⚠️  OPA accessible but policy evaluation may need review${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  OPA not accessible (may be OK if not running)${NC}"
fi

# Test 5: Resource Counts
echo -e "${BLUE}[5/5]${NC} Checking Resource Counts..."
for inst in usa fra gbr; do
    source ./scripts/sync-gcp-secrets.sh "$inst" >/dev/null 2>&1
    PORT=$(jq -r ".instances.${inst}.services.mongodb.externalPort" config/federation-registry.json)
    DB=$(jq -r ".instances.${inst}.mongodb.database" config/federation-registry.json)
    USER=$(jq -r ".instances.${inst}.mongodb.user" config/federation-registry.json)
    PASS_VAR="MONGO_PASSWORD_$(echo $inst | tr '[:lower:]' '[:upper:]')"
    PASS="${!PASS_VAR}"
    
    COUNT=$(mongosh "mongodb://${USER}:${PASS}@localhost:${PORT}/${DB}?authSource=admin" \
        --quiet --eval "db.resources.countDocuments({})" 2>/dev/null || echo "0")
    
    if [ "$COUNT" -gt 0 ]; then
        echo -e "  ${GREEN}✅ ${inst^^}: ${COUNT} resources${NC}"
    else
        echo -e "  ${RED}❌ ${inst^^}: No resources found${NC}"
    fi
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Verification Complete                                        ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "For detailed tests, run:"
echo "  ./scripts/tests/run-all-verifications.sh"

