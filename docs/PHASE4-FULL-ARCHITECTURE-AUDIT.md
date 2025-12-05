# 🏛️ PHASE 4: COMPREHENSIVE MULTI-INSTANCE ARCHITECTURE AUDIT

**Document:** Phase 4 Full Architecture - IdP/SP/KAS/MongoDB/OPA Integration Analysis  
**Date:** 2025-11-28  
**Status:** ✅ **READY FOR OPTION A IMPLEMENTATION**  
**Priority:** ⭐⭐⭐⭐⭐ **CRITICAL - PHASE 4 FOUNDATION**

---

## 📋 **EXECUTIVE SUMMARY**

This document provides a **complete architectural audit** of DIVE V3's multi-instance federation architecture, analyzing how **IdP workflows**, **SP workflows**, **KAS (Key Access Service)**, **MongoDB resources**, and **OPA policies** interact in a federated environment with multiple sovereign instances (USA, FRA, GBR, DEU, etc.).

### 🎯 **Key Finding**

**DIVE V3 has a WELL-DESIGNED federated architecture** with:
- ✅ **Clear separation** between IdP (identity brokering) and SP (resource access)
- ✅ **Per-instance sovereignty** (each instance owns its resources)
- ✅ **Global policy guardrails** (NATO compliance enforced universally)
- ✅ **Local policy flexibility** (instance-specific resource policies)
- ✅ **Cross-instance KAS federation** (multi-KAS key access)
- ✅ **Metadata synchronization** (opt-in resource sharing)

### ⚠️ **Critical Gaps Identified**

1. **Cross-Instance Resource Discovery** - No unified search across all instances
2. **KAS Federation Implementation** - Cross-KAS code exists but not deployed
3. **Policy Versioning** - No global policy version tracking across instances
4. **Resource Origin Tracking** - Limited `originRealm` usage in queries
5. **Federation Agreement Enforcement** - Middleware exists but not fully integrated

---

## 🏗️ **ARCHITECTURAL OVERVIEW**

### **Multi-Instance Model**

DIVE V3 follows a **Federated Sovereign Model**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DIVE V3 FEDERATION                         │
│                    (NATO Coalition ICAM)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐              │
│   │   USA    │────▶│   FRA    │────▶│   GBR    │              │
│   │ Instance │◀────│ Instance │◀────│ Instance │              │
│   └──────────┘     └──────────┘     └──────────┘              │
│        │                 │                │                     │
│        └─────────────────┼────────────────┘                     │
│                          ▼                                      │
│                    ┌──────────┐                                 │
│                    │   DEU    │                                 │
│                    │ Instance │                                 │
│                    └──────────┘                                 │
│                                                                  │
│  Each Instance Has:                                             │
│  • Own Keycloak IdP Broker                                      │
│  • Own MongoDB (resources)                                      │
│  • Own OPA (policies)                                           │
│  • Own KAS (key management)                                     │
│  • Own Redis (caching)                                          │
│  • Own Backend API                                              │
│  • Own Frontend UI                                              │
│                                                                  │
│  Shared Components:                                             │
│  • Centralized Blacklist Redis (cross-instance token revocation)│
│  • Global OPA Policy Bundle (NATO compliance guardrails)        │
│  • Federation Registry (partner relationships)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### **Key Principles**

1. **Sovereignty**: Each nation controls its own instance, resources, and policies
2. **Trust**: Bilateral federation agreements define trust relationships
3. **Interoperability**: Standardized protocols (OIDC, SAML, ABAC, ZTDF)
4. **Compliance**: Global NATO/ACP-240 guardrails enforced universally
5. **Flexibility**: Local instance policies can be more restrictive

---

## 1️⃣ **IDP WORKFLOW vs SP WORKFLOW**

### **1.1 IdP (Identity Provider) Workflow**

**Purpose:** Federate external identity providers for **user authentication**

**Scope:** **Cross-instance identity federation**
- USA Keycloak trusts FRA Keycloak as IdP
- FRA Keycloak trusts GBR Keycloak as IdP
- Bidirectional trust relationships

**Architecture:**

