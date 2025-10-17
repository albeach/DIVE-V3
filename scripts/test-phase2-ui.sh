#!/bin/bash

# Test Phase 2 UI by creating submissions with different risk tiers
# Usage: ./scripts/test-phase2-ui.sh <JWT_TOKEN>

set -e

JWT_TOKEN="${1:-}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

if [ -z "$JWT_TOKEN" ]; then
    echo "❌ Error: JWT token required"
    echo "Usage: $0 <JWT_TOKEN>"
    echo ""
    echo "To get a token:"
    echo "1. Login at http://localhost:3000"
    echo "2. Open DevTools → Console"
    echo "3. Run: localStorage.getItem('jwt')"
    exit 1
fi

echo "🧪 Creating Phase 2 test submissions..."
echo ""

# Create Gold Tier Submission (will be auto-approved but we can see it briefly)
echo "1. Creating Gold Tier submission (85+ points)..."
curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-gold-ui-'$(date +%s)'",
    "displayName": "Gold Tier Test - UI Demo",
    "description": "IAL2 government ID with comprehensive audit logging and ABAC support",
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
      "acp240Certificate": "acp-240-cert.pdf",
      "mfaPolicy": "mfa-enforcement-policy.pdf",
      "dataResidencyDoc": "data-residency.pdf"
    }
  }' | python3 -m json.tool | head -30

echo ""
echo "2. Creating Silver Tier submission (70-84 points, Fast-Track)..."
curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-silver-ui-'$(date +%s)'",
    "displayName": "Silver Tier Test - UI Demo",
    "description": "IAL1 with basic audit logging",
    "protocol": "oidc",
    "config": {
      "issuer": "https://login.microsoftonline.com/common/v2.0"
    },
    "operationalData": {
      "uptimeSLA": "99.0%",
      "incidentResponse": "business-hours",
      "supportContacts": ["support@example.com"]
    }
  }' | python3 -m json.tool | head -30

echo ""
echo "3. Creating Bronze Tier submission (50-69 points, Standard Review)..."
curl -s -X POST "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "test-bronze-ui-'$(date +%s)'",
    "displayName": "Bronze Tier Test - UI Demo",  
    "description": "Basic IdP minimal config",
    "protocol": "oidc",
    "config": {
      "issuer": "https://accounts.google.com"
    },
    "operationalData": {
      "supportContacts": ["support@example.com"]
    }
  }' | python3 -m json.tool | head -30

echo ""
echo "✅ Test submissions created!"
echo ""
echo "📋 Now check MongoDB:"
mongosh dive-v3 --eval "db.idp_submissions.find({status: 'pending'}, {alias: 1, 'comprehensiveRiskScore.total': 1, 'comprehensiveRiskScore.tier': 1, slaDeadline: 1}).pretty()"

echo ""
echo "🌐 View in UI:"
echo "   http://localhost:3000/admin/approvals"
echo ""
echo "You should now see:"
echo "   - Risk score badges (Gold/Silver/Bronze)"
echo "   - Risk breakdowns"
echo "   - Compliance cards"
echo "   - SLA countdowns"
echo "   - Risk factor analysis"

