# Week 3.1 Implementation Prompt - NATO ACP-240 Data-Centric Security

**Implementation Window:** October 12-15, 2025 (3-4 days)  
**Objective:** Enhance DIVE V3 with NATO ACP-240 Data-Centric Security requirements  
**Focus:** ZTDF, Policy-Bound Encryption, KAS Integration, Enhanced Audit Logging

---

## EXECUTIVE SUMMARY

**Week 3.1 Goal:** Transform DIVE V3 from an access control demonstration to a **Data-Centric Security (DCS)** system compliant with NATO ACP-240 standards, where security controls are bound to the data objects themselves, not just network perimeters.

**Why This Matters:**
- Demonstrates NATO compliance for coalition data sharing
- Shows Zero Trust Architecture (ZTA) principles in action
- Protects data after it leaves the origin system
- Enables policy-bound encryption with Key Access Service (KAS)
- Proves data can be shared across security domains with embedded protections

**Success Criteria:**
- ✅ Resources implement ZTDF (Zero Trust Data Format) structure
- ✅ Encrypted resources require KAS key release (policy-bound encryption)
- ✅ STANAG 4774 labels applied to all resources
- ✅ Enhanced audit logging (Encrypt/Decrypt/Denied events)
- ✅ OPA policies enforce KAS obligations for encrypted data
- ✅ All 78+ existing tests still passing
- ✅ New ACP-240 compliance tests added
- ✅ GitHub CI/CD passing

---

## CONTEXT FROM WEEKS 1-3 (Complete Foundation)

### Repository Status

**GitHub:** https://github.com/albeach/DIVE-V3  
**Branch:** main  
**Latest Commit:** b31e51e (Week 3 complete)  
**CI/CD Status:** ✅ All jobs passing (OPA: 78/78, Integration: 22/22, Session: 11/11)

### What's Already Built and Working

**Week 1 Foundation:**
- ✅ Keycloak realm `dive-v3-pilot` with U.S. IdP
- ✅ Next.js 15 frontend with NextAuth.js v5
- ✅ Express.js backend API with resource endpoints
- ✅ PostgreSQL (NextAuth sessions + Keycloak)
- ✅ MongoDB with 8 sample resources
- ✅ OPA 0.68.0 policy engine
- ✅ Full Docker Compose stack
- ✅ GitHub Actions CI/CD

**Week 2 Authorization:**
- ✅ Complete OPA Rego policy (238 lines, fail-secure pattern)
- ✅ 53 comprehensive tests (clearance, releasability, COI, embargo)
- ✅ PEP middleware (JWT validation, OPA integration, decision caching)
- ✅ Authorization decision UI (allow/deny with evaluation details)
- ✅ Database session management with OAuth token refresh
- ✅ Structured audit logging

**Week 3 Multi-IdP Federation:**
- ✅ France SAML IdP (SAML 2.0 protocol)
- ✅ Canada OIDC IdP (modern federation)
- ✅ Industry OIDC IdP (claim enrichment demo)
- ✅ 22 negative OPA tests (edge cases, invalid inputs)
- ✅ 22 federation integration tests (extensibility)
- ✅ 11 session lifecycle tests (logout verification)
- ✅ Claim enrichment (email domain → country, default clearance)
- ✅ Complete logout (events.signOut, frontchannel, postMessage)
- ✅ Country code validation (ISO 3166-1 alpha-3, 39-country whitelist)
- ✅ Production-ready IdP brokering architecture

### Current Resource Model (MongoDB)

```javascript
// Current resource schema (Week 1-3):
{
  resourceId: "doc-nato-ops-001",
  title: "NATO Operations Plan",
  classification: "SECRET",           // Clearance level required
  releasabilityTo: ["USA", "GBR", "CAN"],  // Country release control
  COI: ["NATO-COSMIC"],               // Community of Interest
  creationDate: "2025-10-01T00:00:00Z",  // Embargo enforcement
  content: "Plaintext document content...",  // UNENCRYPTED (Week 1-3)
}
```

**Limitations for ACP-240:**
- ❌ No ZTDF structure (not self-contained)
- ❌ No cryptographic binding of metadata to payload
- ❌ No encryption (data not protected outside system)
- ❌ No STANAG 4774 labels
- ❌ No KAS integration (policy-bound encryption)
- ❌ Audit logs don't capture Encrypt/Decrypt events

---

## NATO ACP-240 REQUIREMENTS ANALYSIS

**Source:** ACP240-llms.txt (NATO ACP‑240 (A) Data‑Centric Security Developer Cheat Sheet)

### Core ACP-240 Principles

**1. Data-Centric Security (DCS):**
> "Protects data objects themselves (embedded metadata + encryption), not just networks/perimeters. Every object carries metadata (classification, owner, caveats) to drive fine‑grained access even after data leaves origin."

**Application to DIVE V3:**
- Resources must carry embedded security metadata
- Metadata cryptographically bound to payload
- Protection travels with data (not just at access points)

**2. Zero Trust Data Format (ZTDF):**
> "Self‑contained encrypted object: payload + metadata assertions (security labels, policies) bound together. Incorporates STANAG 4774 (labels) and 4778 (binding) in a JSON‑based container."

**Application to DIVE V3:**
- Transform MongoDB resources to ZTDF structure
- Implement Policy Section (metadata + assertions)
- Implement Payload Section (encrypted content)
- Implement Encryption Info (Key Access Objects)

**3. Key Access Service (KAS):**
> "Holds private keys; mediates wrapped‑key access. On request, evaluates requester's attributes/policy and rewraps the DEK if authorized; all actions auditable."

**Application to DIVE V3:**
- Implement KAS service (Week 4 stretch goal advanced to Week 3.1)
- KAS evaluates same OPA policy before key release
- Audit all key access attempts (granted/denied)

**4. STANAG 4774 Labels:**
> "Defines confidentiality labels (fields/semantics); adapted into ZTDF's JSON with same core elements."

**Application to DIVE V3:**
- Add STANAG 4774 compliant labels to resources
- Include: classification, releasability, handling instructions
- Map to existing DIVE schema (already compatible)

**5. Enhanced Audit Logging:**
> "Mandatory Event Categories: Encrypt, Decrypt, Access Denied, Access Modified, Data Shared."

**Application to DIVE V3:**
- Expand audit logging beyond authorization decisions
- Log Encrypt events (when resource created/updated)
- Log Decrypt events (when encrypted resource accessed)
- Log KAS key release events
- Include all required fields (Who, What, Action, Outcome, When, Attributes)

---

## WEEK 3.1 PHASED IMPLEMENTATION PLAN

### Phase 1: ZTDF Structure Implementation (Day 1 - 6 hours)

**Objective:** Implement Zero Trust Data Format for DIVE V3 resources

**Task 1.1: Define ZTDF Resource Schema**

**File:** `backend/src/models/ztdf-resource.model.ts` (NEW)

```typescript
/**
 * Zero Trust Data Format (ZTDF) Resource Model
 * Based on: NATO ACP-240 (A) Data-Centric Security
 * Reference: STANAG 4774 (labels), STANAG 4778 (binding)
 */

export interface ZTDFResource {
  // Unique identifier
  resourceId: string;
  
  // ZTDF Structure (three main sections):
  manifest: ZTDFManifest;
  policy: ZTDFPolicySection;
  payload: ZTDFPayloadSection;
}

export interface ZTDFManifest {
  // ZTDF version and type
  version: string;  // "1.0.0"
  type: string;     // "document", "image", "data"
  
  // Timestamps
  createdAt: string;  // ISO 8601
  modifiedAt: string; // ISO 8601
  
  // Origin information
  originOrganization: string;  // "DIVE-V3-PILOT"
  originCountry: string;       // "USA" (ISO 3166-1 alpha-3)
}

export interface ZTDFPolicySection {
  // STANAG 4774 Security Labels
  classification: {
    level: "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";
    system: "US" | "NATO";  // Classification system
  };
  
  // Releasability (country-based)
  releasability: {
    releasableTo: string[];  // ISO 3166-1 alpha-3 codes
    displayOnly: boolean;    // "DISPLAY ONLY" caveat
  };
  
  // Community of Interest (COI)
  communityOfInterest: {
    requiredCOI: string[];  // ["NATO-COSMIC", "FVEY", etc.]
    validFrom?: string;     // Optional embargo start
    validUntil?: string;    // Optional embargo end
  };
  
  // Handling Instructions (STANAG 4774)
  handlingInstructions: {
    disseminationControls: string[];  // ["NOFORN", "RELIDO", etc.]
    displayMarkings: string;          // "SECRET//NOFORN//NATO"
  };
  
  // Policy Assertions
  accessPolicy: {
    engine: "OPA";  // Policy engine type
    policyId: string;  // "dive.authorization"
    minimumClearance: string;
    requiresKAS: boolean;  // If true, must obtain key from KAS
  };
  
  // Cryptographic Integrity (STANAG 4778)
  integrity: {
    algorithm: string;  // "SHA-384"
    digest: string;     // Hash of policy section
    signature?: string; // Digital signature (optional)
    signedBy?: string;  // Signer identity
  };
}

export interface ZTDFPayloadSection {
  // Encryption status
  encrypted: boolean;
  
  // If encrypted:
  encryptionInfo?: {
    algorithm: string;  // "AES-256-GCM"
    keyAccessObjects: KeyAccessObject[];  // One or more KAOs
  };
  
  // Payload data
  content: string;  // Base64-encoded (encrypted or plaintext)
  
  // Payload integrity
  contentHash: string;  // SHA-384 of original content
}

export interface KeyAccessObject {
  // KAS information
  kasUrl: string;  // "http://localhost:8080/request-key"
  kasId: string;   // "dive-v3-kas-001"
  
  // Wrapped DEK (Data Encryption Key)
  wrappedKey: string;  // Base64-encoded encrypted DEK
  keyWrapAlgorithm: string;  // "RSA-OAEP-256"
  
  // Policy binding
  policyBinding: string;  // Hash linking to policy section
  
  // Recipient/COI targeting
  intendedRecipient?: string;  // Specific user/service
  intendedCOI?: string;        // "NATO-COSMIC"
}
```

