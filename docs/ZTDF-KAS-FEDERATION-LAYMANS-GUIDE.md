# ZTDF Encryption, KAS, and Federation - Layman's Guide

**Document Version**: 1.0  
**Date**: November 4, 2025  
**Audience**: Pilot Testers, External Partners, Non-Technical Stakeholders  
**Purpose**: Explain DIVE V3's encryption and federation in simple terms

---

## Table of Contents

1. [The Big Picture: What Problem Are We Solving?](#the-big-picture)
2. [ZTDF Encryption: Protecting Data with Policies](#ztdf-encryption)
3. [KAS: The Smart Key Guardian](#kas-key-access-service)
4. [Federation: Connecting Your System to Ours](#federation)
5. [Pilot Demonstration Baseline](#pilot-demonstration-baseline)
6. [Integration Examples](#integration-examples)
7. [Frequently Asked Questions](#faq)

---

## The Big Picture: What Problem Are We Solving? {#the-big-picture}

### Traditional File Security Problems

Imagine you have a classified document that should only be read by:
- U.S. and U.K. personnel
- With SECRET clearance
- Who are part of the FVEY intelligence community

**Traditional approach (doesn't work well)**:
1. Encrypt the file with a password
2. Email the password separately
3. Hope people follow your sharing rules
4. Problem: Once someone has the password, they can share it with anyone!

### DIVE V3's Solution: Policy-Bound Encryption

**Our approach (much better)**:
1. **Encrypt** the document
2. **Attach the rules** (SECRET, USA+GBR, FVEY) to the encrypted file itself
3. **Lock the key** in a secure service (KAS)
4. **Check the rules** every time someone tries to decrypt it
5. Result: Even if someone steals the encrypted file, they can't read it unless they meet the rules!

This is called **Zero Trust Data Format (ZTDF)** - the file doesn't trust anyone until they prove they're allowed to see it.

### Complete System Architecture

Here's how all the pieces fit together:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DIVE V3 COMPLETE ARCHITECTURE                           │
│                    (ZTDF Encryption + KAS + Federation)                         │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ IDENTITY LAYER (Who are you?)                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ USA IdP │  │ UK  IdP │  │ FRA IdP │  │ CAN IdP │  │ Partner │          │
│  │ (OIDC)  │  │ (OIDC)  │  │ (OIDC)  │  │ (OIDC)  │  │  IdPs   │          │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │
│       │            │            │            │            │                │
│       └────────────┴────────────┴────────────┴────────────┘                │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                                │
│                    │   Keycloak Broker     │                                │
│                    │ (Claim Normalization) │                                │
│                    └───────────────────────┘                                │
│                                │                                            │
│                                ▼                                            │
│                    JWT Token with attributes:                               │
│                    • uniqueID                                               │
│                    • clearance (SECRET)                                     │
│                    • countryOfAffiliation (GBR)                             │
│                    • acpCOI ([FVEY])                                        │
│                    • acr (AAL2 - MFA verified)                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER (What can you access?)                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐         ┌────────────────────────┐              │
│  │  Next.js Frontend      │         │   Backend API (PEP)    │              │
│  │  • Upload UI           │◀───────▶│  • Resource CRUD       │              │
│  │  • Resource browser    │  HTTPS  │  • Authorization check │              │
│  │  • Standards lens      │         │  • Encryption/Decrypt  │              │
│  │  • Federation search   │         │  • KAS integration     │              │
│  └────────────────────────┘         └───────────┬────────────┘              │
│                                                  │                           │
└──────────────────────────────────────────────────┼───────────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ AUTHORIZATION LAYER (Should you be allowed?)                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       ┌─────────────────────┐                               │
│                       │   OPA (Policy PDP)  │                               │
│                       │  ┌───────────────┐  │                               │
│                       │  │ Rego Policies │  │                               │
│                       │  │ • Clearance   │  │                               │
│                       │  │ • Releasability│ │                               │
│                       │  │ • COI         │  │                               │
│                       │  │ • Embargo     │  │                               │
│                       │  │ • MFA (AAL2)  │  │                               │
│                       │  └───────────────┘  │                               │
│                       │                     │                               │
│                       │ Decision: ALLOW/DENY│                               │
│                       └─────────────────────┘                               │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────────┐                              │
│                    │   Audit Logger          │                              │
│                    │ • All decisions logged  │                              │
│                    │ • 90-day retention      │                              │
│                    │ • Compliance reports    │                              │
│                    └─────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼ (if authorized)
┌──────────────────────────────────────────────────────────────────────────────┐
│ DATA LAYER (ZTDF + KAS Encryption)                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                        MongoDB                                  │        │
│  │  ┌────────────────────────────────────────────────────────┐     │        │
│  │  │ ZTDF Object:                                           │     │        │
│  │  │ {                                                      │     │        │
│  │  │   manifest: {                                          │     │        │
│  │  │     objectId, version, owner, contentType              │     │        │
│  │  │   },                                                   │     │        │
│  │  │   policy: {                                            │     │        │
│  │  │     securityLabel: {                                   │     │        │
│  │  │       classification: "SECRET",                        │     │        │
│  │  │       releasabilityTo: ["USA", "GBR", "CAN"],          │     │        │
│  │  │       COI: ["FVEY"],                                   │     │        │
│  │  │       displayMarking: "SECRET//FVEY"                   │     │        │
│  │  │     },                                                 │     │        │
│  │  │     policyAssertions: [...],                           │     │        │
│  │  │     policySignature: { ... }  ← Tamper-proof          │     │        │
│  │  │   },                                                   │     │        │
│  │  │   payload: {                                           │     │        │
│  │  │     encryptedChunks: [                                 │     │        │
│  │  │       {                                                │     │        │
│  │  │         chunkId: 0,                                    │     │        │
│  │  │         encryptedData: "eXNjaGxhYm5kZm9ienZqc2Rma...", │     │        │
│  │  │         iv: "...",           ← AES-256-GCM parameters  │     │        │
│  │  │         authTag: "..."                                 │     │        │
│  │  │       }                                                │     │        │
│  │  │     ],                                                 │     │        │
│  │  │     keyAccessObjects: [                                │     │        │
│  │  │       {                                                │     │        │
│  │  │         kaoId: "kao-doc-123",                          │     │        │
│  │  │         kasUrl: "https://kas.dive-v3.mil:8080",        │     │        │
│  │  │         wrappedKey: "...",  ← DEK wrapped with KEK     │     │        │
│  │  │         policyBinding: { ... }                         │     │        │
│  │  │       }                                                │     │        │
│  │  │     ]                                                  │     │        │
│  │  │   }                                                    │     │        │
│  │  │ }                                                      │     │        │
│  │  └────────────────────────────────────────────────────────┘     │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                │                                            │
│                                ▼ (Backend requests key)                     │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                KAS (Key Access Service)                         │        │
│  │  ┌──────────────────────────────────────────────────────────┐   │        │
│  │  │ 1. Verify JWT signature (JWKS)                           │   │        │
│  │  │ 2. Extract user attributes (clearance, country, COI)     │   │        │
│  │  │ 3. Fetch resource policy from Backend                    │   │        │
│  │  │ 4. Re-evaluate with OPA (defense in depth!)              │   │        │
│  │  │ 5. If ALLOW:                                             │   │        │
│  │  │    • Unwrap DEK with KEK                                 │   │        │
│  │  │    • Log decision (audit trail)                          │   │        │
│  │  │    • Return DEK to Backend                               │   │        │
│  │  │ 6. If DENY:                                              │   │        │
│  │  │    • Log denial reason                                   │   │        │
│  │  │    • Return 403 Forbidden                                │   │        │
│  │  └──────────────────────────────────────────────────────────┘   │        │
│  │                                                                 │        │
│  │  ┌──────────────────────────────────────────────────────────┐   │        │
│  │  │ Key Vault (Pilot: In-Memory; Prod: HSM)                  │   │        │
│  │  │ • KEK (Key Encryption Keys)                              │   │        │
│  │  │ • DEK Cache (1 hour TTL)                                 │   │        │
│  │  │ • COI Community Keys                                     │   │        │
│  │  └──────────────────────────────────────────────────────────┘   │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                │                                            │
│                                ▼ (DEK returned)                             │
│               Backend decrypts with DEK → Plaintext → User                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FEDERATION LAYER (Cross-domain sharing)                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐       ┌────────────────────────┐                │
│  │  Partner System A      │       │  Partner System B      │                │
│  │  (e.g., UK MOD)        │       │  (e.g., French DGA)    │                │
│  │                        │       │                        │                │
│  │  • Federation Endpoint │◀─────▶│  • Federation Endpoint │                │
│  │  • ZTDF Compatible     │       │  • ZTDF Compatible     │                │
│  │  • KAS Instance        │       │  • KAS Instance        │                │
│  │  • OPA Policies        │       │  • OPA Policies        │                │
│  └────────┬───────────────┘       └───────────┬────────────┘                │
│           │                                   │                             │
│           └───────────────┬───────────────────┘                             │
│                           │                                                 │
│                           ▼                                                 │
│              ┌────────────────────────┐                                     │
│              │  DIVE V3 Federation    │                                     │
│              │  • Resource Discovery  │                                     │
│              │  • Access Requests     │                                     │
│              │  • Policy Sync         │                                     │
│              │  • OAuth 2.0 / OIDC    │                                     │
│              │  • SCIM Provisioning   │                                     │
│              └────────────────────────┘                                     │
│                                                                              │
│  Flow: User searches → DIVE V3 queries partners → Combined results          │
│        → User clicks → Access request → Partner authorizes → Content        │
└──────────────────────────────────────────────────────────────────────────────┘

 SECURITY PROPERTIES:
 ✅ Confidentiality: AES-256-GCM encryption (NIST approved)
 ✅ Integrity: HMAC signatures + auth tags (tamper-evident)
 ✅ Authenticity: RS256 JWT signatures (verified with JWKS)
 ✅ Authorization: Policy-bound (checked at rest, in transit, and before decryption)
 ✅ Auditability: All decisions logged (90-day retention minimum)
 ✅ Non-repudiation: Digital signatures on ZTDF policy
 ✅ Defense in Depth: Multiple authorization checks (Backend + KAS)
 ✅ Fail-Closed: Deny on error, unavailable policy engine, or invalid token
```

---

## ZTDF Encryption: Protecting Data with Policies {#ztdf-encryption}

### What is ZTDF?

ZTDF is like a **secure envelope** with three parts:

```
┌─────────────────────────────────────────────┐
│         ZTDF Secure Envelope                │
├─────────────────────────────────────────────┤
│                                             │
│  📋 Part 1: MANIFEST                        │
│     - What: Document ID, title, owner       │
│     - When: Creation date, last modified    │
│     - Size: File size, content type         │
│                                             │
│  🔒 Part 2: POLICY (The Rules)              │
│     - Classification: SECRET                │
│     - Releasable to: USA, GBR               │
│     - COI Required: FVEY                    │
│     - Digitally signed (tamper-proof)       │
│                                             │
│  🔐 Part 3: PAYLOAD (The Encrypted Content) │
│     - Encrypted data (gibberish without key)│
│     - Key Access Object (KAO)               │
│     - Points to KAS: "Ask me for the key"   │
│                                             │
└─────────────────────────────────────────────┘
```

### How ZTDF Works: A Story

**Alice** (U.S. Army, SECRET clearance, FVEY member) wants to share a fuel inventory report with coalition partners.

#### Step 1: Upload (Encryption)

Alice uploads her document through DIVE V3:

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ZTDF ENCRYPTION FLOW (Upload)                      │
└─────────────────────────────────────────────────────────────────────┘

Alice's Browser                    DIVE V3 Backend                    KAS
     │                                    │                           │
     │  1. Upload "fuel_report.pdf"      │                           │
     │  (Plaintext + Metadata)            │                           │
     ├───────────────────────────────────>│                           │
     │                                    │                           │
     │                                    │ 2. Generate Random DEK    │
     │                                    │    (32 bytes for AES-256) │
     │                                    │                           │
     │                                    │ 3. Encrypt Content        │
     │                                    │    AES-256-GCM(plaintext, DEK)
     │                                    │    = ciphertext           │
     │                                    │                           │
     │                                    │ 4. Create Policy Object   │
     │                                    │    - classification: SECRET
     │                                    │    - releaseTo: [USA,GBR,CAN]
     │                                    │    - COI: [FVEY]          │
     │                                    │                           │
     │                                    │ 5. Wrap DEK with KEK      │
     │                                    │    wrappedKey = Wrap(DEK, KEK)
     │                                    │                           │
     │                                    │  6. Register with KAS     │
     │                                    ├──────────────────────────>│
     │                                    │  {resourceId, wrappedKey, │
     │                                    │   policy}                 │
     │                                    │                           │
     │                                    │<──────────────────────────┤
     │                                    │  {kaoId, kasUrl}          │
     │                                    │                           │
     │                                    │ 7. Build ZTDF Object:     │
     │                                    │    {                      │
     │                                    │      manifest: {...},     │
     │                                    │      policy: {...},       │
     │                                    │      payload: {           │
     │                                    │        encryptedChunks,   │
     │                                    │        keyAccessObjects   │
     │                                    │      }                    │
     │                                    │    }                      │
     │                                    │                           │
     │                                    │ 8. Save to MongoDB        │
     │                                    │    (ZTDF object)          │
     │                                    │                           │
     │  9. Success Response               │                           │
     │<───────────────────────────────────┤                           │
     │  {resourceId, encrypted: true}     │                           │
     │                                    │                           │
```

**What happened**:
1. **DIVE V3 Backend** receives the plaintext document
2. **Generates a random key** (DEK - Data Encryption Key, 256-bit)
3. **Encrypts the content** with this key using military-grade encryption (AES-256-GCM)
4. **Creates a policy** based on Alice's settings:
   - Classification: SECRET
   - Releasable to: USA, GBR, CAN
   - COI: FVEY
5. **Wraps the key** with a master key and stores it in KAS
6. **Saves everything** as a ZTDF object in MongoDB

**Result**: The original document is now securely encrypted with its policies attached.

#### Step 2: Viewing (Decryption)

**Bob** (U.K. RAF, SECRET clearance, FVEY member) tries to view the document:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  ZTDF DECRYPTION FLOW (View with Authorization)             │
└─────────────────────────────────────────────────────────────────────────────┘

Bob's Browser          DIVE V3 Backend       OPA Policy Engine        KAS
     │                       │                      │                   │
     │ 1. Login via UK IdP   │                      │                   │
     │   (Keycloak)          │                      │                   │
     ├──────────────────────>│                      │                   │
     │                       │                      │                   │
     │<──────────────────────┤                      │                   │
     │ JWT Token:            │                      │                   │
     │ {uniqueID: bob.smith, │                      │                   │
     │  clearance: SECRET,   │                      │                   │
     │  country: GBR,        │                      │                   │
     │  coi: [FVEY]}         │                      │                   │
     │                       │                      │                   │
     │ 2. Request Document   │                      │                   │
     │    GET /resources/doc-123                    │                   │
     ├──────────────────────>│                      │                   │
     │                       │                      │                   │
     │                       │ 3. Fetch ZTDF from   │                   │
     │                       │    MongoDB           │                   │
     │                       │    (encrypted=true)  │                   │
     │                       │                      │                   │
     │                       │ 4. Check Authz       │                   │
     │                       ├─────────────────────>│                   │
     │                       │ OPA Input: {         │                   │
     │                       │   subject: Bob's attrs,                  │
     │                       │   resource: doc policy│                  │
     │                       │ }                    │                   │
     │                       │                      │                   │
     │                       │<─────────────────────┤                   │
     │                       │ Decision: ALLOW      │                   │
     │                       │ Reason: "All checks  │                   │
     │                       │         passed"      │                   │
     │                       │                      │                   │
     │                       │ 5. Request Key from KAS                  │
     │                       ├─────────────────────────────────────────>│
     │                       │ {resourceId, kaoId,  │                   │
     │                       │  bearerToken,        │                   │
     │                       │  wrappedKey}         │                   │
     │                       │                      │                   │
     │                       │                      │    6. Verify JWT  │
     │                       │                      │    7. Re-check OPA│
     │                       │                      │    8. Unwrap DEK  │
     │                       │                      │    9. Log decision│
     │                       │                      │                   │
     │                       │<─────────────────────────────────────────┤
     │                       │ {dek: "base64..."}   │                   │
     │                       │                      │                   │
     │                       │ 10. Decrypt Content  │                   │
     │                       │     plaintext =      │                   │
     │                       │     Decrypt(ciphertext, dek)             │
     │                       │                      │                   │
     │ 11. Return Plaintext  │                      │                   │
     │<──────────────────────┤                      │                   │
     │ "FUEL INVENTORY..."   │                      │                   │
     │                       │                      │                   │
     │ Bob reads document ✅  │                      │                   │
     │                       │                      │                   │
```

**What happened**:
1. **Bob logs in** through U.K.'s identity provider
2. **Keycloak verifies** Bob's identity and adds his attributes to his token:
   - uniqueID: bob.smith@raf.uk
   - clearance: SECRET
   - countryOfAffiliation: GBR
   - acpCOI: ["FVEY"]
3. **Bob clicks** on the document
4. **Backend fetches** the ZTDF object and sees it's encrypted
5. **Backend checks authorization** (OPA policy engine):
   - ✅ Bob has SECRET clearance (document requires SECRET)
   - ✅ Bob is from GBR (document allows USA, GBR, CAN)
   - ✅ Bob has FVEY membership (document requires FVEY)
6. **Backend requests key** from KAS (explained next)
7. **KAS double-checks** the policy (defense in depth)
8. **KAS releases key** to Backend
9. **Backend decrypts** the document
10. **Bob sees** the content

**Important**: If Bob tries to copy the encrypted file to his laptop, it's useless without going through this process again!

### What Gets Encrypted?

- ✅ Document content (text, images, etc.)
- ✅ Attached files
- ✅ Sensitive metadata (if applicable)
- ❌ Policy rules (these must be readable to enforce them)
- ❌ Classification marking (must be visible before access)

### NATO Standards Compliance

ZTDF follows these NATO standards:
- **STANAG 4774**: Security labels (how we mark documents)
- **STANAG 5636**: Display markings (how we show classification)
- **STANAG 4778**: Cryptographic binding (policies can't be altered without breaking the file)
- **ACP-240**: Data-centric security (protect the data, not just the network)

---

## KAS: The Smart Key Guardian {#kas-key-access-service}

### What is KAS?

**KAS = Key Access Service**

Think of KAS as a **robotic security guard** that holds all the encryption keys in a vault. But this guard is smart:
- It **checks your ID** (JWT token)
- It **reads the document's rules** (classification, releasability, COI)
- It **compares your clearance** to the requirements
- It **only gives you the key** if you meet ALL the rules
- It **logs everything** (who asked, when, approved or denied)

### Why KAS? Why Not Just Give Everyone the Keys?

**Bad approach**: Encrypt with a password, give password to authorized people
- Problem: People can share passwords
- Problem: Can't revoke access after giving password
- Problem: No audit trail

**DIVE V3 approach**: Encrypt with a random key, lock the key in KAS
- ✅ Keys never leave the secure service
- ✅ Access can be revoked instantly (KAS just denies future requests)
- ✅ Every access attempt is logged
- ✅ Policy changes take effect immediately

### KAS Flow: Step by Step

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KAS DECISION PROCESS (Detailed)                      │
└─────────────────────────────────────────────────────────────────────────┘

User (Bob from UK)
  │
  │ 1. "I want document DOC-12345"
  ▼
Backend API (PEP - Policy Enforcement Point)
  │
  │ 2. Fetches encrypted document from MongoDB
  │ 3. Checks authorization with OPA
  │ 4. If allowed, requests key from KAS
  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ KAS (Key Access Service) - The Smart Guardian                        │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Step 5: VALIDATE JWT                                                │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ • Verify signature with Keycloak JWKS (public key)              │ │
│  │ • Check expiration (exp claim)                                  │ │
│  │ • Check issued time (iat claim)                                 │ │
│  │ • Check not-before (nbf claim)                                  │ │
│  │ Result: ✅ Token is valid, signed by trusted IdP                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Step 6: EXTRACT ATTRIBUTES                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ From JWT claims:                                                │ │
│  │ • uniqueID: "bob.smith@raf.uk"                                  │ │
│  │ • clearance: "SECRET"                                           │ │
│  │ • countryOfAffiliation: "GBR"                                   │ │
│  │ • acpCOI: ["FVEY"]                                              │ │
│  │ • acr: "1" (AAL2 - MFA authenticated)                           │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Step 7: FETCH RESOURCE POLICY                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Request to Backend: GET /api/resources/DOC-12345                │ │
│  │ Response (ZTDF policy):                                         │ │
│  │ • classification: "SECRET"                                      │ │
│  │ • releasabilityTo: ["USA", "GBR", "CAN"]                        │ │
│  │ • COI: ["FVEY"]                                                 │ │
│  │ • creationDate: "2025-11-01T10:00:00Z"                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Step 8: RE-EVALUATE WITH OPA (Defense in Depth)                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ POST to OPA: /v1/data/dive/authorization                        │ │
│  │                                                                 │ │
│  │ Check 1: Clearance Sufficient?                                 │ │
│  │   User SECRET >= Doc SECRET ✅ PASS                             │ │
│  │                                                                 │ │
│  │ Check 2: Country Releasable?                                   │ │
│  │   GBR in [USA, GBR, CAN] ✅ PASS                                │ │
│  │                                                                 │ │
│  │ Check 3: COI Match?                                            │ │
│  │   User FVEY ∩ Doc FVEY = [FVEY] ✅ PASS                         │ │
│  │                                                                 │ │
│  │ Check 4: Embargo Expired?                                      │ │
│  │   Now > creationDate ✅ PASS                                    │ │
│  │                                                                 │ │
│  │ Check 5: MFA Required?                                         │ │
│  │   User AAL2 (MFA) ✅ PASS                                       │ │
│  │                                                                 │ │
│  │ 🟢 DECISION: ALLOW                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Step 9: RETRIEVE & UNWRAP DEK                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ • Fetch wrappedKey from request                                 │ │
│  │ • Unwrap with KEK (Key Encryption Key)                          │ │
│  │ • DEK = Unwrap(wrappedKey, KEK)                                 │ │
│  │ • DEK ready to return (32 bytes, base64-encoded)                │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Step 10: LOG DECISION                                               │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Audit Log Entry:                                                │ │
│  │ {                                                               │ │
│  │   "eventType": "KEY_RELEASED",                                 │ │
│  │   "timestamp": "2025-11-04T14:30:00Z",                          │ │
│  │   "subject": "bob.smith@raf.uk",                                │ │
│  │   "resourceId": "DOC-12345",                                    │ │
│  │   "outcome": "ALLOW",                                           │ │
│  │   "reason": "All policy checks passed",                         │ │
│  │   "clearanceCheck": "PASS",                                     │ │
│  │   "releasabilityCheck": "PASS",                                 │ │
│  │   "coiCheck": "PASS",                                           │ │
│  │   "latencyMs": 45                                               │ │
│  │ }                                                               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
  │
  │ 11. Returns DEK to Backend
  ▼
Backend API
  │
  │ 12. Uses key to decrypt document
  │     plaintext = AES-256-GCM-Decrypt(ciphertext, DEK, IV, authTag)
  │ 13. Returns plaintext to Bob
  ▼
User (Bob) sees document ✅
```

### KAS Decision Example

**Request**: Bob (GBR, SECRET, FVEY) wants DOC-12345 (SECRET, USA+GBR+CAN, FVEY)

**KAS checks**:
1. ✅ **Authentication**: Bob's JWT is valid (signed by Keycloak, not expired)
2. ✅ **Clearance**: SECRET >= SECRET (sufficient)
3. ✅ **Releasability**: GBR is in [USA, GBR, CAN] (allowed)
4. ✅ **COI**: FVEY matches FVEY (satisfied)
5. ✅ **Time**: No embargo restrictions
6. ✅ **MFA**: Bob used two-factor authentication (AAL2 requirement)

**KAS logs**:
```json
{
  "eventType": "KEY_RELEASED",
  "timestamp": "2025-11-04T14:30:00.123Z",
  "requestId": "kas-abc123",
  "subject": "bob.smith@raf.uk",
  "resourceId": "DOC-12345",
  "outcome": "ALLOW",
  "reason": "All policy conditions satisfied",
  "clearance": "SECRET",
  "country": "GBR",
  "coi": ["FVEY"],
  "latencyMs": 45
}
```

**Result**: Bob gets the key and can read the document.

### What If Policy Changes?

**Scenario**: Document owner updates policy to remove GBR from releasability list.

1. Policy updated in MongoDB (ZTDF object)
2. Next time Bob tries to access: KAS sees new policy
3. KAS denies request (GBR no longer in releasabilityTo)
4. Bob gets error: "Access denied: Country GBR not in releasability list"
5. Bob can no longer decrypt the document (even if he saved the encrypted file!)

**This is the power of policy-bound encryption**: Access control travels with the data.

---

## Federation: Connecting Your System to Ours {#federation}

### What is Federation?

**Federation** means connecting different organizations' identity systems so users can access resources across boundaries without needing separate accounts everywhere.

**Analogy**: 
- **Without federation**: Bob needs accounts at U.S. Army, RAF, French Air Force, Canadian Forces (4 usernames, 4 passwords)
- **With federation**: Bob logs in once at RAF, gets access to all coalition systems (1 username, 1 password)

### How DIVE V3 Supports Federation

DIVE V3 is a **federation hub** that connects:
1. **Identity Providers (IdPs)**: Systems that verify who you are (e.g., RAF login, U.S. Army login)
2. **Service Providers (SPs)**: Systems that provide resources (e.g., DIVE V3, partner systems)

```
┌─────────────────────────────────────────────────┐
│            Identity Providers (IdPs)            │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐      │
│   │ USA  │  │  UK  │  │ FRA  │  │ CAN  │      │
│   │ IdP  │  │ IdP  │  │ IdP  │  │ IdP  │      │
│   └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘      │
│       │         │         │         │          │
└───────┼─────────┼─────────┼─────────┼──────────┘
        │         │         │         │
        └─────────┴─────────┴─────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Keycloak Broker      │
        │  (Claim Normalization) │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │     DIVE V3 Platform   │
        │  (Service Provider)    │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Encrypted Resources   │
        │  (MongoDB + ZTDF)      │
        └────────────────────────┘
```

### Current Federation Capabilities

**Incoming Federation (Identity Providers)**:
DIVE V3 currently accepts users from 10 identity providers:
1. USA (OIDC)
2. United Kingdom (OIDC)
3. France (OIDC)
4. Germany (OIDC)
5. Italy (OIDC)
6. Spain (SAML + OIDC)
7. Netherlands (OIDC)
8. Poland (OIDC)
9. Canada (OIDC)
10. Industry Partners (OIDC)

**How it works**:
1. User clicks "Login with UK RAF" on DIVE V3
2. Redirected to RAF's login page
3. RAF verifies user (username/password + MFA)
4. RAF sends token to Keycloak: "This is Bob, clearance SECRET, country GBR"
5. Keycloak normalizes attributes (RAF's format → DIVE V3 format)
6. Keycloak creates DIVE V3 token with standardized claims
7. User accesses DIVE V3 resources with this token

### Federation for External Partners (New!)

**Outgoing Federation (Service Providers)**:
DIVE V3 can now act as an **identity provider** for external partners' systems!

**Use case**: French Air Force has their own resource portal and wants to let DIVE V3 users access it.

```
French User → DIVE V3 (IdP) → French Portal (SP) → French Resources
```

**Implementation**: OAuth 2.0 + OIDC standards

---

## Pilot Demonstration Baseline {#pilot-demonstration-baseline}

### Goal: Simple Cross-Organization Resource Sharing

**Scenario**: 
- **Your organization** has a document management system
- **DIVE V3** has encrypted fuel inventory reports
- **You want** to let your users access our reports
- **We want** to let our users access your documents

### Baseline Setup (Simplest Approach)

#### Option 1: You Act as an Identity Provider (Easiest)

**What you need**:
1. **OIDC-capable identity system** (e.g., Keycloak, Okta, Azure AD, Auth0)
2. **User attributes** mapped to our required claims:
   - `uniqueID`: Unique user identifier (email or UUID)
   - `clearance`: UNCLASSIFIED, CONFIDENTIAL, SECRET, or TOP_SECRET
   - `countryOfAffiliation`: ISO 3166-1 alpha-3 (e.g., USA, GBR, FRA)
   - `acpCOI`: (optional) Communities of Interest (e.g., ["FVEY"])

**Integration steps**:
1. Register your IdP with DIVE V3 (provide metadata URL)
2. DIVE V3 configures broker connection in Keycloak
3. Test user login flow
4. Your users can now access DIVE V3 resources (if authorized by policy)

**What DIVE V3 does**:
- Accepts your OIDC tokens
- Normalizes your attribute names to our schema
- Enforces policies based on your users' clearances and countries
- Logs all access decisions
- Releases encryption keys via KAS when authorized

**Time to integrate**: 2-4 hours (mostly configuration)

#### Option 2: You Act as a Service Provider (More Advanced)

**What you need**:
1. **OAuth 2.0 client** implementation in your system
2. **Authorization endpoint** to handle OAuth flow
3. **Token validation** logic (verify JWT signature with JWKS)
4. **Attribute extraction** from DIVE V3 tokens

**Integration steps**:
1. Register your SP with DIVE V3 (provide redirect URIs, scopes)
2. Receive OAuth client credentials (client ID, client secret)
3. Implement OAuth authorization code flow with PKCE
4. Test user login flow
5. DIVE V3 users can now access your resources (if authorized by your policies)

**What you do**:
- Redirect users to DIVE V3 for authentication
- Receive OAuth authorization code
- Exchange code for access token
- Validate token signature (use JWKS from DIVE V3)
- Extract user attributes from token
- Enforce your own authorization policies
- Grant or deny access to your resources

**Time to integrate**: 1-2 days (requires development)

### Federating Resource Metadata

**Problem**: How do we know what resources each other has?

**Solution**: Federation Protocol (lightweight REST API)

#### Step 1: Exchange Federation Metadata

**You expose**:
```http
GET https://your-system.mil/.well-known/federation-metadata

Response:
{
  "entityId": "https://your-system.mil",
  "federationEndpoints": {
    "discovery": "https://api.your-system.mil/federation/discover",
    "access": "https://api.your-system.mil/federation/access"
  },
  "supportedClassifications": ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"],
  "supportedCountries": ["USA", "GBR", "FRA"],
  "supportedCOIs": ["NATO-COSMIC", "FVEY"]
}
```

**DIVE V3 exposes** (already implemented):
```http
GET https://api.dive-v3.mil/.well-known/federation-metadata
```

#### Step 2: Resource Discovery API

**DIVE V3 endpoint** (already implemented):
```http
POST https://api.dive-v3.mil/api/federation/resources/search

Headers:
  Authorization: Bearer <your_token>

Body:
{
  "query": "fuel inventory",
  "filters": {
    "classification": "SECRET",
    "country": "USA"
  },
  "limit": 10
}

Response:
{
  "results": [
    {
      "resourceId": "DOC-12345",
      "title": "Q4 2025 Fuel Inventory",
      "classification": "SECRET",
      "releasabilityTo": ["USA", "GBR", "CAN"],
      "COI": ["FVEY"],
      "encrypted": true,
      "kasUrl": "https://kas.dive-v3.mil:8080",
      "previewAvailable": false
    }
  ],
  "total": 1
}
```

**Your endpoint** (you would implement):
```http
POST https://api.your-system.mil/federation/resources/search

(Same format as above)
```

#### Step 3: Federated Access Flow

**Scenario**: Bob (DIVE V3 user) wants to access a document on your system

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  FEDERATED RESOURCE ACCESS FLOW                              │
│          (DIVE V3 User → External Partner System Document)                   │
└──────────────────────────────────────────────────────────────────────────────┘

Bob's Browser          DIVE V3 Backend       External Partner API      Partner KAS
     │                       │                      │                       │
     │ 1. Search "fuel"      │                      │                       │
     ├──────────────────────>│                      │                       │
     │                       │                      │                       │
     │                       │ 2. Query Local DB    │                       │
     │                       │    (MongoDB)         │                       │
     │                       │                      │                       │
     │                       │ 3. Query Partners    │                       │
     │                       ├─────────────────────>│                       │
     │                       │ POST /federation/    │                       │
     │                       │      resources/search│                       │
     │                       │                      │                       │
     │                       │<─────────────────────┤                       │
     │                       │ Results from Partner │                       │
     │                       │ [{resourceId, title, │                       │
     │                       │   classification}]   │                       │
     │                       │                      │                       │
     │  4. Combined Results  │                      │                       │
     │<──────────────────────┤                      │                       │
     │  • 5 DIVE V3 docs     │                      │                       │
     │  • 3 Partner docs     │                      │                       │
     │                       │                      │                       │
     │ 5. Bob clicks         │                      │                       │
     │    Partner Doc        │                      │                       │
     │    "Partner-DOC-456"  │                      │                       │
     ├──────────────────────>│                      │                       │
     │                       │                      │                       │
     │                       │ 6. Request Access    │                       │
     │                       ├─────────────────────>│                       │
     │                       │ POST /federation/    │                       │
     │                       │      resources/      │                       │
     │                       │      request-access  │                       │
     │                       │ {                    │                       │
     │                       │   resourceId,        │                       │
     │                       │   requestingUser: {  │                       │
     │                       │     uniqueID,        │                       │
     │                       │     clearance,       │                       │
     │                       │     country,         │                       │
     │                       │     coi              │                       │
     │                       │   }                  │                       │
     │                       │ }                    │                       │
     │                       │                      │                       │
     │                       │                      │ 7. Validate User      │
     │                       │                      │    Attributes         │
     │                       │                      │                       │
     │                       │                      │ 8. Check Policy       │
     │                       │                      │    (OPA or similar)   │
     │                       │                      │                       │
     │                       │                      │ ✅ Authorized         │
     │                       │                      │                       │
     │                       │                      │ 9. Fetch Encrypted    │
     │                       │                      │    Resource           │
     │                       │                      │                       │
     │                       │                      │ 10. Request Key       │
     │                       │                      ├──────────────────────>│
     │                       │                      │                       │
     │                       │                      │<──────────────────────┤
     │                       │                      │ DEK released          │
     │                       │                      │                       │
     │                       │                      │ 11. Decrypt content   │
     │                       │                      │                       │
     │                       │<─────────────────────┤                       │
     │                       │ Access Grant:        │                       │
     │                       │ {                    │                       │
     │                       │   allowed: true,     │                       │
     │                       │   accessUrl,         │                       │
     │                       │   content,           │                       │
     │                       │   expiresIn: 3600    │                       │
     │                       │ }                    │                       │
     │                       │                      │                       │
     │  12. Display Content  │                      │                       │
     │<──────────────────────┤                      │                       │
     │  (or redirect to      │                      │                       │
     │   partner system)     │                      │                       │
     │                       │                      │                       │
     │ Bob views document ✅  │                      │                       │
     │                       │                      │                       │
```

**What happened step-by-step**:
1. **Bob searches** on DIVE V3
   - DIVE V3 queries local resources + your federation endpoint (in parallel)
2. **Bob sees results** from both systems (clearly labeled by source)
   - Bob clicks document from your system
3. **DIVE V3 requests access** on Bob's behalf:
   ```http
   POST https://api.your-system.mil/federation/resources/access
   Headers:
     Authorization: Bearer <bob_token_from_dive_v3>
   Body:
     {
       "resourceId": "YOUR-DOC-456",
       "requestingUser": {
         "uniqueID": "bob.smith@raf.uk",
         "clearance": "SECRET",
         "country": "GBR",
         "coi": ["FVEY"]
       }
     }
   ```
4. **Your system checks authorization**
   - Bob meets requirements? ✅ Yes
5. **Your system returns access grant**:
   ```json
   {
     "allowed": true,
     "accessUrl": "https://your-system.mil/view/YOUR-DOC-456",
     "expiresIn": 3600
   }
   ```
6. **DIVE V3 redirects** Bob to your system
   - Bob views document on your system (or DIVE V3 proxies content)

### Minimum Viable Federation (MVF)

For pilot demonstration, you need **only these essentials**:

**Must Have**:
1. ✅ OIDC identity provider with required attributes (uniqueID, clearance, country)
2. ✅ HTTPS endpoints with valid certificates
3. ✅ Federation metadata endpoint (JSON)
4. ✅ Resource search API (returns metadata, not content)
5. ✅ Authorization check before serving content

**Nice to Have** (not required for pilot):
- OAuth 2.0 client registration
- SCIM user provisioning
- Real-time policy synchronization
- Distributed ledger for audit trail

**Demo Flow** (15 minutes):
1. **Setup** (5 min): Exchange federation metadata URLs
2. **Test Authentication** (3 min): User logs in via your IdP, accesses DIVE V3
3. **Test Authorization** (3 min): User with SECRET clearance accesses SECRET document
4. **Test Denial** (2 min): User with CONFIDENTIAL clearance blocked from SECRET document
5. **Show Federation** (2 min): Search across both systems, view results

---

## Integration Examples {#integration-examples}

### Example 1: Integrate Your OIDC IdP

**Your system**: Auth0 tenant at `https://your-org.auth0.com`

**Step 1: Configure attributes in Auth0**

Auth0 Rules (JavaScript):
```javascript
function(user, context, callback) {
  // Add DIVE V3 required attributes
  const namespace = 'https://dive-v3.mil/claims/';
  
  context.idToken[namespace + 'uniqueID'] = user.email;
  context.idToken[namespace + 'clearance'] = user.app_metadata.clearance || 'UNCLASSIFIED';
  context.idToken[namespace + 'countryOfAffiliation'] = user.app_metadata.country || 'USA';
  context.idToken[namespace + 'acpCOI'] = user.app_metadata.coi || [];
  
  callback(null, user, context);
}
```

**Step 2: Register with DIVE V3**

Send us:
- OpenID Configuration URL: `https://your-org.auth0.com/.well-known/openid-configuration`
- Client ID: (we'll create in Auth0)
- Client Secret: (we'll receive from Auth0)
- Attribute mappings: (how your claim names map to ours)

**Step 3: Test**

```bash
# User clicks "Login with Your Org" on DIVE V3
# Redirects to: https://your-org.auth0.com/authorize?...
# User logs in
# Redirects back to: https://frontend.dive-v3.mil/api/auth/callback/your-org
# User is authenticated!
```

### Example 2: Consume DIVE V3 Resources from Your Portal

**Your system**: React web app at `https://portal.your-org.mil`

**Step 1: Register as Service Provider**

Contact DIVE V3 admin to register:
- SP Name: Your Organization Portal
- Redirect URIs: `https://portal.your-org.mil/auth/callback`
- Scopes: `openid profile email resource:read`
- OAuth Grant: `authorization_code` with PKCE

**Step 2: Implement OAuth Flow**

React component:
```typescript
import { useState } from 'react';

export function LoginWithDIVE() {
  const handleLogin = async () => {
    // Generate PKCE challenge
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await sha256(codeVerifier);
    
    // Store for later
    sessionStorage.setItem('code_verifier', codeVerifier);
    
    // Redirect to DIVE V3
    const authUrl = new URL('https://api.dive-v3.mil/oauth/authorize');
    authUrl.searchParams.set('client_id', 'YOUR_CLIENT_ID');
    authUrl.searchParams.set('redirect_uri', 'https://portal.your-org.mil/auth/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile resource:read');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    window.location.href = authUrl.toString();
  };
  
  return <button onClick={handleLogin}>Login with DIVE V3</button>;
}
```

Callback handler:
```typescript
// /auth/callback route
export async function handleCallback(code: string) {
  const codeVerifier = sessionStorage.getItem('code_verifier');
  
  // Exchange code for token
  const response = await fetch('https://api.dive-v3.mil/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://portal.your-org.mil/auth/callback',
      client_id: 'YOUR_CLIENT_ID',
      code_verifier: codeVerifier
    })
  });
  
  const { access_token, id_token } = await response.json();
  
  // Store tokens
  sessionStorage.setItem('access_token', access_token);
  
  // Decode ID token to get user info
  const userInfo = jwt_decode(id_token);
  console.log('User:', userInfo.uniqueID, 'Clearance:', userInfo.clearance);
  
  // Redirect to portal home
  window.location.href = '/home';
}
```

**Step 3: Query DIVE V3 Resources**

```typescript
async function searchDIVEResources(query: string) {
  const token = sessionStorage.getItem('access_token');
  
  const response = await fetch('https://api.dive-v3.mil/api/federation/resources/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      filters: { classification: 'SECRET' },
      limit: 10
    })
  });
  
  const results = await response.json();
  return results.results;
}
```

**Step 4: Display Results**

```typescript
function ResourceList() {
  const [resources, setResources] = useState([]);
  
  useEffect(() => {
    searchDIVEResources('fuel inventory').then(setResources);
  }, []);
  
  return (
    <div>
      {resources.map(resource => (
        <div key={resource.resourceId}>
          <h3>{resource.title}</h3>
          <span className="classification">{resource.classification}</span>
          <p>Releasable to: {resource.releasabilityTo.join(', ')}</p>
          {resource.encrypted && (
            <span>🔒 Encrypted (requires KAS key)</span>
          )}
          <button onClick={() => requestAccess(resource.resourceId)}>
            View Document
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Federate Your Encrypted Resources

**Your system**: Custom Django app with encrypted documents

**Step 1: Implement ZTDF-compatible metadata**

Your database schema:
```python
class EncryptedDocument(models.Model):
    document_id = models.CharField(max_length=100, primary_key=True)
    title = models.CharField(max_length=255)
    
    # ZTDF-compatible policy
    classification = models.CharField(max_length=20)  # SECRET, etc.
    releasability_to = models.JSONField()  # ["USA", "GBR", "CAN"]
    coi = models.JSONField(default=list)  # ["FVEY"]
    
    # Encryption
    encrypted_content = models.BinaryField()
    encryption_algorithm = models.CharField(max_length=50, default='AES-256-GCM')
    
    # Key management
    kas_url = models.URLField()
    kao_id = models.CharField(max_length=100)
    wrapped_key = models.TextField()  # Base64-encoded wrapped DEK
```

**Step 2: Implement Federation Search API**

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['POST'])
def federation_search(request):
    # Validate token from DIVE V3
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user_info = validate_dive_v3_token(token)  # Implement with JWKS
    
    # Extract search params
    query = request.data.get('query', '')
    filters = request.data.get('filters', {})
    
    # Query your database
    docs = EncryptedDocument.objects.filter(
        title__icontains=query,
        classification=filters.get('classification', 'UNCLASSIFIED')
    )
    
    # Return metadata only (not content!)
    results = []
    for doc in docs:
        # Check if user authorized to even see metadata
        if user_info['country'] in doc.releasability_to:
            results.append({
                'resourceId': doc.document_id,
                'title': doc.title,
                'classification': doc.classification,
                'releasabilityTo': doc.releasability_to,
                'COI': doc.coi,
                'encrypted': True,
                'kasUrl': doc.kas_url,
                'previewAvailable': False
            })
    
    return Response({
        'results': results,
        'total': len(results)
    })
```

**Step 3: Implement KAS Integration**

```python
import requests
import json

def decrypt_document_with_kas(document_id, user_token):
    doc = EncryptedDocument.objects.get(pk=document_id)
    
    # Request key from your KAS
    kas_response = requests.post(
        f"{doc.kas_url}/request-key",
        json={
            'resourceId': doc.document_id,
            'kaoId': doc.kao_id,
            'bearerToken': user_token,
            'wrappedKey': doc.wrapped_key
        },
        timeout=5
    )
    
    if kas_response.status_code == 200:
        data = kas_response.json()
        dek = data['dek']  # Data Encryption Key
        
        # Decrypt content with DEK
        plaintext = decrypt_aes_gcm(
            encrypted=doc.encrypted_content,
            key=base64.b64decode(dek),
            algorithm='AES-256-GCM'
        )
        
        return plaintext
    else:
        # KAS denied access
        raise PermissionError(kas_response.json()['denialReason'])
```

**Step 4: Register with DIVE V3 Federation**

Send us:
```json
{
  "organizationName": "Your Organization",
  "federationMetadataUrl": "https://api.your-org.mil/.well-known/federation-metadata",
  "technicalContact": "admin@your-org.mil",
  "supportedClassifications": ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"],
  "supportedCountries": ["USA", "GBR"],
  "agreementDate": "2025-11-04",
  "trustCertificate": "-----BEGIN CERTIFICATE-----\n..."
}
```

---

## Frequently Asked Questions {#faq}

### General Questions

**Q: What makes ZTDF different from normal encryption?**

A: Normal encryption protects data at rest (file encrypted) and in transit (HTTPS). But once decrypted, anyone can copy/share. ZTDF binds the **policy** to the **data** so access control is enforced every time someone tries to decrypt, even if they have the encrypted file.

**Q: Can I use ZTDF without KAS?**

A: No. KAS is essential for policy-bound encryption. Without KAS, you'd have to give everyone the key upfront, defeating the purpose.

**Q: What happens if KAS goes down?**

A: Encrypted documents become temporarily inaccessible. This is "fail-closed" security (safe default). For high availability, deploy multiple KAS instances behind a load balancer.

**Q: Can I decrypt ZTDF files offline?**

A: No. ZTDF requires online policy checking via KAS. This is intentional to prevent policy bypass.

### Technical Questions

**Q: What encryption algorithms do you use?**

A: 
- **Content**: AES-256-GCM (symmetric encryption)
- **Keys**: RSA-OAEP-256 or AES-256-KW for key wrapping
- **Signatures**: RSA-SHA256 (minimum 2048-bit keys)
- **Tokens**: RS256 for JWT signing

**Q: How do you prevent man-in-the-middle attacks?**

A:
- All communication over HTTPS (TLS 1.2+)
- JWT tokens signed with RS256 (verified with JWKS)
- Certificate pinning for KAS communication
- Token replay protection (nonce, exp, nbf claims)

**Q: What's the performance impact of KAS?**

A:
- **Typical latency**: 50-200ms for key request
- **Throughput**: 100+ requests/second per KAS instance
- **Caching**: Decision cache (60 seconds) reduces load
- **Scaling**: Horizontal scaling with multiple KAS instances

**Q: How do you handle different clearance levels?**

A: Clearances are hierarchical:
- UNCLASSIFIED < CONFIDENTIAL < SECRET < TOP_SECRET
- User with SECRET can access CONFIDENTIAL and UNCLASSIFIED
- User with CONFIDENTIAL cannot access SECRET

**Q: What if my country's clearance levels don't match?**

A: We use attribute transcription in Keycloak:
- France "SECRET DÉFENSE" → SECRET
- Germany "GEHEIM" → SECRET
- UK "SECRET" → SECRET (already matches)
- Mapping configured per identity provider

### Federation Questions

**Q: Do I need to install DIVE V3 software?**

A: No! Federation uses standard protocols (OIDC, OAuth 2.0, REST APIs). You just need to configure your existing OIDC provider.

**Q: Can I keep my existing user database?**

A: Yes! DIVE V3 never stores your user credentials. We only receive tokens with attributes from your IdP.

**Q: How do you ensure users can't fake their clearances?**

A:
1. Tokens signed by your IdP (we verify signature with your public key)
2. Token claims are tamper-evident
3. We trust your IdP to assign correct clearances
4. Audit logs track all access decisions

**Q: Can I revoke access for a specific user?**

A: Yes:
1. Disable user in your IdP → Future logins fail
2. Update resource policy → KAS denies existing tokens
3. Token expiration → Force re-authentication

**Q: How much data can I federate?**

A: For pilot demonstration:
- **Metadata**: Unlimited (lightweight JSON)
- **Content**: Recommended < 100 MB per document (due to encryption overhead)
- **Search results**: Max 1000 results per query (pagination supported)

### Compliance Questions

**Q: Is ZTDF compliant with NATO standards?**

A: Yes:
- **ACP-240**: Data-centric security (policy binding)
- **STANAG 4774**: Security labels
- **STANAG 5636**: Display markings
- **STANAG 4778**: Cryptographic binding

**Q: Can I use this for TOP SECRET documents?**

A: For pilot: No. Current setup uses software KMS (mock).
For production: Yes, with HSM (Hardware Security Module) for key storage.

**Q: How long are audit logs retained?**

A: Minimum 90 days (configurable up to 7 years). Logs include:
- Who accessed what
- When
- Decision (allow/deny)
- Reason
- User attributes at time of access

**Q: Is this NIST compliant?**

A: Yes:
- **NIST SP 800-63B**: Authentication (AAL2 with MFA)
- **NIST SP 800-63C**: Federation (OIDC, SAML 2.0)
- **NIST SP 800-53**: Security controls
- **NIST ABAC**: Attribute-based access control

---

## Next Steps

### For Testers

1. **Review this guide** to understand concepts
2. **Identify your integration type**:
   - Option A: Just authenticate users (IdP integration) → 2-4 hours
   - Option B: Share resources bilaterally (federation) → 1-2 days
3. **Contact DIVE V3 admin** with:
   - Organization name
   - Technical contact
   - Integration option (A or B)
   - Timeline
4. **Schedule integration session** (we'll help you configure)

### For Developers

1. **Read OAuth 2.0 RFC 6749** (if acting as SP)
2. **Read OIDC Core 1.0** (if acting as IdP)
3. **Test with Postman** (we provide collection)
4. **Review example code** (see `docs/sp-onboarding-guide.md`)
5. **Join weekly federation calls** (Wednesdays 10 AM EST)

### Resources

- **DIVE V3 API Documentation**: `https://api.dive-v3.mil/docs`
- **Federation Metadata**: `https://api.dive-v3.mil/.well-known/federation-metadata`
- **OIDC Configuration**: `https://keycloak.dive-v3.mil/realms/dive-v3-pilot/.well-known/openid-configuration`
- **SP Onboarding Guide**: `docs/sp-onboarding-guide.md`
- **Test Environment**: `https://test.dive-v3.mil` (credentials provided upon request)

### Contact

- **Technical Support**: dive-v3-support@mil
- **Security Questions**: dive-v3-security@mil
- **Federation Admin**: aubrey.beach@example.mil
- **Office Hours**: Mon-Fri 9 AM - 5 PM EST

---

**Document End** - Last Updated: November 4, 2025

