# DIVE V3 - OPAL JWT Authentication Implementation

**Session Date:** 2026-01-22  
**Previous Session Commits:** `ed9c50de` (refactor: Use MongoDB instead of static JSON for OPAL data)  
**Status:** OPAL Data Service MongoDB Integration COMPLETE ✅ | JWT-based OPAL Push Auth REQUIRED

---

## 🎯 SESSION OBJECTIVE

Implement proper JWT-based OPAL authentication for real-time data push from Hub backend to OPAL server. Currently, `opalClient.publishInlineData()` returns 401 because the OPAL server expects a JWT token, not the raw master token.

**Current State:** OPAL client polling works (data syncs on restart); push notifications fail with 401.  
**Target State:** Hub backend can push real-time data updates to OPAL server, which propagates to all connected spoke OPAL clients.

---

## 🚨 CRITICAL CONSTRAINTS (NON-NEGOTIABLE)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✅ DATABASE = SSOT   - MongoDB for all dynamic configuration data          │
│                        NO static JSON files for runtime data                │
│                        .env files ONLY for secrets/environment config       │
│                                                                             │
│  ✅ ENHANCE EXISTING  - OPAL token logic already exists in multiple places  │
│                        DO NOT create duplicate/parallel implementations     │
│                        AUDIT existing code FIRST, then enhance              │
│                                                                             │
│  ✅ BEST PRACTICE     - No shortcuts, workarounds, or "quick fixes"         │
│                        Full testing required for all changes                │
│                                                                             │
│  ✅ DIVE CLI ONLY     - Use ./dive commands exclusively                     │
│                        NO manual docker/docker-compose commands             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 PROBLEM ANALYSIS

### Root Cause

The Hub backend's `opal-client.ts` sends the raw `OPAL_AUTH_MASTER_TOKEN` in the Authorization header:

```typescript
// backend/src/services/opal-client.ts (lines 134-136)
...(this.config.clientToken && { 
  'Authorization': `Bearer ${this.config.clientToken}` 
})
```

However, the OPAL server expects a **JWT token** obtained from its `/token` endpoint, not the master token directly. The master token is used to **request** a JWT, not as an Authorization bearer directly.

### Evidence

```
Backend logs:
{"error":"OPAL server returned 401: {\"detail\":{\"error\":\"Could not decode access token\",\"token\":\"b4016...\"}}"}
```

The token `b4016...` is the raw master token (not a JWT starting with `eyJ`).

---

## 🔍 EXISTING LOGIC AUDIT

### ✅ Files That Handle OPAL Tokens (DO NOT DUPLICATE)

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/services/opal-token.service.ts` | Generates JWT from OPAL server `/token` endpoint | COMPLETE - correctly fetches JWT |
| `backend/src/services/opal-client.ts` | Publishes data to OPAL server | NEEDS FIX - uses raw master token |
| `backend/src/services/opal-data.service.ts` | MongoDB SSOT for OPAL data | COMPLETE - uses MongoDB |
| `scripts/provision-opal-tokens.sh` | Provisions JWT for spoke .env files | COMPLETE |
| `backend/src/routes/federation.routes.ts` | Issues JWT during spoke registration | COMPLETE |

### Current Token Flow (Spokes - WORKING)

```
1. Spoke registers with Hub
2. Hub calls opalTokenService.generateClientToken()
3. opalTokenService fetches JWT from OPAL server's /token endpoint (using master token)
4. Hub returns JWT to spoke
5. Spoke stores JWT in .env as SPOKE_OPAL_TOKEN
6. Spoke OPAL client uses JWT to connect to Hub OPAL server
```

### Current Token Flow (Hub Backend - BROKEN)

```
1. Hub backend has OPAL_CLIENT_TOKEN = OPAL_AUTH_MASTER_TOKEN (raw)
2. opal-client.ts sends raw master token in Authorization header
3. OPAL server rejects - expects JWT, not master token
4. Data push fails with 401
```

---

## 🛠️ SOLUTION ARCHITECTURE

### Option A: Hub Backend Uses opalTokenService (RECOMMENDED)

**Approach:** Hub backend should obtain a JWT from `opalTokenService` on startup, similar to how spokes get their tokens.

**Implementation:**
1. Modify `opal-client.ts` to fetch JWT via `opalTokenService.generateClientToken()` on initialization
2. Cache the JWT and refresh before expiry
3. Use JWT in Authorization header instead of raw master token

**Pros:**
- Consistent with spoke token flow
- Uses existing, tested `opalTokenService`
- JWT has proper expiry handling

**Cons:**
- Requires startup coordination (OPAL server must be ready)

### Option B: OPAL Server Accepts Master Token as Admin

**Approach:** Configure OPAL server to accept master token for admin operations.

**Cons:**
- Would require OPAL server configuration changes
- Less secure (master token has full access)
- Not aligned with JWT-based authentication model

### RECOMMENDATION: Option A

---

## 📝 IMPLEMENTATION PLAN

### Phase 1: Enhance opal-client.ts to Use JWT

**File:** `backend/src/services/opal-client.ts`

```typescript
// CHANGES NEEDED:

// 1. Import opalTokenService
import { opalTokenService } from './opal-token.service';

// 2. Add JWT management to OPALClient class
class OPALClient {
  private jwt: string | null = null;
  private jwtExpiry: Date | null = null;
  
  // 3. Initialize JWT on construction (async init pattern)
  async ensureJwt(): Promise<string | null> {
    // If JWT exists and not expired (with 5 min buffer), return it
    if (this.jwt && this.jwtExpiry && new Date() < new Date(this.jwtExpiry.getTime() - 5 * 60 * 1000)) {
      return this.jwt;
    }
    
    // Fetch new JWT from OPAL server
    try {
      const token = await opalTokenService.generateClientToken('hub-backend', 'USA');
      this.jwt = token.token;
      this.jwtExpiry = token.expiresAt;
      logger.info('OPAL JWT obtained for Hub backend', { expiresAt: this.jwtExpiry });
      return this.jwt;
    } catch (error) {
      logger.error('Failed to obtain OPAL JWT', { error: error.message });
      return null;
    }
  }
  
  // 4. Modify fetchWithRetry to get JWT dynamically
  private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
    const jwt = await this.ensureJwt();
    
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(jwt && { 'Authorization': `Bearer ${jwt}` })
      }
    };
    // ... rest of method
  }
}
```

### Phase 2: Handle Startup Timing

**Issue:** `opalTokenService.generateClientToken()` requires OPAL server to be running.

**Solution:** Lazy initialization with retry:

```typescript
// In opal-client.ts
private jwtInitPromise: Promise<void> | null = null;

async initializeJwt(): Promise<void> {
  if (this.jwtInitPromise) return this.jwtInitPromise;
  
  this.jwtInitPromise = (async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.ensureJwt();
        if (this.jwt) {
          logger.info('OPAL client JWT initialized');
          return;
        }
      } catch (error) {
        logger.warn(`OPAL JWT init attempt ${attempt}/5 failed`, { error: error.message });
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s between retries
      }
    }
    logger.error('Failed to initialize OPAL JWT after 5 attempts');
  })();
  
  return this.jwtInitPromise;
}
```

### Phase 3: Remove Raw Master Token from docker-compose

**File:** `docker-compose.hub.yml`

```yaml
# REMOVE THIS LINE:
OPAL_CLIENT_TOKEN: ${OPAL_AUTH_MASTER_TOKEN}