**Task 1.2: Migrate Existing Resources to ZTDF**

**File:** `backend/src/scripts/migrate-to-ztdf.ts` (NEW)

```typescript
/**
 * Migration script: Convert existing resources to ZTDF format
 * Preserves all existing metadata while adding ZTDF structure
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

async function migrateToZTDF() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  
  const db = client.db(process.env.MONGODB_DATABASE);
  const resources = db.collection('resources');
  
  const existingResources = await resources.find({}).toArray();
  
  for (const resource of existingResources) {
    // Create ZTDF structure
    const ztdfResource: ZTDFResource = {
      resourceId: resource.resourceId,
      
      manifest: {
        version: "1.0.0",
        type: "document",
        createdAt: resource.creationDate || new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        originOrganization: "DIVE-V3-PILOT",
        originCountry: "USA"
      },
      
      policy: {
        classification: {
          level: resource.classification,
          system: "US"  // Or "NATO" for NATO-originated docs
        },
        releasability: {
          releasableTo: resource.releasabilityTo,
          displayOnly: false
        },
        communityOfInterest: {
          requiredCOI: resource.COI || [],
          validFrom: resource.creationDate,
          validUntil: undefined
        },
        handlingInstructions: {
          disseminationControls: generateDissemControls(resource),
          displayMarkings: generateDisplayMarking(resource)
        },
        accessPolicy: {
          engine: "OPA",
          policyId: "dive.authorization",
          minimumClearance: resource.classification,
          requiresKAS: resource.encrypted || false
        },
        integrity: {
          algorithm: "SHA-384",
          digest: "", // Will compute after serialization
          signature: undefined,
          signedBy: undefined
        }
      },
      
      payload: {
        encrypted: resource.encrypted || false,
        encryptionInfo: resource.encrypted ? {
          algorithm: "AES-256-GCM",
          keyAccessObjects: resource.keyAccessObjects || []
        } : undefined,
        content: resource.content || "",
        contentHash: crypto.createHash('sha384')
          .update(resource.content || "")
          .digest('hex')
      }
    };
    
    // Compute policy section hash
    const policyJson = JSON.stringify(ztdfResource.policy);
    ztdfResource.policy.integrity.digest = crypto.createHash('sha384')
      .update(policyJson)
      .digest('hex');
    
    // Update in database
    await resources.updateOne(
      { resourceId: resource.resourceId },
      { $set: ztdfResource }
    );
    
    console.log(`Migrated ${resource.resourceId} to ZTDF format`);
  }
  
  await client.close();
  console.log('Migration complete!');
}

function generateDissemControls(resource: any): string[] {
  const controls = [];
  
  // If not releasable to all
  if (resource.releasabilityTo.length < 5) {
    controls.push("RELIDO");  // Release limited
  }
  
  // If USA-only
  if (resource.releasabilityTo.length === 1 && resource.releasabilityTo[0] === "USA") {
    controls.push("NOFORN");  // No foreign nationals
  }
  
  // If has COI
  if (resource.COI && resource.COI.length > 0) {
    controls.push(`COI:${resource.COI[0]}`);
  }
  
  return controls;
}

function generateDisplayMarking(resource: any): string {
  // STANAG 4774 format: CLASSIFICATION//CAVEATS
  let marking = resource.classification;
  
  const caveats = [];
  if (resource.releasabilityTo.length === 1 && resource.releasabilityTo[0] === "USA") {
    caveats.push("NOFORN");
  }
  if (resource.COI && resource.COI.length > 0) {
    caveats.push(resource.COI[0]);
  }
  
  if (caveats.length > 0) {
    marking += "//" + caveats.join("//");
  }
  
  return marking;
}

// Run migration
migrateToZTDF().catch(console.error);
```

**Task 1.3: Update Resource Service for ZTDF**

**File:** `backend/src/services/resource.service.ts`

**Update to handle ZTDF structure:**
```typescript
// Add ZTDF validation
export function validateZTDFIntegrity(resource: ZTDFResource): boolean {
  // Recompute policy hash
  const policyJson = JSON.stringify({
    ...resource.policy,
    integrity: undefined  // Exclude integrity field from hash
  });
  
  const computedHash = crypto.createHash('sha384')
    .update(policyJson)
    .digest('hex');
  
  // Verify matches stored hash
  if (computedHash !== resource.policy.integrity.digest) {
    console.error('ZTDF integrity violation: Policy hash mismatch');
    return false;
  }
  
  return true;
}

// Add to getResourceById:
export async function getResourceById(id: string): Promise<ZTDFResource | null> {
  const resource = await resourcesCollection.findOne({ resourceId: id });
  
  if (resource) {
    // Validate ZTDF integrity
    if (!validateZTDFIntegrity(resource)) {
      throw new Error('ZTDF integrity check failed - possible tampering');
    }
  }
  
  return resource;
}
```

**Deliverables Phase 1:**
- [ ] ZTDF TypeScript interfaces defined
- [ ] Migration script created
- [ ] Existing 8 resources migrated to ZTDF
- [ ] ZTDF integrity validation implemented
- [ ] MongoDB schema updated

---

### Phase 2: KAS (Key Access Service) Implementation (Day 2 - 8 hours)

**Objective:** Implement policy-bound encryption with KAS for encrypted resources

**Task 2.1: Implement KAS Service**

**File:** `kas/src/server.ts` (Week 4 stretch goal advanced to Week 3.1)

**Enhance existing KAS stub:**
```typescript
/**
 * Key Access Service (KAS)
 * Based on: NATO ACP-240 KAS requirements
 * 
 * KAS mediates access to wrapped Data Encryption Keys (DEKs)
 * Evaluates requester's attributes against policy before releasing key
 * All access attempts audited (granted/denied)
 */

import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// In-memory key storage (production would use HSM)
const keyStore: Map<string, string> = new Map();

// OPA endpoint for policy evaluation
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * POST /request-key
 * Request decryption key for encrypted resource
 * 
 * Request body:
 * {
 *   resourceId: "doc-nato-ops-001",
 *   kasId: "dive-v3-kas-001",
 *   wrappedKey: "base64...",
 *   policyBinding: "hash...",
 *   requesterToken: "JWT..."  // From PEP
 * }
 */
app.post('/request-key', async (req, res) => {
  const startTime = Date.now();
  const requestId = `kas-${Date.now()}`;
  
  try {
    const { resourceId, kasId, wrappedKey, policyBinding, requesterToken } = req.body;
    
    console.log('[KAS] Key request received:', {
      requestId,
      resourceId,
      kasId
    });
    
    // Step 1: Validate request parameters
    if (!resourceId || !wrappedKey || !policyBinding || !requesterToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameters'
      });
    }
    
    // Step 2: Extract requester attributes from JWT
    const tokenPayload = JSON.parse(
      Buffer.from(requesterToken.split('.')[1], 'base64').toString()
    );
    
    const requester = {
      uniqueID: tokenPayload.uniqueID || tokenPayload.sub,
      clearance: tokenPayload.clearance,
      countryOfAffiliation: tokenPayload.countryOfAffiliation,
      acpCOI: parseACPCOI(tokenPayload.acpCOI)
    };
    
    console.log('[KAS] Requester attributes:', requester);
    
    // Step 3: Fetch resource metadata from MongoDB
    const resourceMetadata = await fetchResourceMetadata(resourceId);
    
    if (!resourceMetadata) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Resource ${resourceId} not found`
      });
    }
    
    // Step 4: Verify policy binding integrity
    const computedBinding = crypto.createHash('sha384')
      .update(JSON.stringify(resourceMetadata.policy))
      .digest('hex');
    
    if (computedBinding !== policyBinding) {
      console.error('[KAS] Policy binding mismatch - possible tampering');
      
      // CRITICAL: Log security event
      await logKASEvent({
        eventType: 'KAS_POLICY_VIOLATION',
        requestId,
        resourceId,
        requester: requester.uniqueID,
        outcome: 'DENIED',
        reason: 'Policy binding integrity check failed',
        severity: 'CRITICAL'
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Policy binding integrity check failed',
        details: {
          reason: 'ZTDF policy section may have been tampered with'
        }
      });
    }
    
    // Step 5: Call OPA for authorization decision
    // Re-evaluate policy before key release (defense in depth)
    const opaInput = {
      input: {
        subject: {
          authenticated: true,
          uniqueID: requester.uniqueID,
          clearance: requester.clearance,
          countryOfAffiliation: requester.countryOfAffiliation,
          acpCOI: requester.acpCOI
        },
        resource: {
          resourceId: resourceMetadata.resourceId,
          classification: resourceMetadata.policy.classification.level,
          releasabilityTo: resourceMetadata.policy.releasability.releasableTo,
          COI: resourceMetadata.policy.communityOfInterest.requiredCOI,
          creationDate: resourceMetadata.manifest.createdAt
        },
        context: {
          currentTime: new Date().toISOString(),
          requestId
        }
      }
    };
    
    const opaResponse = await axios.post(
      `${OPA_URL}/v1/data/dive/authorization/decision`,
      opaInput
    );
    
    const decision = opaResponse.data.result.decision;
    
    console.log('[KAS] OPA decision:', {
      allow: decision.allow,
      reason: decision.reason
    });
    
    // Step 6: Deny if policy denies (even if PEP allowed earlier)
    if (!decision.allow) {
      // Log KAS denial (PDP denied at KAS layer)
      await logKASEvent({
        eventType: 'KAS_DENIED',
        requestId,
        resourceId,
        requester: requester.uniqueID,
        outcome: 'DENIED',
        reason: decision.reason,
        latency_ms: Date.now() - startTime
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'KAS policy evaluation denied access',
        details: {
          reason: decision.reason,
          evaluation: decision.evaluation_details
        }
      });
    }
    
    // Step 7: Unwrap DEK (decrypt the wrapped key)
    // In production: Use HSM for this operation
    const kek = getKEK(kasId);  // Key Encryption Key from secure storage
    const dek = unwrapKey(wrappedKey, kek);  // Decrypt wrapped DEK
    
    // Step 8: Return DEK to requester
    // ACP-240: Log all key releases
    await logKASEvent({
      eventType: 'KAS_KEY_RELEASED',
      requestId,
      resourceId,
      requester: requester.uniqueID,
      outcome: 'GRANTED',
      reason: 'Policy evaluation passed',
      clearance: requester.clearance,
      classification: resourceMetadata.policy.classification.level,
      latency_ms: Date.now() - startTime
    });
    
    res.status(200).json({
      dek: dek,  // Base64-encoded Data Encryption Key
      algorithm: "AES-256-GCM",
      requestId,
      validUntil: new Date(Date.now() + 3600000).toISOString()  // 1 hour validity
    });
    
  } catch (error) {
    console.error('[KAS] Error processing key request:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process key request'
    });
  }
});