```
┌───────────────────────────────────────────────────────────────┐
│                    IDP FEDERATION WORKFLOW                    │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Step 1: User Authentication                                  │
│  ┌──────────┐                                                 │
│  │ FRA User │──┐                                              │
│  └──────────┘  │                                              │
│                 │                                              │
│                 ▼                                              │
│  Step 2: IdP Selection (USA Frontend)                        │
│  ┌─────────────────────────────────────┐                     │
│  │ USA App: Login Page                │                     │
│  │ • usa-local-idp (OIDC)              │                     │
│  │ • fra-federation (OIDC) ◀─ Selected │                     │
│  │ • gbr-federation (OIDC)             │                     │
│  │ • deu-federation (OIDC)             │                     │
│  └─────────────────────────────────────┘                     │
│                 │                                              │
│                 ▼                                              │
│  Step 3: Redirect to FRA Keycloak                            │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA Keycloak                         │                    │
│  │ • Authenticate user (username/pwd)   │                    │
│  │ • Check clearance attribute          │                    │
│  │ • Check countryOfAffiliation=FRA     │                    │
│  │ • Issue JWT token                    │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 4: Return to USA (with token)                         │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Keycloak                         │                    │
│  │ • Verify token from FRA              │                    │
│  │ • Map attributes (protocol mappers)   │                    │
│  │   - FRA clearance → clearance        │                    │
│  │   - FRA uniqueID → uniqueID          │                    │
│  │   - FRA country → countryOfAffiliation│                    │
│  │ • Issue USA realm token               │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 5: User Logged In to USA Instance                     │
│  ┌──────────────────────────────────────┐                    │
│  │ USA App                              │                    │
│  │ User: testuser-fra-3@fra.mil         │                    │
│  │ Country: FRA                          │                    │
│  │ Clearance: SECRET                     │                    │
│  │ Can access: USA resources (if releasable to FRA)         │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key Files:**
- **Backend:** `backend/src/controllers/admin.controller.ts` (`createIdPHandler`)
- **Frontend:** `frontend/src/app/admin/idp/new/page.tsx` (IdP wizard)
- **Script:** `scripts/add-federation-partner.sh` (automated IdP broker creation)
- **Terraform:** `terraform/modules/federated-instance/idp-brokers.tf`

**Current State:** ✅ **PRODUCTION-READY**
- USA ↔ FRA: Working
- USA ↔ GBR: Working
- USA ↔ DEU: Working (remote)
- All bidirectional OIDC trust established

---

### **1.2 SP (Service Provider) Workflow**

**Purpose:** Register external service providers for **resource access** (OAuth clients)

**Scope:** **Within-instance OAuth client provisioning**
- External organizations (e.g., defense contractors, partner agencies)
- OAuth 2.0 clients accessing instance resources
- NOT for cross-instance federation (that's IdP workflow)

**Architecture:**

```
┌───────────────────────────────────────────────────────────────┐
│                    SP REGISTRY WORKFLOW                       │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Step 1: External Organization Applies                       │
│  ┌──────────────────────────────────────┐                    │
│  │ Lockheed Martin (Industry Partner)   │                    │
│  │ • Wants to access USA SECRET resources│                   │
│  │ • Has security clearances             │                    │
│  │ • Needs OAuth client for API access   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 2: SP Registration Request                             │
│  ┌──────────────────────────────────────┐                    │
│  │ POST /api/sp-management/register     │                    │
│  │ {                                     │                    │
│  │   name: "Lockheed Martin",           │                    │
│  │   organizationType: "CONTRACTOR",     │                    │
│  │   country: "USA",                     │                    │
│  │   clientType: "confidential",         │                    │
│  │   redirectUris: ["https://lm.com/cb"],│                    │
│  │   allowedScopes: ["resource:read"],   │                    │
│  │   maxClassification: "SECRET"         │                    │
│  │ }                                     │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 3: Keycloak OAuth Client Created                       │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Keycloak                         │                    │
│  │ • Create client: "sp-lockheed-martin"│                    │
│  │ • Generate client_id                  │                    │
│  │ • Generate client_secret              │                    │
│  │ • Configure redirect URIs             │                    │
│  │ • Set allowed scopes                  │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 4: Store in MongoDB                                    │
│  ┌──────────────────────────────────────┐                    │
│  │ MongoDB: external_sps collection      │                    │
│  │ {                                     │                    │
│  │   spId: "sp-lm-001",                  │                    │
│  │   name: "Lockheed Martin",            │                    │
│  │   clientId: "sp-lockheed-martin",     │                    │
│  │   clientSecret: "...",                │                    │
│  │   status: "PENDING",  ← Approval      │                    │
│  │   federationAgreements: [],           │                    │
│  │   attributeRequirements: {...}        │                    │
│  │ }                                     │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 5: SuperAdmin Approval                                 │
│  ┌──────────────────────────────────────┐                    │
│  │ Admin UI: /admin/sp-registry          │                    │
│  │ • Review application                  │                    │
│  │ • Verify security clearances          │                    │
│  │ • Check federation agreements         │                    │
│  │ • Approve → status: "ACTIVE"          │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 6: SP Can Now Access Resources                         │
│  ┌──────────────────────────────────────┐                    │
│  │ Lockheed Martin API Client           │                    │
│  │ 1. OAuth2 Client Credentials flow    │                    │
│  │ 2. Get access_token                   │                    │
│  │ 3. GET /api/resources?classification=SECRET│              │
│  │ 4. USA Backend checks:                │                    │
│  │    - SP has federation agreement      │                    │
│  │    - SP maxClassification >= SECRET   │                    │
│  │    - Resource releasable to USA       │                    │
│  │ 5. Return filtered resources          │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key Files:**
- **Backend:** `backend/src/controllers/sp-management.controller.ts` (`registerSP`)
- **Backend:** `backend/src/services/sp-management.service.ts` (SP provisioning)
- **Frontend:** `frontend/src/app/admin/sp-registry/new/page.tsx` (SP registration form)
- **Middleware:** `backend/src/middleware/federation-agreement.middleware.ts` (enforcement)

**Current State:** ✅ **PRODUCTION-READY**
- SP registration workflow implemented
- OAuth client provisioning working
- Federation agreement enforcement exists
- Approval workflow complete

---

### **1.3 Key Differences: IdP vs SP**

| **Aspect** | **IdP Workflow** | **SP Workflow** |
|---|---|---|
| **Purpose** | User authentication federation | OAuth client provisioning |
| **Scope** | Cross-instance (nation-to-nation) | Within-instance (org-to-instance) |
| **Protocol** | OIDC / SAML (identity protocols) | OAuth 2.0 (authorization protocol) |
| **Trust Model** | Bilateral (peer-to-peer) | Hub-spoke (instance is hub) |
| **Users** | Foreign nation users | Industry partners, contractors |
| **Example** | FRA user logs into USA | Lockheed Martin accesses USA resources |
| **Keycloak Entity** | Identity Provider Broker | OAuth Client |
| **Configuration** | IdP mapper, trust settings | Client credentials, scopes, redirect URIs |
| **Management UI** | `/admin/idp` | `/admin/sp-registry` |
| **Automation Script** | `add-federation-partner.sh` | None (manual for now) |
| **Federation Registry** | Yes (USA ↔ FRA) | No (SP-specific) |

---

## 2️⃣ **KAS (KEY ACCESS SERVICE) ARCHITECTURE**

### **2.1 KAS Role in Multi-Instance Federation**

**Purpose:** Policy-bound key release for encrypted resources (ACP-240 compliance)

**Key Concept:** **Per-Instance Sovereignty**
- Each instance has its **own KAS**
- USA KAS manages keys for USA-originated resources
- FRA KAS manages keys for FRA-originated resources
- Cross-KAS federation for multi-instance resources

### **2.2 Single-Instance KAS Flow**

