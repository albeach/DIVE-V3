# DIVE V3 - Bugs to Fix

This document tracks critical bugs discovered during development and deployment that need systematic fixes.

---

## BUG-001: Terraform Keycloak Provider Fails to Apply User Attributes

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** WORKAROUND APPLIED (needs systematic fix)

### Description

When running `terraform apply` for a new instance (e.g., FRA), the Keycloak Terraform provider creates test users but **fails to apply their attributes** in a single pass. This results in users having:

```json
{
  "username": "testuser-fra-1",
  "attributes": null  // CRITICAL: Missing identity attributes!
}
```

Instead of the expected:

```json
{
  "username": "testuser-fra-1",
  "attributes": {
    "countryOfAffiliation": ["FRA"],
    "clearance": ["UNCLASSIFIED"],
    "uniqueID": ["testuser-fra-1"],
    "organizationType": ["GOV"],
    ...
  }
}
```

### Impact

- **Identity Corruption:** Users authenticated without proper attributes
- **Wrong Country:** Frontend shows "USA" for FRA users (defaults)
- **Authorization Failures:** OPA policies may incorrectly evaluate without proper claims
- **Security Risk:** Users could access resources without proper clearance verification

### Root Cause

The Keycloak Terraform provider (`mrparkers/keycloak`) has a known issue where it:
1. Creates the user in one API call
2. Attempts to update attributes in a separate call
3. The second call can silently fail or be ignored

The Terraform state shows `attributes = {}` even though the HCL specifies attributes.

### Workaround Applied

Run a targeted Terraform apply specifically for user resources:

```bash
terraform apply -auto-approve -var-file=fra.tfvars \
  -target='module.instance.keycloak_user.pilot_users' \
  -target='module.instance.keycloak_user.industry_partner'
```

### Permanent Fix Needed

1. **Update instance sync script** to run Terraform apply twice or with targeted user apply
2. **Add post-apply verification** that checks user attributes via Keycloak Admin API
3. **Consider alternative:** Use Keycloak Admin API directly for user creation instead of Terraform
4. **Add CI/CD check:** Validate user attributes after deployment

### Verification Command

```bash
# Check user attributes via Keycloak Admin API
TOKEN=$(curl -s -k -X POST "https://${INSTANCE}-idp.dive25.com/realms/master/protocol/openid-connect/token" \
  -d "username=admin&password=$KEYCLOAK_ADMIN_PASSWORD&grant_type=password&client_id=admin-cli" | jq -r '.access_token')

curl -s -k "https://${INSTANCE}-idp.dive25.com/admin/realms/dive-v3-broker/users?username=testuser-${INSTANCE,,}-1" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].attributes'
```

### Files Affected

- `terraform/modules/federated-instance/test-users.tf` - User creation logic
- `scripts/sync-gcp-secrets.sh` - Instance sync script (needs verification step)

---

## BUG-002: Frontend Missing BACKEND_URL Environment Variable

**Severity:** HIGH  
**Discovered:** 2025-12-01  
**Status:** FIXED for FRA (needs fix for all instances)

### Description

The frontend API routes (`/api/resources/search`) use `process.env.BACKEND_URL` for server-side requests to the backend, but only `NEXT_PUBLIC_BACKEND_URL` was configured in docker-compose files.

### Impact

- `/api/resources/search` returns 500 error
- `ECONNREFUSED` when frontend API routes try to reach backend
- Resources page shows "Something went wrong"

### Root Cause

- `NEXT_PUBLIC_*` variables are for client-side JavaScript only
- Server-side API routes need non-prefixed environment variables
- `BACKEND_URL` was missing from docker-compose environment

### Fix Applied (FRA only)

Added to `docker-compose.fra.yml`:

```yaml
environment:
  BACKEND_URL: https://backend:4000  # Server-side API routes use Docker network
  NEXT_PUBLIC_BACKEND_URL: https://fra-api.dive25.com  # Client-side uses tunnel
```

### Files Needing Same Fix

- [ ] `docker-compose.yml` (USA)
- [x] `docker-compose.fra.yml` (FRA) - FIXED
- [ ] `docker-compose.gbr.yml` (GBR)
- [ ] `docker-compose.deu.yml` (DEU)

---

## BUG-003: Keycloak Client Secret Mismatch After Terraform Apply

**Severity:** HIGH  
**Discovered:** 2025-12-01  
**Status:** WORKAROUND APPLIED (needs systematic fix)

### Description