// Helper functions
function parseACPCOI(acpCOI: any): string[] {
  // Same parsing logic as in authz middleware
  if (Array.isArray(acpCOI)) return acpCOI;
  if (typeof acpCOI === 'string') {
    try {
      return JSON.parse(acpCOI);
    } catch {
      return [acpCOI];
    }
  }
  return [];
}

function getKEK(kasId: string): Buffer {
  // In production: Retrieve from HSM
  // For pilot: Use generated KEK stored securely
  const kek = keyStore.get(kasId);
  if (!kek) {
    throw new Error(`KEK not found for KAS ${kasId}`);
  }
  return Buffer.from(kek, 'base64');
}

function unwrapKey(wrappedKey: string, kek: Buffer): string {
  // Decrypt wrapped DEK using KEK
  // RSA-OAEP-256 decryption
  const wrapped = Buffer.from(wrappedKey, 'base64');
  
  // For pilot: Simple AES unwrap (production would use RSA/HSM)
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    kek.slice(0, 32),
    wrapped.slice(0, 16)  // IV
  );
  
  const dek = Buffer.concat([
    decipher.update(wrapped.slice(16)),
    decipher.final()
  ]);
  
  return dek.toString('base64');
}

async function logKASEvent(event: any) {
  // Write to KAS audit log
  // ACP-240 requirement: Log all Encrypt/Decrypt/Denied events
  const kasLogger = getLogger('kas-audit');
  
  kasLogger.info('KAS Event', {
    timestamp: new Date().toISOString(),
    ...event
  });
  
  // Also write to file for compliance
  fs.appendFileSync(
    '/app/logs/kas-audit.log',
    JSON.stringify(event) + '\n'
  );
}

app.listen(8080, () => {
  console.log('[KAS] Service running on port 8080');
});
```

**Task 2.2: Add Encrypted Resource to Test Data**

**File:** `backend/src/scripts/seed-resources.ts`

**Add encrypted resource example:**
```typescript
{
  resourceId: "doc-encrypted-001",
  manifest: {
    version: "1.0.0",
    type: "document",
    createdAt: "2025-10-12T00:00:00Z",
    modifiedAt: "2025-10-12T00:00:00Z",
    originOrganization: "DIVE-V3-PILOT",
    originCountry: "USA"
  },
  policy: {
    classification: {
      level: "SECRET",
      system: "US"
    },
    releasability: {
      releasableTo: ["USA", "GBR", "CAN"],
      displayOnly: false
    },
    communityOfInterest: {
      requiredCOI: ["FVEY"],
      validFrom: "2025-10-12T00:00:00Z"
    },
    handlingInstructions: {
      disseminationControls: ["RELIDO", "COI:FVEY"],
      displayMarkings: "SECRET//FVEY"
    },
    accessPolicy: {
      engine: "OPA",
      policyId: "dive.authorization",
      minimumClearance: "SECRET",
      requiresKAS: true  // ENCRYPTED - requires KAS key release
    },
    integrity: {
      algorithm: "SHA-384",
      digest: "abc123...",  // Computed hash
      signature: undefined,
      signedBy: undefined
    }
  },
  payload: {
    encrypted: true,
    encryptionInfo: {
      algorithm: "AES-256-GCM",
      keyAccessObjects: [
        {
          kasUrl: "http://localhost:8080/request-key",
          kasId: "dive-v3-kas-001",
          wrappedKey: "base64-encoded-wrapped-dek",
          keyWrapAlgorithm: "RSA-OAEP-256",
          policyBinding: "abc123...",  // Matches policy.integrity.digest
          intendedCOI: "FVEY"
        }
      ]
    },
    content: "encrypted-base64-content-here",  // AES-256-GCM encrypted
    contentHash: "original-content-hash"
  }
}
```

**Task 2.4: Update PEP Middleware for KAS Obligation**

**File:** `backend/src/middleware/authz.middleware.ts`

**Add KAS obligation handling:**
```typescript
// After OPA decision, check for KAS obligation
if (opaDecision.result.allow && opaDecision.result.obligations) {
  const kasObligation = opaDecision.result.obligations.find(
    (o: any) => o.type === 'KAS_KEY_REQUIRED'
  );
  
  if (kasObligation) {
    console.log('[PEP] Resource requires KAS key release');
    
    // Attach obligation to request for downstream handler
    (req as any).kasObligation = {
      resourceId,
      kasUrl: kasObligation.kasUrl,
      kasId: kasObligation.kasId
    };
  }
}
```

**Deliverables Phase 2:**
- [ ] KAS service implemented (8080)
- [ ] Key wrap/unwrap logic functional
- [ ] Policy re-evaluation in KAS
- [ ] KAS audit logging implemented
- [ ] Encrypted resource example added
- [ ] PEP handles KAS obligations

---

### Phase 3: STANAG 4774 Labels & Display Markings (Day 3 - 4 hours)

**Objective:** Implement NATO-compliant security labels and display markings

**Task 3.1: Add STANAG 4774 Label Generation**

**File:** `backend/src/utils/stanag4774.ts` (NEW)

```typescript
/**
 * STANAG 4774 Security Label Generation
 * Based on: NATO ACP-240 labeling requirements
 */

export interface STANAG4774Label {
  classification: string;       // "SECRET"
  releasability: string[];      // ["NATO", "USA", "GBR"]
  caveats: string[];           // ["NOFORN", "RELIDO"]
  communityOfInterest: string[];  // ["FVEY", "NATO-COSMIC"]
  displayMarking: string;      // "SECRET//NOFORN//FVEY"
  originalClassification?: string;  // For equivalency mapping
}

export function generateSTANAG4774Label(resource: ZTDFResource): STANAG4774Label {
  const policy = resource.policy;
  
  // Build display marking per STANAG 4774 format
  let marking = policy.classification.level;
  
  // Add caveats
  const caveats = policy.handlingInstructions.disseminationControls;
  if (caveats.length > 0) {
    marking += "//" + caveats.join("//");
  }
  
  // Add COI
  const coi = policy.communityOfInterest.requiredCOI;
  if (coi.length > 0) {
    marking += "//" + coi.join("//");
  }
  
  return {
    classification: policy.classification.level,
    releasability: policy.releasability.releasableTo,
    caveats,
    communityOfInterest: coi,
    displayMarking: marking,
    originalClassification: policy.classification.system === "NATO" 
      ? mapNATOToUS(policy.classification.level)
      : undefined
  };
}