```
┌───────────────────────────────────────────────────────────────┐
│              SINGLE-INSTANCE KAS WORKFLOW                     │
│              (USA User → USA Resource)                        │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Step 1: User Requests Encrypted Resource                    │
│  ┌──────────────────────────────────────┐                    │
│  │ GET /api/resources/doc-usa-secret-123 │                    │
│  │ Authorization: Bearer <JWT>           │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 2: Backend PEP (Policy Enforcement Point)              │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Backend API                      │                    │
│  │ • Call OPA for authorization         │                    │
│  │ • OPA checks: clearance, country, COI│                    │
│  │ • OPA Result: ALLOW                   │                    │
│  │ • Resource has obligation: KAS        │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 3: KAS Key Request                                     │
│  ┌──────────────────────────────────────┐                    │
│  │ POST /request-key (USA KAS)          │                    │
│  │ {                                     │                    │
│  │   resourceId: "doc-usa-secret-123",  │                    │
│  │   kaoId: "kao-abc123",                │                    │
│  │   wrappedKey: "base64...",            │                    │
│  │   bearerToken: "<JWT>"                │                    │
│  │ }                                     │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 4: KAS Policy Re-Evaluation                           │
│  ┌──────────────────────────────────────┐                    │
│  │ USA KAS                              │                    │
│  │ • Verify JWT signature (JWKS)        │                    │
│  │ • Extract user attributes            │                    │
│  │ • Fetch resource metadata (MongoDB)  │                    │
│  │ • Call OPA for INDEPENDENT evaluation│                    │
│  │ • OPA Input:                          │                    │
│  │   {                                   │                    │
│  │     subject: { clearance, country, COI },│               │
│  │     resource: { classification, releasabilityTo, COI },│  │
│  │     action: "decrypt",                │                    │
│  │     context: { acr, amr, auth_time }  │                    │
│  │   }                                   │                    │
│  │ • OPA Result: ALLOW                   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 5: DEK Release                                         │
│  ┌──────────────────────────────────────┐                    │
│  │ USA KAS                              │                    │
│  │ • Retrieve DEK from cache or HSM     │                    │
│  │ • Return DEK to client                │                    │
│  │ • Log audit event: KEY_RELEASED       │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 6: Client Decrypts Resource                           │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Frontend                         │                    │
│  │ • Decrypt content with DEK            │                    │
│  │ • Display to user                     │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key Points:**
- ✅ **Independent Policy Evaluation**: KAS re-evaluates OPA policy (defense in depth)
- ✅ **Fail-Closed**: If OPA unavailable, KAS denies (503 Service Unavailable)
- ✅ **Divergence Detection**: KAS can deny even if PDP allowed (logs security event)
- ✅ **Audit Logging**: All key requests logged (ACP-240 compliance)

### **2.3 Cross-Instance KAS Federation** ⚠️

**Scenario:** FRA user wants to access USA-originated encrypted resource

**Problem:** USA KAS holds the keys, but FRA user is authenticated via FRA Keycloak

**Solution:** **Cross-KAS Key Request** (implemented in code, not yet deployed)

```
┌───────────────────────────────────────────────────────────────┐
│           CROSS-INSTANCE KAS WORKFLOW                         │
│           (FRA User → USA Resource)                           │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Step 1: FRA User Requests USA Resource                      │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA User logged into USA via IdP     │                    │
│  │ GET /api/resources/doc-usa-secret-123 │                    │
│  │ Authorization: Bearer <USA-JWT>       │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 2: USA Backend PEP Authorization                       │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Backend API                      │                    │
│  │ • Call OPA: ALLOW (FRA in releasabilityTo)│              │
│  │ • Resource metadata:                  │                    │
│  │   - originRealm: "USA"  ← Key holder │                    │
│  │   - encrypted: true                   │                    │
│  │   - releasabilityTo: ["USA", "FRA"]   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 3: Determine KAS Authority                            │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Backend                          │                    │
│  │ • Check resource.originRealm = "USA" │                    │
│  │ • KAS Authority = USA KAS            │                    │
│  │ • Call: POST https://usa-kas.dive25.com/request-key│      │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 4: USA KAS Re-Evaluation                              │
│  ┌──────────────────────────────────────┐                    │
│  │ USA KAS                              │                    │
│  │ • Verify USA-JWT (FRA user identity) │                    │
│  │ • Extract: countryOfAffiliation=FRA  │                    │
│  │ • Fetch resource: originRealm=USA    │                    │
│  │ • Call USA OPA:                       │                    │
│  │   - Allow: FRA in releasabilityTo    │                    │
│  │ • Check: resource.originRealm = USA ✅│                    │
│  │ • Release DEK                         │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 5: DEK Returned to FRA User                           │
│  ┌──────────────────────────────────────┐                    │
│  │ USA Backend → FRA Frontend           │                    │
│  │ • Decrypt content                     │                    │
│  │ • Display to FRA user                 │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key Implementation: `kas/src/utils/kas-federation.ts`**

```typescript
export class CrossKASClient {
  /**
   * Request key from remote KAS
   */
  async requestKey(
    kasId: string,
    request: ICrossKASRequest
  ): Promise<ICrossKASResponse> {
    const kasEntry = kasRegistry.get(kasId);
    const client = kasRegistry.getClient(kasId);

    // Authenticate to remote KAS
    const authHeader = await this.getAuthHeader(kasEntry);

    // Request key
    const response = await client.post('/request-key', {
      resourceId: request.resourceId,
      kaoId: request.kaoId,
      wrappedKey: request.wrappedKey,
      subject: {
        uniqueID: request.subject.uniqueID,
        clearance: request.subject.clearance,
        countryOfAffiliation: request.subject.countryOfAffiliation,
        acpCOI: request.subject.acpCOI
      },
      requestId: request.requestId
    }, {
      headers: authHeader
    });

    return {
      success: response.data.success,
      dek: response.data.dek,
      kasId,
      organization: kasEntry.organization
    };
  }
}
```

**Current Status:** ⚠️ **CODE EXISTS, NOT DEPLOYED**
- `CrossKASClient` class implemented in `kas/src/utils/kas-federation.ts`
- KAS registry structure defined
- mTLS, API key, JWT, OAuth2 auth methods supported
- **NOT YET INTEGRATED** into backend resource controller

**Phase 4 TODO:**
1. Deploy KAS registry (`config/kas-registry.json`)
2. Integrate `CrossKASClient` into `backend/src/controllers/resource.controller.ts`
3. Add `originRealm` to all resource metadata
4. Test USA KAS → FRA KAS federation

---

### **2.4 KAS Policy Re-Evaluation Logic**

**Critical Security Feature:** KAS **independently evaluates** OPA policy

**Code:** `kas/src/server.ts` (lines 236-352)

```typescript
// Step 4: Re-Evaluate OPA Policy (Defense in Depth)
const opaInput = {
  input: {
    subject: {
      authenticated: true,
      uniqueID,
      clearance,
      countryOfAffiliation,
      acpCOI: userCOI,
      dutyOrg,
      orgUnit
    },
    action: {
      operation: 'decrypt' // KAS-specific action
    },
    resource: {
      resourceId: resource.resourceId,
      classification: resource.classification,
      releasabilityTo: resource.releasabilityTo,
      COI: resourceCOI,
      creationDate: resource.creationDate,
      encrypted: true
    },
    context: {
      currentTime: new Date().toISOString(),
      sourceIP: req.ip || 'unknown',
      acr: decodedToken.acr,
      amr: decodedToken.amr,
      auth_time: decodedToken.auth_time
    }
  }
};

const opaResponse = await axios.post(
  `${OPA_URL}/v1/data/dive/authorization`,
  opaInput
);

opaDecision = opaResponse.data.result?.decision || opaResponse.data.result;

// Fail-closed: Deny if OPA unavailable
if (!opaDecision.allow) {
  // Log audit event: KEY_DENIED
  // Return 403 Forbidden
}

// Release DEK
```

**Why This Matters:**
- ✅ **Defense in Depth**: KAS doesn't trust PEP's decision
- ✅ **Independent Authority**: KAS can override PEP (e.g., if policy changed)
- ✅ **Divergence Detection**: Logs security event if KAS denies but PDP allowed
- ✅ **Fail-Secure**: If OPA unavailable, KAS fails closed (503)

---

## 3️⃣ **MONGODB RESOURCE ARCHITECTURE**

### **3.1 Per-Instance Resource Ownership**

**Key Principle:** Each instance **owns its resources** stored in its own MongoDB

**Architecture:**

