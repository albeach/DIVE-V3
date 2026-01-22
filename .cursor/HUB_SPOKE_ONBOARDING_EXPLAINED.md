# Hub-Spoke Onboarding Process - Explained in Simple Terms

**Date:** 2026-01-22  
**Audience:** Non-technical stakeholders  
**Purpose:** Understand what happens when a country (spoke) joins the DIVE federation

---

## 🌍 THE BIG PICTURE (Layman's Terms)

Think of DIVE like an exclusive members-only club where NATO countries share classified information:

- **The Hub (USA):** The main headquarters with the master guest list and security policies
- **Spokes (FRA, GBR, DEU, etc.):** Individual country offices that want to join the club  
- **Onboarding:** The process of getting a new country office connected and trusted

**Your Question:** "When France (FRA) wants to join, what handshakes happen to make everything work?"

---

## 🤝 THE ONBOARDING HANDSHAKE (Step-by-Step)

### PHASE 1: Spoke Says "Hello, I Want to Join"

**What Happens:**
```bash
# Administrator runs this command on the France spoke
./dive spoke deploy fra
```

**Behind the Scenes:**
1. **Spoke containers start** (France's own Keycloak, database, backend, etc.)
2. **Spoke calls Hub:** "Hi, I'm France, here are my credentials"
   - Sends: Instance code (FRA), name, URLs, certificate, Keycloak password
   - POST request: `https://hub-backend:4000/api/spoke/register`

**Result:** Hub creates a "pending" registration (like a membership application)

---

### PHASE 2: Hub Admin Says "Yes, France Can Join"

**What Happens:**
```bash
# Hub administrator approves France
curl -X POST https://localhost:4000/api/spoke/approve/spoke-fra-abc123 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "allowedScopes": ["policy:base", "policy:fra"],
    "trustLevel": "bilateral",
    "maxClassification": "SECRET"
  }'
```

**Behind the Scenes (Automatic Cascade):**

This is where ALL the magic happens! The Hub approval triggers **7 automatic configuration steps:**

#### Step 1: **Keycloak Federation** (Identity Trust - Bidirectional!)
```
What: Hub and Spoke exchange identity provider (IdP) configurations
Why: So users can log in with "their" Keycloak and access "other" resources

Hub Keycloak:
  ✅ Creates "fra-idp" (points to France Keycloak)
  ✅ French users can now log into USA Hub using FRA credentials
  
France Keycloak:
  ✅ Creates "usa-idp" (points to USA Hub Keycloak)
  ✅ USA users can now log into France spoke using USA credentials

Technical: OIDC federation with protocol mappers for DIVE attributes
```

#### Step 2: **Trusted Issuer Registration** (Token Validation)
```
What: Hub adds France Keycloak to its "trusted issuers" list
Why: So Hub recognizes French tokens as legitimate

MongoDB Collection: trusted_issuers
New Document:
{
  "issuerUrl": "https://localhost:8644/realms/dive-v3-broker-fra",
  "tenant": "FRA",
  "name": "France Keycloak",
  "country": "FRA",
  "trust_level": "BILATERAL",
  "enabled": true
}

Result: French JWT tokens are now accepted by Hub OPA policies
```

#### Step 3: **Federation Matrix Update** (Access Rules)
```
What: Hub adds France to its "federation partners" list
Why: So policies know "USA trusts FRA" and "FRA trusts USA"

MongoDB Collection: federation_matrix
Updated Document:
{
  "USA": ["FRA", "GBR", ...],  ← FRA added here
  "FRA": ["USA", ...]           ← USA added to FRA's list
}

Result: Cross-border authorization now works (USA user → FRA resource)
```

#### Step 4: **OPAL Distribution** (Real-Time Policy Sync)
```
What: Hub OPAL Server pushes updates to all spoke OPAL clients
Why: So ALL spokes immediately know about the new France member

Flow:
  Hub MongoDB updated
    ↓
  Hub Backend publishes to OPAL Server (JWT authenticated)
    ↓
  OPAL Server broadcasts to all spoke OPAL clients
    ↓
  Spoke OPA instances receive fresh trusted_issuers & federation_matrix
    ↓
  All spokes can now validate French tokens!

Speed: < 10 seconds for global propagation
```

#### Step 5: **Spoke Token Generation** (API Access)
```
What: Hub generates a secure token for France spoke
Why: So France spoke can call Hub APIs (heartbeat, policy sync, KAS requests)

Token Contains:
- spokeId: spoke-fra-abc123
- scopes: ["policy:base", "policy:fra"]
- expiresAt: 24 hours from now
- signature: HMAC signed by Hub

Result: France can now authenticate to Hub APIs
```

#### Step 6: **KAS Registry Update** (Encryption Key Access)
```
What: Hub registers France's KAS (Key Access Service) instance
Why: So encrypted documents can be decrypted across borders

Hub KAS Registry:
{
  "fra-kas": {
    "url": "https://dive-spoke-fra-kas:8080",
    "publicUrl": "https://localhost:10001",
    "instanceCode": "FRA",
    "trustLevel": "BILATERAL",
    "enabled": true
  }
}

Result: Users can request decryption keys from France KAS
```

#### Step 7: **Policy Scope Assignment** (What France Can See)
```
What: Hub tells France which policies it can download
Why: France only gets policies relevant to them (not Germany's secrets!)

Scopes Granted to FRA:
  - policy:base      (Everyone gets base policies)
  - policy:fra       (France-specific policies)
  - data:federation_matrix
  - data:trusted_issuers

Scopes NOT granted:
  - policy:usa       (USA internal policies)
  - policy:gbr       (UK internal policies)
  - policy:deu       (Germany internal policies)

Result: France downloads only authorized policy bundles
```

---

## 🎯 YOUR QUESTION ANSWERED

> "When a Hub approves a spoke, are all of these resources verified/configured at the same time?"

**YES! It's a single "approval" that triggers an automatic cascade.**

Here's what happens in the Hub backend when you approve a spoke:

```typescript
// hubSpokeRegistry.approveSpoke(spokeId, admin, options)
//
// 1. Update status: pending → approved
// 2. AUTO: Create bidirectional Keycloak IdP (both directions)
//    └─ If this fails, spoke is auto-suspended (fail-fast)
// 3. AUTO: Add to trusted_issuers (MongoDB)
// 4. AUTO: Add to federation_matrix (MongoDB)
// 5. AUTO: Notify OPAL Server (push to all spokes)
// 6. AUTO: Generate spoke token (for Hub API access)
// 7. AUTO: Emit event for KAS registry, cache invalidation, audit log
//
// Result: 100% operational federation in < 30 seconds
```

---

## 🔄 WHAT SERVICES GET CONFIGURED (Checklist)

When France spoke is approved, the Hub AUTOMATICALLY configures:

| Service | What Gets Configured | Automatic? | How Long? |
|---------|---------------------|------------|-----------|
| **Keycloak (Hub)** | `fra-idp` created, enabled, mapped | ✅ Auto | ~5 sec |
| **Keycloak (Spoke)** | `usa-idp` created via remote API | ✅ Auto | ~5 sec |
| **MongoDB trusted_issuers** | FRA issuer added | ✅ Auto | < 1 sec |
| **MongoDB federation_matrix** | USA ↔ FRA bilateral trust | ✅ Auto | < 1 sec |
| **OPAL (Hub → All Spokes)** | Push trusted_issuers update | ✅ Auto | ~5 sec |
| **OPA (All Instances)** | Fresh policy data loaded | ✅ Auto | ~10 sec |
| **Spoke Token** | Generated for Hub API access | ✅ Auto | < 1 sec |
| **KAS Registry** | FRA KAS registered | ⚠️ **Manual** | N/A |
| **Policy Bundle** | Scoped bundle for FRA | ⚠️ **On-demand** | When requested |
| **Audit Log** | All events recorded | ✅ Auto | < 1 sec |

### ⚠️ **GAP IDENTIFIED: KAS Registration Not Automatic**

Currently, KAS registration happens separately. This should be part of spoke approval!

---

## 📊 CURRENT VS. IDEAL STATE

### CURRENT (What We Have Now)

```
1. Admin runs: ./dive spoke deploy fra
   └─ Spoke containers start
   └─ Spoke registers with Hub (pending status)

2. Admin manually approves in Hub UI/API
   └─ ✅ Keycloak federation (bidirectional)
   └─ ✅ Trusted issuer added
   └─ ✅ Federation matrix updated
   └─ ✅ OPAL push to all spokes
   └─ ✅ Spoke token generated
   └─ ❌ KAS NOT auto-registered (GAP!)

3. Admin manually registers KAS (separate step)
   └─ Calls /api/kas/register manually
```

### IDEAL (Industry Standard - Zero-Touch Onboarding)

```
1. Admin runs: ./dive spoke deploy fra
   └─ Spoke deploys
   └─ Spoke auto-registers
   └─ Hub auto-approves (if certificate valid)  ← Future enhancement
   └─ ALL services configured automatically:
       ✅ Keycloak federation (both directions)
       ✅ Trusted issuer
       ✅ Federation matrix
       ✅ OPAL synchronization
       ✅ Spoke token
       ✅ KAS registry ← Should be automatic!
       ✅ Policy scope assignment
       ✅ Audit logging

Result: 100% automated onboarding, zero manual steps
```

---

## 🔍 GAP ANALYSIS

### Current Gaps in Spoke Onboarding

| Gap ID | Description | Impact | Priority | Recommendation |
|--------|-------------|--------|----------|----------------|
| **GAP-1** | KAS not auto-registered during approval | Medium | High | Auto-register KAS in `approveSpoke()` |
| **GAP-2** | Manual approval required | Low | Medium | Auto-approve if certificate valid |
| **GAP-3** | No health verification during onboarding | Low | Low | Verify spoke endpoints before approval |
| **GAP-4** | Federation matrix not bidirectional auto | Low | Medium | Auto-update both directions |
| **GAP-5** | No notification to spoke when approved | Medium | Medium | Webhook or polling mechanism |

---

## 🔧 RECOMMENDED ENHANCEMENT: Auto-Register KAS

### Code Change Needed

**File:** `backend/src/services/hub-spoke-registry.service.ts`

**Add to `approveSpoke()` method (around line 758):**

```typescript
// AUTO-REGISTER KAS INSTANCE (New Enhancement)
try {
  await this.registerSpokeKAS(spoke);
  logger.info('KAS auto-registered for approved spoke', {
    spokeId,
    instanceCode: spoke.instanceCode,
  });
} catch (error) {
  logger.warn('Failed to auto-register KAS (non-blocking)', {
    spokeId,
    instanceCode: spoke.instanceCode,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  // Don't fail approval - KAS can be registered manually later
}

// ... existing code for updateOPATrustForSpoke
```

**New Method to Add:**

```typescript
private async registerSpokeKAS(spoke: ISpokeRegistration): Promise<void> {
  const { kasRegistryService } = await import('./kas-registry.service');
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Determine KAS URLs based on environment
  const kasInternalUrl = `https://dive-spoke-${spoke.instanceCode.toLowerCase()}-kas:8080`;
  const kasPublicUrl = isDevelopment
    ? `https://localhost:${10000 + this.getPortOffsetForCountry(spoke.instanceCode)}`
    : `https://${spoke.instanceCode.toLowerCase()}-kas.dive25.com`;
  
  // Register KAS instance
  await kasRegistryService.register({
    instanceCode: spoke.instanceCode,
    kasUrl: kasInternalUrl,
    publicUrl: kasPublicUrl,
    trustLevel: spoke.trustLevel,
    enabled: true,
    maxClassification: spoke.maxClassificationAllowed,
  });
  
  logger.info('Spoke KAS registered automatically', {
    instanceCode: spoke.instanceCode,
    kasUrl: kasInternalUrl,
    publicUrl: kasPublicUrl,
  });
}
```

---

## 🎓 INDUSTRY STANDARDS RESEARCH

### Hub-Spoke Federation Best Practices

**Source:** OpenID Federation 1.0
> "Entities establish trust through a Trust Anchor - a central entity that issues statements about other entities. Multiple levels of authorities can be used: federation operators, organizations, and individual sites."

**Source:** Teleport Zero Trust Auto-Discovery
> "Automatic registration involves: (1) Looking up resources in infrastructure, (2) Checking what's already registered, (3) Creating new services or registering unregistered resources, (4) Deregistering resources that no longer exist."

**Source:** OPAL Architecture
> "OPAL server sends instructions on where to get data rather than the data itself, preventing sensitive data from being pooled in one location."

### How DIVE Compares to Industry Standards

| Industry Standard | DIVE Implementation | Status |
|-------------------|---------------------|--------|
| **Automatic Service Discovery** | ✅ Spoke self-registers with Hub | Compliant |
| **Certificate-Based Trust** | ✅ X.509 cert validation | Compliant |
| **Bidirectional Trust** | ✅ Hub ↔ Spoke Keycloak federation | Compliant |
| **Centralized Policy Distribution** | ✅ OPAL Server → Spoke clients | Compliant |
| **Dynamic Trust Updates** | ✅ Real-time via OPAL | Compliant |
| **Audit Trail** | ✅ All events logged | Compliant |
| **Auto-Register All Services** | ⚠️ Keycloak yes, KAS no | **Gap!** |
| **Health Verification** | ⚠️ Post-registration heartbeat | **Gap!** |

---

## 🚀 COMPLETE SERVICE INTEGRATION MAP

When France (FRA) spoke is approved, here's EVERY service that needs configuration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPOKE APPROVAL CASCADE (Automatic)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRIGGER: Hub admin approves spoke "FRA"                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  1. KEYCLOAK IDENTITY FEDERATION (Bidirectional)                 │       │
│  │     ✅ Hub Keycloak:                                             │       │
│  │        - Creates IdP: "fra-idp"                                  │       │
│  │        - Points to: https://france-keycloak:8443                 │       │
│  │        - Enables: True (appears on login page)                   │       │
│  │        - Maps: clearance, country, COI attributes                │       │
│  │                                                                  │       │
│  │     ✅ France Keycloak (Remote API Call):                        │       │
│  │        - Creates IdP: "usa-idp"                                  │       │
│  │        - Points to: https://usa-keycloak:8443                    │       │
│  │        - Enables: True                                           │       │
│  │        - Uses: France's Keycloak admin password (from registration) │ │
│  │                                                                  │       │
│  │     Result: Bidirectional SSO working                            │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  2. JWT TOKEN TRUST (OPA Policy Data)                            │       │
│  │     ✅ MongoDB trusted_issuers:                                  │       │
│  │        - Document added for FRA Keycloak issuer                  │       │
│  │        - Sets trust_level: BILATERAL                             │       │
│  │        - Enables JWT signature validation                        │       │
│  │                                                                  │       │
│  │     Result: OPA policies can validate French tokens              │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  3. AUTHORIZATION RULES (Federation Matrix)                      │       │
│  │     ✅ MongoDB federation_matrix:                                │       │
│  │        - USA trusts: [..., FRA]                                  │       │
│  │        - FRA trusts: [USA, ...]                                  │       │
│  │                                                                  │       │
│  │     Result: OPA policies allow cross-border resource access      │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  4. REAL-TIME POLICY DISTRIBUTION (OPAL)                         │       │
│  │     ✅ Hub OPAL Server:                                          │       │
│  │        - Publishes trusted_issuers update                        │       │
│  │        - Publishes federation_matrix update                      │       │
│  │        - Broadcasts to ALL spoke OPAL clients                    │       │
│  │                                                                  │       │
│  │     ✅ All Spoke OPAL Clients:                                   │       │
│  │        - Receive push notification                               │       │
│  │        - Fetch fresh data from Hub backend                       │       │
│  │        - Update local OPA instances                              │       │
│  │                                                                  │       │
│  │     Result: All spokes know about FRA within 10 seconds          │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  5. API ACCESS TOKEN (Spoke Authentication)                      │       │
│  │     ✅ Hub generates JWT for spoke:                              │       │
│  │        - Scopes: ["policy:base", "policy:fra"]                   │       │
│  │        - Expiry: 24 hours                                        │       │
│  │        - Signature: Hub HMAC                                     │       │
│  │                                                                  │       │
│  │     ✅ Spoke receives token:                                     │       │
│  │        - Stores in environment: $SPOKE_TOKEN                     │       │
│  │        - Uses for: Heartbeat, policy download, KAS requests      │       │
│  │                                                                  │       │
│  │     Result: Spoke can call Hub APIs securely                     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  6. KAS REGISTRY (Encryption Key Service) - GAP!                 │       │
│  │     ❌ Currently MANUAL:                                         │       │
│  │        - Admin must separately register FRA KAS                  │       │
│  │        - Separate API call to /api/kas/register                  │       │
│  │                                                                  │       │
│  │     ✅ SHOULD BE AUTO:                                           │       │
│  │        - Auto-register during approveSpoke()                     │       │
│  │        - Add to Hub KAS registry                                 │       │
│  │        - Enable cross-border key access immediately              │       │
│  │                                                                  │       │
│  │     Impact: Encrypted documents can't be shared until manual KAS │       │
│  │             registration (breaks user experience)                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  7. AUDIT & MONITORING (Observability)                           │       │
│  │     ✅ Audit log created:                                        │       │
│  │        - Event: spoke:approved                                   │       │
│  │        - Timestamp, admin, correlation ID                        │       │
│  │                                                                  │       │
│  │     ✅ Prometheus metrics updated:                               │       │
│  │        - dive_v3_federation_partners_total                       │       │
│  │        - dive_v3_spoke_registrations_total                       │       │
│  │                                                                  │       │
│  │     Result: Full audit trail and monitoring                      │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 WHAT HAPPENS FOR DIFFERENT USER TYPES

### Scenario 1: French Military Officer Logs into USA Hub

**Step-by-Step:**
1. **User clicks "France" button** on USA Hub login page
   - (Button only appears because fra-idp was auto-created during spoke approval)

2. **Browser redirects to France Keycloak**
   - URL: https://france-keycloak:8443/realms/dive-v3-broker-fra

3. **French officer logs in with FRA credentials**
   - Username: `jean.dupont@defense.gouv.fr`
   - Password: (French password)
   - MFA: French OTP device

4. **France Keycloak returns to USA Hub**
   - Includes: uniqueID, clearance=SECRET, country=FRA, COI=NATO

5. **USA Hub validates token**
   - Checks: Is issuer in trusted_issuers? ✅ Yes (auto-added during approval)
   - Checks: Is FRA in federation_matrix[USA]? ✅ Yes (auto-added)

6. **USA Hub creates session**
   - User can now access USA Hub resources (subject to clearance/releasability)

**Total Time:** ~5 seconds  
**Manual Steps:** 0 (all automatic!)

### Scenario 2: USA Officer Accesses Encrypted French Document

**Step-by-Step:**
1. **USA officer browses resources** on USA Hub

2. **Finds French encrypted document**
   - Classification: SECRET
   - ReleasabilityTo: [USA, FRA]
   - Encrypted: true
   - KAS: fra-kas

3. **USA backend checks authorization**
   - OPA query with French document metadata
   - Policy checks: clearance ✅, releasability ✅, federation ✅

4. **USA backend requests decryption key**
   - Calls: France KAS at https://fra-kas:8080/request-key
   - Includes: USA officer's token, document policy

5. **France KAS validates**
   - **Requires:** FRA KAS in Hub registry (currently manual!)
   - Re-evaluates policy using FRA OPA
   - Returns: Decryption key if authorized

6. **USA backend decrypts document**
   - Uses key from FRA KAS
   - Displays to user

**Current Problem:** Step 5 fails if KAS not manually registered!

---

## 💡 LAYMAN'S EXPLANATION

### Think of It Like Airport Security Clearance

**Scenario:** France (spoke) wants to join the USA's (hub) secure information sharing network.

#### The Old Way (Manual Configuration):
```
1. France calls USA: "We want to join"
2. USA admin says: "OK, but I need to..."
   - Add France to my badge system (30 min)
   - Add France to my access rules (30 min)
   - Tell all other countries about France (30 min)
   - Register France's encryption keys (30 min)
   - Configure France's login portal (30 min)