function mapNATOToUS(natoClassification: string): string {
  // NATO classification equivalency
  const mapping: Record<string, string> = {
    "NATO UNCLASSIFIED": "UNCLASSIFIED",
    "NATO CONFIDENTIAL": "CONFIDENTIAL",
    "NATO SECRET": "SECRET",
    "COSMIC TOP SECRET": "TOP_SECRET"
  };
  
  return mapping[natoClassification] || natoClassification;
}

export function validateLabelIntegrity(resource: ZTDFResource): boolean {
  // Verify display marking matches policy
  const generated = generateSTANAG4774Label(resource);
  const stored = resource.policy.handlingInstructions.displayMarkings;
  
  if (generated.displayMarking !== stored) {
    console.warn('[STANAG4774] Display marking mismatch', {
      generated: generated.displayMarking,
      stored
    });
    return false;
  }
  
  return true;
}
```

**Task 3.2: Update Frontend to Display STANAG Labels**

**File:** `frontend/src/app/resources/[id]/page.tsx`

**Add banner showing STANAG 4774 display marking:**
```tsx
// At top of resource detail page:
<div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
  <div className="flex items-center">
    <div className="flex-shrink-0">
      <svg className="h-5 w-5 text-yellow-700" /* warning icon */ />
    </div>
    <div className="ml-3">
      <p className="text-sm font-mono font-bold text-yellow-800">
        {resource.policy.handlingInstructions.displayMarkings}
      </p>
      <p className="text-xs text-yellow-700 mt-1">
        STANAG 4774 Security Marking
      </p>
    </div>
  </div>
</div>
```

**Deliverables Phase 3:**
- [ ] STANAG 4774 label generation implemented
- [ ] Display markings validated
- [ ] Classification equivalency mapping
- [ ] Frontend shows security markings
- [ ] Banner-style display per NATO standards

---

### Phase 4: Enhanced Audit Logging (Day 3-4 - 4 hours)

**Objective:** Implement ACP-240 mandatory event categories

**Task 4.1: Expand Audit Logger**

**File:** `backend/src/utils/logger.ts`

**Add ACP-240 event types:**
```typescript
export enum ACP240EventType {
  ENCRYPT = 'ENCRYPT',           // Data protected/encrypted
  DECRYPT = 'DECRYPT',           // Data accessed/decrypted
  ACCESS_DENIED = 'ACCESS_DENIED',  // Policy denied access
  ACCESS_MODIFIED = 'ACCESS_MODIFIED',  // Object permissions changed
  DATA_SHARED = 'DATA_SHARED'    // Released outside original COI/domain
}

export interface ACP240AuditEvent {
  // Mandatory fields per ACP-240 Supplement 6
  eventType: ACP240EventType;
  timestamp: string;  // ISO 8601
  requestId: string;
  
  // Who
  subjectId: string;  // uniqueID
  subjectClearance: string;
  subjectCountry: string;
  
  // What
  resourceId: string;
  classification: string;
  releasability: string[];
  
  // Action & Outcome
  action: string;  // "READ", "DECRYPT", "MODIFY"
  outcome: "GRANTED" | "DENIED";
  
  // Policy Context
  policyEngine: string;  // "OPA"
  policyDecision: any;   // Full OPA decision
  
  // Additional Context
  reason: string;
  attributes?: any;  // Relevant attributes used
  kasInvolved?: boolean;  // Was KAS called?
  latency_ms?: number;
}

export function logACP240Event(event: ACP240AuditEvent) {
  const auditLogger = logger.child({ service: 'acp240-audit' });
  
  auditLogger.info(event.eventType, {
    timestamp: event.timestamp,
    requestId: event.requestId,
    subject: {
      id: event.subjectId,
      clearance: event.subjectClearance,
      country: event.subjectCountry
    },
    resource: {
      id: event.resourceId,
      classification: event.classification,
      releasability: event.releasability
    },
    action: event.action,
    outcome: event.outcome,
    policy: {
      engine: event.policyEngine,
      decision: event.policyDecision
    },
    reason: event.reason,
    kasInvolved: event.kasInvolved,
    latency_ms: event.latency_ms
  });
  
  // Write to dedicated ACP-240 audit file
  fs.appendFileSync(
    './logs/acp240-audit.log',
    JSON.stringify(event) + '\n'
  );
}
```

**Task 4.2: Integrate ACP-240 Logging into PEP**

**File:** `backend/src/middleware/authz.middleware.ts`

**Update to log ACP-240 events:**
```typescript
// After OPA decision
if (opaDecision.result.allow) {
  // Log ACCESS_GRANTED (if accessing encrypted resource, will log DECRYPT later)
  logACP240Event({
    eventType: resource.payload.encrypted ? ACP240EventType.DECRYPT : ACP240EventType.ACCESS_DENIED,
    timestamp: new Date().toISOString(),
    requestId,
    subjectId: uniqueID,
    subjectClearance: clearance,
    subjectCountry: countryOfAffiliation,
    resourceId: resource.resourceId,
    classification: resource.policy.classification.level,
    releasability: resource.policy.releasability.releasableTo,
    action: resource.payload.encrypted ? "DECRYPT" : "READ",
    outcome: "GRANTED",
    policyEngine: "OPA",
    policyDecision: opaDecision.result,
    reason: opaDecision.result.reason,
    kasInvolved: resource.policy.accessPolicy.requiresKAS,
    latency_ms: Date.now() - startTime
  });
} else {
  // Log ACCESS_DENIED
  logACP240Event({
    eventType: ACP240EventType.ACCESS_DENIED,
    timestamp: new Date().toISOString(),
    requestId,
    subjectId: uniqueID,
    subjectClearance: clearance,
    subjectCountry: countryOfAffiliation,
    resourceId: resource.resourceId,
    classification: resource.policy.classification.level,
    releasability: resource.policy.releasability.releasableTo,
    action: "READ",
    outcome: "DENIED",
    policyEngine: "OPA",
    policyDecision: opaDecision.result,
    reason: opaDecision.result.reason,
    kasInvolved: false,
    latency_ms: Date.now() - startTime
  });
}
```

**Deliverables Phase 4:**
- [ ] ACP-240 audit event types defined
- [ ] Enhanced logger with mandatory fields
- [ ] ENCRYPT/DECRYPT/ACCESS_DENIED events logged
- [ ] Dedicated acp240-audit.log file
- [ ] KAS events included in audit trail

---

### Phase 5: OPA Policy Updates for ZTDF & KAS (Day 4 - 4 hours)

**Objective:** Update OPA policies to handle ZTDF structure and KAS obligations

**Task 5.1: Add KAS Obligation to OPA Policy**

**File:** `policies/fuel_inventory_abac_policy.rego`

**Add obligation for encrypted resources:**
```rego
# Obligations Section (after allow rule)

# Obligation: KAS Key Required for Encrypted Resources
obligations contains obligation if {
    allow  # Only if access is allowed
    input.resource.encrypted == true
    input.resource.encryptionInfo
    
    # Build KAS obligation
    kao := input.resource.encryptionInfo.keyAccessObjects[0]  # First KAO
    
    obligation := {
        "type": "KAS_KEY_REQUIRED",
        "kasUrl": kao.kasUrl,
        "kasId": kao.kasId,
        "wrappedKey": kao.wrappedKey,
        "policyBinding": input.resource.policyIntegrityDigest,
        "message": "Resource is encrypted. Obtain DEK from KAS before decryption."
    }
}

# Include obligations in decision
decision := {
    "allow": allow,
    "reason": reason,
    "obligations": obligations,  # Add obligations array
    "evaluation_details": evaluation_details
}
```

**Task 5.2: Add ZTDF Integrity Check**

**Add to OPA policy:**
```rego
# Check: ZTDF Integrity Validation
is_ztdf_integrity_violation := msg if {
    input.resource.policyIntegrityDigest
    input.resource.computedPolicyHash
    
    # Verify policy hash matches
    input.resource.policyIntegrityDigest != input.resource.computedPolicyHash
    
    msg := "ZTDF policy integrity check failed - possible tampering"
}

# Add to main allow rule:
allow if {
    not is_not_authenticated
    not is_missing_required_attributes
    not is_insufficient_clearance
    not is_not_releasable_to_country
    not is_coi_violation
    not is_under_embargo
    not is_ztdf_integrity_violation  # NEW - ZTDF check
}
```

**Task 5.3: Add OPA Tests for ZTDF/KAS**

**File:** `policies/tests/acp240_compliance_test_suite.rego` (NEW)

```rego
package dive.authorization_test

import rego.v1
import data.dive.authorization

# ==============================================================================
# ACP-240 Compliance Test Suite
# ==============================================================================
# Tests ZTDF structure handling, KAS obligations, and enhanced audit requirements

# Test: Encrypted resource generates KAS obligation
test_kas_obligation_for_encrypted_resource if {
    decision := authorization.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"]
        },
        "resource": {
            "resourceId": "doc-encrypted-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"],
            "encrypted": true,
            "encryptionInfo": {
                "keyAccessObjects": [{
                    "kasUrl": "http://localhost:8080/request-key",
                    "kasId": "dive-v3-kas-001",
                    "wrappedKey": "base64...",
                    "policyBinding": "hash..."
                }]
            }
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
    
    # Should allow access
    decision.allow
    
    # Should include KAS obligation
    count(decision.obligations) > 0
    some obligation in decision.obligations
    obligation.type == "KAS_KEY_REQUIRED"
    obligation.kasUrl == "http://localhost:8080/request-key"
}

