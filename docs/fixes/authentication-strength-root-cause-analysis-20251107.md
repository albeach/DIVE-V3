# Authentication Strength Root Cause Analysis (Nov 7, 2025)

## Issue Summary

**User Report**: SECRET USA user cannot access CONFIDENTIAL USA document  
**Error**: "Authentication strength insufficient"  
**Resource**: `doc-generated-1762442164745-10321`  
**URL**: https://kas.js.usa.divedeeper.internal:3000/resources/doc-generated-1762442164745-10321

## Root Causes Identified

### PRIMARY ISSUE: Invalid ACR Value

The user's JWT token contains:
```json
{
  "acr": "otp",
  "amr": ["pwd"]
}
```

#### Problem 1: ACR = "otp" is Not Valid
The backend's `normalizeACR()` function expects ACR to be:
- **Numeric**: `0` (AAL1), `1` (AAL2), `2` (AAL3)
- **URN Format**: Contains "bronze", "silver", "gold", "aal1", "aal2", "aal3"

The value `"otp"` does NOT match any valid pattern, so it defaults to AAL1 (0):

```typescript
// backend/src/middleware/authz.middleware.ts:512
function normalizeACR(acr: string | number | undefined): number {
    //... 
    // Fallback: Unknown format, default to AAL1 (fail-secure)
    logger.warn('Unknown ACR format, defaulting to AAL1 (fail-secure)', { acr });
    return 0;
}
```

#### Problem 2: Only 1 Authentication Factor
The token has `amr: ["pwd"]` (password only) instead of `["pwd", "otp"]` (password + OTP).

The AAL2 validation requires:
```typescript
// Either ACR >= 1 (AAL2+) OR 2+ AMR factors
const isAAL2 = aal >= 1;
const hasMFA = amrArray.length >= 2;
if (!isAAL2 && !hasMFA) {
    throw new Error('AAL2 required');
}
```

Since ACR=0 (AAL1) and only 1 factor, **both conditions fail**.

---

## Why ACR = "otp" Instead of Correct Value?

This is likely a **Keycloak mapper configuration issue**. The ACR claim should be set by:

### Expected ACR Mappers (from terraform/keycloak-dynamic-acr-amr.tf):
1. **Hardcoded Mapper** (Phase 1): Sets ACR="1" for users with MFA credential
2. **Dynamic Mapper** (Phase 2): Custom SPI that calculates ACR from session notes

Possible causes:
1. **Custom SPI Not Deployed**: The dynamic ACR/AMR mapper SPI isn't loaded
2. **Mapper Misconfiguration**: The protocol mapper is disabled or has wrong claim name
3. **Session Note Issue**: Keycloak authentication flow isn't writing correct session notes
4. **Legacy Mapper Conflict**: An older mapper is overwriting the correct value with "otp"

---

## Secondary Issue: Frontend Shows "Classification UNKNOWN"

The frontend displays `Classification UNKNOWN, Releasability NULL` because:
1. Backend **denies access** due to AAL2 failure (403 Forbidden)
2. Frontend **never receives** the resource metadata
3. Without metadata, UI falls back to "UNKNOWN" placeholders

This is a **cascade failure**, not a separate bug. Fixing the ACR issue will resolve both problems.

---

## OPA Policy Evaluation

The backend AAL validation happens **BEFORE** calling OPA:

```typescript
// backend/src/middleware/authz.middleware.ts:1295
// Step 4.5: Validate AAL BEFORE calling OPA
try {
    validateAAL2(decodedToken, classification);
} catch (error) {
    // Deny access and return 403
    res.status(403).json({
        error: 'Forbidden',
        message: 'Authentication strength insufficient',
        details: {...}
    });
    return; // ← Never reaches OPA
}
```

Because AAL validation fails early, OPA is **never called**, so:
- No OPA decision reason
- No human-readable rejection rationale
- No evaluation_details from OPA

The frontend only sees the backend middleware's generic error message.

---

## Verification: What User Should Have

For a **SECRET USA** user to access **CONFIDENTIAL USA** documents:

### Required Claims:
```json
{
  "uniqueID": "john.doe",
  "clearance": "SECRET",           // ✅ Sufficient (SECRET > CONFIDENTIAL)
  "countryOfAffiliation": "USA",   // ✅ Matches releasability
  "acpCOI": ["US-ONLY"],           // ✅ (if resource has COI requirement)
  
  // ❌ PROBLEM: Invalid ACR/AMR
  "acr": "otp",                    // Should be "1" or "2"
  "amr": ["pwd"]                   // Should be ["pwd", "otp"]
}
```

### What Backend Expects:
```json
{
  "acr": "1",                      // Numeric AAL2
  "amr": ["pwd", "otp"]            // 2+ factors
}
```

OR (legacy URN format):
```json
{
  "acr": "urn:mace:incommon:iap:silver",  // Contains "silver"
  "amr": ["pwd", "otp"]
}
```

---

## Fixes Required

### Fix 1: Keycloak ACR Mapper Configuration

**Option A: Verify Dynamic SPI Deployment** (Preferred)
```bash
# Check if custom SPI is deployed
docker exec dive-v3-keycloak ls -la /opt/keycloak/providers/

# Should see: keycloak-dynamic-acr-amr-spi.jar
```

If missing, deploy the SPI:
```bash
# Rebuild and deploy SPI
cd keycloak-spi/
./build.sh
docker cp target/keycloak-dynamic-acr-amr-spi.jar dive-v3-keycloak:/opt/keycloak/providers/
docker restart dive-v3-keycloak
```

**Option B: Fix Hardcoded Mapper** (Quick Fix)
Update Terraform to set correct ACR value:
```hcl
# terraform/usa-broker.tf
resource "keycloak_openid_user_attribute_protocol_mapper" "usa_acr" {
  name            = "USA ACR Mapper"
  realm_id        = keycloak_realm.usa.id
  client_id       = keycloak_openid_client.usa_client.id
  claim_name      = "acr"
  user_attribute  = "acr"
  
  # FIX: Add default value if attribute missing
  claim_value_type = "String"
  add_to_id_token  = true
  add_to_access_token = true
  add_to_userinfo  = false
  
  # NEW: Add script mapper to check MFA credential
  multivalued = false
}
```

**Option C: Update User Attributes** (Immediate Workaround)
Manually set ACR attribute for test users:
```bash
# Keycloak Admin Console > Users > [user] > Attributes
acr = 1
amr = ["pwd","otp"]
```

### Fix 2: Enhance Error Message (Backend)

Update `backend/src/middleware/authz.middleware.ts` to provide clearer guidance:

```typescript
// Line 1321-1334
res.status(403).json({
    error: 'Forbidden',
    message: 'Authentication strength insufficient',
    details: {
        required_aal: 'AAL2 (ACR >= 1 OR 2+ factors)',
        user_aal: `AAL${normalizedAAL + 1}`,
        user_acr: decodedToken?.acr || 'missing',
        user_amr: decodedToken?.amr || [],
        classification,
        // NEW: Actionable guidance
        reason: decodedToken?.acr === 'otp' || decodedToken?.acr === 'pwd' 
            ? 'Invalid ACR format detected. Expected numeric (0,1,2) or string (aal1/aal2/silver/gold). Received: ' + decodedToken.acr
            : 'Insufficient authentication factors',
        actions: [
            'Verify Keycloak ACR mapper configuration',
            'Check if custom ACR/AMR SPI is deployed',
            'User may need to enroll in MFA (OTP/WebAuthn)',
            'Re-authenticate to obtain fresh tokens with correct ACR'
        ]
    }
});
```

### Fix 3: Frontend Error Display

Update `frontend/src/components/authz/access-denied.tsx` to show actionable error details:

```typescript
{denial?.details?.actions && (
  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
    <h4 className="font-semibold text-yellow-900 mb-2">Recommended Actions:</h4>
    <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
      {denial.details.actions.map((action, i) => (
        <li key={i}>{action}</li>
      ))}
    </ul>
  </div>
)}
```

---

## Testing the Fix

