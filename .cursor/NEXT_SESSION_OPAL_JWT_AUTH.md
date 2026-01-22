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

### OPAL Authentication Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPAL TOKEN AUTHENTICATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MASTER TOKEN (Secret):                                                      │
│    - Stored in .env as OPAL_AUTH_MASTER_TOKEN                               │
│    - Used ONLY to request JWTs from /token endpoint                         │
│    - NEVER sent directly to /data/config or other API endpoints             │
│                                                                              │
│  JWT TOKEN (Client credential):                                              │
│    - Obtained by POSTing to /token with master token                        │
│    - Contains claims: { peer_type: 'client', expired: '<timestamp>' }       │
│    - Signed with RS256 algorithm                                            │
│    - Has expiration (typically 1 year)                                      │
│    - Used in Authorization header for all OPAL API calls                    │
│                                                                              │
│  Flow:                                                                       │
│    1. Client sends: POST /token { Authorization: Bearer <master_token> }    │
│    2. Server returns: { token: "eyJ...", details: { expired: "..." } }      │
│    3. Client uses JWT: GET/POST /data/config { Authorization: Bearer <jwt> }│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 EXISTING LOGIC AUDIT

### ✅ Files That Handle OPAL Tokens (DO NOT DUPLICATE)

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/services/opal-token.service.ts` | Generates JWT from OPAL server `/token` endpoint | COMPLETE - correctly fetches JWT |
| `backend/src/services/opal-client.ts` | Publishes data to OPAL server | NEEDS FIX - uses raw master token |
| `backend/src/services/opal-data.service.ts` | MongoDB SSOT for OPAL data | COMPLETE - uses MongoDB |
| `backend/src/models/trusted-issuer.model.ts` | MongoDB store for trusted issuers, federation matrix | COMPLETE - SSOT |

### Existing opal-token.service.ts (WORKING - USE THIS)

```typescript
// backend/src/services/opal-token.service.ts
// This service CORRECTLY fetches JWT from OPAL server

class OPALTokenService {
  private masterToken: string;
  private opalServerUrl: string;

  constructor() {
    this.masterToken = process.env.OPAL_AUTH_MASTER_TOKEN || '';
    this.opalServerUrl = process.env.OPAL_SERVER_URL || 'https://opal-server:7002';
  }

  // This method correctly uses master token to get JWT
  async generateClientToken(spokeId: string, instanceCode: string): Promise<IOPALClientToken> {
    const response = await this.fetchOPALToken();  // Uses master token here
    return {
      token: response.token,  // This IS the JWT (starts with eyJ...)
      expiresAt: new Date(response.details.expired),
      clientId: response.details.id,
      type: 'opal_client'
    };
  }

  private async fetchOPALToken(): Promise<IOPALTokenResponse> {
    const response = await fetch(`${this.opalServerUrl}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.masterToken}`,  // Master token for auth
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'client' })
    });
    return await response.json();  // Returns JWT token
  }
}

export const opalTokenService = new OPALTokenService();
```

### Existing opal-client.ts (BROKEN - NEEDS FIX)

```typescript
// backend/src/services/opal-client.ts
// PROBLEM: Uses raw master token instead of JWT

class OPALClient {
  private config: IOPALClientConfig;

  constructor(config: Partial<IOPALClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // BUG: this.config.clientToken is OPAL_CLIENT_TOKEN which is master token
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        // BUG: Uses raw master token - OPAL expects JWT here!
        ...(this.config.clientToken && { 
          'Authorization': `Bearer ${this.config.clientToken}` 
        })
      }
    };
    // ...
  }
}
```

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

## 🛠️ SOLUTION: Enhance opal-client.ts to Use JWT via opalTokenService

### Implementation Approach

The fix is simple: `opal-client.ts` should use `opalTokenService` to obtain a JWT instead of using the raw master token. This reuses existing, tested logic.

### Modified opal-client.ts

```typescript
/**
 * DIVE V3 - OPAL Client
 * 
 * Enhanced to use JWT authentication via opalTokenService.
 * The Hub backend obtains a JWT from the OPAL server's /token endpoint,
 * then uses that JWT for all subsequent API calls.
 */

import { logger } from '../utils/logger';
import { opalTokenService } from './opal-token.service';

// ... existing interfaces remain unchanged ...

class OPALClient {
  private config: IOPALClientConfig;
  private isEnabled: boolean;
  
  // NEW: JWT management
  private jwt: string | null = null;
  private jwtExpiry: Date | null = null;
  private jwtInitPromise: Promise<void> | null = null;

