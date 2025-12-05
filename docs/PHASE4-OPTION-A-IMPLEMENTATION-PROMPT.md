# 🚀 PHASE 4: OPTION A FULL INTEGRATION - IMPLEMENTATION PROMPT

**Document:** Phase 4 Option A - New Session Handoff  
**Date:** 2025-11-28  
**Session Type:** Implementation (5-6 weeks)  
**Priority:** ⭐⭐⭐⭐⭐ **CRITICAL - PRODUCTION DEPLOYMENT**

---

## 📋 **MISSION STATEMENT**

Implement **Option A: Full Integration** for DIVE V3 Phase 4 - Complete multi-instance federation with automated partner onboarding, cross-instance encrypted resource access, federated search, and policy version management.

**Duration:** 5-6 weeks (220 hours)  
**Approach:** Best practices, test-driven, incremental deployment  
**Reference:** `docs/PHASE4-FULL-ARCHITECTURE-AUDIT.md` (2,245 lines - comprehensive architecture analysis)

---

## 🎯 **WHAT YOU'RE IMPLEMENTING**

### **Core Objective**

Enhance DIVE V3's multi-instance federation to support:
1. **Automated Partner Onboarding** (<5 minutes to add new nation)
2. **Cross-Instance Encrypted Access** (FRA user → USA KAS → USA resource)
3. **Federated Resource Discovery** (search across all instances)
4. **Policy Version Management** (prevent policy drift)
5. **Complete Resource Origin Tracking** (100% `originRealm` coverage)
6. **Federation Agreement Enforcement** (SP access controls)

### **Expected Outcomes**

- ✅ **95% time reduction**: Partner onboarding 8-16 hours → <30 minutes
- ✅ **100% federation coverage**: All instances interconnected
- ✅ **Zero policy drift**: All instances on same policy version
- ✅ **Seamless cross-instance access**: FRA user accesses USA encrypted resources
- ✅ **Unified search**: Single query across USA, FRA, GBR, DEU
- ✅ **Self-service SP registration**: External orgs can register OAuth clients

---

## 📊 **CURRENT STATE (From Audit)**

### ✅ **What's Working** (Production-Ready)

1. **IdP Federation**: USA ↔ FRA ↔ GBR ↔ DEU bidirectional OIDC trust
   - Script: `scripts/add-federation-partner.sh` (417 lines)
   - Terraform: `terraform/modules/federated-instance/idp-brokers.tf`
   - Registry: `config/federation-registry.json` (442 lines)

2. **SP Registry**: OAuth client provisioning for external organizations
   - Backend: `backend/src/services/sp-management.service.ts` (588 lines)
   - Frontend: `frontend/src/app/admin/sp-registry/new/page.tsx` (490 lines)
   - Middleware: `backend/src/middleware/federation-agreement.middleware.ts` (150 lines)

3. **KAS Policy Re-Evaluation**: Independent OPA checks before key release
   - Service: `kas/src/server.ts` (607 lines)
   - Re-evaluation: Lines 236-352 (defense in depth)
   - Audit logging: ACP-240 compliant

4. **Resource Metadata Sync**: FRA ↔ USA synchronization working
   - Service: `backend/src/services/fra-federation.service.ts` (420 lines)
   - Interval: 5 minutes
   - Version-based conflict detection

5. **Global OPA Policies**: NATO compliance enforced universally
   - Policy: `policies/fuel_inventory_abac_policy.rego` (933 lines, 41+ tests)
   - Pattern: Fail-secure (`is_not_a_*` violations)
   - Modules: Authorization, Federation, Object, Admin

6. **Centralized Token Blacklist**: Cross-instance revocation
   - Service: `backend/src/services/token-blacklist.service.ts`
   - Architecture: Shared Redis + Pub/Sub
   - Logout revokes access to ALL instances

### ⚠️ **Critical Gaps (What You Need to Fix)**