### 1. Verify ACR Mapper is Working
```bash
# Get user token
export TOKEN="<user-jwt-token>"

# Decode and inspect ACR/AMR
echo $TOKEN | cut -d'.' -f2 | base64 -d | jq '.acr, .amr'
# Should show:
# "1"  or  "urn:mace:incommon:iap:silver"
# ["pwd", "otp"]
```

### 2. Test Backend AAL Validation
```bash
# Try to access classified resource
curl -k https://localhost:4000/api/resources/doc-generated-1762442164745-10321 \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Request-Id: test-123"

# Should return 200 OK (not 403)
```

### 3. Verify OPA is Called
Check backend logs for OPA decision:
```bash
docker logs dive-v3-backend 2>&1 | grep "OPA decision"
# Should see: "OPA decision received" with allow=true
```

---

## Expected Behavior After Fix

1. **ACR Claim**: Token contains `acr: "1"` (AAL2) or `acr: "2"` (AAL3)
2. **AMR Claim**: Token contains `amr: ["pwd", "otp"]` (2+ factors)
3. **Backend Validation**: AAL2 validation passes
4. **OPA Evaluation**: Policy is called and evaluates clearance/country/COI
5. **Authorization Decision**: ALLOW (SECRET > CONFIDENTIAL, USA in [USA])
6. **Frontend Display**: Shows correct classification, releasability, COI

---

## Monitoring & Prevention

### 1. Add Telemetry for ACR Normalization
Log all ACR values that fail normalization:
```typescript
if (!valid_acr_format) {
    logger.error('INVALID_ACR_FORMAT_DETECTED', {
        acr: decodedToken.acr,
        uniqueID: decodedToken.uniqueID,
        iss: decodedToken.iss,
        // Alert ops team
        severity: 'HIGH',
        action_required: 'Check Keycloak ACR mapper configuration'
    });
}
```

### 2. Healthcheck for Keycloak Mappers
Create `/api/health/keycloak-config` endpoint:
```typescript
// Check if ACR/AMR mappers are configured
const mappers = await getKeycloakProtocolMappers();
const hasACRMapper = mappers.some(m => m.name === 'ACR Mapper');
const hasAMRMapper = mappers.some(m => m.name === 'AMR Mapper');

return {
    acr_mapper: hasACRMapper ? 'OK' : 'MISSING',
    amr_mapper: hasAMRMapper ? 'OK' : 'MISSING',
    spi_deployed: checkSPIDeployed(),
};
```

### 3. E2E Test Coverage
Add test case for AAL2 enforcement:
```typescript
// tests/e2e/aal2-enforcement.spec.ts
test('AAL1 user denied access to classified resource', async () => {
  const aal1Token = await getTokenWithACR('0', ['pwd']);
  const response = await fetch('/api/resources/classified-doc', {
    headers: { Authorization: `Bearer ${aal1Token}` }
  });
  expect(response.status).toBe(403);
  expect(response.json()).toMatchObject({
    error: 'Forbidden',
    message: 'Authentication strength insufficient'
  });
});
```

---

## Summary

| Issue | Root Cause | Impact | Fix |
|-------|-----------|--------|-----|
| ACR = "otp" | Keycloak mapper misconfigured | Defaults to AAL1 | Deploy/fix ACR mapper |
| AMR = ["pwd"] | User hasn't enrolled MFA | Only 1 factor | User enrolls OTP/WebAuthn |
| Classification UNKNOWN | Backend denies before resource fetch | Frontend can't display metadata | Fixed by above |
| No OPA rationale | AAL check happens before OPA call | Less informative error | Working as designed |

**Primary Action**: Fix Keycloak ACR mapper to output numeric ACR ("1", "2") or valid URN format.

**Secondary Action**: Ensure users with classified access have enrolled in MFA (OTP/WebAuthn).

---

## References

- `backend/src/middleware/authz.middleware.ts` lines 477-514 (normalizeACR)
- `backend/src/middleware/authz.middleware.ts` lines 579-631 (validateAAL2)
- `terraform/keycloak-dynamic-acr-amr.tf` (mapper configuration)
- `policies/fuel_inventory_abac_policy.rego` lines 750-784 (OPA AAL check)
- `docs/IDENTITY-ASSURANCE-LEVELS.md` (AAL requirements)





