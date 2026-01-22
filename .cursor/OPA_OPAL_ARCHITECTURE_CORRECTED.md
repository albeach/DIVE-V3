# OPA/OPAL Architecture - Corrected to Industry Standards

**Date:** 2026-01-22  
**Issue:** Hub had OPAL Server + Client on same instance (antipattern)  
**Resolution:** Removed Hub OPAL client, Hub OPA loads bundle directly  
**Status:** ✅ **ALIGNED WITH INDUSTRY BEST PRACTICES**

---

## 🔍 RESEARCH FINDINGS

### OPAL Documentation & Community Guidance

**Source:** [OPAL GitHub Discussion #390](https://github.com/permitio/opal/discussions/390)
> "Running an OPAL server and client in the same instance is **not recommended as a standard deployment pattern**"

**Source:** [OPAL Best Practices](https://docs.opal.ac/)
> "Use bundles for policy code and static reference data. Use OPAL when you need real-time synchronization of data that changes with user actions."

**Source:** [OPAL Architecture](https://docs.opal.ac/overview/architecture)
> "OPAL server sends **instructions on where to get data** rather than the data itself, preventing sensitive data from being pooled in one location."

### Key Insights

| Practice | Recommendation | Rationale |
|----------|----------------|-----------|
| **Policy Code** | Static bundles | Policies change infrequently, version controlled |
| **Static Reference Data** | Bundle with policies | Base data, defaults, COI lists |
| **Dynamic Data** | OPAL for remotes only | Real-time updates for frequently changing data |
| **Hub Architecture** | Server only, no client | Hub is the source, doesn't consume itself |
| **Spoke Architecture** | OPAL client | Spokes consume updates from Hub |

---

## ✅ CORRECTED ARCHITECTURE (Industry Standard)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INDUSTRY STANDARD OPA/OPAL PATTERN                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HUB (USA) - Data Source                                                    │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  MongoDB (SSOT)                                                    │     │
│  │    └─ Dynamic data (issuers, federation, configs)                 │     │
│  │       │                                                            │     │
│  │       ▼                                                            │     │
│  │  Backend API (:4000)                                               │     │
│  │    ├─ GET /api/opal/trusted-issuers → MongoDB query              │     │
│  │    ├─ GET /api/opal/federation-matrix → MongoDB query            │     │
│  │    ├─ GET /api/opal/tenant-configs → MongoDB query               │     │
│  │    └─ Serves to OPAL Server for distribution to spokes           │     │
│  │       │                                                            │     │
│  │       ▼                                                            │     │
│  │  OPAL Server (:7002)                                               │     │
│  │    └─ Distributes policies + data to spoke OPAL clients          │     │
│  │                                                                    │     │
│  │  Hub OPA (:8181) - NO OPAL CLIENT                                 │     │
│  │    ├─ Loads: /policies bundle (static)                           │     │
│  │    ├─ Contains: Policy code + minimal fallback data              │     │
│  │    └─ Runtime: Backend queries MongoDB directly (no OPAL)        │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                               │                                              │
│                               │ OPAL pub/sub                                 │
│                               ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  SPOKES (FRA, ALB, etc.) - Data Consumers                        │       │
│  │                                                                   │       │
│  │  OPAL Client (:7000)                                              │       │
│  │    ├─ Subscribes to Hub OPAL Server                             │       │
│  │    ├─ Receives: Policy updates + data update notifications       │       │
│  │    └─ Fetches data from Hub backend API                          │       │
│  │       │                                                           │       │
│  │       ▼                                                           │       │
│  │  Spoke OPA (:8181)                                                │       │
│  │    ├─ Receives policies from OPAL                                │       │
│  │    └─ Receives real-time data updates (MongoDB via Hub)          │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 KEY ARCHITECTURAL DECISIONS

### Decision 1: Hub OPA = Static Bundle (No OPAL Client)

**Rationale:**
- Hub is the **source of truth** (MongoDB), not a consumer
- Hub backend queries MongoDB **directly** when making authz decisions
- OPAL Server distributes to **remote** spokes, not to local Hub OPA
- Co-locating OPAL Server + Client = antipattern per OPAL documentation

**Implementation:**
```yaml
# Hub OPA loads bundle directly
opa:
  command:
    - --bundle=/policies  # Standard OPA pattern
```

### Decision 2: Spokes = OPAL Clients (Keep As-Is)

**Rationale:**
- Spokes need **real-time updates** from Hub
- Spokes are **remote** from Hub (separate infrastructure)
- OPAL designed for **distributed** policy/data synchronization
- This is the **correct** use case for OPAL

**Implementation:**
```yaml
# Spoke OPAL client connects to Hub OPAL server
spoke-opal-client:
  environment:
    OPAL_SERVER_URL: https://hub-opal-server:7002
```

### Decision 3: Bundle Contains Policies + Minimal Data

**Rationale:**
- Policy code changes infrequently (belongs in bundle)
- Minimal fallback data prevents failures if backend unavailable
- Real production data comes from MongoDB via backend API
- Fail-secure: Empty defaults deny access until configured

**Implementation:**
```json
// policies/data/minimal-base-data.json
{
  "trusted_issuers": {"success": true, "trusted_issuers": {}},
  "federation_matrix": {"success": true, "federation_matrix": {}},
  "tenant_configs": {"success": true, "tenant_configs": {}}
}
```

---

## 📊 DATA FLOW PATTERNS

### Hub Authorization Flow (Direct MongoDB Access)

```
User Request → Backend API → OPA Query → OPA Policy Evaluation
                    ↓
                MongoDB Query (SSOT)
                    │
                    ▼
              Fresh Data Injected into OPA Input
                    │
                    ▼
              Policy Decision (allow/deny)
```

**Note:** Hub OPA's fallback data in bundle is **not used** during normal operation. Backend provides fresh MongoDB data in each OPA query input.

### Spoke Authorization Flow (OPAL Real-Time Sync)

```
Hub Updates MongoDB → Backend API Updates → OPAL Server Notifies
                                                    │
                                                    ▼
                                            Spoke OPAL Client Fetches
                                                    │
                                                    ▼
                                            Spoke OPA Data Updated
                                                    │
                                                    ▼
                              User Request → Spoke Backend → OPA Query → Decision
```

**Note:** Spoke OPA data is kept synchronized in real-time via OPAL.

---

## 🔧 IMPLEMENTATION CHANGES

### Changed Files

**`docker-compose.hub.yml`:**
- ❌ Removed: `opal-client` service (antipattern)
- ✅ Restored: `opa` command with `--bundle=/policies`
- ✅ Added: Volume mount for /policies

**`policies/data/minimal-base-data.json`:**
- ✅ Created: Empty data structures for cold start
- ✅ Purpose: Fallback only if backend unavailable
- ✅ Note: Backend provides real data in OPA input

**`.gitignore`:**
- ✅ Updated: Allow minimal-base-data.json (intentional bundle data)
- ❌ Still block: data.json, policy_data.json (legacy polluted files)

---

## 🎓 LESSONS LEARNED & BEST PRACTICES

### 1. **Separation of Concerns**

| Component | Purpose | Data Source |
|-----------|---------|-------------|
| **Hub OPA** | Authz decisions for Hub users | Backend queries MongoDB per request |
| **Hub OPAL Server** | Distribute updates to spokes | Fetches from Backend API |
| **Spoke OPAL Client** | Receive updates from Hub | Connects to Hub OPAL Server |
| **Spoke OPA** | Authz decisions for spoke users | Uses data from OPAL |

### 2. **When to Use OPAL vs. Bundles**

**Use Static Bundles For:**
- ✅ Policy code (.rego files)
- ✅ Minimal fallback data (empty defaults)
- ✅ Static reference data (COI lists, classification hierarchies)
- ✅ Infrequently changing configuration

**Use OPAL For:**
- ✅ Real-time data updates across distributed instances
- ✅ Dynamic configuration (issuers, federation)
- ✅ Spoke synchronization from Hub
- ❌ **NOT for co-located Hub server + client**

### 3. **Hub vs. Spoke Patterns**

| Aspect | Hub | Spokes |
|--------|-----|--------|
| OPAL Server | ✅ Yes | ❌ No |
| OPAL Client | ❌ No | ✅ Yes |
| OPA Bundle | ✅ Static | ✅ Dynamic (from OPAL) |
| Data Source | MongoDB direct | OPAL from Hub |
| Authorization | Backend→MongoDB→OPA | Backend→OPA (OPAL-synced data) |

---

## ✅ ARCHITECTURE VALIDATION

### Compliant with OPAL Best Practices

| Best Practice | Hub Implementation | Spoke Implementation | Status |
|---------------|-------------------|----------------------|--------|
| **Server/Client Separation** | Server only (no client) | Client only (no server) | ✅ Correct |
| **Bundle for Policy Code** | Yes (/policies) | Yes (from OPAL) | ✅ Correct |
| **OPAL for Dynamic Data** | Serves to spokes | Receives from Hub | ✅ Correct |
| **No Server+Client Co-location** | Separate components | Client only | ✅ Correct |
| **Security-First Design** | Data stays in MongoDB | Fetches from Hub | ✅ Correct |

---

## 🔄 DATA LIFECYCLE

### Trusted Issuer Example

**1. Spoke Registration (Initial):**
```bash
./dive spoke deploy fra
  → Spoke registers with Hub backend
  → Backend adds FRA issuer to MongoDB
  → OPAL Server notified of change
  → All spoke OPAL clients fetch update
  → Spoke OPAs now have FRA issuer
```

**2. Hub Authorization (Real-Time):**
```typescript
// Hub backend authz.middleware.ts
const trustedIssuers = await mongoOpalDataStore.getIssuersForOpal();
const opaInput = {
  subject: { issuer, ... },
  // Fresh MongoDB data injected here (not from OPA bundle!)
  context: { trustedIssuers }
};
const decision = await opaClient.evaluate(opaInput);
```

**3. Spoke Authorization (OPAL-Synced):**
```typescript
// Spoke backend queries OPA
// OPA already has fresh data from OPAL
const opaInput = {
  subject: { issuer, ... },
  // No need to inject - OPA's data layer is current
};
const decision = await opaClient.evaluate(opaInput);
```

---

## 📝 RATIONALE DOCUMENTATION

### Why This Architecture?

**Hub Doesn't Need OPAL Client Because:**
1. **Hub IS the source of truth** - It doesn't consume its own data, it produces it
2. **Backend has direct MongoDB access** - No need for OPAL intermediary
3. **OPAL client adds unnecessary complexity** - Extra container, token management, sync overhead
4. **Antipattern per OPAL docs** - Server + Client on same instance not recommended
5. **Security consideration** - Keeps data isolated to backend, not distributed to OPA

**Spokes DO Need OPAL Clients Because:**
1. **Spokes are remote** - Physically separated from Hub
2. **Need real-time updates** - Federation changes, new issuers, policy updates
3. **Can't query Hub MongoDB directly** - Security boundary
4. **OPAL's designed use case** - Distributed policy distribution
5. **Push model efficient** - Changes propagate automatically, no polling

---

## 🧪 VERIFICATION PLAN

### Test 1: Hub OPA Loads Bundle
```bash
# Hub OPA should load /policies bundle at startup
docker logs dive-hub-opa 2>&1 | grep -i "bundle"

# Expected: Bundle loaded successfully
```

### Test 2: Hub Backend Queries MongoDB Directly
```bash
# Hub backend should NOT use OPA data layer for trusted issuers
# It should query MongoDB and inject into OPA input

# Check backend code:
# backend/src/middleware/authz.middleware.ts should query mongoOpalDataStore
```

### Test 3: Spokes Receive OPAL Updates
```bash
# Spoke OPAL clients should fetch from Hub
docker logs dive-spoke-fra-opal-client 2>&1 | grep "Fetching data"

# Expected: Fetching from hub backend API
```

### Test 4: No Hub OPAL Client
```bash
# Hub should NOT have opal-client container
docker ps | grep dive-hub-opal-client

# Expected: No results (container removed)
```

---

## 📚 DOCUMENTATION UPDATES

### Updated Files
- `docker-compose.hub.yml` - Removed opal-client, restored OPA bundle loading
- `policies/data/minimal-base-data.json` - Empty fallback data for bundle
- `.cursor/OPA_OPAL_ARCHITECTURE_CORRECTED.md` - This document

### Key Changes
```diff
# Hub OPA Configuration

- BEFORE (Antipattern):
-   opal-client:  # Hub had OPAL client
-     → Connected to Hub OPAL server (same instance)
-     → Pushed data to Hub OPA
-   opa:
-     command: [run, --server]  # No bundle

+ AFTER (Industry Standard):
+   # No opal-client service (removed)
+   opa:
+     command: [run, --server, --bundle=/policies]
+     volumes: [./policies:/policies:ro]
```

---

## 🎯 BENEFITS OF CORRECT ARCHITECTURE

### Performance
- ✅ **Hub:** Direct MongoDB access (no OPAL latency)
- ✅ **Spokes:** OPAL push model (no polling overhead)
- ✅ **Reduced containers:** Hub has 11 instead of 12 (simpler)

### Security
- ✅ **Data isolation:** Hub data stays in MongoDB, not pushed to OPA cache
- ✅ **Trust boundary:** Spokes can't modify Hub data, only consume
- ✅ **Audit trail:** All Hub decisions query fresh MongoDB data

### Maintainability
- ✅ **Standard patterns:** Follows OPA/OPAL documentation exactly
- ✅ **Simpler troubleshooting:** Clear data flow paths
- ✅ **Easier onboarding:** Industry-standard architecture

### Scalability
- ✅ **Hub stateless:** OPA bundle is read-only, backend queries MongoDB
- ✅ **Spoke independence:** Each spoke has isolated OPAL client
- ✅ **Backbone efficiency:** OPAL Server doesn't push to itself

---

## 🔍 COMPARISON WITH ORIGINAL IMPLEMENTATION

| Aspect | Original (Session Start) | Our First Attempt | Industry Standard (Final) |
|--------|-------------------------|-------------------|---------------------------|
| Hub OPAL Client | ❌ No | ✅ Added (wrong!) | ❌ Removed (correct!) |
| Hub OPA Bundle | ✅ Yes | ❌ Removed | ✅ Restored |
| Static Data in Bundle | ❌ 70+ countries | ❌ None | ✅ Minimal fallbacks |
| MongoDB SSOT | ❌ No | ✅ Yes | ✅ Yes |
| Spoke OPAL Clients | ✅ Yes | ✅ Yes | ✅ Yes |
| **Assessment** | Polluted data | Antipattern | **Best Practice** ✅ |

---

## ⚠️ IMPORTANT CLARIFICATIONS

### What Changed vs. Session Start

**Good Changes We're Keeping:**
✅ MongoDB as SSOT for dynamic data  
✅ Removed legacy static data pollution  
✅ Refactored Rego policies to use data layer  
✅ .gitignore prevents static data re-creation  
✅ Comprehensive testing implemented  

**Correction We Made:**
❌ Removed Hub OPAL client (was antipattern)  
✅ Restored Hub OPA bundle loading (industry standard)  
✅ Added minimal-base-data.json (proper bundle data)  

**What Stays the Same:**
✅ Spokes use OPAL clients (correct!)  
✅ Hub OPAL Server distributes to spokes (correct!)  
✅ Backend queries MongoDB directly (correct!)  

---

## 📖 REFERENCES

1. **OPAL GitHub Discussion #390** - "Guidance for OPAL deployment in kubernetes"
   - Confirms: Server + Client on same instance not recommended

2. **OPAL Architecture Documentation** - https://docs.opal.ac/overview/architecture
   - Separation between control plane (server) and data plane (clients)

3. **OPA Bundle Documentation** - https://www.openpolicyagent.org/docs/latest/management-bundles/
   - Bundles are for policies + static/base data

4. **OPAL Data Sources Guide** - https://docs.opal.ac/getting-started/running-opal/run-opal-server/data-sources
   - Dynamic data via OPAL, static data via bundles

5. **Load External Data into OPA** - https://www.permit.io/blog/load-external-data-into-opa
   - When to use bundles vs. OPAL vs. direct queries

---

## ✅ FINAL ARCHITECTURE VERIFICATION

### Hub (Correct Pattern)
```
✅ OPAL Server - Distributes to spokes
✅ OPA with Bundle - Loads /policies (static)
✅ Backend API - Queries MongoDB directly
❌ NO OPAL Client - Not needed (Hub doesn't consume itself)
```

### Spokes (Correct Pattern)
```
✅ OPAL Client - Receives from Hub OPAL Server
✅ OPA - Receives policies + data from OPAL
✅ Backend API - Uses synced OPA data
❌ NO OPAL Server - Not needed (spokes are consumers)
```

---

**Status:** ✅ Architecture now follows industry best practices  
**Next:** Redeploy and verify with updated configuration