```
┌───────────────────────────────────────────────────────────────┐
│            PER-INSTANCE MONGODB ARCHITECTURE                  │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  USA Instance                                                 │
│  ┌──────────────────────────────────────┐                    │
│  │ MongoDB: dive-v3                     │                    │
│  │ Collection: resources                 │                    │
│  │ ┌────────────────────────────────┐   │                    │
│  │ │ resourceId: "doc-usa-001"      │   │                    │
│  │ │ title: "US Military Plans"     │   │                    │
│  │ │ classification: "SECRET"       │   │                    │
│  │ │ releasabilityTo: ["USA"]       │   │                    │
│  │ │ originRealm: "USA"  ← Owner    │   │                    │
│  │ │ encrypted: true                 │   │                    │
│  │ │ kasAuthority: "usa-kas"        │   │                    │
│  │ └────────────────────────────────┘   │                    │
│  │ ┌────────────────────────────────┐   │                    │
│  │ │ resourceId: "doc-usa-002"      │   │                    │
│  │ │ title: "NATO Joint Exercise"   │   │                    │
│  │ │ classification: "CONFIDENTIAL" │   │                    │
│  │ │ releasabilityTo: ["USA","FRA","GBR"]│                   │
│  │ │ originRealm: "USA"             │   │                    │
│  │ │ encrypted: true                 │   │                    │
│  │ └────────────────────────────────┘   │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
│  FRA Instance                                                 │
│  ┌──────────────────────────────────────┐                    │
│  │ MongoDB: dive-v3-fra                 │                    │
│  │ Collection: resources                 │                    │
│  │ ┌────────────────────────────────┐   │                    │
│  │ │ resourceId: "doc-fra-001"      │   │                    │
│  │ │ title: "French Defense Strategy"│  │                    │
│  │ │ classification: "SECRET"       │   │                    │
│  │ │ releasabilityTo: ["FRA"]       │   │                    │
│  │ │ originRealm: "FRA"  ← Owner    │   │                    │
│  │ │ encrypted: true                 │   │                    │
│  │ │ kasAuthority: "fra-kas"        │   │                    │
│  │ └────────────────────────────────┘   │                    │
│  │ ┌────────────────────────────────┐   │                    │
│  │ │ resourceId: "doc-usa-002" ← Copy│  │                    │
│  │ │ title: "NATO Joint Exercise"   │   │                    │
│  │ │ importedFrom: "USA"  ← Source  │   │                    │
│  │ │ originRealm: "USA"  ← Original │   │                    │
│  │ │ kasAuthority: "usa-kas" ← Key holder│                   │
│  │ │ lastSyncedAt: "2025-11-28T..."  │   │                    │
│  │ └────────────────────────────────┘   │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Key Fields:**
- `resourceId`: Globally unique ID (prefixed with instance code)
- `originRealm`: **WHO OWNS THIS RESOURCE** (USA, FRA, GBR, DEU)
- `kasAuthority`: **WHICH KAS HOLDS THE KEYS** (usa-kas, fra-kas, gbr-kas)
- `importedFrom`: If resource is synced from another instance
- `lastSyncedAt`: When metadata was last synchronized

### **3.2 Resource Types**

**1. Local-Only Resources**
```json
{
  "resourceId": "doc-usa-classified-001",
  "title": "US Eyes Only - Strategic Plans",
  "classification": "TOP_SECRET",
  "releasabilityTo": ["USA"],
  "originRealm": "USA",
  "kasAuthority": "usa-kas",
  "encrypted": true
}
```
- **Stored:** USA MongoDB only
- **Accessible:** USA users only
- **KAS:** USA KAS holds keys

**2. Bilaterally Shared Resources**
```json
{
  "resourceId": "doc-usa-nato-001",
  "title": "NATO Joint Exercise Plans",
  "classification": "SECRET",
  "releasabilityTo": ["USA", "FRA", "GBR"],
  "originRealm": "USA",
  "kasAuthority": "usa-kas",
  "encrypted": true
}
```
- **Stored:** USA MongoDB (original), FRA MongoDB (copy), GBR MongoDB (copy)
- **Accessible:** USA, FRA, GBR users
- **KAS:** USA KAS holds keys (origin authority)

**3. Multilateral Shared Resources**
```json
{
  "resourceId": "doc-nato-cosmic-001",
  "title": "NATO COSMIC TOP SECRET Document",
  "classification": "TOP_SECRET",
  "releasabilityTo": ["NATO"], // All NATO members
  "COI": ["NATO-COSMIC"],
  "originRealm": "USA",
  "kasAuthority": "usa-kas",
  "encrypted": true
}
```
- **Stored:** All NATO instance MongoDB (USA, FRA, GBR, DEU, ...)
- **Accessible:** All NATO users with NATO-COSMIC clearance
- **KAS:** USA KAS (origin) or distributed KAS network

---

### **3.3 Resource Synchronization** (Opt-In)

**Service:** `backend/src/services/fra-federation.service.ts`

**Purpose:** Synchronize resource **metadata** (not content) between instances

**How It Works:**

```typescript
export class FRAFederationService {
  private readonly USA_FEDERATION_ENDPOINT = 'https://dev-api.dive25.com/federation';
  private readonly SYNC_INTERVAL = 300 * 1000; // 5 minutes

  /**
   * Sync resources with USA instance
   */
  async syncWithUSA(): Promise<SyncResult> {
    const correlationId = uuidv4();

    // Step 1: Get federation-eligible FRA resources
    const fraResources = await this.getFederationEligibleResources();

    // Step 2: Push FRA resources to USA
    const pushResult = await this.pushResources(fraResources, correlationId);

    // Step 3: Pull USA resources releasable to FRA
    const usaResources = await this.pullResources(correlationId);

    // Step 4: Import USA resources into FRA MongoDB
    const importResult = await this.importResources(usaResources, 'USA');

    return {
      correlationId,
      timestamp: new Date(),
      resourcesSynced: usaResources.length,
      resourcesPushed: fraResources.length,
      conflicts: importResult.conflicts
    };
  }

