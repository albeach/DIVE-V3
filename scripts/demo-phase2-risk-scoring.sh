#!/bin/bash

# ===========================================
# Phase 2: Risk Scoring & Compliance Demo
# ===========================================
# Demonstrates comprehensive risk scoring and auto-triage workflow
#
# Prerequisites:
# - Backend running (npm run dev)
# - Valid JWT token with super_admin role
# - MongoDB and OPA available
#
# Usage:
#   ./scripts/demo-phase2-risk-scoring.sh
#   ./scripts/demo-phase2-risk-scoring.sh <JWT_TOKEN>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
JWT_TOKEN="${1:-}"

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Phase 2: Risk Scoring & Compliance Demo               ║"
echo "║     Comprehensive Risk Assessment & Auto-Triage            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if JWT token provided
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  No JWT token provided${NC}"
    echo "Usage: $0 <JWT_TOKEN>"
    echo ""
    echo "To get a token:"
    echo "1. Login to the app at http://localhost:3000"
    echo "2. Open browser DevTools (F12)"
    echo "3. Run: localStorage.getItem('jwt')"
    echo "4. Copy the token and pass it as first argument"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ JWT Token: ${JWT_TOKEN:0:20}...${NC}"
echo ""

# Test 1: Gold Tier (Auto-Approve) - Minimal Risk
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test 1: Gold Tier Submission (Auto-Approve)${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Submitting IdP with perfect risk score...${NC}"
echo "- TLS 1.3 ✅"
echo "- RS256/RS512 algorithms ✅"
echo "- MFA enforced (with policy) ✅"
echo "- IAL2 identity proofing ✅"
echo "- 99.9% uptime SLA ✅"
echo "- 24/7 incident response ✅"
echo "- <30 day patching ✅"
echo "- Multiple support channels ✅"
echo "- ACP-240 certified ✅"
echo "- MFA policy uploaded ✅"
echo ""

GOLD_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-gold-'$(date +%s)'",
    "displayName": "Gold Tier Test IdP",
    "description": "IAL2 government ID with comprehensive audit logging and data-centric security",
    "protocol": "oidc",
    "config": {
      "issuer": "https://accounts.google.com"
    },
    "operationalData": {
      "uptimeSLA": "99.9%",
      "incidentResponse": "24/7",
      "securityPatching": "<30 days",
      "supportContacts": ["noc@example.com", "support@example.com", "+1-555-0100"]
    },
    "complianceDocuments": {
      "acp240Certificate": "acp240-cert.pdf",
      "mfaPolicy": "mfa-enforcement-policy.pdf",
      "dataResidencyDoc": "data-residency-doc.pdf"
    }
  }')

echo -e "${GREEN}Response:${NC}"
echo "$GOLD_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$GOLD_RESPONSE"
echo ""

# Extract score and decision
GOLD_SCORE=$(echo "$GOLD_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('comprehensiveRiskScore', {}).get('total', 'N/A'))" 2>/dev/null || echo "N/A")
GOLD_DECISION=$(echo "$GOLD_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('approvalDecision', {}).get('action', 'N/A'))" 2>/dev/null || echo "N/A")

echo -e "${GREEN}✅ Result: Score = ${GOLD_SCORE}/100, Decision = ${GOLD_DECISION}${NC}"
echo -e "${GREEN}   Expected: Score ≥ 85, Decision = auto-approve${NC}"
echo ""

# Test 2: Silver Tier (Fast-Track) - Low Risk
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test 2: Silver Tier Submission (Fast-Track)${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Submitting IdP with good risk score...${NC}"
echo "- TLS 1.2 ✅"
echo "- RS256 algorithm ✅"
echo "- MFA detected (ACR hints) ✅"
echo "- 99.0% uptime SLA ✅"
echo "- Business hours support ✅"
echo ""

SILVER_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-silver-'$(date +%s)'",
    "displayName": "Silver Tier Test IdP",
    "description": "IAL1 with audit logging",
    "protocol": "oidc",
    "config": {
      "issuer": "https://login.microsoftonline.com/common/v2.0"
    },
    "operationalData": {
      "uptimeSLA": "99.0%",
      "incidentResponse": "business-hours",
      "supportContacts": ["support@example.com"]
    }
  }')

echo -e "${GREEN}Response:${NC}"
echo "$SILVER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$SILVER_RESPONSE"
echo ""

SILVER_SCORE=$(echo "$SILVER_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('comprehensiveRiskScore', {}).get('total', 'N/A'))" 2>/dev/null || echo "N/A")
SILVER_DECISION=$(echo "$SILVER_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('approvalDecision', {}).get('action', 'N/A'))" 2>/dev/null || echo "N/A")