| **Gap** | **Severity** | **Current State** | **Blocks** |
|---|---|---|---|
| **Gap 1:** Cross-Instance Resource Discovery | High | No unified search | User experience (can't find remote resources) |
| **Gap 2:** KAS Federation Implementation | **Critical** | Code exists, not deployed | Cross-instance encrypted access |
| **Gap 3:** Policy Version Tracking | Medium | Manual deployment | Compliance (risk of policy drift) |
| **Gap 4:** Resource Origin Tracking | Medium | Incomplete `originRealm` | KAS authority determination |
| **Gap 5:** Federation Agreement Enforcement | Medium | Middleware not integrated | SP access control enforcement |

---

## 🏗️ **ARCHITECTURE CONTEXT (From Audit)**

### **Key Architectural Patterns**

#### **Pattern 1: IdP Federation** (Cross-Instance Identity)
```
FRA User → FRA Keycloak (authenticate) → USA Keycloak (OIDC trust) → USA App
```
- **Purpose**: Foreign nation users authenticate via their own IdP
- **Protocol**: OIDC (bidirectional trust)
- **Status**: ✅ Working (USA ↔ FRA ↔ GBR ↔ DEU)

#### **Pattern 2: SP Registry** (OAuth Client Provisioning)
```
Lockheed Martin → SP Registration → OAuth Client Created → Access USA Resources
```
- **Purpose**: External organizations (contractors) access resources
- **Protocol**: OAuth 2.0 Client Credentials
- **Status**: ✅ Working (approval workflow complete)

#### **Pattern 3: Cross-Instance KAS** ⚠️ (NOT DEPLOYED)
```
FRA User → USA Resource (encrypted) → USA KAS (re-evaluate policy) → DEK Release
```
- **Purpose**: Access encrypted resources from other instances
- **Code**: `kas/src/utils/kas-federation.ts` (CrossKASClient class)
- **Status**: ⚠️ Code exists, not integrated

#### **Pattern 4: Resource Metadata Sync** (Opt-In)
```
USA Resources → Federation API → FRA MongoDB (import metadata) → 5min interval
```
- **Purpose**: Discover remote resources without syncing content
- **Status**: ✅ Working (USA ↔ FRA)

### **MongoDB Resource Architecture**

**Per-Instance Ownership:**
- Each nation owns its MongoDB resources
- `originRealm`: WHO owns the resource (USA, FRA, GBR, DEU)
- `kasAuthority`: WHICH KAS holds the keys (usa-kas, fra-kas, etc.)
- `importedFrom`: If resource synced from another instance

**Resource Types:**
1. **Local-Only**: `releasabilityTo: ["USA"]` → USA MongoDB only
2. **Bilaterally Shared**: `releasabilityTo: ["USA", "FRA"]` → USA & FRA MongoDB
3. **Multilateral**: `releasabilityTo: ["NATO"]` → All NATO instances

### **OPA Policy Hierarchy**

**Layer 1: Global Guardrails** (CANNOT BE OVERRIDDEN)
- File: `policies/fuel_inventory_abac_policy.rego`
- Package: `dive.authorization`
- Rules: Authentication, clearance, releasability, COI, MFA, ZTDF integrity
- Applied to: **ALL INSTANCES** (USA, FRA, GBR, DEU)

**Layer 2: Specialized Modules**
- `federation_abac_policy.rego` - AAL enforcement, token lifetime
- `object_abac_policy.rego` - ZTDF integrity, KAS obligations
- `admin_authorization_policy.rego` - Super admin operations

**Layer 3: Instance-Specific** (OPTIONAL)
- `fra-authorization-policy.rego` (if exists)
- Can add restrictions, **cannot bypass** global guardrails
- Example: EU export control, French clearance mapping

---

## 🎯 **IMPLEMENTATION ROADMAP (Option A)**

### **Week 1-2: Core Integration** (80 hours)

#### **Task 1.1: IdP Wizard Federation Quick-Add** (8 hours)
**Goal**: Add "DIVE V3 Federation Partner" option to IdP wizard

**Files to Edit:**
- `frontend/src/app/admin/idp/new/page.tsx` (Line 420 - Step 1)
- `backend/src/controllers/admin.controller.ts` (Line 210 - createIdPHandler)

**Implementation:**
1. Add 3rd protocol option: "DIVE V3 Federation Partner"
2. Show partner selector (load from `config/federation-registry.json`)
3. Auto-populate OIDC config from registry
4. Skip to Review step (no manual config)
5. Backend: Detect `isFederationPartner: true` flag
6. Call `scripts/add-federation-partner.sh` or Terraform apply
7. Return success immediately

**Reference:** Audit Section 1.1, Integration Assessment Quick-Win MVP

---

#### **Task 1.2: SP Self-Service Portal** (12 hours)
**Goal**: Expose SP registration as public API with OAuth pre-auth

**Files to Create:**
- `frontend/src/app/register/sp/page.tsx` (new)
- `backend/src/controllers/public.controller.ts` (new - publicRegisterSP)

**Implementation:**
1. Create public page: `/register/sp`
2. OAuth pre-authentication (partner must have federated IdP)
3. Auto-populate country/org from token claims
4. Reuse existing `spManagementService.registerSP()`
5. Email confirmation workflow
6. Status tracking page

**Reference:** Audit Section 1.2, Integration Assessment Priority 2

---

#### **Task 1.3: Deploy KAS Registry** ⭐ (4 hours)
**Goal**: Create KAS registry configuration

**Files to Create:**
- `config/kas-registry.json` (new)

**Implementation:**
```json
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
    },
    {
      "kasId": "gbr-kas",
      "organization": "United Kingdom",
      "kasUrl": "https://gbr-kas.dive25.com",
      "authMethod": "jwt",
      "trustLevel": "high",
      "supportedCountries": ["GBR"],
      "supportedCOIs": ["GBR-US", "FVEY", "NATO"]
    }
  ]
}
```

**Reference:** Audit Section 2.3, Gap 2 Solution

---

#### **Task 1.4: Integrate CrossKASClient** ⭐⭐⭐ (16 hours)
**Goal**: Enable cross-instance encrypted resource access

**Files to Edit:**
- `backend/src/controllers/resource.controller.ts` (getResourceByIdHandler)
- `kas/src/utils/kas-federation.ts` (CrossKASClient - already exists)

**Implementation:**
```typescript
// backend/src/controllers/resource.controller.ts
export async function getResourceByIdHandler(req, res) {
  const resource = await resourceService.getResource(resourceId);

  // NEW: Check if cross-instance encrypted resource
  const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';
  
  if (resource.encrypted && resource.originRealm !== INSTANCE_REALM) {
    logger.info('Cross-instance encrypted resource detected', {
      resourceId: resource.resourceId,
      originRealm: resource.originRealm,
      currentRealm: INSTANCE_REALM,
      kasAuthority: resource.kasAuthority
    });

    // Import CrossKASClient
    const { CrossKASClient } = require('../../kas/src/utils/kas-federation');
    const kasClient = new CrossKASClient();

    // Load KAS registry
    const kasRegistry = JSON.parse(
      fs.readFileSync('config/kas-registry.json', 'utf-8')
    );

    // Find KAS authority
    const kasAuthority = resource.kasAuthority || 
      `${resource.originRealm.toLowerCase()}-kas`;

    // Request key from origin KAS
    try {
      const keyResponse = await kasClient.requestKey(kasAuthority, {
        resourceId: resource.resourceId,
        kaoId: resource.kaoId || 'kao-default',
        wrappedKey: resource.wrappedKey || '',
        subject: {
          uniqueID: req.user.uniqueID,
          clearance: req.user.clearance,
          countryOfAffiliation: req.user.countryOfAffiliation,
          acpCOI: req.user.acpCOI || []
        },
        requestId: req.headers['x-request-id'] as string
      });

      if (!keyResponse.success) {
        logger.warn('Cross-KAS key request denied', {
          resourceId: resource.resourceId,
          kasAuthority,
          denialReason: keyResponse.denialReason
        });

        return res.status(403).json({
          error: 'Forbidden',
          message: keyResponse.denialReason,
          kasAuthority,
          kasOrganization: keyResponse.organization
        });
      }

      // Add DEK to resource
      resource.dek = keyResponse.dek;

      logger.info('Cross-KAS key released successfully', {
        resourceId: resource.resourceId,
        kasAuthority,
        userCountry: req.user.countryOfAffiliation
      });

    } catch (error) {
      logger.error('Cross-KAS request failed', {
        resourceId: resource.resourceId,
        kasAuthority,
        error: error.message
      });

      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Key Access Service unavailable',
        kasAuthority
      });
    }
  }

  res.json(resource);
}
```

**Testing:**
1. FRA user logs into USA
2. Requests USA encrypted resource (doc-usa-secret-123)
3. Backend detects `originRealm=USA`, calls USA KAS
4. USA KAS re-evaluates policy (FRA in releasabilityTo?)
5. USA KAS releases DEK
6. FRA user can decrypt content

**Reference:** Audit Section 2.3, Gap 2 Critical

---

#### **Task 1.5: Resource Origin Tracking Migration** (8 hours)
**Goal**: Add `originRealm` to all existing resources

**Files to Create:**
- `backend/src/scripts/add-origin-realm-migration.ts` (new)

**Implementation:**
```typescript
import { getMongoClient, getMongoDBName } from '../utils/mongodb-config';
import { logger } from '../utils/logger';

async function addOriginRealmMigration() {
  const client = await getMongoClient();
  const dbName = getMongoDBName();
  const db = client.db(dbName);
  const collection = db.collection('resources');

  const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

  logger.info('Starting origin realm migration', { 
    instance: INSTANCE_REALM,
    database: dbName 
  });

  // Find all resources without originRealm
  const resourcesWithoutOrigin = await collection.find({
    originRealm: { $exists: false }
  }).toArray();

  logger.info(`Found ${resourcesWithoutOrigin.length} resources without originRealm`);

  let updated = 0;
  let errors = 0;

  for (const resource of resourcesWithoutOrigin) {
    try {
      // Infer originRealm from resourceId prefix
      let originRealm = INSTANCE_REALM;

      if (resource.resourceId) {
        // Pattern: "doc-usa-001" → "USA"
        const parts = resource.resourceId.split('-');
        if (parts.length >= 2) {
          const prefix = parts[1].toUpperCase();
          if (['USA', 'FRA', 'GBR', 'DEU', 'CAN'].includes(prefix)) {
            originRealm = prefix;
          }
        }
      }

      // Infer kasAuthority
      const kasAuthority = `${originRealm.toLowerCase()}-kas`;

      // Update resource
      await collection.updateOne(
        { _id: resource._id },
        { 
          $set: { 
            originRealm,
            kasAuthority,
            updatedAt: new Date()
          } 
        }
      );

      updated++;
      logger.debug('Updated resource', {
        resourceId: resource.resourceId,
        originRealm,
        kasAuthority
      });

    } catch (error) {
      errors++;
      logger.error('Failed to update resource', {
        resourceId: resource.resourceId,
        error: error.message
      });
    }
  }

  logger.info('Origin realm migration complete', {
    total: resourcesWithoutOrigin.length,
    updated,
    errors
  });

  // Create index on originRealm for performance
  await collection.createIndex({ originRealm: 1 });
  logger.info('Created index on originRealm');
}

// Run migration
addOriginRealmMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  });
```

**Run:**
```bash
cd backend
INSTANCE_REALM=USA ts-node src/scripts/add-origin-realm-migration.ts
INSTANCE_REALM=FRA ts-node src/scripts/add-origin-realm-migration.ts
INSTANCE_REALM=GBR ts-node src/scripts/add-origin-realm-migration.ts
```

**Reference:** Audit Section 3.4, Gap 4

---

#### **Task 1.6: Integration Testing** (16 hours)
**Test Scenarios:**
1. ✅ FRA user accesses USA encrypted resource (cross-KAS)
2. ✅ USA user accesses FRA encrypted resource (cross-KAS)
3. ✅ GBR user accesses USA resource (cross-KAS)
4. ✅ KAS denies if user not in releasabilityTo
5. ✅ KAS denies if OPA unavailable (fail-closed)
6. ✅ 100% resources have originRealm
7. ✅ SuperAdmin onboards new partner (<5 minutes)

---

### **Week 3-4: Policy & Monitoring** (80 hours)

#### **Task 3.1: OPA Policy Bundle Versioning** (16 hours)
**Goal**: Implement policy versioning to prevent drift

**Files to Create:**
- `policies/policy_version.rego` (new)
- `backend/src/services/policy-version-monitor.ts` (new)

**Implementation:**

1. **Policy Version Metadata**
```rego
// policies/policy_version.rego
package dive

policy_version := {
  "version": "2.1.0",
  "bundleId": "dive-v3-global-policies",
  "timestamp": "2025-11-28T00:00:00Z",
  "git_commit": "abc123def456",
  "modules": [
    "dive.authorization",
    "dive.federation",
    "dive.object",
    "dive.admin_authorization"
  ],
  "compliance": [
    "ACP-240",
    "ADatP-5663",
    "STANAG 4774",
    "STANAG 4778"
  ]
}
```

2. **Health Check Endpoint**
```typescript
// backend/src/controllers/health.controller.ts
export async function getPolicyVersion(req, res) {
  const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
  const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

  try {
    const opaResponse = await axios.get(
      `${OPA_URL}/v1/data/dive/policy_version`
    );

    res.json({
      instance: INSTANCE_REALM,
      policyVersion: opaResponse.data.result,
      opaUrl: OPA_URL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'OPA policy version unavailable',
      instance: INSTANCE_REALM
    });
  }
}
```

3. **Policy Drift Monitor**
```typescript
// backend/src/services/policy-version-monitor.ts
export class PolicyVersionMonitor {
  private instances = [
    { code: 'USA', url: 'https://usa-api.dive25.com' },
    { code: 'FRA', url: 'https://fra-api.dive25.com' },
    { code: 'GBR', url: 'https://gbr-api.dive25.com' },
    { code: 'DEU', url: 'https://deu-api.prosecurity.biz' }
  ];

  async checkPolicyConsistency(): Promise<PolicyVersionReport> {
    const versions: Record<string, string> = {};
    const errors: string[] = [];

    for (const instance of this.instances) {
      try {
        const response = await axios.get(
          `${instance.url}/api/health/policy-version`,
          { timeout: 5000 }
        );
        versions[instance.code] = response.data.policyVersion.version;
      } catch (error) {
        errors.push(`${instance.code}: ${error.message}`);
      }
    }

    const uniqueVersions = new Set(Object.values(versions));

    if (uniqueVersions.size > 1) {
      logger.warn('⚠️  POLICY DRIFT DETECTED', { versions });
      
      // Send alert (Slack, email, etc.)
      await this.sendDriftAlert(versions);

      return {
        consistent: false,
        versions,
        errors,
        recommendation: 'Update all instances to latest policy bundle',
        expectedVersion: this.getLatestVersion(versions),
        driftDetectedAt: new Date().toISOString()
      };
    }

    logger.info('✅ Policy versions consistent', { version: Array.from(uniqueVersions)[0] });

    return {
      consistent: true,
      versions,
      errors
    };
  }

  private getLatestVersion(versions: Record<string, string>): string {
    // Semantic version comparison
    return Object.values(versions).sort((a, b) => 
      a.localeCompare(b, undefined, { numeric: true })
    ).reverse()[0];
  }

  private async sendDriftAlert(versions: Record<string, string>): Promise<void> {
    // TODO: Integrate with alerting system (Slack, PagerDuty, etc.)
    logger.error('Policy drift alert sent', { versions });
  }
}

// Scheduled check (every 5 minutes)
setInterval(async () => {
  const monitor = new PolicyVersionMonitor();
  await monitor.checkPolicyConsistency();
}, 5 * 60 * 1000);
```

**Reference:** Audit Section 4.4, Gap 3

---

#### **Task 3.2: Federated Resource Discovery** (24 hours)
**Goal**: Unified search across all instances

**Files to Create:**
- `backend/src/controllers/federated-search.controller.ts` (new)

**Implementation:**
```typescript
export async function federatedSearch(req, res) {
  const { query, classification, country, coi } = req.query;
  const user = req.user;

  logger.info('Federated search initiated', {
    query,
    user: user.uniqueID,
    country: user.countryOfAffiliation
  });

  // Instances to query
  const instances = [
    { code: 'USA', url: 'https://usa-api.dive25.com', local: true },
    { code: 'FRA', url: 'https://fra-api.dive25.com', local: false },
    { code: 'GBR', url: 'https://gbr-api.dive25.com', local: false },
    { code: 'DEU', url: 'https://deu-api.prosecurity.biz', local: false }
  ];

  const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

  // Parallel queries
  const searchPromises = instances.map(async (instance) => {
    try {
      if (instance.local && instance.code === INSTANCE_REALM) {
        // Local search (MongoDB)
        return await resourceService.searchResources({
          query,
          classification,
          releasabilityTo: country || user.countryOfAffiliation,
          COI: coi
        });
      } else {
        // Remote search (Federation API)
        const response = await axios.get(
          `${instance.url}/federation/resources/search`,
          {
            headers: {
              'Authorization': req.headers.authorization,
              'X-Origin-Realm': INSTANCE_REALM
            },
            params: {
              query,
              classification,
              releasableTo: user.countryOfAffiliation,
              coi
            },
            timeout: 3000 // 3 second timeout
          }
        );

        return response.data.resources.map(r => ({
          ...r,
          originRealm: instance.code,
          _federated: true
        }));
      }
    } catch (error) {
      logger.warn('Instance search failed', {
        instance: instance.code,
        error: error.message
      });
      return []; // Graceful degradation
    }
  });

  // Wait for all searches
  const results = await Promise.all(searchPromises);

  // Aggregate results
  let allResources = results.flat();

  // Deduplicate (same resourceId from multiple instances)
  const seen = new Set();
  allResources = allResources.filter(r => {
    if (seen.has(r.resourceId)) return false;
    seen.add(r.resourceId);
    return true;
  });

  // Authorization filter (client-side)
  allResources = allResources.filter(r => {
    // Check releasability
    if (!r.releasabilityTo.includes(user.countryOfAffiliation)) {
      return false;
    }

    // Check clearance
    const requiredLevel = clearanceLevel(r.classification);
    const userLevel = clearanceLevel(user.clearance);
    if (userLevel < requiredLevel) {
      return false;
    }

    // Check COI (if resource has COI requirement)
    if (r.COI && r.COI.length > 0) {
      const userCOIs = user.acpCOI || [];
      const hasCOI = r.COI.some(coi => userCOIs.includes(coi));
      if (!hasCOI) {
        return false;
      }
    }

    return true;
  });

  // Rank by relevance (simple: title/description match)
  if (query) {
    allResources = allResources.sort((a, b) => {
      const aScore = calculateRelevance(a, query);
      const bScore = calculateRelevance(b, query);
      return bScore - aScore;
    });
  }

  logger.info('Federated search complete', {
    totalResults: allResources.length,
    instances: results.map((r, i) => ({
      code: instances[i].code,
      count: r.length
    }))
  });

  res.json({
    query,
    totalResults: allResources.length,
    results: allResources.slice(0, 100), // Limit to 100
    federatedFrom: instances.map(i => i.code),
    executionTimeMs: Date.now() - startTime
  });
}

function calculateRelevance(resource: any, query: string): number {
  const q = query.toLowerCase();
  let score = 0;

  if (resource.title && resource.title.toLowerCase().includes(q)) {
    score += 10;
  }

  if (resource.description && resource.description.toLowerCase().includes(q)) {
    score += 5;
  }

  return score;
}

function clearanceLevel(clearance: string): number {
  const levels = {
    'UNCLASSIFIED': 0,
    'RESTRICTED': 0,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
  };
  return levels[clearance] || 0;
}
```

**Frontend Integration:**
```typescript
// frontend/src/app/resources/page.tsx
const [searchScope, setSearchScope] = useState<'local' | 'federated'>('local');

async function handleSearch() {
  const endpoint = searchScope === 'federated' 
    ? '/api/resources/federated-search'
    : '/api/resources/search';

  const response = await fetch(`${BACKEND_URL}${endpoint}?query=${query}`);
  const data = await response.json();

  setResources(data.results);
}

// UI: Toggle switch
<div className="flex gap-2">
  <button 
    onClick={() => setSearchScope('local')}
    className={searchScope === 'local' ? 'active' : ''}
  >
    🏠 Local Resources
  </button>
  <button 
    onClick={() => setSearchScope('federated')}
    className={searchScope === 'federated' ? 'active' : ''}
  >
    🌐 Federated Search (All Instances)
  </button>
</div>
```

**Reference:** Audit Section 6, Gap 1

---

#### **Task 3.3: Federation Agreement Middleware Integration** (8 hours)
**Goal**: Enforce SP access controls

**Files to Edit:**
- `backend/src/routes/resource.routes.ts`

**Implementation:**
```typescript
// backend/src/routes/resource.routes.ts
import { enforceFederationAgreement } from '../middleware/federation-agreement.middleware';

// Apply middleware to SP resource access
router.get('/resources/:id',
  authenticate,
  enrichUserAttributes,
  enforceFederationAgreement, // ← ADD THIS
  getResourceByIdHandler
);

router.get('/resources',
  authenticate,
  enrichUserAttributes,
  enforceFederationAgreement, // ← ADD THIS
  getResourcesHandler
);
```

**Testing:**
1. Create SP with `maxClassification: "SECRET"`
2. SP requests TOP_SECRET resource
3. Middleware should block (403 Forbidden)
4. Log: "Classification TOP_SECRET exceeds agreement max SECRET"

**Reference:** Audit Section 5.4, Gap 5

---

### **Week 5-6: Testing & Documentation** (60 hours)

#### **Task 5.1: Comprehensive Testing** (40 hours)

**Test Matrix:**

| **Test** | **Scenario** | **Expected Result** |
|---|---|---|
| KAS-1 | FRA user → USA encrypted resource | DEK released, content decrypted |
| KAS-2 | FRA user → USA resource (not releasable to FRA) | 403 Forbidden |
| KAS-3 | USA KAS unavailable | 503 Service Unavailable (fail-closed) |
| KAS-4 | FRA user → GBR encrypted resource | Cross-KAS to gbr-kas works |
| SEARCH-1 | Federated search: "NATO" | Results from USA, FRA, GBR, DEU |
| SEARCH-2 | Federated search: TOP_SECRET (SECRET user) | Filtered out |
| SEARCH-3 | One instance down | Graceful degradation (other instances work) |
| POLICY-1 | All instances same version | Consistent = true |
| POLICY-2 | USA v2.1.0, FRA v2.0.5 | Alert triggered |
| ORIGIN-1 | All resources have originRealm | 100% coverage |
| ORIGIN-2 | New resource created | originRealm auto-set |
| FED-1 | SP with maxClassification=SECRET | Cannot access TOP_SECRET |
| FED-2 | SP agreement expired | Access denied |
| IDP-1 | Onboard new partner (ESP) | <5 minutes |
| IDP-2 | Auto-populated config from registry | Skip manual steps |
| SP-1 | External org self-registers | OAuth client created, status=PENDING |
| SP-2 | SuperAdmin approves SP | Status=ACTIVE, can access resources |

**Test Implementation:**
```bash
# Run all Phase 4 tests
cd backend
npm run test:phase4

# Specific test suites
npm run test -- kas-federation.test.ts
npm run test -- federated-search.test.ts
npm run test -- policy-version.test.ts
npm run test -- origin-tracking.test.ts
npm run test -- federation-agreement.test.ts
```

---

#### **Task 5.2: Documentation Updates** (12 hours)

**Update Files:**
1. `docs/PHASE4-COMPLETION-REPORT.md` (create - summary of implementation)
2. `docs/api/federated-search-api.md` (create - API documentation)
3. `docs/runbooks/cross-kas-troubleshooting.md` (create - operational guide)
4. `README.md` (update - add Phase 4 features)

---

#### **Task 5.3: Performance Testing** (8 hours)

**Performance Targets:**
- Cross-instance resource access: p95 < 500ms
- Federated search: p95 < 2s
- KAS key request: p95 < 200ms
- Policy consistency check: < 5s

**Load Testing:**
```bash
# Artillery load test
artillery run tests/load/cross-kas-load.yml
artillery run tests/load/federated-search-load.yml
```

---

## 📋 **SUCCESS CRITERIA**

### **Functional**
- [ ] FRA user can access USA encrypted resource (cross-KAS)
- [ ] Federated search returns results from all instances (USA, FRA, GBR, DEU)
- [ ] All instances report same policy version (no drift)
- [ ] 100% resources have `originRealm` field
- [ ] SP federation agreement enforcement active
- [ ] SuperAdmin can onboard partner in <5 minutes
- [ ] External SP can self-register (OAuth client)

### **Non-Functional**
- [ ] Cross-instance resource access latency <500ms (p95)
- [ ] Federated search latency <2s (p95)
- [ ] KAS key request latency <200ms (p95)
- [ ] Policy drift detection within 5 minutes
- [ ] Zero manual Terraform for partner onboarding
- [ ] 85%+ test coverage for new code

### **Documentation**
- [ ] Phase 4 completion report
- [ ] API documentation (federated search)
- [ ] Runbooks (cross-KAS troubleshooting)
- [ ] README updated

---

## 🚀 **GETTING STARTED**

### **Step 1: Review Architecture Audit**
```bash
# Read the comprehensive audit (2,245 lines)
cat docs/PHASE4-FULL-ARCHITECTURE-AUDIT.md

# Key sections:
# - Section 1: IdP vs SP Workflows
# - Section 2: KAS Architecture (2.3 = Cross-KAS)
# - Section 3: MongoDB Resource Architecture
# - Section 4: OPA Policy Hierarchy
# - Section 6: Critical Gaps (5 gaps identified)
```

### **Step 2: Set Up Development Environment**
```bash
# Ensure all instances running
docker-compose -f docker-compose.yml up -d        # USA
docker-compose -f docker-compose.fra.yml up -d    # FRA
docker-compose -f docker-compose.gbr.yml up -d    # GBR

# Verify federation working
./scripts/federation/validate-federation.sh
```

### **Step 3: Start with Task 1.3 (Deploy KAS Registry)**
- Create `config/kas-registry.json`
- Add USA, FRA, GBR KAS servers
- Test loading registry in backend

### **Step 4: Implement Task 1.4 (CrossKASClient Integration)**
- Edit `backend/src/controllers/resource.controller.ts`
- Add cross-instance detection logic
- Test with FRA user → USA resource

### **Step 5: Run Migration (Task 1.5)**
```bash
cd backend
INSTANCE_REALM=USA ts-node src/scripts/add-origin-realm-migration.ts
```

### **Step 6: Execute Week 1-2 Tasks**
- Follow roadmap sequentially
- Test incrementally
- Document issues

---

## 🎯 **IMPLEMENTATION PRIORITIES**

### **Must Have** (Critical Path)
1. ✅ Task 1.3: Deploy KAS Registry
2. ✅ Task 1.4: Integrate CrossKASClient (BLOCKS cross-instance access)
3. ✅ Task 1.5: Origin Tracking Migration (PREREQUISITE for 1.4)
4. ✅ Task 3.2: Federated Resource Discovery (HIGH user value)
5. ✅ Task 3.1: Policy Version Tracking (COMPLIANCE requirement)

### **Should Have** (High Value)
6. ✅ Task 1.1: IdP Wizard Federation Quick-Add (REDUCES onboarding time)
7. ✅ Task 3.3: Federation Agreement Enforcement (SECURITY hardening)
8. ✅ Task 5.1: Comprehensive Testing (ENSURES quality)

### **Nice to Have** (Lower Priority)
9. ✅ Task 1.2: SP Self-Service Portal (UX improvement)
10. ✅ Task 5.2: Documentation Updates (KNOWLEDGE transfer)

---

## 📚 **KEY REFERENCE FILES**

### **Architecture & Design**
- `docs/PHASE4-FULL-ARCHITECTURE-AUDIT.md` (2,245 lines) - **PRIMARY REFERENCE**
- `docs/PHASE4-IDP-SP-INTEGRATION-ASSESSMENT.md` (935 lines) - Integration analysis
- `config/federation-registry.json` (442 lines) - Federation config

### **Working Code to Reference**
- `kas/src/utils/kas-federation.ts` (CrossKASClient - use this)
- `backend/src/services/fra-federation.service.ts` (Metadata sync pattern)
- `backend/src/middleware/federation-agreement.middleware.ts` (Use this middleware)
- `scripts/add-federation-partner.sh` (417 lines - Automated IdP setup)

### **Frontend Examples**
- `frontend/src/app/admin/idp/new/page.tsx` (1,101 lines - IdP wizard)
- `frontend/src/app/admin/sp-registry/new/page.tsx` (490 lines - SP registration)

### **Policy Examples**
- `policies/fuel_inventory_abac_policy.rego` (933 lines - Global policy)
- `policies/federation_abac_policy.rego` (AAL enforcement)
- `policies/object_abac_policy.rego` (ZTDF, KAS obligations)

---

## ⚠️ **CRITICAL REMINDERS**

1. **Test Incrementally**: Don't implement everything at once
2. **Cross-Instance Testing**: Always test FRA → USA, USA → FRA, GBR → USA
3. **Fail-Closed Security**: If KAS unavailable, DENY (don't bypass)
4. **Audit Everything**: Log all cross-KAS requests, policy checks
5. **Graceful Degradation**: If one instance down, others should work
6. **Policy Consistency**: Monitor policy versions continuously
7. **Origin Tracking**: Every resource MUST have `originRealm`
8. **KAS Authority**: `originRealm` determines which KAS holds keys

---

## 🎓 **BEST PRACTICES**

### **Security**
- ✅ Always verify JWT signatures (never decode without verify)
- ✅ Re-evaluate policy at KAS (defense in depth)
- ✅ Log divergence (KAS denies but PDP allowed)
- ✅ Fail-closed (unavailable = deny)
- ✅ Audit all cross-instance access

### **Performance**
- ✅ Parallel federation queries (Promise.all)
- ✅ Timeout remotes (3s max)
- ✅ Cache KAS registry (don't reload every request)
- ✅ Index MongoDB on `originRealm`
- ✅ Rate limit cross-instance queries

### **Resilience**
- ✅ Graceful degradation (instance down = skip)
- ✅ Circuit breaker for failing instances
- ✅ Retry with exponential backoff
- ✅ Health checks every 30 seconds
- ✅ Alert on policy drift

---

## ✅ **READY TO START**

**You have everything you need:**
- ✅ Complete architecture audit (2,245 lines)
- ✅ 6-week implementation roadmap
- ✅ Code examples for every task
- ✅ Test scenarios defined
- ✅ Success criteria clear
- ✅ Reference files identified

**Start with:** Task 1.3 (Deploy KAS Registry) - 4 hours

**Expected completion:** 5-6 weeks (220 hours)

**Questions?** Reference `docs/PHASE4-FULL-ARCHITECTURE-AUDIT.md` Section 6 (Critical Gaps)

---

**END OF HANDOFF PROMPT** ✅

**Status:** Ready for implementation  
**Approach:** Best practices, incremental, test-driven  
**Reference:** Complete architecture audit included








