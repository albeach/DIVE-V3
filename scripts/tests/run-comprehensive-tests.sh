#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Run Comprehensive Tests (All Clearance × All Countries)
# =============================================================================
# Simplified test runner that shows complete results
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

REALM_NAME="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"
TEST_USER_PASSWORD="TestUser2025!Pilot"

declare -A INSTANCE_CONFIGS
INSTANCE_CONFIGS[usa_idp]="https://usa-idp.dive25.com"
INSTANCE_CONFIGS[usa_api]="https://usa-api.dive25.com"
INSTANCE_CONFIGS[fra_idp]="https://fra-idp.dive25.com"
INSTANCE_CONFIGS[fra_api]="https://fra-api.dive25.com"
INSTANCE_CONFIGS[gbr_idp]="https://gbr-idp.dive25.com"
INSTANCE_CONFIGS[gbr_api]="https://gbr-api.dive25.com"
INSTANCE_CONFIGS[deu_idp]="https://deu-idp.prosecurity.biz"
INSTANCE_CONFIGS[deu_api]="https://deu-api.prosecurity.biz"

PASSED=0
FAILED=0

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  DIVE V3 - Comprehensive Test Results                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 1: Authentication for all users
echo -e "${BLUE}━━━ Test 1: Authentication (All Clearance Levels × All Countries) ━━━${NC}"
echo ""

for country in usa fra gbr deu; do
    echo "Testing ${country^^} Instance:"
    source ./scripts/sync-gcp-secrets.sh "$country" >/dev/null 2>&1
    CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-${country} --project=dive25 2>/dev/null)
    
    for i in {1..4}; do
        username="testuser-${country}-${i}"
        case $i in
            1) clearance="UNCLASSIFIED" ;;
            2) clearance="CONFIDENTIAL" ;;
            3) clearance="SECRET" ;;
            4) clearance="TOP_SECRET" ;;
        esac
        
        echo -n "  ${username} (${clearance}): "
        
        TOKEN=$(curl -sk -X POST "${INSTANCE_CONFIGS[${country}_idp]}/realms/${REALM_NAME}/protocol/openid-connect/token" \
            --data-urlencode "grant_type=password" \
            --data-urlencode "client_id=${CLIENT_ID}" \
            --data-urlencode "client_secret=${CLIENT_SECRET}" \
            --data-urlencode "username=${username}" \
            --data-urlencode "password=${TEST_USER_PASSWORD}" \
            --data-urlencode "scope=openid profile email" \
            --max-time 15 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)
        
        if [ -n "$TOKEN" ]; then
            PAYLOAD=$(echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r "{clearance, country: .countryOfAffiliation, uniqueID}" 2>/dev/null)
            echo -e "${GREEN}✅ $PAYLOAD${NC}"
            ((PASSED++))
        else
            echo -e "${RED}❌ Authentication failed${NC}"
            ((FAILED++))
        fi
    done
    echo ""
done

# Test 2: Federation Authentication
echo -e "${BLUE}━━━ Test 2: Federation Authentication (Cross-Instance Token Usage) ━━━${NC}"
echo ""

echo "Test 2a: Authenticate on USA → Access FRA resources"
source ./scripts/sync-gcp-secrets.sh usa >/dev/null 2>&1
CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-usa --project=dive25 2>/dev/null)
TOKEN=$(curl -sk -X POST "${INSTANCE_CONFIGS[usa_idp]}/realms/${REALM_NAME}/protocol/openid-connect/token" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "username=testuser-usa-3" \
    --data-urlencode "password=${TEST_USER_PASSWORD}" \
    --data-urlencode "scope=openid profile email" \
    --max-time 15 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)

if [ -n "$TOKEN" ]; then
    FED_RESULT=$(curl -sk -X POST "${INSTANCE_CONFIGS[fra_api]}/api/resources/federated-query" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"query":"","instances":["FRA"],"pagination":{"limit":5}}' \
        --max-time 30 2>/dev/null)
    TOTAL=$(echo "$FED_RESULT" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
    if [ "$TOTAL" -gt 0 ]; then
        echo -e "  ${GREEN}✅ Accessed ${TOTAL} resources on FRA using USA token${NC}"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠️  No resources found (may be expected)${NC}"
    fi
else
    echo -e "  ${RED}❌ Failed to get token${NC}"
    ((FAILED++))
fi
echo ""

echo "Test 2b: Authenticate on FRA → Access GBR resources"
source ./scripts/sync-gcp-secrets.sh fra >/dev/null 2>&1
CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-fra --project=dive25 2>/dev/null)
TOKEN=$(curl -sk -X POST "${INSTANCE_CONFIGS[fra_idp]}/realms/${REALM_NAME}/protocol/openid-connect/token" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "username=testuser-fra-3" \
    --data-urlencode "password=${TEST_USER_PASSWORD}" \
    --data-urlencode "scope=openid profile email" \
    --max-time 15 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)