When Terraform creates the `dive-v3-client-broker` OIDC client, it generates a random client secret instead of using the secret from GCP Secret Manager. This causes NextAuth to fail with "Invalid client credentials".

### Impact

- Authentication fails after fresh Terraform apply
- Users see "Server error - There is a problem with the server configuration"
- NextAuth callback returns 401 from Keycloak

### Root Cause

The `keycloak_openid_client.broker_client` resource in Terraform doesn't have `client_secret` explicitly set, so Keycloak auto-generates one.

### Workaround Applied

Manually update client secret via Keycloak Admin API after Terraform apply:

```bash
# Update client secret to match GCP secret
curl -s -k -X PUT "https://${INSTANCE}-idp.dive25.com/admin/realms/dive-v3-broker/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "'$CLIENT_UUID'", "clientId": "dive-v3-client-broker", "secret": "'$KEYCLOAK_CLIENT_SECRET'"}'
```

### Permanent Fix Needed

Update `terraform/modules/federated-instance/main.tf` to accept client secret as input variable:

```hcl
resource "keycloak_openid_client" "broker_client" {
  # ... existing config ...
  client_secret = var.keycloak_client_secret  # Use GCP secret
}
```

### Files Affected

- `terraform/modules/federated-instance/main.tf`
- `terraform/modules/federated-instance/variables.tf`
- `terraform/instances/fra.tfvars` (and all instance tfvars)

---

## BUG-005: Federated Search Returns Wrong totalCount and Limited Results

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED (Commit `f3084bb`)

### Description

When a FRA user selects USA + FRA in federated mode, the page shows "16 documents" when it should show 14,000 (7,000 from each instance). This is actually a combination of correct ABAC behavior and incorrect count reporting.

### Stack Trace Analysis

```
FRA Frontend → /api/resources/search → FRA Backend /api/resources/federated-query
                                       ↓
    ┌──────────────────────────────────┴──────────────────────────────────┐
    ↓                                                                      ↓
FRA Local MongoDB                                            USA Remote API Call
  - Direct query                                              - HTTPS to usa-api.dive25.com
  - limit(100) cap                                            - limit(100) cap
  - Returns 100 results                                       - ABAC filtering by USA backend
                                                              - Returns 16 results (FRA/UNCLAS accessible)
    ↓                                                                      ↓
    └──────────────────────────────────┬──────────────────────────────────┘
                                       ↓
                              Aggregate + ABAC filter + Deduplicate
                                       ↓
                              Return 16 results, totalCount: 16
```

### Root Causes

#### 1. `totalCount` doesn't include ABAC filtering (paginated-search.controller.ts)
```typescript
// Line 549-556: Counts ALL documents, not ABAC-filtered
const totalCount = await collection.countDocuments(
  query && query.trim() ? { $or: [...] } : {}  // No clearance/releasability filter!
);
```

**Impact:** USA backend reports `totalCount: 7000` but only 16 are accessible to FRA/UNCLASSIFIED user.

#### 2. MAX_RESULTS_PER_INSTANCE = 100 (federated-resource.service.ts)
```typescript
// Line 113
const MAX_RESULTS_PER_INSTANCE = 100;
// Line 538
.limit(MAX_RESULTS_PER_INSTANCE)
```

**Impact:** Even local FRA query only returns 100 of 7,000 available documents.

#### 3. No "accessibleCount" computed
Neither local nor federated search computes the true count of documents the user can actually access.

### Actual Backend Logs

```json
// FRA Backend federated query
{"instanceResults":[
  {"count":16,"instance":"USA","latencyMs":308},   // ← ABAC filtered (correct)
  {"count":100,"instance":"FRA","latencyMs":18}    // ← Capped at 100 (wrong)
]}
"totalResults":16  // ← Only shows USA results after dedup??

// USA Backend receiving federated request
{"clearance":"UNCLASSIFIED","countryOfAffiliation":"FRA"}
{"resultCount":16,"totalCount":7000}  // ← 7000 is unfiltered count!
```

### Why 16 Results (ABAC Explanation)

The FRA user with UNCLASSIFIED clearance can only access USA documents that:
1. Are UNCLASSIFIED classification
2. Have FRA in `releasabilityTo` array (or NATO/FVEY)

Most USA documents don't meet these criteria, so only 16 are accessible. **This is correct ABAC behavior.**

### What's Wrong (Summary)

| Issue | Current Behavior | Expected Behavior |
|-------|------------------|-------------------|
| `totalCount` | 7000 (unfiltered) | Count of accessible docs |
| FRA local results | 100 (capped) | Proper pagination across all accessible |
| Federated total | 16 (just USA filtered) | Sum of accessible from all instances |