  /**
   * Pull resources from USA instance
   */
  private async pullResources(correlationId: string): Promise<FederationResource[]> {
    const token = await this.generateFederationToken();

    const response = await axios.get(
      `${this.USA_FEDERATION_ENDPOINT}/resources`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Correlation-ID': correlationId,
          'X-Origin-Realm': 'FRA'
        },
        params: {
          releasableTo: 'FRA', // Only resources FRA can access
          excludeOrigin: 'FRA' // Don't pull our own resources back
        }
      }
    );

    return response.data.resources || [];
  }

  /**
   * Import resources from another realm
   */
  private async importResources(resources: FederationResource[], sourceRealm: string) {
    for (const resource of resources) {
      const existing = await this.resourcesCollection.findOne({
        resourceId: resource.resourceId
      });

      if (!existing) {
        // New resource - import
        await this.resourcesCollection.insertOne({
          ...resource,
          importedFrom: sourceRealm,
          importedAt: new Date(),
          lastSyncedFrom: sourceRealm,
          lastSyncedAt: new Date()
        });
      } else if (resource.version > existing.version) {
        // Resource updated - sync
        await this.resourcesCollection.updateOne(
          { resourceId: resource.resourceId },
          {
            $set: {
              ...resource,
              lastSyncedFrom: sourceRealm,
              lastSyncedAt: new Date()
            }
          }
        );
      }
    }
  }
}
```

**Key Points:**
- ✅ **Opt-In**: Only resources with `releasabilityTo` containing target instance
- ✅ **Metadata Only**: Syncs classification, releasabilityTo, COI (not encrypted content)
- ✅ **Origin Tracking**: Preserves `originRealm` and `kasAuthority`
- ✅ **Version Control**: Uses `version` field to detect updates
- ✅ **Conflict Resolution**: Logs conflicts for manual review

**Current Status:** ✅ **IMPLEMENTED**
- FRA ↔ USA sync working
- Correlation IDs for audit
- Version-based conflict detection
- 5-minute sync interval

---

### **3.4 Cross-Instance Resource Access**

**Scenario:** FRA user wants to access USA resource (that's releasable to FRA)

**Flow:**

```
┌───────────────────────────────────────────────────────────────┐
│         CROSS-INSTANCE RESOURCE ACCESS FLOW                   │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Step 1: FRA User Browses Resources                          │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA Frontend: /resources              │                    │
│  │ • Shows FRA-owned resources           │                    │
│  │ • Shows USA resources (synced metadata)│                   │
│  │   - doc-usa-nato-001 (releasable to FRA)│                 │
│  │   - doc-usa-002 (releasable to FRA)   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 2: FRA User Clicks USA Resource                       │
│  ┌──────────────────────────────────────┐                    │
│  │ GET /api/resources/doc-usa-002        │                    │
│  │ Authorization: Bearer <FRA-JWT>       │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 3: FRA Backend Checks Resource    │                    │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA MongoDB Query                    │                    │
│  │ • Find: resourceId = "doc-usa-002"   │                    │
│  │ • Result:                             │                    │
│  │   - originRealm: "USA" ← Not local   │                    │
│  │   - importedFrom: "USA"               │                    │
│  │   - kasAuthority: "usa-kas"           │                    │
│  │   - encrypted: true                   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 4: Determine Access Strategy      │                    │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA Backend Logic                    │                    │
│  │ if (resource.originRealm !== "FRA") {│                    │
│  │   // Cross-instance resource          │                    │
│  │   if (resource.encrypted) {           │                    │
│  │     // Need to call USA KAS           │                    │
│  │     return fetchEncryptedFromOrigin(resource);│           │
│  │   } else {                            │                    │
│  │     // Metadata available locally     │                    │
│  │     return resource;                  │                    │
│  │   }                                   │                    │
│  │ }                                     │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 5: Call USA KAS for Key          │                    │
│  ┌──────────────────────────────────────┐                    │
│  │ CrossKASClient.requestKey(           │                    │
│  │   kasId: "usa-kas",                   │                    │
│  │   resourceId: "doc-usa-002",          │                    │
│  │   subject: { FRA user attributes }    │                    │
│  │ )                                     │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 6: USA KAS Re-Evaluates Policy   │                    │
│  ┌──────────────────────────────────────┐                    │
│  │ USA KAS                              │                    │
│  │ • Verify FRA user identity            │                    │
│  │ • Check USA resource releasabilityTo  │                    │
│  │ • Call USA OPA: ALLOW (FRA in list)  │                    │
│  │ • Release DEK                         │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Step 7: FRA Backend Returns Resource  │                    │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA Backend → FRA Frontend           │                    │
│  │ • Return resource + DEK               │                    │
│  │ • Frontend decrypts with DEK          │                    │
│  │ • Display to FRA user                 │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**⚠️ Current Gap:** Cross-KAS request not integrated into resource controller

**Phase 4 TODO:**
1. Add `originRealm` detection logic in `backend/src/controllers/resource.controller.ts`
2. Integrate `CrossKASClient` for encrypted cross-instance resources
3. Handle KAS failure scenarios (fallback, retry)
4. Test FRA user accessing USA encrypted resource

---

## 4️⃣ **OPA POLICY ARCHITECTURE**

### **4.1 Policy Hierarchy**

DIVE V3 uses a **layered policy model**:

```
┌───────────────────────────────────────────────────────────────┐
│                  OPA POLICY HIERARCHY                         │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  LAYER 1: Global NATO Compliance Guardrails                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ File: fuel_inventory_abac_policy.rego                │    │
│  │ Package: dive.authorization                           │    │
│  │                                                        │    │
│  │ Rules (CANNOT BE OVERRIDDEN):                         │    │
│  │ • is_not_authenticated                                │    │
│  │ • is_insufficient_clearance (clearance levels)       │    │
│  │ • is_not_releasable_to_country (releasability)       │    │
│  │ • is_coi_violation (COI matching)                     │    │
│  │ • is_under_embargo (time-based)                       │    │
│  │ • is_ztdf_integrity_violation (STANAG 4778)          │    │
│  │ • is_mfa_not_verified (AAL enforcement)              │    │
│  │                                                        │    │
│  │ Applied to: ALL instances (USA, FRA, GBR, DEU)       │    │
│  │ Enforced by: OPA running in each instance            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  LAYER 2: Specialized Policy Modules                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ File: federation_abac_policy.rego                    │    │
│  │ Package: dive.federation                              │    │
│  │ Focus: Identity federation (AAL, token lifetime)     │    │
│  │                                                        │    │
│  │ File: object_abac_policy.rego                        │    │
│  │ Package: dive.object                                  │    │
│  │ Focus: Data-centric security (ZTDF, KAS)            │    │
│  │                                                        │    │
│  │ File: admin_authorization_policy.rego                │    │
│  │ Package: dive.admin_authorization                    │    │
│  │ Focus: Super admin operations                        │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  LAYER 3: Instance-Specific Policies (OPTIONAL)              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ File: fra-authorization-policy.rego (FRA instance)   │    │
│  │ Package: dive.fra.authorization                      │    │
│  │                                                        │    │
│  │ Rules (CAN BE MORE RESTRICTIVE):                     │    │
│  │ • is_fra_resource_owner_only (FRA-specific logic)    │    │
│  │ • is_french_security_clearance_invalid               │    │
│  │   (map French clearance levels)                       │    │
│  │ • is_eu_export_control_violated                      │    │
│  │   (EU-specific compliance)                            │    │
│  │                                                        │    │
│  │ Applied to: FRA instance ONLY                        │    │
│  │ Evaluated: AFTER global guardrails (AND logic)       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

### **4.2 Global Guardrail Policy**

**File:** `policies/fuel_inventory_abac_policy.rego`

**Key Characteristics:**
- ✅ **Default Deny**: `allow := true if { ... } else := false`
- ✅ **Fail-Secure Pattern**: Uses `is_not_a_*` violation checks
- ✅ **NATO Compliance**: ACP-240, STANAG 4774/5636
- ✅ **Comprehensive**: 933 lines, 41+ test cases
- ✅ **COI Coherence**: Validates COI membership, mutual exclusivity
- ✅ **ZTDF Integrity**: Validates STANAG 4778 signatures
- ✅ **KAS Obligations**: Returns obligations for encrypted resources

**Core Rules:**

```rego
package dive.authorization

import rego.v1