# The backend will now fetch its own JWT from the OPAL server
```

### Phase 4: Testing

1. **Unit Test:** Mock `opalTokenService` and verify JWT is used in requests
2. **Integration Test:** Deploy Hub, verify trusted issuer push succeeds
3. **E2E Test:** Deploy Hub + Spoke, add new trusted issuer, verify it appears in spoke OPA

---

## 🔎 FILES TO MODIFY

### Primary Changes

| File | Change |
|------|--------|
| `backend/src/services/opal-client.ts` | Add JWT management via `opalTokenService` |
| `docker-compose.hub.yml` | Remove `OPAL_CLIENT_TOKEN` line (backend fetches own JWT) |

### Files to Audit (DO NOT MODIFY unless necessary)

| File | Reason |
|------|--------|
| `backend/src/services/opal-token.service.ts` | Already correctly fetches JWT - may need minor enhancements |
| `backend/src/services/opal-data.service.ts` | Already uses MongoDB SSOT - no changes needed |
| `scripts/provision-opal-tokens.sh` | For spoke tokens - no changes needed |

---

## 🧪 VERIFICATION STEPS

### Step 1: Deploy Clean Environment

```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy tst
```

### Step 2: Verify JWT Acquisition

```bash
# Check Hub backend logs for JWT initialization
docker logs dive-hub-backend 2>&1 | grep -i "OPAL JWT"
# Expected: "OPAL JWT obtained for Hub backend"
```

### Step 3: Verify Data Push Works

```bash
# Check for successful OPAL publish
docker logs dive-hub-backend 2>&1 | grep -i "OPAL data update published"
# Expected: "OPAL data update published successfully"

# Should NOT see 401 errors
docker logs dive-hub-backend 2>&1 | grep "401" | grep -i opal
# Expected: No output
```

### Step 4: Verify Spoke Receives Update

```bash
# Check TST OPA has trusted issuers
curl -ks https://localhost:10181/v1/data/trusted_issuers | jq '.result.trusted_issuers | keys'
# Expected: Should include both USA and TST issuers without requiring restart
```

---

## 📊 CURRENT DATA FLOW (After MongoDB Refactor)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SPOKE REGISTRATION                                                       │
│     ┌─────────┐    ┌───────────┐    ┌──────────────┐                        │
│     │  Spoke  │───▶│ Hub API   │───▶│ MongoDB      │                        │
│     │ Request │    │           │    │ (SSOT)       │                        │
│     └─────────┘    └───────────┘    └──────────────┘                        │
│                           │                │                                 │
│                           │                │                                 │
│  2. OPAL DATA PUBLISH (CURRENTLY BROKEN - 401)                              │
│                           │                │                                 │
│                           ▼                ▼                                 │
│     ┌───────────────────────────────────────────────┐                       │
│     │            opal-data.service.ts               │                       │
│     │  updateTrustedIssuer() -> MongoDB + OPAL push │                       │
│     └───────────────────────────────────────────────┘                       │
│                           │                                                  │
│                           ▼                                                  │
│     ┌───────────────────────────────────────────────┐                       │
│     │              opal-client.ts                   │                       │
│     │  publishInlineData() -> OPAL server           │                       │
│     │  ❌ Currently uses raw master token          │                       │
│     │  ✅ Should use JWT from opalTokenService     │                       │
│     └───────────────────────────────────────────────┘                       │
│                           │                                                  │
│                           ▼ (Currently fails with 401)                       │
│     ┌───────────────────────────────────────────────┐                       │
│     │              OPAL Server                      │                       │
│     │  /data/config endpoint                        │                       │
│     │  Expects: Authorization: Bearer <JWT>         │                       │
│     │  Receives: Authorization: Bearer <master>     │                       │
│     └───────────────────────────────────────────────┘                       │
│                           │                                                  │
│                           ▼ (When fixed)                                     │
│     ┌───────────────────────────────────────────────┐                       │
│     │          Spoke OPAL Clients                   │                       │
│     │  Receive push notification                    │                       │
│     │  Fetch updated data from Hub API              │                       │
│     └───────────────────────────────────────────────┘                       │
│                           │                                                  │
│                           ▼                                                  │
│     ┌───────────────────────────────────────────────┐                       │
│     │              Spoke OPA                        │                       │
│     │  Updated trusted_issuers, federation_matrix   │                       │
│     └───────────────────────────────────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 RELEVANT CODE REFERENCES

### opal-token.service.ts (lines 54-86) - JWT Generation Logic

```typescript
async generateClientToken(spokeId: string, instanceCode: string): Promise<IOPALClientToken> {
  // Uses master token to request JWT from OPAL server /token endpoint
  const response = await this.fetchOPALToken();
  return {
    token: response.token,  // This is the JWT (starts with eyJ)
    expiresAt: new Date(response.details.expired),
    clientId: response.details.id,
    type: 'opal_client'
  };
}