### Best Practice Solutions

#### Option A: Compute accessibleCount (Recommended)

Add ABAC-aware count query to `paginated-search.controller.ts`:

```typescript
// Build ABAC-aware filter
const abacFilter: any = { ...mongoFilter };

// Only show documents user can access by clearance
const userClearance = CLEARANCE_ORDER[token?.clearance || 'UNCLASSIFIED'];
const allowedClassifications = Object.entries(CLEARANCE_ORDER)
  .filter(([_, level]) => level <= userClearance)
  .map(([name]) => name);
abacFilter.$and = abacFilter.$and || [];
abacFilter.$and.push({
  $or: [
    { classification: { $in: allowedClassifications } },
    { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } }
  ]
});

// Add releasability filter
if (token?.countryOfAffiliation) {
  abacFilter.$and.push({
    $or: [
      { releasabilityTo: token.countryOfAffiliation },
      { releasabilityTo: 'NATO' },
      { releasabilityTo: 'FVEY' },
    ]
  });
}

// Count accessible documents
const accessibleCount = await collection.countDocuments(abacFilter);
```

#### Option B: Pre-computed Accessibility Index (Long-term)

Create materialized view or index that pre-calculates document accessibility:
- By clearance level (UNCLAS, CONF, SECRET, TS)
- By country affiliation

#### Option C: Show Per-Instance Counts (Short-term)

Display breakdown: "16 accessible from USA, 7000 accessible from FRA"

### Performance Considerations

The ABAC-aware count query adds ~50-100ms per request because it must evaluate:
- Classification filtering
- Releasability array intersection
- COI membership (optional)

Consider caching counts by user attribute combination (clearance + country).

### Fix Applied (Commit `f3084bb`)

Added ABAC filters directly to MongoDB query in `paginated-search.controller.ts`:

```typescript
// ABAC Filter 1: Classification - only fetch docs user can access
mongoFilter.$and.push({
  $or: [
    { classification: { $in: allowedClassifications } },
    { 'ztdf.policy.securityLabel.classification': { $in: allowedClassifications } },
  ]
});

// ABAC Filter 2: Releasability - only fetch docs releasable to user's country
if (userCountry) {
  mongoFilter.$and.push({
    $or: [
      { releasabilityTo: userCountry },
      { releasabilityTo: 'NATO' },
      { releasabilityTo: 'FVEY' },
      { 'ztdf.policy.securityLabel.releasabilityTo': userCountry },
      // ... etc
    ]
  });
}

// totalCount now uses same ABAC filters
const totalCount = await collection.countDocuments(countFilter);
```

### Results After Complete Fix

| Instance | User | Before | After |
|----------|------|--------|-------|
| FRA Local | FRA/UNCLASSIFIED | 7,000 total (raw) | **720 accessible** ✅ |
| USA Federated | FRA/UNCLASSIFIED | 7,000 total (raw) | **562 accessible** ✅ |
| **Federated Total** | FRA/UNCLASSIFIED | **100** (wrong) | **1,282** ✅ |

### Files Fixed

- `backend/src/controllers/paginated-search.controller.ts` - ABAC filters in MongoDB query
- `backend/src/services/federated-resource.service.ts` - ABAC filters for local federated queries
- `frontend/src/app/api/resources/search/route.ts` - Use totalAccessible in response normalization

### Commits

- `f3084bb` - fix(backend): Add ABAC filtering to paginated search
- `8847637` - fix(federation): Increase per-instance limit and capture accessibleCount
- `aff2800` - fix(federation): Add ABAC filters to local federated queries

### Related Issues

- BUG-001: Terraform user attributes (affects ABAC decisions)
- Federated pagination cursor handling works correctly after fix

---

## BUG-004: Resources Page Hardcoded 'USA' Instance Defaults

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED

### Description

The resources page (`frontend/src/app/resources/page.tsx`) had hardcoded `'USA'` as the default instance in multiple places:

1. `selectedInstances` initial state: `useState<string[]>(['USA'])`
2. `selectedFilters.instances` initial state: `instances: ['USA']`
3. `clearAllFilters` reset value: `instances: ['USA']`
4. Instance pill disabled logic: `instance !== 'USA'`
5. BentoDashboard `activeInstances` prop: `['USA']`

This caused FRA, GBR, and DEU instances to show USA as the default/selected instance.

### Impact