# ============================================
# Main Authorization Rule
# ============================================
allow := true if {
	not is_not_authenticated
	not is_missing_required_attributes
	not is_insufficient_clearance
	not is_not_releasable_to_country
	not is_coi_violation
	count(is_coi_coherence_violation) == 0
	not is_under_embargo
	not is_ztdf_integrity_violation
	not is_upload_not_releasable_to_uploader
	not is_authentication_strength_insufficient
	not is_mfa_not_verified
	not is_industry_access_blocked
} else := false

# ============================================
# Violation Rules (Examples)
# ============================================

# Clearance Check
is_insufficient_clearance := msg if {
	required_level := clearance_level_numeric(input.resource.classification)
	user_level := clearance_level_numeric(input.subject.clearance)
	user_level < required_level
	msg := sprintf("User clearance %s (level %d) insufficient for %s (level %d)", 
		[input.subject.clearance, user_level, 
		 input.resource.classification, required_level])
}

# Releasability Check
is_not_releasable_to_country := msg if {
	count(input.resource.releasabilityTo) > 0
	not input.subject.countryOfAffiliation in input.resource.releasabilityTo
	msg := sprintf("Country %s not in releasabilityTo: %v", 
		[input.subject.countryOfAffiliation, 
		 input.resource.releasabilityTo])
}

# COI Check
is_coi_violation := msg if {
	count(input.resource.COI) > 0
	user_cois := input.subject.acpCOI
	resource_cois := input.resource.COI
	not has_coi_intersection(user_cois, resource_cois)
	msg := sprintf("User COI %v does not intersect with resource COI %v", 
		[user_cois, resource_cois])
}
```

**Applied To:** **ALL INSTANCES**
- USA OPA evaluates this policy
- FRA OPA evaluates this policy
- GBR OPA evaluates this policy
- DEU OPA evaluates this policy

**Cannot Be Overridden:** Instance policies can add restrictions, but **cannot bypass** these rules

---

### **4.3 Instance-Specific Policies**

**Example:** FRA-specific policy

**File:** `policies/fra-authorization-policy.rego` (if exists)

**Purpose:** Add **France-specific** authorization rules

**Example Rules:**

```rego
package dive.fra.authorization

import rego.v1
import data.dive.authorization as global

# Import global policy
default allow := false

# ============================================
# FRA-Specific Authorization
# ============================================

allow if {
	# MUST pass global policy first
	global.allow
	
	# THEN apply FRA-specific rules
	not is_fra_specific_violation
}

# ============================================
# FRA-Specific Violations
# ============================================

# Example: FRA requires EU export control check
is_fra_specific_violation := msg if {
	input.resource.classification in ["SECRET", "TOP_SECRET"]
	input.resource.originRealm == "FRA"
	not input.subject.euExportControlClearance
	msg := "FRA SECRET resources require EU export control clearance"
}

# Example: FRA maps French clearance levels
is_fra_specific_violation := msg if {
	input.subject.clearance == "CONFIDENTIEL_DEFENSE"
	input.resource.classification == "TOP_SECRET"
	msg := "CONFIDENTIEL_DEFENSE cannot access TOP_SECRET (mapping issue)"
}
```

**Evaluation Order:**

```typescript
// backend/src/middleware/authz.middleware.ts
async function evaluateOPA(subject, resource, action, context) {
  // Step 1: Evaluate global policy
  const globalResult = await opaClient.evaluate('dive/authorization', {
    input: { subject, resource, action, context }
  });

  if (!globalResult.allow) {
    return { allow: false, reason: globalResult.reason, source: 'global' };
  }

  // Step 2: Evaluate instance-specific policy (if exists)
  const instanceRealm = process.env.INSTANCE_REALM || 'USA';
  const instancePolicyPath = `dive/${instanceRealm.toLowerCase()}/authorization`;

  try {
    const instanceResult = await opaClient.evaluate(instancePolicyPath, {
      input: { subject, resource, action, context }
    });

    if (!instanceResult.allow) {
      return { allow: false, reason: instanceResult.reason, source: 'instance' };
    }
  } catch (error) {
    // Instance policy not found - OK, use global only
  }

  return { allow: true, reason: 'Global + instance policies satisfied' };
}
```

**Key Points:**
- ✅ **Global First**: Always evaluate global policy first
- ✅ **Instance Adds Restrictions**: Instance policy can only **further restrict**
- ✅ **Graceful Degradation**: If instance policy missing, use global only
- ✅ **Audit Both**: Log which policy source made decision

---

### **4.4 Policy Synchronization**

**Problem:** How to ensure all instances have same global policy version?

**Current Approach:** **Manual deployment** (copy-paste policy files)

**Phase 4 Improvement:** **Policy Bundle Versioning**

```
┌───────────────────────────────────────────────────────────────┐
│              POLICY BUNDLE SYNCHRONIZATION                    │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Central Policy Repository (GitHub)                           │
│  ┌──────────────────────────────────────┐                    │
│  │ policies/                             │                    │
│  │ ├── fuel_inventory_abac_policy.rego  │                    │
│  │ ├── federation_abac_policy.rego      │                    │
│  │ ├── object_abac_policy.rego          │                    │
│  │ ├── admin_authorization_policy.rego  │                    │
│  │ └── bundle.tar.gz (versioned)        │                    │
│  │     - Version: 2.1.0                  │                    │
│  │     - Timestamp: 2025-11-28T00:00:00Z│                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Automated Deployment (CI/CD)                                │
│  ┌──────────────────────────────────────┐                    │
│  │ GitHub Actions                       │                    │
│  │ • On policy commit → main            │                    │
│  │ • Build OPA bundle                    │                    │
│  │ • Run policy tests                    │                    │
│  │ • Tag version (2.1.0)                │                    │
│  │ • Deploy to all instances:            │                    │
│  │   - USA OPA: Load bundle v2.1.0      │                    │
│  │   - FRA OPA: Load bundle v2.1.0      │                    │
│  │   - GBR OPA: Load bundle v2.1.0      │                    │
│  │   - DEU OPA: Load bundle v2.1.0      │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Instance OPA Servers                                        │
│  ┌──────────────────────────────────────┐                    │
│  │ USA OPA                              │                    │
│  │ • Current bundle: 2.1.0              │                    │
│  │ • Auto-reload on update               │                    │
│  └──────────────────────────────────────┘                    │
│  ┌──────────────────────────────────────┐                    │
│  │ FRA OPA                              │                    │
│  │ • Current bundle: 2.1.0              │                    │
│  │ • Auto-reload on update               │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Implementation:**

1. **Policy as Code**: All policies in `policies/` directory
2. **Version Tagging**: Git tags for policy versions (v2.1.0)
3. **Automated Testing**: `opa test` in CI/CD pipeline
4. **OPA Bundle Server**: Serve bundles via HTTPS
5. **Instance Pull**: Each OPA server polls for updates (or webhook)

**Status:** ⚠️ **NOT IMPLEMENTED**
- Manual policy deployment currently
- No version tracking across instances
- Risk of policy drift

**Phase 4 TODO:**
1. Set up OPA bundle server
2. Implement policy versioning
3. Add CI/CD pipeline for policy deployment
4. Add policy version health check (`GET /v1/data/dive/policy_version`)