private async fetchOPALToken(): Promise<IOPALTokenResponse> {
  const response = await fetch(`${this.opalServerUrl}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.masterToken}`,  // Master token here
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'client' })
  });
  return await response.json();  // Returns JWT
}
```

### opal-client.ts (lines 121-164) - Where JWT Should Be Used

```typescript
private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      // THIS IS THE PROBLEM - uses raw master token
      ...(this.config.clientToken && { 
        'Authorization': `Bearer ${this.config.clientToken}` 
      })
    }
  };
  // ...
}
```

---

## 📁 PROJECT STRUCTURE (Relevant Files)

```
backend/src/services/
├── opal-client.ts              # ❌ NEEDS FIX: Use JWT instead of master token
├── opal-token.service.ts       # ✅ COMPLETE: Correctly fetches JWT from OPAL server
├── opal-data.service.ts        # ✅ COMPLETE: Uses MongoDB SSOT
├── federation-bootstrap.service.ts  # Uses opal-data.service for trusted issuer registration
└── hub-spoke-registry.service.ts    # Uses opal-data.service for federation

docker-compose.hub.yml          # Remove OPAL_CLIENT_TOKEN environment variable

scripts/
├── provision-opal-tokens.sh    # For spoke JWT provisioning (no changes needed)
└── generate-opal-certs.sh      # Generates JWT signing keys (no changes needed)
```

---

## ✅ SUCCESS CRITERIA

### Quantitative
- [ ] Hub backend obtains JWT from OPAL server on startup
- [ ] `publishInlineData()` returns `success: true` (not 401)
- [ ] New trusted issuers appear in spoke OPA within 30 seconds (without restart)
- [ ] JWT refresh works before expiry

### Qualitative
- [ ] No static JSON files for OPAL data (MongoDB is SSOT)
- [ ] Uses existing `opalTokenService` (no duplicate token logic)
- [ ] Proper error handling for JWT acquisition failures
- [ ] Graceful degradation if OPAL server unavailable

---

## 🚀 GETTING STARTED

### Step 1: Verify Current State

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Check latest commit
git log --oneline -1
# Expected: ed9c50de refactor(opal): Use MongoDB instead of static JSON files for OPAL data

# Check current error in logs (if Hub is running)
docker logs dive-hub-backend 2>&1 | grep -i "401" | tail -5
```

### Step 2: Read Existing Token Service

```bash
# Understand how JWT is currently generated for spokes
cat backend/src/services/opal-token.service.ts
```

### Step 3: Implement Changes

1. Modify `opal-client.ts` to use `opalTokenService` for JWT
2. Remove `OPAL_CLIENT_TOKEN` from `docker-compose.hub.yml`
3. Test with clean deployment

### Step 4: Verify and Commit

```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy tst

# Verify no 401 errors
docker logs dive-hub-backend 2>&1 | grep -i opal

# Commit changes
git add -A
git commit -m "fix(opal): Use JWT for Hub backend OPAL authentication"
git push
```

---

## 📚 REFERENCE DOCUMENTATION

### OPAL Authentication Model
- OPAL uses JWT tokens for client authentication
- Master token is an **admin secret** used to request JWTs, not for direct API access
- JWTs are issued by OPAL server's `/token` endpoint
- JWTs have expiry and should be refreshed before expiry

### Files Audit Summary

| File | SSOT Role | Auth Method |
|------|-----------|-------------|
| MongoDB `trusted_issuers` | Trusted issuer registry | N/A (database) |
| MongoDB `federation_matrix` | Federation trust matrix | N/A (database) |
| MongoDB `tenant_configs` | Tenant configurations | N/A (database) |
| `.env.hub` | Secrets only (`OPAL_AUTH_MASTER_TOKEN`) | N/A (secrets) |
| Spoke `.env` | `SPOKE_OPAL_TOKEN` (JWT for OPAL connection) | JWT |
| Hub backend | Should use JWT from `opalTokenService` | JWT (to be fixed) |

---

**END OF SESSION HANDOFF**

**Next Action:** Implement JWT-based authentication in `opal-client.ts` using existing `opalTokenService`.