# Test: ZTDF integrity violation denies access
test_deny_ztdf_integrity_violation if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "policyIntegrityDigest": "original-hash",
            "computedPolicyHash": "tampered-hash"  # Mismatch!
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
}

# Test: Unencrypted resource has no KAS obligation
test_no_kas_obligation_for_unencrypted if {
    decision := authorization.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []
        },
        "resource": {
            "resourceId": "doc-unencrypted",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": [],
            "encrypted": false
        },
        "context": {
            "currentTime": "2025-10-15T14:30:00Z"
        }
    }
    
    decision.allow
    count(decision.obligations) == 0  # No KAS obligation
}

# Additional tests for STANAG compliance...
```

**Deliverables Phase 3:**
- [ ] STANAG 4774 label generator implemented
- [ ] Display marking generation functional
- [ ] Classification equivalency mapping
- [ ] Frontend displays security labels
- [ ] OPA tests for ZTDF/KAS (10+ new tests)

---

### Phase 6: Integration & Testing (Day 4 - 6 hours)

**Objective:** Complete integration, run full test suite, verify CI/CD

**Task 6.1: Update Resource Controller for ZTDF**

**File:** `backend/src/controllers/resource.controller.ts`

**Handle encrypted resources:**
```typescript
export const getResourceHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const resource = await getResourceById(id);
    
    if (!resource) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Resource ${id} not found`
      });
    }
    
    // Check if resource is encrypted and requires KAS
    if (resource.payload.encrypted && resource.policy.accessPolicy.requiresKAS) {
      // Check for KAS obligation from PEP
      const kasObligation = (req as any).kasObligation;
      
      if (!kasObligation) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Resource is encrypted but KAS obligation not present',
          details: {
            encrypted: true,
            requiresKAS: true,
            hint: 'This should not happen - check PEP middleware'
          }
        });
      }
      
      // Return ZTDF metadata + KAS obligation
      // Client must call KAS to get DEK, then decrypt
      return res.status(200).json({
        resourceId: resource.resourceId,
        manifest: resource.manifest,
        policy: resource.policy,
        payload: {
          encrypted: true,
          content: resource.payload.content,  // Encrypted blob
          contentHash: resource.payload.contentHash
        },
        kasObligation: {
          message: "Resource requires key from KAS",
          kasUrl: kasObligation.kasUrl,
          kasId: kasObligation.kasId,
          instructions: "Call KAS /request-key endpoint with your JWT to obtain DEK"
        }
      });
    }
    
    // Unencrypted resource - return normally
    return res.status(200).json({
      resourceId: resource.resourceId,
      manifest: resource.manifest,
      policy: resource.policy,
      payload: {
        encrypted: false,
        content: resource.payload.content,  // Plaintext
      },
      stanagLabel: generateSTANAG4774Label(resource)
    });
    
  } catch (error) {
    console.error('Resource handler error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve resource'
    });
  }
};
```

**Task 6.2: Run Complete Test Suite**
```bash
# 1. OPA Tests (should still be 78/78)
docker-compose exec opa opa test /policies/ -v

# Expected: PASS: 78/78 (existing tests)
# Plus: PASS: X/X for new ACP-240 tests

# 2. Backend Integration Tests
cd backend
npm test

# Expected: 33/33 passing (existing)
# Plus: New ACP-240 compliance tests

# 3. TypeScript Compilation
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit

# Expected: 0 errors

# 4. Manual Testing
# - Test ZTDF resource display
# - Test encrypted resource + KAS obligation
# - Test STANAG label display
# - Test audit log entries
```

**Task 6.3: Update CI/CD Workflow**

**File:** `.github/workflows/ci.yml`

**Add ACP-240 validation:**
```yaml
- name: Verify ACP-240 Compliance
  run: |
    # Check for ZTDF structure in resources
    # Check for KAS service
    # Check for audit logging
    # Check for STANAG 4774 labels
    echo "✅ ACP-240 compliance checks passed"
```

**Task 6.4: Create ACP-240 Compliance Report**

**File:** `docs/ACP240-COMPLIANCE-REPORT.md` (NEW)

**Document:**
- ZTDF implementation status
- STANAG 4774/4778 compliance
- KAS integration level
- Audit logging coverage
- Policy enforcement
- Remaining gaps for full compliance

**Deliverables Phase 6:**
- [ ] All tests passing (OPA + Integration + TypeScript)
- [ ] CI/CD workflow updated
- [ ] ACP-240 compliance documented
- [ ] Ready for GitHub commit

---

## SUCCESS CRITERIA FOR WEEK 3.1

### Functional Requirements:

**ZTDF Implementation:**
- [ ] All resources use ZTDF structure
- [ ] Policy section with STANAG 4774 labels
- [ ] Payload section (encrypted/unencrypted)
- [ ] Manifest section with origin info
- [ ] Cryptographic integrity (SHA-384 hashes)

**KAS Integration:**
- [ ] KAS service operational (port 8080)
- [ ] Key wrap/unwrap functional
- [ ] Policy re-evaluation before key release
- [ ] KAS audit logging
- [ ] At least 1 encrypted resource with KAO

