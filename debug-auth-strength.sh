#!/bin/bash
# Debug Authentication Strength Issue
# Check what's happening with the specific document access

BACKEND_URL="${BACKEND_URL:-https://kas.js.usa.divedeeper.internal:4000}"
RESOURCE_ID="doc-generated-1762442152029-9460"

echo "=========================================="
echo "Debugging Authentication Strength Issue"
echo "=========================================="
echo ""
echo "Resource ID: $RESOURCE_ID"
echo ""

# First, let's check what this document's properties are
echo "1. Fetching document metadata from MongoDB..."
docker compose exec -T mongodb mongosh dive-v3-pilot --quiet --eval "
  db.resources.findOne({resourceId: '$RESOURCE_ID'}, {
    resourceId: 1,
    classification: 1,
    clearanceLevel: 1,
    releasabilityTo: 1,
    COI: 1,
    coiOperator: 1,
    _id: 0
  })
" 2>/dev/null || echo "Could not fetch from MongoDB"

echo ""
echo "2. Checking recent OPA decision logs for this resource..."
docker compose logs opa --tail 200 --since 10m 2>&1 | \
  grep -A 50 "$RESOURCE_ID" | \
  grep -E '"classification"|"acr"|"amr"|"clearance"|"allow"|"reason"' | \
  head -30

echo ""
echo "3. Checking backend logs for authentication details..."
docker compose logs backend --tail 200 --since 10m 2>&1 | \
  grep -A 5 -B 5 "testuser-usa-unclass\|Authentication strength" | \
  tail -50

echo ""
echo "4. Key Questions to Answer:"
echo "   - What is the document classification? (UNCLASSIFIED, RESTRICTED, etc.)"
echo "   - What ACR value is the user sending? (0=AAL1, 1=AAL2, 2=AAL3)"
echo "   - What AMR values is the user sending? (e.g., ['pwd'] or ['pwd','otp'])"
echo "   - Is RESTRICTED being treated as 'classified' and requiring AAL2?"
echo ""
echo "5. Expected Behavior:"
echo "   - UNCLASSIFIED: No MFA required (any AAL)"
echo "   - RESTRICTED: Should it require MFA? (Currently: YES, treated as classified)"
echo "   - CONFIDENTIAL+: Definitely requires MFA (AAL2+)"
echo ""