---

## 5️⃣ **FEDERATION INTEGRATION PATTERNS**

### **5.1 Pattern 1: IdP Federation (Cross-Instance Identity)**

**Use Case:** FRA user logs into USA instance

**Components:**
- USA Keycloak: IdP broker for FRA
- FRA Keycloak: IdP for FRA users
- Protocol: OIDC
- Token: FRA issues JWT → USA validates

**Files:**
- `scripts/add-federation-partner.sh`
- `terraform/modules/federated-instance/idp-brokers.tf`
- `config/federation-registry.json`

**Status:** ✅ **WORKING**

---

### **5.2 Pattern 2: Resource Metadata Synchronization**

**Use Case:** FRA wants to see USA resources (metadata only)

**Components:**
- USA Backend: Federation API (`/federation/resources`)
- FRA Backend: FRAFederationService
- Storage: FRA MongoDB imports USA metadata
- Sync Interval: 5 minutes

**Files:**
- `backend/src/services/fra-federation.service.ts`
- `backend/src/routes/fra-federation.routes.ts`
- `backend/src/controllers/federation.controller.ts`

**Status:** ✅ **WORKING**

---

### **5.3 Pattern 3: Cross-Instance Encrypted Resource Access**

**Use Case:** FRA user accesses USA encrypted resource

**Components:**
- FRA Frontend: Request USA resource
- FRA Backend: Detect `originRealm=USA`
- USA KAS: Re-evaluate policy, release key
- Protocol: Cross-KAS key request

**Files:**
- `kas/src/utils/kas-federation.ts` (CrossKASClient)
- `kas/src/server.ts` (KAS re-evaluation)
- `backend/src/controllers/resource.controller.ts` (needs integration)

**Status:** ⚠️ **CODE EXISTS, NOT INTEGRATED**

---

### **5.4 Pattern 4: SP External Access (Within-Instance)**

**Use Case:** Lockheed Martin (contractor) accesses USA resources

**Components:**
- USA Keycloak: OAuth client for Lockheed Martin
- USA Backend: SP authentication middleware
- Federation Agreement: MaxClassification, allowed COIs
- Protocol: OAuth 2.0 Client Credentials

**Files:**
- `backend/src/services/sp-management.service.ts`
- `backend/src/middleware/federation-agreement.middleware.ts`
- `frontend/src/app/admin/sp-registry/new/page.tsx`

**Status:** ✅ **WORKING**

---

## 6️⃣ **CRITICAL GAPS & RECOMMENDATIONS**

### **Gap 1: Cross-Instance Resource Discovery**

**Problem:** No unified search across all instances

**Current State:**
- FRA user searches FRA MongoDB only
- Sees: FRA-owned resources + USA resources (synced metadata)
- Missing: GBR resources, DEU resources

**Recommended Solution:**

```
┌───────────────────────────────────────────────────────────────┐
│         FEDERATED RESOURCE DISCOVERY SERVICE                  │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  FRA User Search Query: "NATO exercise"                       │
│                 │                                              │
│                 ▼                                              │
│  FRA Backend: Federated Search Controller                    │
│  ┌──────────────────────────────────────┐                    │
│  │ Parallel queries to all instances:    │                    │
│  │ • Query FRA MongoDB (local)           │                    │
│  │ • Query USA Federation API             │                    │
│  │ • Query GBR Federation API             │                    │
│  │ • Query DEU Federation API             │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Aggregate Results (Authorization-Aware)                     │
│  ┌──────────────────────────────────────┐                    │
│  │ • Filter by releasabilityTo: FRA      │                    │
│  │ • Filter by clearance: user.clearance │                    │
│  │ • Filter by COI: user.acpCOI          │                    │
│  │ • Deduplicate (same resourceId)       │                    │
│  │ • Rank by relevance                   │                    │
│  └──────────────────────────────────────┘                    │
│                 │                                              │
│                 ▼                                              │
│  Return Federated Search Results                            │
│  ┌──────────────────────────────────────┐                    │
│  │ [                                     │                    │
│  │   { resourceId: "doc-fra-001", originRealm: "FRA" },│     │
│  │   { resourceId: "doc-usa-002", originRealm: "USA" },│     │
│  │   { resourceId: "doc-gbr-003", originRealm: "GBR" }│      │
│  │ ]                                     │                    │
│  └──────────────────────────────────────┘                    │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Implementation:**
1. Create `/api/resources/federated-search` endpoint
2. Query all federation partners in parallel
3. Aggregate, filter, deduplicate results
4. Add `originRealm` badge in UI

---

### **Gap 2: KAS Federation Implementation**

**Problem:** Cross-KAS key requests not integrated

**Current State:**
- `CrossKASClient` class exists in `kas/src/utils/kas-federation.ts`
- Not called by resource controller
- No KAS registry deployed

**Recommended Solution:**

1. **Deploy KAS Registry**

```json
// config/kas-registry.json
{
  "kasServers": [
    {
      "kasId": "usa-kas",
      "organization": "United States",
      "kasUrl": "https://usa-kas.dive25.com",
      "authMethod": "jwt",
      "trustLevel": "high",
      "supportedCountries": ["USA"],
      "supportedCOIs": ["US-ONLY", "CAN-US", "FVEY", "NATO"]
    },
    {
      "kasId": "fra-kas",
      "organization": "France",
      "kasUrl": "https://fra-kas.dive25.com",
      "authMethod": "jwt",
      "trustLevel": "high",
      "supportedCountries": ["FRA"],
      "supportedCOIs": ["FRA-US", "NATO", "EU-RESTRICTED"]
    }
  ]
}
```

2. **Integrate into Resource Controller**

```typescript
// backend/src/controllers/resource.controller.ts
export async function getResource(req, res) {
  const resource = await resourceService.getResource(resourceId);

  // Check if cross-instance encrypted resource
  if (resource.encrypted && resource.originRealm !== INSTANCE_REALM) {
    // Call origin KAS
    const kasClient = new CrossKASClient();
    const kasAuthority = `${resource.originRealm.toLowerCase()}-kas`;

    const keyResponse = await kasClient.requestKey(kasAuthority, {
      resourceId: resource.resourceId,
      kaoId: resource.kaoId,
      wrappedKey: resource.wrappedKey,
      subject: {
        uniqueID: req.user.uniqueID,
        clearance: req.user.clearance,
        countryOfAffiliation: req.user.countryOfAffiliation,
        acpCOI: req.user.acpCOI
      },
      requestId: req.headers['x-request-id']
    });

    if (!keyResponse.success) {
      return res.status(403).json({
        error: 'Forbidden',
        message: keyResponse.denialReason,
        kasAuthority
      });
    }

    resource.dek = keyResponse.dek;
  }

  res.json(resource);
}
```

---

### **Gap 3: Policy Version Tracking**

**Problem:** No way to verify all instances have same policy version

**Recommended Solution:**

1. **Add Policy Version Endpoint**

```rego
// policies/policy_version.rego
package dive