  constructor(config: Partial<IOPALClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isEnabled = process.env.OPAL_ENABLED !== 'false' && 
                     !!process.env.OPAL_SERVER_URL;
    
    if (this.isEnabled) {
      logger.info('OPAL client initialized', {
        serverUrl: this.config.serverUrl,
        topics: this.config.dataTopics,
        timeoutMs: this.config.timeoutMs
      });
      
      // Initialize JWT asynchronously
      this.initializeJwt();
    } else {
      logger.info('OPAL client disabled - using static policy data');
    }
  }

  /**
   * Initialize JWT with retry logic for startup timing
   * OPAL server may not be ready immediately when backend starts
   */
  private async initializeJwt(): Promise<void> {
    if (this.jwtInitPromise) return this.jwtInitPromise;
    
    this.jwtInitPromise = (async () => {
      const maxAttempts = 5;
      const retryDelayMs = 5000;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.refreshJwt();
          if (this.jwt) {
            logger.info('OPAL client JWT initialized successfully', {
              attempt,
              expiresAt: this.jwtExpiry?.toISOString()
            });
            return;
          }
        } catch (error) {
          logger.warn(`OPAL JWT initialization attempt ${attempt}/${maxAttempts} failed`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }
      }
      
      logger.error('Failed to initialize OPAL JWT after all attempts - push notifications will fail');
    })();
    