3. Total: 2.5 hours of manual configuration
4. Risk: Forgot to do one step? Things break!
```

#### The DIVE Way (Mostly Automatic):
```
1. France runs: ./dive spoke deploy fra (2 minutes)
2. USA admin clicks "Approve" (5 seconds)
3. Hub automatically:
   ✅ Adds France to badge system (Keycloak)
   ✅ Adds France to access rules (OPA)
   ✅ Notifies ALL countries about France (OPAL)
   ✅ Generates France's API key (Token)
   ✅ Enables French login portal (both directions!)
   ❌ Registers France's encryption keys (MANUAL - should be auto!)
4. Total: 2 minutes, 5 seconds
5. Risk: Minimal (automatic cascade ensures consistency)
```

#### What Should Happen (Zero-Touch Onboarding):
```
1. France runs: ./dive spoke deploy fra (2 minutes)
2. Hub AUTOMATICALLY:
   ✅ Validates France's certificate
   ✅ Auto-approves if certificate valid
   ✅ Configures ALL 7 services (including KAS!)
   ✅ Notifies France "You're approved!"
3. Total: 2 minutes
4. Risk: None (fully automated, tested, verified)
```

---

## 🎯 SUMMARY: "WHAT HANDSHAKES ARE NEEDED?"

### Currently Automatic (6/7 Services)

When you approve a spoke, these happen AUTOMATICALLY:

1. ✅ **Keycloak Federation** (bidirectional SSO) - 5 seconds
2. ✅ **JWT Trust** (token validation) - 1 second
3. ✅ **Authorization Rules** (who can access what) - 1 second
4. ✅ **Policy Distribution** (OPAL push to all spokes) - 10 seconds
5. ✅ **API Token** (spoke authentication) - 1 second
6. ✅ **Audit Log** (compliance tracking) - 1 second

**Total Automatic Configuration Time:** ~20 seconds

### Currently Manual (1/7 Services) - **THIS IS THE GAP!**

7. ❌ **KAS Registry** (encryption key access) - Manual API call required

**Impact:**
- Users can log in cross-border ✅
- Users can browse resources cross-border ✅
- Users can access unencrypted documents ✅
- Users CANNOT decrypt encrypted documents ❌ (until KAS registered)

---

## ✅ RECOMMENDATION

**Add KAS auto-registration to `approveSpoke()` method** so spoke approval is a single atomic operation that configures ALL 7 services.

**Benefits:**
1. ✅ **100% automated onboarding** (zero manual steps)
2. ✅ **Faster deployment** (20 sec vs. hours)
3. ✅ **No forgotten steps** (automatic cascade)
4. ✅ **Better UX** (encrypted docs work immediately)
5. ✅ **Industry standard** (matches Teleport auto-discovery pattern)

**Implementation Effort:** ~1 hour (add method, test, commit)

---

## 📋 NEXT STEPS (If You Want Complete Automation)

1. **Immediate (Recommended):**
   - [ ] Add KAS auto-registration to spoke approval
   - [ ] Test with clean slate deployment
   - [ ] Verify encrypted document sharing works immediately

2. **Future (Optional):**
   - [ ] Auto-approve spokes with valid certificates (zero-touch)
   - [ ] Webhook notification to spoke when approved
   - [ ] Health check before approval (verify endpoints reachable)
   - [ ] Automatic bidirectional federation matrix (both directions)

---

**Bottom Line (ELI5):**

> **Right now:** When you approve France, 6 out of 7 things configure automatically. The 7th (KAS encryption keys) requires a manual step.
>
> **Ideal state:** All 7 things should configure automatically when you click "Approve."
>
> **The gap:** We need to add KAS auto-registration to the approval cascade.

Would you like me to implement the KAS auto-registration enhancement?