policy_version := {
  "version": "2.1.0",
  "bundleId": "dive-v3-global-policies",
  "timestamp": "2025-11-28T00:00:00Z",
  "modules": [
    "dive.authorization",
    "dive.federation",
    "dive.object",
    "dive.admin_authorization"
  ]
}
```

```typescript
// backend/src/controllers/health.controller.ts
export async function getPolicyVersion(req, res) {
  const opaResponse = await axios.get(
    `${OPA_URL}/v1/data/dive/policy_version`
  );

  res.json({
    instance: INSTANCE_REALM,
    policyVersion: opaResponse.data.result,
    opaUrl: OPA_URL
  });
}
```

2. **Add Monitoring**

```typescript
// backend/src/services/policy-version-monitor.ts
export class PolicyVersionMonitor {
  async checkPolicyConsistency(): Promise<PolicyVersionReport> {
    const instances = ['USA', 'FRA', 'GBR', 'DEU'];
    const versions = {};

    for (const instance of instances) {
      const response = await axios.get(
        `https://${instance.toLowerCase()}-api.dive25.com/api/health/policy-version`
      );
      versions[instance] = response.data.policyVersion.version;
    }

    const uniqueVersions = new Set(Object.values(versions));

    if (uniqueVersions.size > 1) {
      logger.warn('POLICY DRIFT DETECTED', { versions });
      return {
        consistent: false,
        versions,
        recommendation: 'Update all instances to latest policy bundle'
      };
    }

    return { consistent: true, versions };
  }
}
```

---

### **Gap 4: Resource Origin Tracking**

**Problem:** Not all resources have `originRealm` field

**Recommended Solution:**

1. **Database Migration**

```typescript
// backend/src/scripts/add-origin-realm.ts
async function addOriginRealm() {
  const resources = await db.collection('resources').find({}).toArray();

  for (const resource of resources) {
    if (!resource.originRealm) {
      // Infer from resourceId prefix
      const prefix = resource.resourceId.split('-')[1]; // "doc-usa-001" → "usa"
      const originRealm = prefix.toUpperCase();

      await db.collection('resources').updateOne(
        { _id: resource._id },
        { $set: { originRealm } }
      );
    }
  }
}
```

2. **Enforce at Creation**

```typescript
// backend/src/controllers/upload.controller.ts
export async function uploadResource(req, res) {
  const resource = {
    resourceId: generateResourceId(),
    originRealm: INSTANCE_REALM, // Always set
    kasAuthority: `${INSTANCE_REALM.toLowerCase()}-kas`,
    ...req.body
  };

  await resourceService.createResource(resource);
}
```

---

### **Gap 5: Federation Agreement Enforcement**

**Problem:** Middleware exists but not fully integrated

**Recommended Solution:**

1. **Integrate Middleware**

```typescript
// backend/src/routes/resource.routes.ts
router.get('/resources/:id',
  authenticate,
  enrichUserAttributes,
  enforceFederationAgreement, // ← Add this
  getResourceByIdHandler
);
```

2. **Store SP Federation Agreements**

```typescript
// backend/src/models/federation-agreement.model.ts
export interface IFederationAgreement {
  spId: string;
  allowedIdPs: string[]; // ["usa-idp", "fra-federation"]
  allowedCountries: string[]; // ["USA", "FRA"]
  maxClassification: string; // "SECRET"
  allowedCOIs: string[]; // ["NATO", "FVEY"]
  minAAL: number; // 2
  maxAuthAge: number; // 3600 (seconds)
  status: 'active' | 'suspended' | 'expired';
  expirationDate?: Date;
}
```

---

## 7️⃣ **PHASE 4 IMPLEMENTATION ROADMAP**

### **Week 1-2: Core Integration**

1. ✅ Integrate IdP wizard with federation partner quick-add
2. ✅ Integrate SP registry with self-service portal
3. ✅ Deploy KAS registry
4. ✅ Integrate CrossKASClient into resource controller
5. ✅ Add `originRealm` to all resources (migration)

### **Week 3-4: Policy & Monitoring**

6. ✅ Implement OPA policy bundle versioning
7. ✅ Deploy policy version monitoring
8. ✅ Add federated resource discovery API
9. ✅ Integrate federation agreement middleware
10. ✅ Add policy drift alerting

### **Week 5-6: Testing & Documentation**

11. ✅ Test cross-instance encrypted resource access
12. ✅ Test federated search across all instances
13. ✅ Test policy drift detection
14. ✅ E2E testing (50+ scenarios)
15. ✅ Update architecture documentation

---

## 8️⃣ **SUCCESS CRITERIA**

### **Functional Requirements**

- ✅ FRA user can access USA encrypted resource (via USA KAS)
- ✅ SuperAdmin can onboard new partner in <5 minutes
- ✅ External SP can self-register and get OAuth client
- ✅ Federated search returns results from all instances
- ✅ Policy drift detected and alerted within 5 minutes
- ✅ All instances report same policy version
- ✅ KAS federation working (USA ↔ FRA ↔ GBR)

### **Non-Functional Requirements**

- ✅ Cross-instance resource access latency <500ms (p95)
- ✅ Federated search latency <2s (p95)
- ✅ KAS key request latency <200ms (p95)
- ✅ Policy consistency check interval: 5 minutes
- ✅ Zero manual Terraform commands for partner onboarding
- ✅ 100% resource origin tracking
- ✅ 100% policy version visibility

---

## 9️⃣ **CONCLUSION**

### ✅ **What's Working**

1. **IdP Federation**: Bidirectional OIDC trust (USA ↔ FRA ↔ GBR ↔ DEU)
2. **SP Registry**: OAuth client provisioning for external organizations
3. **KAS Policy Re-Evaluation**: Independent policy checks before key release
4. **Resource Metadata Sync**: FRA ↔ USA resource synchronization
5. **Global OPA Policies**: NATO compliance enforced universally
6. **Token Blacklist**: Centralized Redis for cross-instance revocation

### ⚠️ **What Needs Work**

1. **Cross-KAS Integration**: Code exists, not deployed
2. **Federated Search**: No unified search across instances
3. **Policy Versioning**: No global version tracking
4. **Origin Tracking**: Missing `originRealm` on some resources
5. **Federation Agreement**: Middleware not fully integrated

### 🎯 **Next Steps for Option A**

1. Start with **Quick-Win MVP** (4-8 hours) from integration assessment
2. Implement **Gap 2** (KAS Federation) - Highest priority
3. Implement **Gap 1** (Federated Search) - High user value
4. Implement **Gap 3** (Policy Versioning) - Critical for compliance
5. Implement **Gap 4** (Origin Tracking) - Database migration
6. Implement **Gap 5** (Federation Agreement) - Security hardening

---

**END OF COMPREHENSIVE AUDIT** ✅

**STATUS:** Ready for Option A (Full Integration) implementation  
**RISK LEVEL:** Medium (most infrastructure exists, needs integration)  
**EFFORT:** 5-6 weeks (realistic timeline with testing)  
**VALUE:** High (scalable, secure, NATO-compliant multi-instance federation)