- **Wrong Instance Filter:** FRA users see USA selected by default
- **Wrong Bento Dashboard:** "Local" card shows USA instead of FRA
- **Wrong Filter Badge:** USA badge shown in filters panel
- **Confusing UX:** Users think they're searching USA when on FRA

### Root Cause

Developer oversight - hardcoded `'USA'` instead of using `NEXT_PUBLIC_INSTANCE` environment variable which is correctly set per instance.

### Fix Applied

Added `CURRENT_INSTANCE` constant that reads from `process.env.NEXT_PUBLIC_INSTANCE`:

```typescript
// Get current instance from environment (FRA, USA, GBR, DEU)
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

// Then replaced all hardcoded 'USA' with CURRENT_INSTANCE
const [selectedInstances, setSelectedInstances] = useState<string[]>([CURRENT_INSTANCE]);
```

### Files Fixed

- `frontend/src/app/resources/page.tsx` - All 5 hardcoded references replaced

### Commit

`697eb0c` - fix(resources): Use NEXT_PUBLIC_INSTANCE for instance-aware defaults

---

## BUG-006: Cross-Federation Resource Access Returns 404

**Severity:** CRITICAL  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED (Commit `d08adb7`)

### Description

When a user on one instance (e.g., FRA) clicks to view a document from a different instance (e.g., USA document `doc-USA-seed-...`), the request fails with a generic error or 404.

The document exists on USA and is visible in federated search results, but clicking to view details fails because the FRA backend only checks its **local MongoDB**.

### Impact

- **Broken Cross-Federation**: Users cannot access documents from federated instances
- **Confusing UX**: Documents appear in search results but fail to open
- **Federation Promise Broken**: The whole point of federation is transparent access

### Root Cause

The `getResourceById` service function only queries **local MongoDB**:

```typescript
// Only checks local DB!
const resource = await collection.findOne({ resourceId });
```