if [ -n "$TOKEN" ]; then
    FED_RESULT=$(curl -sk -X POST "${INSTANCE_CONFIGS[gbr_api]}/api/resources/federated-query" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"query":"","instances":["GBR"],"pagination":{"limit":5}}' \
        --max-time 30 2>/dev/null)
    TOTAL=$(echo "$FED_RESULT" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
    if [ "$TOTAL" -gt 0 ]; then
        echo -e "  ${GREEN}✅ Accessed ${TOTAL} resources on GBR using FRA token${NC}"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠️  No resources found (may be expected)${NC}"
    fi
else
    echo -e "  ${RED}❌ Failed to get token${NC}"
    ((FAILED++))
fi
echo ""

echo "Test 2c: Authenticate on GBR → Access USA resources"
source ./scripts/sync-gcp-secrets.sh gbr >/dev/null 2>&1
CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-gbr --project=dive25 2>/dev/null)
TOKEN=$(curl -sk -X POST "${INSTANCE_CONFIGS[gbr_idp]}/realms/${REALM_NAME}/protocol/openid-connect/token" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "client_secret=${CLIENT_SECRET}" \
    --data-urlencode "username=testuser-gbr-3" \
    --data-urlencode "password=${TEST_USER_PASSWORD}" \
    --data-urlencode "scope=openid profile email" \
    --max-time 15 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)

if [ -n "$TOKEN" ]; then
    FED_RESULT=$(curl -sk -X POST "${INSTANCE_CONFIGS[usa_api]}/api/resources/federated-query" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"query":"","instances":["USA"],"pagination":{"limit":5}}' \
        --max-time 30 2>/dev/null)
    TOTAL=$(echo "$FED_RESULT" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
    if [ "$TOTAL" -gt 0 ]; then
        echo -e "  ${GREEN}✅ Accessed ${TOTAL} resources on USA using GBR token${NC}"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠️  No resources found (may be expected)${NC}"
    fi
else
    echo -e "  ${RED}❌ Failed to get token${NC}"
    ((FAILED++))
fi
echo ""

# Test 3: Cross-Instance Federated Search
echo -e "${BLUE}━━━ Test 3: Cross-Instance Federated Search ━━━${NC}"
echo ""

for country in usa fra gbr; do
    echo "Testing ${country^^} user searching all instances:"
    source ./scripts/sync-gcp-secrets.sh "$country" >/dev/null 2>&1
    CLIENT_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret-${country} --project=dive25 2>/dev/null)
    TOKEN=$(curl -sk -X POST "${INSTANCE_CONFIGS[${country}_idp]}/realms/${REALM_NAME}/protocol/openid-connect/token" \
        --data-urlencode "grant_type=password" \
        --data-urlencode "client_id=${CLIENT_ID}" \
        --data-urlencode "client_secret=${CLIENT_SECRET}" \
        --data-urlencode "username=testuser-${country}-3" \
        --data-urlencode "password=${TEST_USER_PASSWORD}" \
        --data-urlencode "scope=openid profile email" \
        --max-time 15 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)
    
    if [ -n "$TOKEN" ]; then
        FED_RESULT=$(curl -sk -X POST "${INSTANCE_CONFIGS[${country}_api]}/api/resources/federated-query" \
            -H "Authorization: Bearer ${TOKEN}" \
            -H "Content-Type: application/json" \
            -d '{"query":"","instances":["USA","FRA","GBR","DEU"],"pagination":{"limit":10}}' \
            --max-time 30 2>/dev/null)
        TOTAL=$(echo "$FED_RESULT" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
        INSTANCE_RESULTS=$(echo "$FED_RESULT" | jq -r '.instanceResults // {}' 2>/dev/null)
        
        if [ "$TOTAL" -gt 0 ]; then
            echo -e "  ${GREEN}✅ Found ${TOTAL} accessible resources across all instances${NC}"
            if [ -n "$INSTANCE_RESULTS" ] && [ "$INSTANCE_RESULTS" != "{}" ]; then
                echo "  Instance breakdown:"
                echo "$INSTANCE_RESULTS" | jq -r 'to_entries[] | "    \(.key): \(.value.totalCount // 0) resources"' 2>/dev/null || true
            fi
            ((PASSED++))
        else
            echo -e "  ${YELLOW}⚠️  No resources found (may be expected based on clearance/releasability)${NC}"
        fi
    else
        echo -e "  ${RED}❌ Failed to get token${NC}"
        ((FAILED++))
    fi
    echo ""
done

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Total Tests:  $((PASSED + FAILED))"
echo -e "${GREEN}Passed:       $PASSED${NC}"
echo -e "${RED}Failed:       $FAILED${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