echo -e "${GREEN}✅ Result: Score = ${SILVER_SCORE}/100, Decision = ${SILVER_DECISION}${NC}"
echo -e "${GREEN}   Expected: Score 70-84, Decision = fast-track${NC}"
echo ""

# Test 3: Bronze Tier (Standard Review) - Medium Risk
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test 3: Bronze Tier Submission (Standard Review)${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Submitting IdP with acceptable risk score...${NC}"
echo "- TLS 1.2 ✅"
echo "- RS256 algorithm ✅"
echo "- MFA detected (ACR hints) ⚠️"
echo "- Minimal operational data ⚠️"
echo ""

BRONZE_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-bronze-'$(date +%s)'",
    "displayName": "Bronze Tier Test IdP",
    "description": "Basic IdP with IAL1",
    "protocol": "oidc",
    "config": {
      "issuer": "https://accounts.google.com"
    },
    "operationalData": {
      "supportContacts": ["support@example.com"]
    }
  }')

echo -e "${YELLOW}Response:${NC}"
echo "$BRONZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BRONZE_RESPONSE"
echo ""

BRONZE_SCORE=$(echo "$BRONZE_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('comprehensiveRiskScore', {}).get('total', 'N/A'))" 2>/dev/null || echo "N/A")
BRONZE_DECISION=$(echo "$BRONZE_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('approvalDecision', {}).get('action', 'N/A'))" 2>/dev/null || echo "N/A")

echo -e "${YELLOW}⚠️  Result: Score = ${BRONZE_SCORE}/100, Decision = ${BRONZE_DECISION}${NC}"
echo -e "${YELLOW}   Expected: Score 50-69, Decision = standard-review${NC}"
echo ""

# Test 4: Fail Tier (Auto-Reject) - High Risk
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test 4: Fail Tier Submission (Auto-Reject)${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Submitting IdP with critical issues...${NC}"
echo "- TLS 1.0 ❌ (too old)"
echo "- No operational data ❌"
echo "- No compliance documents ❌"
echo ""

FAIL_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-fail-'$(date +%s)'",
    "displayName": "Fail Tier Test IdP",
    "description": "Legacy IdP with critical issues",
    "protocol": "oidc",
    "config": {
      "issuer": "https://legacy.example.com"
    }
  }')

echo -e "${RED}Response:${NC}"
echo "$FAIL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$FAIL_RESPONSE"
echo ""

FAIL_SCORE=$(echo "$FAIL_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('comprehensiveRiskScore', {}).get('total', 'N/A'))" 2>/dev/null || echo "N/A")
FAIL_DECISION=$(echo "$FAIL_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('approvalDecision', {}).get('action', 'N/A'))" 2>/dev/null || echo "N/A")

echo -e "${RED}❌ Result: Score = ${FAIL_SCORE}/100, Decision = ${FAIL_DECISION}${NC}"
echo -e "${RED}   Expected: Score < 50, Decision = auto-reject${NC}"
echo ""

# Summary
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📊 Phase 2 Demo Summary${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}🥇 Gold Tier:${NC}   Score = ${GOLD_SCORE}, Decision = ${GOLD_DECISION}"
echo -e "${GREEN}🥈 Silver Tier:${NC} Score = ${SILVER_SCORE}, Decision = ${SILVER_DECISION}"
echo -e "${YELLOW}🥉 Bronze Tier:${NC} Score = ${BRONZE_SCORE}, Decision = ${BRONZE_DECISION}"
echo -e "${RED}❌ Fail Tier:${NC}   Score = ${FAIL_SCORE}, Decision = ${FAIL_DECISION}"
echo ""
echo -e "${CYAN}Key Features Demonstrated:${NC}"
echo "✅ 100-point comprehensive risk scoring"
echo "✅ Automated triage (auto-approve, fast-track, standard, reject)"
echo "✅ Compliance validation (ACP-240, STANAG, NIST)"
echo "✅ SLA management (2hr, 24hr deadlines)"
echo "✅ Risk factor analysis (11 factors)"
echo "✅ Actionable recommendations"
echo ""
echo -e "${GREEN}✅ Phase 2 Demo Complete!${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo "- View submissions in admin dashboard"
echo "- Check MongoDB for comprehensive risk scores"
echo "- Review backend logs for decision audit trail"
echo "- Test SLA tracking with updateSLAStatus() method"
echo ""