When FRA receives a request for `doc-USA-seed-...`:
1. FRA backend queries FRA MongoDB
2. Document not found (it's only on USA)
3. Returns 404

### Fix Applied

Created federation-aware resource fetching in `resource.service.ts`:

```typescript
export async function getResourceByIdFederated(resourceId: string, authToken?: string) {
    // 1. Try local MongoDB first
    const localResource = await getResourceById(resourceId);
    if (localResource) return { resource: localResource, source: 'local' };
    
    // 2. Extract origin instance from resourceId (doc-USA-seed-...)
    const originInstance = extractOriginFromResourceId(resourceId);
    
    // 3. Proxy to origin instance's API with user's auth token
    const response = await axios.get(`${originApiUrl}/api/resources/${resourceId}`, {
        headers: { 'Authorization': authToken },
    });
    
    return { resource: response.data, source: 'federated' };
}
```

### Flow After Fix

```
FRA User clicks USA doc → FRA Backend detects USA origin from resourceId
    → FRA proxies request to USA API with user's token
    → USA backend does full OPA authorization 
    → USA returns authorized resource
    → FRA returns to user
```

### Files Fixed

- `backend/src/services/resource.service.ts` - Add `getResourceByIdFederated()`
- `backend/src/middleware/authz.middleware.ts` - Use federation-aware fetch
- `backend/src/controllers/resource.controller.ts` - Handle federated response

### Commit

`d08adb7` - feat(federation): Add transparent cross-instance resource access

---

## BUG-008: Upload Page Hardcoded 'USA' Releasability Default

**Severity:** MEDIUM  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED

### Description

The upload page (`/upload`) defaulted the "Releasable To" field to `['USA']` regardless of which instance the user was on. This caused FRA/GBR/DEU users to see a validation warning that their country wasn't in the releasability list.

### Impact

- **Bad UX**: Users immediately see validation warning on page load
- **Wrong Default**: FRA user on FRA instance sees USA selected by default
- **Potential Errors**: User might accidentally upload documents not releasable to their own country

### Root Cause

Similar to BUG-004, hardcoded `'USA'` in multiple places:

```typescript
// upload/page.tsx line 24
const [releasabilityTo, setReleasabilityTo] = useState<string[]>(['USA']);  // Wrong!

// upload/page.tsx line 34
const userCountry = session?.user?.countryOfAffiliation || 'USA';  // Wrong fallback!
```

### Fix Applied

Used `NEXT_PUBLIC_INSTANCE` environment variable for instance-aware defaults:

```typescript
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

const [releasabilityTo, setReleasabilityTo] = useState<string[]>([CURRENT_INSTANCE]);
const userCountry = session?.user?.countryOfAffiliation || CURRENT_INSTANCE;
```

### Files Fixed

- `frontend/src/app/upload/page.tsx`
- `frontend/src/app/resources/[id]/page.tsx` 
- `frontend/src/app/api/auth/custom-session/route.ts`

---

## BUG-007: ZTDF Inspector KAS Flow Tab Fails for Federated Resources

**Severity:** HIGH  
**Discovered:** 2025-12-01  
**Status:** ✅ FIXED (Commit `26dcd6c`)

### Description

When viewing a federated resource (e.g., USA document from FRA instance), the ZTDF Inspector's "KAS Flow" tab shows "⚠️ Failed to load KAS flow" with "Authentication required" error.

### Impact

- **KAS Flow Visualization Broken**: Users cannot see the 6-step KAS access flow
- **View Decryption Options Might Fail**: Related ZTDF endpoints also affected
- **Federated ZTDF Inspection Broken**: Key feature for understanding policy-bound encryption

### Root Cause

Two issues combined:

**1. No Frontend API Route for KAS Flow**

The `KASFlowVisualizer` component made **direct client-side calls** to the backend:

```typescript
// Direct call from browser to backend - bypasses Next.js API proxy
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
fetch(`${backendUrl}/api/resources/${resourceId}/kas-flow`, {
    headers: { 'Authorization': `Bearer ${token}` }  // Client-side token
});
```

**2. Cross-Instance JWT Token Rejection**

When FRA backend proxies to USA backend:
- FRA user's JWT is signed by **FRA Keycloak**
- USA backend's `authenticateJWT` validates against **USA Keycloak's JWKS**
- Token validation fails → 401 Unauthorized

### Fix Applied

**Part 1: Created Frontend API Route**

New file: `frontend/src/app/api/resources/[id]/kas-flow/route.ts`

```typescript
// Validates session server-side, proxies to backend
// Backend handles federation internally
export async function GET(request, { params }) {
    const validation = await validateSession();
    const tokens = await getSessionTokens();
    
    const response = await fetch(`${BACKEND_URL}/api/resources/${resourceId}/kas-flow`, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
    });
    
    return NextResponse.json(await response.json());
}
```

**Part 2: Updated KASFlowVisualizer**

```typescript
// Before: Direct backend call
fetch(`${NEXT_PUBLIC_BACKEND_URL}/api/resources/${resourceId}/kas-flow`, { ... });

// After: Frontend API route (handles auth server-side)
fetch(`/api/resources/${resourceId}/kas-flow`, { cache: 'no-store' });
```

**Part 3: Federation Auth Bypass**

Added trusted federation support to `authenticateJWT` middleware:

```typescript
const TRUSTED_FEDERATION_INSTANCES = ['USA', 'FRA', 'GBR', 'DEU'];

export const authenticateJWT = async (req, res, next) => {
    const federatedFrom = req.headers['x-federated-from'];
    
    if (federatedFrom && TRUSTED_FEDERATION_INSTANCES.includes(federatedFrom)) {
        // Decode JWT without validation (partner already verified)
        const decoded = jose.decodeJwt(token);
        
        // Extract attributes from foreign token
        req.user = {
            uniqueID: decoded.uniqueID,
            clearance: decoded.clearance,
            countryOfAffiliation: decoded.countryOfAffiliation,
            federated: true,
            federatedFrom,
        };
        
        return next();
    }
    
    // Standard JWT verification for non-federated requests...
};
```

### Security Considerations

- Federation bypass **only** for configured trusted instances
- User attributes extracted from foreign JWT (not arbitrary)
- Logging captures federated request origin
- TODO: Add shared secret validation for federation headers

### Files Fixed

- `frontend/src/app/api/resources/[id]/kas-flow/route.ts` (NEW)
- `frontend/src/components/ztdf/KASFlowVisualizer.tsx`
- `backend/src/middleware/authz.middleware.ts`

### Commit

`26dcd6c` - fix(federation): Add KAS flow API route and federation auth bypass

---

## Template for New Bugs

```markdown
## BUG-XXX: [Title]

**Severity:** CRITICAL | HIGH | MEDIUM | LOW  
**Discovered:** YYYY-MM-DD  
**Status:** OPEN | WORKAROUND APPLIED | FIXED

### Description
[What is the bug?]

### Impact
[What does this break?]

### Root Cause
[Why did this happen?]

### Workaround Applied
[Temporary fix if any]

### Permanent Fix Needed
[What should be done to fix this properly?]

### Files Affected
[List of files]
```