**STANAG 4774 Compliance:**
- [ ] Security labels on all resources
- [ ] Display markings (classification//caveats//coi)
- [ ] Classification equivalency mapping
- [ ] Frontend displays STANAG labels

**Enhanced Audit Logging:**
- [ ] ENCRYPT events logged
- [ ] DECRYPT events logged
- [ ] ACCESS_DENIED events logged
- [ ] KAS events logged
- [ ] All mandatory fields per ACP-240 Supplement 6

**OPA Policy Enhancements:**
- [ ] ZTDF integrity check rule
- [ ] KAS obligations for encrypted resources
- [ ] New tests for ACP-240 scenarios
- [ ] All existing 78 tests still passing

### Technical Requirements:

**Testing:**
- [ ] OPA: 78+ tests passing (existing + new ACP-240 tests)
- [ ] Integration: 33+ tests passing
- [ ] New: ACP-240 compliance tests (10+)
- [ ] TypeScript: 0 errors
- [ ] Manual: ZTDF resource access tested

**Code Quality:**
- [ ] No shortcuts or workarounds
- [ ] Proper TypeScript interfaces
- [ ] Comprehensive error handling
- [ ] Security best practices followed

**Documentation:**
- [ ] ACP-240 compliance report
- [ ] ZTDF implementation guide
- [ ] KAS integration documentation
- [ ] STANAG 4774 label reference
- [ ] Enhanced audit logging guide

**Deployment:**
- [ ] Docker Compose updated (KAS service)
- [ ] MongoDB schema supports ZTDF
- [ ] GitHub CI/CD passing
- [ ] Production deployment notes

---

## REFERENCE MATERIALS

### NATO ACP-240 Documentation

**Source:** `ACP240-llms.txt` (NATO ACP‑240 (A) Data‑Centric Security Cheat Sheet)

**Key Sections:**
1. **Section 1:** Key Concepts (DCS, ZTA, Federated Identity, ABAC, ZTDF)
2. **Section 3:** Access Control & Enforcement (ABAC, PDP/PEP, Fail-Closed)
3. **Section 4:** Data Markings (STANAG 4774 labels, equivalency)
4. **Section 5:** ZTDF & Cryptography (structure, KAS, hybrid encryption)
5. **Section 6:** Logging & Auditing (mandatory events, SIEM integration)
6. **Section 9:** Implementation Checklist

**Critical Quotes:**

**On Data-Centric Security:**
> "Protects data objects themselves (embedded metadata + encryption), not just networks/perimeters. Every object carries metadata (classification, owner, caveats) to drive fine‑grained access even after data leaves origin."

**On ZTDF:**
> "Self‑contained encrypted object: payload + metadata assertions (security labels, policies) bound together. Incorporates STANAG 4774 (labels) and 4778 (binding) in a JSON‑based container."

**On KAS:**
> "Holds private keys; mediates wrapped‑key access. On request, evaluates requester's attributes/policy and rewraps the DEK if authorized; all actions auditable."

**On Audit Logging:**
> "Mandatory Event Categories (Suppl. 6): Encrypt — when data is sealed/protected. Decrypt — when data is accessed. Access Denied — policy denies access. Access Modified — object content or permissions changed. Data Shared — release outside original COI/domain."

**On Enforcement:**
> "PEPs Everywhere: All access (microservices, APIs, data interfaces) must call PDPs. Fail‑Closed: If PDP or attributes unavailable, DENY by default."

### DIVE-V3 Existing Documentation

**Architecture:**
- `docs/PRODUCTION-READY-FEDERATION.md` - Multi-IdP federation architecture
- `docs/README.md` - Complete project overview
- `.cursorrules` - DIVE V3 conventions and standards

**Implementation:**
- `dive-v3-implementation-plan.md` - Original 4-week plan (Week 4 includes KAS stretch goal)
- `dive-v3-security.md` - Security requirements
- `dive-v3-backend.md` - Backend API specification
- `WEEK3-DELIVERY-COMPLETE.md` - Week 3 achievements

**Policies:**
- `policies/fuel_inventory_abac_policy.rego` - Current OPA policy (288 lines)
- `policies/tests/comprehensive_test_suite.rego` - 53 tests
- `policies/tests/negative_test_suite.rego` - 22 tests

**Code:**
- `backend/src/middleware/authz.middleware.ts` - PEP implementation
- `backend/src/services/resource.service.ts` - Resource management
- `frontend/src/auth.ts` - NextAuth with enrichment

### Related Standards (from ACP-240)

**NATO Standards:**
- **STANAG 4774:** Security label semantics
- **STANAG 4778:** Cryptographic binding of metadata
- **STANAG 5636:** Identity/metadata exchange subset

**NIST Standards:**
- **SP 800-207:** Zero Trust Architecture
- **SP 800-63B/C:** Authentication/Federation Assurance Levels

**IETF Standards:**
- **RFC 4122:** UUIDs for globally unique identifiers
- **ISO 3166:** Country codes (already implemented: alpha-3)

---

## WEEK 3.1 OBJECTIVES & SUCCESS CRITERIA

### Primary Objectives:

**Objective 1: ZTDF Implementation**
- Migrate all 8 resources to ZTDF structure
- Implement three sections: manifest, policy, payload
- Add cryptographic integrity (SHA-384 hashes)
- Validate integrity on resource access

**Success Criteria:**
- ✅ All resources have ZTDF structure in MongoDB
- ✅ Policy section includes STANAG 4774 labels
- ✅ Integrity hashes computed and validated
- ✅ Frontend displays ZTDF metadata correctly

**Objective 2: Policy-Bound Encryption with KAS**
- Implement KAS service for encrypted resources
- Add at least 2 encrypted resources to test data
- KAS evaluates OPA policy before key release
- PEP detects KAS obligations from OPA decision

**Success Criteria:**
- ✅ KAS service running on port 8080
- ✅ Encrypted resources require KAS key release
- ✅ KAS calls OPA for re-authorization
- ✅ PEP returns KAS obligation to client
- ✅ Audit logs capture KAS events

**Objective 3: STANAG 4774 Label Compliance**
- Implement NATO-compliant security labels
- Generate display markings (classification//caveats//coi)
- Support classification equivalency (US ↔ NATO)
- Display labels prominently in UI

**Success Criteria:**
- ✅ All resources have display markings
- ✅ Format: "SECRET//NOFORN//FVEY"
- ✅ Classification equivalency mapping functional
- ✅ Frontend banner shows STANAG labels

**Objective 4: Enhanced Audit Logging**
- Implement ACP-240 mandatory event categories
- Log Encrypt, Decrypt, Access Denied, Data Shared
- Include all required fields (Who, What, Action, Outcome, When)
- Dedicated audit log file for compliance

**Success Criteria:**
- ✅ ENCRYPT events logged (resource creation)
- ✅ DECRYPT events logged (encrypted resource access)
- ✅ ACCESS_DENIED events logged (policy denial)
- ✅ KAS events logged (key release/denial)
- ✅ All events in acp240-audit.log

**Objective 5: OPA Policy Enhancements**
- Add ZTDF integrity validation rule
- Add KAS obligation generation
- Add tests for encrypted resources
- Maintain fail-closed enforcement

**Success Criteria:**
- ✅ is_ztdf_integrity_violation rule implemented
- ✅ KAS obligations in decision output
- ✅ 10+ new ACP-240 tests added
- ✅ All 78 existing tests still passing
- ✅ Total: 88+ tests passing

---

## IMPLEMENTATION SCHEDULE

### Day 1: ZTDF Structure (6 hours)

**Morning (3 hours):**
- Define ZTDF TypeScript interfaces
- Create migration script
- Run migration (8 resources → ZTDF)
- Verify in MongoDB

**Afternoon (3 hours):**
- Update resource service for ZTDF
- Add integrity validation
- Update resource controller
- Test ZTDF resource retrieval

**Deliverable:** All resources in ZTDF format, integrity validation working

### Day 2: KAS Implementation (8 hours)

**Morning (4 hours):**
- Implement KAS service (server.ts)
- Key wrap/unwrap logic
- Policy re-evaluation (call OPA)
- KAS audit logging

**Afternoon (4 hours):**
- Create encrypted resource examples
- Update PEP for KAS obligations
- Test KAS key request flow
- Verify KAS logs

**Deliverable:** KAS operational, encrypted resources accessible via KAS

### Day 3: STANAG Labels & Audit Logging (6 hours)

**Morning (3 hours):**
- STANAG 4774 label generator
- Display marking generation
- Frontend label display
- Classification equivalency

**Afternoon (3 hours):**
- Enhanced audit logger (ACP-240 events)
- Integrate into PEP middleware
- Integrate into KAS service
- Test audit log output

**Deliverable:** STANAG labels displayed, comprehensive audit logging

### Day 4: OPA Updates & Testing (6 hours)

**Morning (3 hours):**
- Update OPA policy (ZTDF integrity, KAS obligations)
- Add ACP-240 compliance tests
- Run full OPA test suite
- Fix any failing tests

**Afternoon (3 hours):**
- Run integration tests
- Update CI/CD workflow
- Commit to GitHub
- Verify CI/CD passes

**Deliverable:** All tests passing, CI/CD green, Week 3.1 complete

---

## TESTING STRATEGY

### OPA Policy Tests (Target: 88+ tests)

**Existing Tests (78):**
- ✅ Comprehensive suite: 53 tests
- ✅ Negative suite: 22 tests
- ✅ Validation: 3 tests

**New ACP-240 Tests (10+):**
- KAS obligation for encrypted resources (1 test)
- No KAS obligation for unencrypted (1 test)
- ZTDF integrity violation denies access (1 test)
- Encrypted resource with valid policy binding (1 test)
- Multiple KAOs handling (1 test)
- STANAG label validation (2 tests)
- Classification equivalency (2 tests)
- Audit event generation (2 tests)

**Total Target: 88+ tests, 100% passing**

### Integration Tests (Target: 40+)

**Existing Tests (33):**
- ✅ Federation: 22 tests
- ✅ Session lifecycle: 11 tests

**New ACP-240 Tests (7+):**
- ZTDF structure validation (1 test)
- ZTDF integrity check (1 test)
- KAS key request flow (1 test)
- KAS policy enforcement (1 test)
- STANAG label generation (1 test)
- Enhanced audit logging (1 test)
- Encrypted vs unencrypted access (1 test)

**Total Target: 40+ tests, 100% passing**

### Manual Test Scenarios

**Scenario 1: Unencrypted Resource (ZTDF without encryption)**
```
1. Navigate to /resources
2. Click: doc-nato-ops-001 (unencrypted ZTDF)
3. Expected:
   - STANAG banner shows: "SECRET//NATO-COSMIC"
   - Access granted (clearance check passes)
   - Content displayed (plaintext)
   - Audit log: ACCESS_GRANTED event
```

**Scenario 2: Encrypted Resource (ZTDF with KAS)**
```
1. Navigate to /resources
2. Click: doc-encrypted-001 (encrypted ZTDF)
3. Expected:
   - STANAG banner shows: "SECRET//FVEY"
   - Access granted by OPA (clearance + COI check)
   - KAS obligation returned:
     {
       "message": "Resource requires key from KAS",
       "kasUrl": "http://localhost:8080/request-key",
       "instructions": "Call KAS endpoint..."
     }
   - Content shows: "ENCRYPTED - Requires KAS Key"
   - Audit log: DECRYPT attempt logged

4. (Future enhancement): Frontend calls KAS, decrypts client-side
   For Week 3.1: Just show KAS obligation message
```

**Scenario 3: KAS Denies Key Release**
```
1. User with insufficient clearance accesses encrypted resource
2. OPA allows at PEP level (shouldn't happen, but defense in depth)
3. KAS re-evaluates policy
4. KAS denies key release
5. Audit log: KAS_DENIED event with reason
```

**Scenario 4: ZTDF Integrity Violation**
```
1. Tamper with resource policy (simulate attack)
2. Recompute hash to mismatch
3. Attempt to access resource
4. Expected: Access denied (integrity check fails)
5. Audit log: ZTDF_INTEGRITY_VIOLATION
```

---

## DOCKER COMPOSE UPDATES

**Add KAS service:**

**File:** `docker-compose.yml`

```yaml
kas:
  build: ./kas
  container_name: dive-v3-kas
  ports:
    - "8080:8080"
  environment:
    - OPA_URL=http://opa:8181
    - MONGODB_URL=mongodb://mongo:27017
    - MONGODB_DATABASE=dive-v3
    - LOG_LEVEL=info
  volumes:
    - ./kas/logs:/app/logs
  networks:
    - dive-v3-network
  depends_on:
    - mongo
    - opa
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

---

## CI/CD INTEGRATION

### Update GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

**Add ACP-240 validation job:**
```yaml
acp240-compliance:
  name: ACP-240 Compliance Checks
  runs-on: ubuntu-latest
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Verify ZTDF Structure
      run: |
        # Check TypeScript interfaces exist
        test -f backend/src/models/ztdf-resource.model.ts
        echo "✅ ZTDF model defined"
    
    - name: Verify KAS Service
      run: |
        # Check KAS service exists
        test -f kas/src/server.ts
        echo "✅ KAS service implemented"
    
    - name: Verify STANAG 4774 Implementation
      run: |
        # Check STANAG utilities exist
        test -f backend/src/utils/stanag4774.ts
        echo "✅ STANAG 4774 labels implemented"
    
    - name: Verify Enhanced Audit Logging
      run: |
        # Check for ACP-240 event types
        grep -q "ACP240EventType" backend/src/utils/logger.ts
        echo "✅ ACP-240 audit events defined"
    
    - name: Run ACP-240 Compliance Tests
      run: |
        # OPA tests should include ACP-240 scenarios
        # Target: 88+ tests (78 existing + 10 ACP-240)
        cd policies
        opa test . -v
```

---

## KNOWN CHALLENGES & MITIGATIONS

### Challenge 1: KAS Complexity

**Issue:** Full KAS with HSM integration is complex  
**Mitigation:**
- Implement KAS stub for pilot (in-memory keys)
- Document production HSM requirements
- Focus on policy-bound encryption demo
- Prove concept, not production deployment

### Challenge 2: Encrypted Resources in Frontend

**Issue:** Client-side decryption requires KAS client library  
**Mitigation:**
- Week 3.1: Show KAS obligation message only
- Week 4: Implement client-side KAS call + decryption
- Progressive enhancement approach

### Challenge 3: ZTDF Migration

**Issue:** Changing resource schema might break existing functionality  
**Mitigation:**
- Backward compatibility layer
- Migrate incrementally (test after each resource)
- Keep existing tests running
- Rollback script if needed

### Challenge 4: Audit Log Volume

**Issue:** Enhanced logging might generate large log files  
**Mitigation:**
- Structured JSON logging (efficient parsing)
- Log rotation configured
- SIEM integration planned (future)
- For pilot: File-based acceptable

---

## DELIVERABLES CHECKLIST

### Code Deliverables:

**New Files (~15):**
- [ ] `backend/src/models/ztdf-resource.model.ts` (ZTDF interfaces)
- [ ] `backend/src/scripts/migrate-to-ztdf.ts` (migration script)
- [ ] `backend/src/utils/stanag4774.ts` (label generation)
- [ ] `kas/src/server.ts` (enhanced KAS service)
- [ ] `kas/src/services/key-management.ts` (KEK/DEK handling)
- [ ] `policies/tests/acp240_compliance_test_suite.rego` (10+ tests)
- [ ] `backend/src/__tests__/ztdf.integration.test.ts` (ZTDF tests)
- [ ] `backend/src/__tests__/kas.integration.test.ts` (KAS tests)
- [ ] `docs/ACP240-COMPLIANCE-REPORT.md` (compliance documentation)
- [ ] `docs/ZTDF-IMPLEMENTATION-GUIDE.md` (technical guide)
- [ ] `docs/KAS-INTEGRATION-GUIDE.md` (KAS documentation)

**Modified Files (~10):**
- [ ] `backend/src/services/resource.service.ts` (ZTDF support)
- [ ] `backend/src/controllers/resource.controller.ts` (KAS obligations)
- [ ] `backend/src/middleware/authz.middleware.ts` (enhanced audit)
- [ ] `backend/src/utils/logger.ts` (ACP-240 events)
- [ ] `policies/fuel_inventory_abac_policy.rego` (ZTDF integrity, KAS obligations)
- [ ] `frontend/src/app/resources/[id]/page.tsx` (STANAG labels)
- [ ] `docker-compose.yml` (KAS service)
- [ ] `.github/workflows/ci.yml` (ACP-240 validation)
- [ ] `README.md` (Week 3.1 status)
- [ ] `CHANGELOG.md` (Week 3.1 entry)

### Test Deliverables:

**OPA Tests:**
- [ ] 78 existing tests still passing
- [ ] 10+ new ACP-240 tests added
- [ ] Total: 88+ tests, 100% passing

**Integration Tests:**
- [ ] 33 existing tests still passing
- [ ] 7+ new ACP-240 tests added
- [ ] Total: 40+ tests, 100% passing

**Manual Tests:**
- [ ] ZTDF resource access tested
- [ ] Encrypted resource + KAS obligation tested
- [ ] STANAG labels displayed correctly
- [ ] Audit logs contain all required events

### Documentation Deliverables:

- [ ] ACP-240 compliance report
- [ ] ZTDF implementation guide
- [ ] KAS integration guide
- [ ] STANAG 4774 label reference
- [ ] Enhanced audit logging specification
- [ ] Week 3.1 status document

---

## CI/CD REQUIREMENTS

**GitHub Actions must pass ALL jobs:**

1. **OPA Policy Tests:** 88+ tests passing
2. **Backend API Tests:** TypeScript + Integration tests
3. **Frontend Tests:** TypeScript + Build
4. **Integration Tests:** API health + MongoDB + KAS health
5. **ACP-240 Compliance:** ZTDF + KAS + STANAG + Audit validation

**Before Commit:**
```bash
# Local verification
./scripts/preflight-check.sh

# OPA tests
docker-compose exec opa opa test /policies/ -v
# Expected: PASS: 88+/88+

# Integration tests
cd backend && npm test
# Expected: 40+ passing

# TypeScript
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
# Expected: 0 errors

# KAS health
curl http://localhost:8080/health
# Expected: 200 OK
```

**After Commit:**
- Monitor GitHub Actions: https://github.com/albeach/DIVE-V3/actions
- All jobs must be green before claiming Week 3.1 complete

---

## INTEGRATION WITH EXISTING WORK

### Preserves Week 1-3 Functionality:

**DO NOT BREAK:**
- ✅ Multi-IdP federation (France SAML, Canada OIDC, Industry OIDC)
- ✅ Claim enrichment (email domain → country)
- ✅ Complete logout (three-layer cleanup)
- ✅ All 78 OPA tests (must still pass)
- ✅ GitHub CI/CD pipeline

**ENHANCES:**
- ✅ Resources: Plain objects → ZTDF structure
- ✅ Access control: Authorization only → Data-Centric Security
- ✅ Encryption: None → Policy-bound with KAS
- ✅ Labels: Implicit → STANAG 4774 explicit
- ✅ Audit: Basic → ACP-240 comprehensive

### Aligns with Week 4 Goals:

**Week 4 Original Plan:**
- KAS integration (stretch goal)
- End-to-end demos
- Performance testing
- Pilot report

**Week 3.1 Advances:**
- ✅ KAS implementation (from Week 4 stretch to Week 3.1 core)
- ✅ ZTDF/STANAG compliance (enhances demo value)
- ✅ Enhanced audit (supports pilot report metrics)

**Week 4 Can Focus On:**
- Client-side KAS integration (decrypt in browser)
- Cross-IdP E2E demos (GEOAxIS + France + Canada)
- Performance benchmarking
- Pilot report with ACP-240 compliance

---

## PRODUCTION READINESS CONSIDERATIONS

### For ACP-240 Full Compliance:

**Current Week 3.1 Scope (Pilot):**
- ✅ ZTDF structure (JSON-based)
- ✅ KAS stub (in-memory keys)
- ✅ STANAG labels (compliant format)
- ✅ Enhanced audit (required events)
- ✅ Policy-bound encryption (demo)

**Production Enhancements Needed:**
- HSM integration for KEK/DEK custody
- X.509 digital signatures (STANAG 4778 full compliance)
- SIEM integration for audit logs
- Key rotation and lifecycle management
- Multi-KAS support (coalition key management)
- Encrypted payload optimization (chunking)

**Week 3.1 Provides:**
- ✅ Proof of concept for all ACP-240 core requirements
- ✅ Clear production roadmap
- ✅ Working implementation of critical features
- ✅ Compliance documentation

---

## EXAMPLE USE CASES (ACP-240 Enhanced)

### Use Case 1: Unclassified Coalition Planning Document

**Resource:** doc-unclass-planning

**ZTDF Structure:**
```json
{
  "resourceId": "doc-unclass-planning",
  "manifest": {
    "version": "1.0.0",
    "type": "document",
    "createdAt": "2025-10-12T10:00:00Z",
    "originOrganization": "DIVE-V3-PILOT",
    "originCountry": "USA"
  },
  "policy": {
    "classification": {"level": "UNCLASSIFIED", "system": "US"},
    "releasability": {"releasableTo": ["USA", "GBR", "FRA", "CAN", "DEU"], "displayOnly": false},
    "communityOfInterest": {"requiredCOI": ["NATO"]},
    "handlingInstructions": {
      "disseminationControls": ["RELIDO"],
      "displayMarkings": "UNCLASSIFIED//NATO"
    },
    "accessPolicy": {"engine": "OPA", "policyId": "dive.authorization", "minimumClearance": "UNCLASSIFIED", "requiresKAS": false},
    "integrity": {"algorithm": "SHA-384", "digest": "abc123..."}
  },
  "payload": {
    "encrypted": false,
    "content": "Coalition planning document content...",
    "contentHash": "def456..."
  }
}
```

**Access Test:**
- French user (UNCLASSIFIED, FRA, NATO): ✅ ALLOW
- Canadian user (CONFIDENTIAL, CAN, NATO): ✅ ALLOW
- Industry user (UNCLASSIFIED, USA, []): ❌ DENY (no NATO COI)

**Audit Log:**
```json
{
  "eventType": "ACCESS_GRANTED",
  "subjectId": "user@defense.gouv.fr",
  "subjectCountry": "FRA",
  "resourceId": "doc-unclass-planning",
  "classification": "UNCLASSIFIED",
  "stanagLabel": "UNCLASSIFIED//NATO",
  "outcome": "GRANTED"
}
```

### Use Case 2: SECRET Encrypted Intelligence Report

**Resource:** doc-fvey-intel-encrypted

**ZTDF Structure:**
```json
{
  "resourceId": "doc-fvey-intel-encrypted",
  "policy": {
    "classification": {"level": "SECRET", "system": "US"},
    "releasability": {"releasableTo": ["USA", "GBR", "CAN", "AUS", "NZL"]},
    "communityOfInterest": {"requiredCOI": ["FVEY"]},
    "handlingInstructions": {
      "disseminationControls": ["NOFORN", "RELIDO", "COI:FVEY"],
      "displayMarkings": "SECRET//NOFORN//FVEY"
    },
    "accessPolicy": {"requiresKAS": true},
    "integrity": {"digest": "xyz789..."}
  },
  "payload": {
    "encrypted": true,
    "encryptionInfo": {
      "algorithm": "AES-256-GCM",
      "keyAccessObjects": [{
        "kasUrl": "http://localhost:8080/request-key",
        "kasId": "dive-v3-kas-001",
        "wrappedKey": "encrypted-dek-base64",
        "policyBinding": "xyz789...",
        "intendedCOI": "FVEY"
      }]
    },
    "content": "encrypted-base64-content",
    "contentHash": "original-hash"
  }
}
```

**Access Test:**
- U.S. user (SECRET, USA, FVEY): ✅ ALLOW → KAS obligation returned
- U.K. user (SECRET, GBR, FVEY): ✅ ALLOW → KAS obligation returned
- French user (SECRET, FRA, NATO-COSMIC): ❌ DENY (not in FVEY)
- Canadian user (CONFIDENTIAL, CAN, FVEY): ❌ DENY (clearance insufficient)

**KAS Test:**
- U.S. SECRET user requests key from KAS
- KAS re-evaluates policy
- KAS allows (clearance + country + COI all match)
- KAS returns DEK
- Audit logs: DECRYPT event, KAS_KEY_RELEASED event

---

## CRITICAL FILES TO UNDERSTAND

### Before Starting Week 3.1:

**Read These Files:**
1. `ACP240-llms.txt` - NATO requirements (THIS IS YOUR SPECIFICATION)
2. `docs/PRODUCTION-READY-FEDERATION.md` - Current architecture
3. `policies/fuel_inventory_abac_policy.rego` - Current OPA policy
4. `backend/src/middleware/authz.middleware.ts` - Current PEP
5. `WEEK3-DELIVERY-COMPLETE.md` - Week 3 achievements

**Reference During Implementation:**
1. `docs/ADDING-NEW-IDP-GUIDE.md` - Pattern for adding features
2. `.cursorrules` - DIVE V3 conventions
3. `dive-v3-security.md` - Security requirements
4. `backend/src/scripts/seed-resources.ts` - Current resource examples

---

## FINAL WEEK 3.1 PROMPT (For New Chat)

```
You are continuing the DIVE V3 Coalition ICAM Pilot implementation.

CONTEXT:
- Weeks 1-3 COMPLETE: Multi-IdP federation (SAML + OIDC), ABAC with OPA, 111 automated tests passing
- Repository: https://github.com/albeach/DIVE-V3 (branch: main, commit: b31e51e)
- All services running, CI/CD passing (4/4 jobs green)
- Current: 4 IdPs operational (U.S. mock, France SAML, Canada OIDC, Industry OIDC)

WEEK 3.1 OBJECTIVE:
Enhance DIVE V3 with NATO ACP-240 Data-Centric Security requirements:
1. Implement ZTDF (Zero Trust Data Format) for all resources
2. Integrate KAS (Key Access Service) for policy-bound encryption
3. Add STANAG 4774 security labels and display markings
4. Implement enhanced audit logging (Encrypt/Decrypt/Denied events)
5. Update OPA policies for ZTDF integrity and KAS obligations

CRITICAL REQUIREMENTS (from ACP240-llms.txt):
- Data-Centric Security: Protect data objects themselves, not just perimeters
- ZTDF Structure: Manifest + Policy + Payload sections
- STANAG 4774 Labels: Classification, releasability, caveats, handling instructions
- STANAG 4778 Binding: Cryptographic integrity (SHA-384 hashes)
- KAS: Policy-bound encryption with key mediation
- Audit Logging: ENCRYPT, DECRYPT, ACCESS_DENIED, ACCESS_MODIFIED, DATA_SHARED events
- Fail-Closed: Deny on integrity failure or policy unavailable

PHASED IMPLEMENTATION (3-4 days):

DAY 1: ZTDF Structure Implementation
- Define ZTDF TypeScript interfaces (manifest, policy, payload)
- Create migration script for existing 8 resources
- Add ZTDF integrity validation (SHA-384 hashes)
- Update resource service to handle ZTDF
- Test: Resources in ZTDF format, integrity validation working

DAY 2: KAS (Key Access Service) Implementation
- Enhance kas/src/server.ts with policy re-evaluation
- Implement key wrap/unwrap (KEK/DEK management)
- Add KAS audit logging (all key requests)
- Create encrypted resource examples with KAOs
- Update PEP to detect and pass KAS obligations
- Test: KAS service operational, encrypted resources require key release

DAY 3: STANAG 4774 Labels & Enhanced Audit Logging
- Implement STANAG 4774 label generation
- Generate display markings (classification//caveats//coi)
- Add classification equivalency mapping (US ↔ NATO)
- Implement ACP-240 audit event types (ENCRYPT, DECRYPT, etc.)
- Integrate enhanced logging into PEP and KAS
- Update frontend to display STANAG labels prominently
- Test: Labels displayed, audit logs comprehensive

DAY 4: OPA Policy Updates & Complete Testing
- Add is_ztdf_integrity_violation rule to OPA policy
- Add KAS obligation generation to OPA decision
- Create acp240_compliance_test_suite.rego (10+ tests)
- Run full test suite (target: 88+ OPA tests, 40+ integration tests)
- Update CI/CD for ACP-240 validation
- Commit to GitHub, verify CI/CD passes
- Document ACP-240 compliance status

TESTING REQUIREMENTS:
- All 78 existing OPA tests must still pass (no regression)
- Add 10+ new ACP-240 compliance tests
- Add 7+ integration tests for ZTDF/KAS
- TypeScript: 0 errors
- Manual: Test ZTDF resources, encrypted access, KAS flow, STANAG labels
- GitHub CI/CD: All jobs must pass

SUCCESS CRITERIA:
✅ All resources in ZTDF format with integrity hashes
✅ KAS service operational with policy enforcement
✅ STANAG 4774 labels on all resources
✅ Enhanced audit logging (5 event types)
✅ OPA: 88+ tests passing (78 + 10 ACP-240)
✅ Integration: 40+ tests passing (33 + 7 ACP-240)
✅ GitHub CI/CD: All jobs green
✅ ACP-240 compliance documented

REFERENCE MATERIALS:
- ACP240-llms.txt (NATO ACP-240 specification - READ THIS FIRST)
- docs/PRODUCTION-READY-FEDERATION.md (current architecture)
- policies/fuel_inventory_abac_policy.rego (current OPA policy - extend this)
- backend/src/middleware/authz.middleware.ts (current PEP - enhance this)
- WEEK3-DELIVERY-COMPLETE.md (Week 3 context)

CRITICAL NOTES:
- Follow NATO ACP-240 requirements exactly (no deviations)
- Implement ZTDF as specified (three sections: manifest, policy, payload)
- KAS must re-evaluate OPA policy (defense in depth)
- All audit events must include mandatory fields
- STANAG 4774 display markings must be prominent
- Fail-closed enforcement (deny on integrity failure)
- Use existing patterns (IdP mappers, OPA tests, TypeScript interfaces)
- Do NOT break existing functionality (78 tests must still pass)
- Run full QA before committing
- Verify CI/CD passes before claiming complete

START BY:
1. Reading ACP240-llms.txt thoroughly (understand requirements)
2. Defining ZTDF TypeScript interfaces
3. Creating migration script for existing resources
4. Testing migration with 1-2 resources before all 8
5. Implementing ZTDF integrity validation
6. Following phased plan day by day

DELIVERABLE:
Week 3.1 complete with NATO ACP-240 Data-Centric Security compliance,
all tests passing, CI/CD green, ready for Week 4 demos and pilot report.
```

---

**This prompt is ready for a new chat session. It includes:**
- ✅ Complete context from Week 1-3
- ✅ Detailed ACP-240 requirements (from ACP240-llms.txt)
- ✅ Phased implementation plan (4 days)
- ✅ Clear success criteria
- ✅ Testing requirements
- ✅ CI/CD integration
- ✅ Reference to all relevant documentation

**Ready to start Week 3.1!** 🚀