    return this.jwtInitPromise;
  }

  /**
   * Refresh JWT from OPAL server using opalTokenService
   */
  private async refreshJwt(): Promise<void> {
    try {
      const tokenData = await opalTokenService.generateClientToken(
        'hub-backend',
        process.env.INSTANCE_CODE || 'USA'
      );
      
      this.jwt = tokenData.token;
      this.jwtExpiry = tokenData.expiresAt;
      
      logger.debug('OPAL JWT refreshed', {
        clientId: tokenData.clientId,
        expiresAt: this.jwtExpiry.toISOString()
      });
    } catch (error) {
      logger.error('Failed to refresh OPAL JWT', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Ensure we have a valid JWT, refreshing if necessary
   * Returns null if JWT cannot be obtained (graceful degradation)
   */
  private async ensureJwt(): Promise<string | null> {
    // Wait for initialization if in progress
    if (this.jwtInitPromise) {
      await this.jwtInitPromise;
    }
    
    // Check if JWT exists and is not expired (with 5 minute buffer)
    if (this.jwt && this.jwtExpiry) {
      const bufferMs = 5 * 60 * 1000; // 5 minutes
      const now = new Date();
      const expiryWithBuffer = new Date(this.jwtExpiry.getTime() - bufferMs);
      
      if (now < expiryWithBuffer) {
        return this.jwt;
      }
      
      logger.info('OPAL JWT expiring soon, refreshing');
    }
    
    // Try to refresh JWT
    try {
      await this.refreshJwt();
      return this.jwt;
    } catch (error) {
      logger.warn('Could not refresh OPAL JWT, operating without push capability', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Make HTTP request with retry logic
   * ENHANCED: Uses JWT from ensureJwt() instead of raw master token
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    // Get JWT (may return null if unavailable)
    const jwt = await this.ensureJwt();

    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        // FIXED: Use JWT instead of raw master token
        ...(jwt && { 'Authorization': `Bearer ${jwt}` })
      }
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.retryAttempts) {
          logger.warn('OPAL request failed, retrying', {
            url,
            attempt,
            maxAttempts: this.config.retryAttempts,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    }

    clearTimeout(timeout);
    throw lastError || new Error('OPAL request failed');
  }

  // ... rest of class methods remain unchanged ...
}
```

### Changes Summary

| Change | Location | Description |
|--------|----------|-------------|
| Import `opalTokenService` | Line 17 | Reuse existing JWT generation logic |
| Add JWT state fields | Lines 22-24 | `jwt`, `jwtExpiry`, `jwtInitPromise` |
| Add `initializeJwt()` | Constructor | Async init with retry for startup timing |
| Add `refreshJwt()` | New method | Calls `opalTokenService.generateClientToken()` |
| Add `ensureJwt()` | New method | Get valid JWT, refresh if needed |
| Modify `fetchWithRetry()` | Lines 40-50 | Use `ensureJwt()` instead of `config.clientToken` |

---

## 📝 IMPLEMENTATION PLAN

### Phase 1: Enhance opal-client.ts

1. **Add JWT management methods** to `OPALClient` class
2. **Import `opalTokenService`** from existing service
3. **Modify `fetchWithRetry()`** to use JWT
4. **Add initialization retry** for startup timing

### Phase 2: Remove OPAL_CLIENT_TOKEN from docker-compose

**File:** `docker-compose.hub.yml`

```yaml
# REMOVE this line - no longer needed:
# OPAL_CLIENT_TOKEN: ${OPAL_AUTH_MASTER_TOKEN}

# The backend now obtains its own JWT via opalTokenService
```

### Phase 3: Testing

1. **Clean slate deployment**
2. **Verify JWT acquisition** in backend logs
3. **Verify push succeeds** (no 401 errors)
4. **Verify spoke receives updates** (check OPA data)

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
docker logs dive-hub-backend 2>&1 | grep -i "OPAL.*JWT"
# Expected: "OPAL client JWT initialized successfully"
```

### Step 3: Verify Data Push Works

```bash
# Check for successful OPAL publish
docker logs dive-hub-backend 2>&1 | grep -i "published successfully"
# Expected: "OPAL data update published successfully"

# Should NOT see 401 errors
docker logs dive-hub-backend 2>&1 | grep "401" | grep -i opal
# Expected: No output
```

### Step 4: Verify Spoke Receives Update

```bash
# Check TST OPA has all trusted issuers (without restart)
curl -ks https://localhost:10181/v1/data/trusted_issuers | jq '.result.trusted_issuers | keys'
# Expected: Should include USA, TST issuers
```

### Step 5: Test Dynamic Update

```bash
# Register a new spoke and verify it propagates
./dive spoke deploy dev

# Check TST OPA immediately has DEV issuer
curl -ks https://localhost:10181/v1/data/trusted_issuers | jq '.result.trusted_issuers | keys'
# Expected: Should include DEV issuer without TST restart
```

---

## 📊 DATA FLOW (After Fix)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORRECTED DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. BACKEND STARTUP                                                          │
│     ┌─────────────┐    ┌───────────────┐    ┌──────────────┐                │
│     │  OPALClient │───▶│opalTokenService│───▶│ OPAL Server  │               │
│     │ constructor │    │generateClient │    │   /token     │               │
│     │             │    │Token()        │    │              │               │
│     │             │◀───│               │◀───│ Returns JWT  │               │
│     │ Store JWT   │    │               │    │ (eyJ...)     │               │
│     └─────────────┘    └───────────────┘    └──────────────┘               │
│                                                                              │
│  2. DATA PUBLISH (NOW WORKS)                                                 │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │            opal-data.service.ts                         │             │
│     │  updateTrustedIssuer() -> MongoDB + opal-client.ts      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              opal-client.ts                             │             │
│     │  publishInlineData()                                    │             │
│     │  ✅ ensureJwt() gets valid JWT                         │             │
│     │  ✅ Sends: Authorization: Bearer <JWT>                 │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼ (200 OK)                                         │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              OPAL Server                                │             │
│     │  /data/config endpoint                                  │             │
│     │  Validates JWT ✓                                        │             │
│     │  Notifies connected clients via pub/sub                 │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼ (Push notification)                              │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │          Spoke OPAL Clients                             │             │
│     │  Receive push notification                              │             │
│     │  Fetch updated data from Hub /api/opal/* endpoints      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              Spoke OPA                                  │             │
│     │  Updated trusted_issuers, federation_matrix             │             │
│     │  REAL-TIME SYNC ✓                                      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 FILES TO MODIFY

### Primary Changes

| File | Change |
|------|--------|
| `backend/src/services/opal-client.ts` | Add JWT management via `opalTokenService` |
| `docker-compose.hub.yml` | Remove `OPAL_CLIENT_TOKEN` line (optional cleanup) |

### Files to Audit (DO NOT MODIFY unless necessary)

| File | Reason |
|------|--------|
| `backend/src/services/opal-token.service.ts` | Already correctly fetches JWT - USE AS IS |
| `backend/src/services/opal-data.service.ts` | Already uses MongoDB SSOT - no changes needed |
| `backend/src/models/trusted-issuer.model.ts` | MongoDB SSOT store - no changes needed |

---

## ✅ SUCCESS CRITERIA

### Quantitative
- [ ] Hub backend obtains JWT from OPAL server on startup
- [ ] `publishInlineData()` returns `success: true` (not 401)
- [ ] New trusted issuers appear in spoke OPA within 30 seconds (without restart)
- [ ] JWT refresh works before expiry
- [ ] All existing tests continue to pass

### Qualitative
- [ ] No static JSON files for OPAL data (MongoDB is SSOT)
- [ ] Uses existing `opalTokenService` (no duplicate token logic)
- [ ] Proper error handling for JWT acquisition failures
- [ ] Graceful degradation if OPAL server unavailable
- [ ] Clear logging for troubleshooting

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

### Step 2: Read Existing Services

```bash
# Understand existing token service (DO NOT MODIFY - USE IT)
# File: backend/src/services/opal-token.service.ts

# Understand current opal-client (NEEDS FIX)
# File: backend/src/services/opal-client.ts
```

### Step 3: Implement Changes

1. Enhance `opal-client.ts` to use `opalTokenService` for JWT
2. Remove `OPAL_CLIENT_TOKEN` from `docker-compose.hub.yml` (optional)
3. Test with clean deployment

### Step 4: Verify and Commit

```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy tst

# Verify JWT obtained
docker logs dive-hub-backend 2>&1 | grep -i "OPAL.*JWT"

# Verify no 401 errors
docker logs dive-hub-backend 2>&1 | grep -i "401.*opal"

# Commit changes
git add -A
git commit -m "fix(opal): Use JWT for Hub backend OPAL authentication

- Enhanced opal-client.ts to use opalTokenService for JWT generation
- Added JWT caching with automatic refresh before expiry
- Added retry logic for OPAL server startup timing
- Removed dependency on OPAL_CLIENT_TOKEN environment variable

This fixes the 401 error when Hub backend publishes data to OPAL server,
enabling real-time push notifications to spoke OPAL clients."
git push
```

---

## 📚 REFERENCE: SSOT Architecture Summary

### Data Storage (MongoDB is SSOT)

| Collection | Purpose | Updated By |
|------------|---------|------------|
| `trusted_issuers` | Token issuer registry | `mongoOpalDataStore.addIssuer()` |
| `federation_matrix` | Bilateral trust | `mongoOpalDataStore.setFederationTrust()` |
| `tenant_configs` | Per-tenant policy config | `mongoOpalDataStore.setTenantConfig()` |
| `federation_spokes` | Registered spokes | `hubSpokeRegistry` |

### NO Static JSON Files

| What | How |
|------|-----|
| Trusted issuers | MongoDB `trusted_issuers` collection |
| Federation matrix | MongoDB `federation_matrix` collection |
| OPAL data | Fetched from `/api/opal/*` endpoints backed by MongoDB |
| JWT tokens | Generated dynamically via `opalTokenService` |

### Environment Variables (.env) - ONLY for Secrets

| Variable | Purpose |
|----------|---------|
| `OPAL_AUTH_MASTER_TOKEN` | Admin secret to request JWTs |
| `MONGODB_URL` | Database connection |
| `KEYCLOAK_CLIENT_SECRET` | IDP client credential |

---

## 🏗️ ARCHITECTURE CONTEXT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIVE V3 OPAL AUTHENTICATION ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    HUB (USA)                                                                 │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │  Backend (:4000)                                                   │   │
│    │  ┌──────────────────────────────────────────────────────────────┐ │   │
│    │  │ opal-client.ts                                               │ │   │
│    │  │  - Publishes data updates                                    │ │   │
│    │  │  - Uses JWT from opalTokenService                           │ │   │
│    │  │  - Caches JWT with auto-refresh                             │ │   │
│    │  └──────────────────────────────────────────────────────────────┘ │   │
│    │                           │                                        │   │
│    │                           │ imports                                │   │
│    │                           ▼                                        │   │
│    │  ┌──────────────────────────────────────────────────────────────┐ │   │
│    │  │ opal-token.service.ts                                        │ │   │
│    │  │  - Fetches JWT from OPAL server /token                       │ │   │
│    │  │  - Uses OPAL_AUTH_MASTER_TOKEN for auth                      │ │   │
│    │  │  - Returns signed JWT (eyJ...)                               │ │   │
│    │  └──────────────────────────────────────────────────────────────┘ │   │
│    │                           │                                        │   │
│    │                           │ calls                                  │   │
│    │                           ▼                                        │   │
│    │  ┌──────────────────────────────────────────────────────────────┐ │   │
│    │  │ opal-data.service.ts                                         │ │   │
│    │  │  - Uses MongoDB as SSOT                                      │ │   │
│    │  │  - Calls opalClient.publishInlineData() for sync             │ │   │
│    │  └──────────────────────────────────────────────────────────────┘ │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │  OPAL Server (:7002)                                              │   │
│    │  - /token endpoint: Issues JWTs (requires master token)           │   │
│    │  - /data/config endpoint: Receives updates (requires JWT)         │   │
│    │  - Pushes notifications to connected OPAL clients                 │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│              ┌────────────┴────────────┐                                    │
│              ▼                         ▼                                    │
│    ┌─────────────────┐      ┌─────────────────┐                             │
│    │ TST OPAL Client │      │ DEV OPAL Client │                             │
│    │ (Spoke)         │      │ (Spoke)         │                             │
│    │                 │      │                 │                             │
│    │ Uses JWT from   │      │ Uses JWT from   │                             │
│    │ registration    │      │ registration    │                             │
│    └─────────────────┘      └─────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**END OF SESSION HANDOFF**

**Next Action:** Implement JWT-based authentication in `opal-client.ts` using existing `opalTokenService`. The solution is straightforward - reuse existing logic, don't create new token generation code.
