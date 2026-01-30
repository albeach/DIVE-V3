# ACP-240 KAS Rewrap Protocol - Continuation Prompt for New Session

**Copy this entire document into a new chat session to continue implementation.**

---

## Session Context & Background

I need to continue implementing the ACP-240 SUPP-5(A) AMDT 1 rewrap protocol v1.0 for the DIVE V3 Key Access Service (KAS).

### What Was Already Completed (Phases 0-3.3)

A comprehensive implementation was completed bringing KAS from **22% compliance to ~70% compliance** with the ACP-240 spec:

**Phase 0: Foundation (COMPLETED)**
- Created `.env.example` with feature flags (ENABLE_REWRAP_PROTOCOL, ENABLE_DPOP, etc.)
- Documented 50 baseline requirements from ACP-240 spec (`kas/ACP240-KAS.md`)
- Created comprehensive gap analysis (`kas/acp240-gap-analysis.json` - 1,966 lines)
- Established 5-phase implementation plan (`kas/IMPLEMENTATION-HANDOFF.md` - 1,003 lines)

**Phase 1: Core Protocol (COMPLETED)**
- ✅ Type definitions in `kas/src/types/rewrap.types.ts` (363 lines)
- ✅ POST /rewrap endpoint in `kas/src/server.ts:717-1159` (443 lines)
- ✅ Request validation middleware (`kas/src/middleware/rewrap-validator.middleware.ts`)
- ✅ Asymmetric cryptography (`kas/src/utils/crypto/rewrap.ts`)
- ✅ Key router (`kas/src/utils/crypto/key-router.ts`)

**Phase 2: Security & Integrity (COMPLETED)**
- ✅ DPoP verification middleware (`kas/src/middleware/dpop.middleware.ts`)
- ✅ Per-KAO signature verification (`kas/src/utils/crypto/kao-signature.ts`)
- ✅ PolicyBinding verification (`kas/src/utils/crypto/policy-binding.ts`)
- ✅ Result signing (`kas/src/utils/crypto/result-signing.ts`)

**Phase 3.1-3.3: Federation & Brokering (COMPLETED - Latest Session)**
- ✅ Foreign KAO detection (`kas/src/utils/kao-router.ts` - 267 lines)
- ✅ Spec-compliant /rewrap forwarding (`kas/src/services/kas-federation.service.ts::forwardRewrapRequest()`)
- ✅ Response aggregation (`kas/src/utils/response-aggregator.ts` - 323 lines)
- ✅ MongoDB-backed KAS registry (`kas/src/utils/mongo-kas-registry-loader.ts` - 342 lines)
- ✅ Federation types (`kas/src/types/federation.types.ts` - 252 lines)
- ✅ /rewrap endpoint integration with federation (updated `kas/src/server.ts`)

**Git Commits:**
- `88fc0de4` - Phase 0-2: Core protocol + DPoP + policyBinding
- `3af42e80` - Phase 3.1-3.3: Federation with MongoDB SSOT

### Current Compliance Status
- **Before:** 22% (11/50 requirements)
- **After Phase 3.3:** ~70% (35/50 requirements)
- **Target:** 90%+ (45/50 requirements)

**Critical Gaps Resolved:**
✅ KAS-REQ-020: /rewrap endpoint
✅ KAS-REQ-031: DPoP verification
✅ KAS-REQ-040: KAO signature verification
✅ KAS-REQ-042: PolicyBinding verification
✅ KAS-REQ-050: Asymmetric unwrap
✅ KAS-REQ-052: Asymmetric rewrap
✅ KAS-REQ-083: Per-result signing
✅ KAS-REQ-100: KAO routing
✅ KAS-REQ-101: Foreign KAS detection
✅ KAS-REQ-102: Response aggregation
✅ KAS-REQ-103: Signature preservation
✅ KAS-REQ-104: Federation forwarding

---

## What Remains: Phased Implementation Plan

### PHASE 3.4: Federation Security (Week 13) - CURRENT PRIORITY

**Objective:** Implement mTLS and federation security validation

**SMART Goals:**
- **Specific:** Add mTLS for inter-KAS communication, federation validation middleware, X-Forwarded-By validation
- **Measurable:** 3 security requirements implemented, 18+ security tests passing, penetration test passed
- **Achievable:** Security engineer + platform engineer for 1 week
- **Relevant:** Closes critical federation security gaps (MITM, unauthorized forwarding)
- **Time-bound:** Complete by end of Week 13

**Tasks:**

#### 3.4.1: mTLS Configuration (2 days)
```typescript
// File: kas/src/utils/mtls-config.ts (NEW)
// Configure HTTPS agent with mutual TLS for inter-KAS requests

import https from 'https';
import fs from 'fs';

export function createMTLSAgent(targetKasId: string): https.Agent {
    const certPath = process.env[`MTLS_CLIENT_CERT_${targetKasId.toUpperCase()}`];
    const keyPath = process.env[`MTLS_CLIENT_KEY_${targetKasId.toUpperCase()}`];
    const caPath = process.env[`MTLS_CA_CERT_${targetKasId.toUpperCase()}`];
    
    return new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: caPath ? fs.readFileSync(caPath) : undefined,
        rejectUnauthorized: true,
        requestCert: true,
    });
}
```

**Tests:** 8 mTLS tests (valid cert, invalid cert, missing cert, CA verification)

#### 3.4.2: Federation Validation Middleware (2 days)
```typescript
// File: kas/src/middleware/federation-validator.middleware.ts (NEW)
// Validates incoming federated requests

export async function validateFederatedRequest(req, res, next) {
    // 1. Verify X-Forwarded-By header
    // 2. Check federation agreement (max classification, allowed COIs)
    // 3. Verify forwarder is in trusted KAS list
    // 4. Check federation depth (prevent loops)
    // 5. Validate circuit breaker state
}
```

**Tests:** 10 validation tests (trusted forwarder, untrusted forwarder, max depth, classification cap)

#### 3.4.3: Update HTTP Client in Federation Service (1 day)
- Modify `kas/src/services/kas-federation.service.ts::getHttpClient()`
- Add mTLS agent when `FEDERATION_MTLS_ENABLED=true`
- Test certificate loading and validation

**Tests:** 5 client tests (mTLS enabled, disabled, cert rotation)

**Success Criteria:**
- ✅ mTLS working for inter-KAS communication
- ✅ Federation validation middleware operational
- ✅ X-Forwarded-By header validated
- ✅ Max federation depth enforced
- ✅ 23+ security tests passing
- ✅ Penetration test shows no critical vulnerabilities

**Deliverables:**
- mTLS configuration utility
- Federation validation middleware
- Updated HTTP client with mTLS
- Security test suite (23+ tests)
- mTLS setup guide

---

### PHASE 3.5: Multi-KAS Integration Testing (Week 14)

**Objective:** Set up 3-KAS test environment and comprehensive testing

**SMART Goals:**
- **Specific:** Deploy 3-KAS environment (USA, FRA, GBR), run 68+ integration tests, achieve 90%+ coverage
- **Measurable:** 3 KAS instances operational, 68+ tests passing, p95 latency < 200ms
- **Achievable:** Full team for 1 week (backend, platform, QA)
- **Relevant:** Validates multi-KAS federation in realistic scenario
- **Time-bound:** Complete by end of Week 14

**Tasks:**

#### 3.5.1: 3-KAS Environment Setup (2 days)
**Infrastructure:**
- Deploy KAS instances for USA, FRA, GBR (Docker Compose or K8s)
- Configure MongoDB with federation_spokes collection
- Populate test spokes:
```javascript
// MongoDB seed data
db.federation_spokes.insertMany([
  {
    spokeId: "kas-usa",
    instanceCode: "USA",
    organization: "United States",
    kasUrl: "http://kas-usa:8080/rewrap",
    status: "approved",
    trustLevel: "high",
    supportedCountries: ["USA", "CAN", "GBR"],
    supportedCOIs: ["US-ONLY", "FVEY", "NATO"],
    authMethod: "jwt"
  },
  {
    spokeId: "kas-fra",
    instanceCode: "FRA",
    organization: "France",
    kasUrl: "http://kas-fra:8080/rewrap",
    status: "approved",
    trustLevel: "high",
    supportedCountries: ["FRA", "DEU", "BEL"],
    supportedCOIs: ["NATO", "EU-RESTRICTED"],
    authMethod: "jwt"
  },
  {
    spokeId: "kas-gbr",
    instanceCode: "GBR",
    organization: "United Kingdom",
    kasUrl: "http://kas-gbr:8080/rewrap",
    status: "approved",
    trustLevel: "high",
    supportedCountries: ["GBR", "USA", "CAN"],
    supportedCOIs: ["FVEY", "NATO", "AUKUS"],
    authMethod: "jwt"
  }
]);
```

**Tests:** 5 environment tests (all KAS healthy, registry loaded, network connectivity)

#### 3.5.2: Integration Test Suite (2 days)
**File:** `kas/tests/integration/federation.test.ts` (NEW)

**Test Categories:**
1. **Single KAS Tests (10 tests):** All KAOs local to one KAS
2. **2-KAS Tests (15 tests):** USA → FRA forwarding, response aggregation
3. **3-KAS Tests (10 tests):** USA client requests KAOs from USA + FRA + GBR
4. **Failure Scenarios (15 tests):** Circuit breaker, timeout, partial failures
5. **Signature Preservation (8 tests):** Verify downstream signatures not re-signed
6. **Policy Association (10 tests):** Verify policy-KAO grouping preserved

**Total:** 68 integration tests

#### 3.5.3: Performance Benchmarking (2 days)
**Metrics to Measure:**
- Latency (p50, p95, p99) for single-KAS vs multi-KAS
- Throughput (req/s) with 10, 50, 100 concurrent requests
- Federation overhead (latency difference local vs federated)
- Circuit breaker recovery time

**Target Performance:**
- p95 latency: < 200ms (single KAS), < 500ms (3-KAS)
- Throughput: 100 req/s sustained

**Tests:** 10 performance tests

#### 3.5.4: End-to-End Scenarios (1 day)
**Scenario 1:** USA client accesses USA resource (local only)
**Scenario 2:** USA client accesses FRA resource (federation)
**Scenario 3:** USA client accesses multi-national resource (USA + FRA + GBR KAOs)
**Scenario 4:** Circuit breaker activation and recovery
**Scenario 5:** Partial failure handling (FRA down, USA + GBR succeed)

**Tests:** 15 E2E tests

#### 3.5.5: Federation Audit Trail (1 day)
- Verify X-Forwarded-By headers logged
- Verify federation request IDs correlated
- Check audit events in all 3 KAS instances
- Validate audit trail completeness

**Tests:** 10 audit tests

**Success Criteria:**
- ✅ 3-KAS environment operational
- ✅ 68+ integration tests passing
- ✅ p95 latency < 200ms (single), < 500ms (multi)
- ✅ Throughput: 100+ req/s
- ✅ Signature preservation verified
- ✅ Policy associations preserved
- ✅ Audit trail complete across all KAS

**Deliverables:**
- 3-KAS Docker Compose environment
- Integration test suite (68+ tests)
- Performance benchmark report
- E2E test scenarios
- Audit trail verification tools

---

### PHASE 4: Optional Features & Optimization (Week 15-18)

**Objective:** Implement advanced features and production optimizations

**SMART Goals:**
- **Specific:** Add metadata decryption, key split recombination, AWS KMS integration
- **Measurable:** 8 optional requirements implemented, production HSM operational, performance targets met
- **Achievable:** Crypto engineer + platform engineer for 4 weeks
- **Relevant:** Enables advanced ZTDF features and production deployment readiness
- **Time-bound:** Complete by end of Week 18

**Tasks:**

#### 4.1: EncryptedMetadata Decryption (Week 15)
- Complete implementation in `kas/src/utils/crypto/rewrap.ts::decryptMetadata`
- Add optional decryption in /rewrap handler
- Return decrypted content in result.metadata field
- **Tests:** 12 metadata tests

#### 4.2: Key Split Recombination for All-Of Mode (Week 15-16)
```typescript
function recombineKeySplits(
    splits: Buffer[],
    method: 'xor' | 'aes-kw' | 'shamir'
): Buffer {
    // Implement based on Phase 0 Q9 answer
}
```
- Detect All-Of scenario: multiple KAOs with same keyAccessObjectId
- Unwrap all splits, recombine, verify policyBinding, rewrap combined DEK
- **Tests:** 15 key split tests (2-of-2, 3-of-5, different algorithms)

#### 4.3: Any-Of Mode Support (Week 16)
- Implement alternate KAS routing
- Try primary KAS first, fall back to alternates
- Use circuit breaker to skip known-down KAS instances
- **Tests:** 10 Any-Of tests

#### 4.4: AWS KMS Integration (Week 17-18)
- Complete `kas/src/utils/hsm-provider.ts::AWSKMSProvider`
- Configure KAS_HSM_PROVIDER=aws-kms in production
- Set up IAM roles and KMS key policies
- Implement key rotation support
- **Tests:** 20 HSM tests

#### 4.5: Performance Optimization (Week 18)
- Implement decision caching (60s TTL)
- Add connection pooling for downstream KAS HTTP clients
- Optimize JSON canonicalization
- Run performance benchmarks (target: p95 < 200ms, 100 req/s)
- **Tests:** 10 performance tests

**Success Criteria:**
- ✅ EncryptedMetadata decryption operational
- ✅ All-Of key split recombination working
- ✅ Any-Of alternate routing functional
- ✅ AWS KMS integrated and operational
- ✅ Performance targets met (p95 < 200ms, 100 req/s)
- ✅ Production HSM ready
- ✅ 67+ tests passing for optional features

---

### PHASE 5: Documentation, Testing & Launch (Week 19-20)

**Objective:** Complete documentation, comprehensive testing, and production rollout

**SMART Goals:**
- **Specific:** Document API, create runbooks, achieve 90%+ test coverage, deploy to production
- **Measurable:** OpenAPI spec complete, 300+ tests passing, 90%+ coverage, zero critical bugs
- **Achievable:** Full team for 2 weeks
- **Relevant:** Ensures production readiness and operational success
- **Time-bound:** Complete by end of Week 20

**Tasks:**

#### 5.1: API Documentation (Week 19)
- Complete `kas/docs/rewrap-api.yaml` OpenAPI 3.0 specification
- Create `kas/docs/rewrap-protocol-guide.md`
- Create client integration guide with example code

#### 5.2: Operational Runbooks (Week 19)
- Create deployment checklist
- Create troubleshooting guide
- Create security incident response procedures

#### 5.3: Comprehensive Testing (Week 19-20)
- Achieve 90%+ test coverage (300+ tests total)
- Conduct interoperability testing with external ACP-240 client
- Run full test suite in CI/CD

#### 5.4: Security Audit (Week 20)
- External security review of DPoP, signatures, policyBinding
- Address findings
- Obtain security sign-off

#### 5.5: Production Rollout (Week 20)
- Phase A: Enable in dev (monitoring)
- Phase B: Enable in staging (load testing)
- Phase C: Canary rollout (5% → 25% → 50% → 100%)
- Phase D: Deprecate /request-key after 30 days

**Success Criteria:**
- ✅ Complete OpenAPI specification published
- ✅ All documentation complete and reviewed
- ✅ 300+ tests passing with 90%+ coverage
- ✅ Security audit passed
- ✅ Production rollout complete at 100%
- ✅ Zero critical bugs

---

## Open Questions Requiring Stakeholder Input

From `kas/acp240-gap-analysis.json::open_questions`:

1. **Q1 (KAS-REQ-013):** Does the ZTDF manifest include type='wrapped' and protocol='kas' fields in keyAccessObject?
   - **Needed:** Sample ZTDF manifest with full keyAccessObject structure
   - **Impact:** Determines if we validate or ignore these fields

2. **Q3 (KAS-REQ-033):** How are client DPoP public keys registered and distributed?
   - **Needed:** Client registration flow, key distribution mechanism
   - **Impact:** DPoP verification requires trusting client public keys

3. **Q4 (KAS-REQ-051):** How many KAS key pairs exist per instance? What is the kid naming scheme?
   - **Needed:** KAS key generation scripts, key inventory
   - **Impact:** Need to implement kid-based key selection logic

4. **Q5 (KAS-REQ-070):** What is the structure and format of encryptedMetadata?
   - **Needed:** ZTDF encryption specification, sample encrypted metadata
   - **Impact:** Need decryption parameters (algorithm, IV location)

5. **Q6 (KAS-REQ-083):** Does each KAS use the same signing key as its KEK, or separate signing keys?
   - **Needed:** Key management architecture documentation
   - **Impact:** Determines if need separate signing key infrastructure

6. **Q9 (KAS-REQ-120):** What is the key split recombination algorithm (XOR, AES-KW, polynomial secret sharing)?
   - **Needed:** ZTDF All-Of mode specification
   - **Impact:** Need to implement correct recombination

7. **Q10 (PERFORMANCE):** What are the latency and throughput requirements for rewrap operations?
   - **Needed:** Performance benchmarks, SLA targets
   - **Impact:** Determines if caching/batching/optimization needed

---

## Key Artifacts & File Locations

**Documentation (Read First):**
- `kas/PHASE3-SESSION-SUMMARY.md` - Latest session summary (this file's sibling)
- `kas/IMPLEMENTATION-HANDOFF.md` - Full 5-phase plan (1,003 lines)
- `kas/acp240-gap-analysis.json` - Detailed gap analysis (1,966 lines)
- `kas/ACP240-KAS.md` - 50 baseline requirements (462 lines)
- `kas/.env.example` - Configuration template

**Implemented Code (Phase 0-3.3):**
- `kas/src/types/rewrap.types.ts` - Rewrap type definitions (363 lines)
- `kas/src/types/federation.types.ts` - Federation types (252 lines)
- `kas/src/server.ts:717-1159` - /rewrap endpoint (443 lines)
- `kas/src/middleware/dpop.middleware.ts` - DPoP verification (200 lines)
- `kas/src/middleware/rewrap-validator.middleware.ts` - Request validation (316 lines)
- `kas/src/utils/crypto/rewrap.ts` - Cryptography (265 lines)
- `kas/src/utils/crypto/key-router.ts` - Key routing (347 lines)
- `kas/src/utils/crypto/kao-signature.ts` - Signature verification (220 lines)
- `kas/src/utils/crypto/policy-binding.ts` - PolicyBinding (109 lines)
- `kas/src/utils/crypto/result-signing.ts` - Result signing (153 lines)
- `kas/src/utils/kao-router.ts` - KAO routing (267 lines)
- `kas/src/utils/response-aggregator.ts` - Response aggregation (323 lines)
- `kas/src/utils/mongo-kas-registry-loader.ts` - MongoDB registry (342 lines)
- `kas/src/services/kas-federation.service.ts` - Federation service (updated)

**To Be Created (Phase 3.4+):**
- `kas/src/utils/mtls-config.ts` - mTLS configuration
- `kas/src/middleware/federation-validator.middleware.ts` - Federation validation
- `kas/tests/integration/federation.test.ts` - Integration test suite
- `kas/docs/rewrap-api.yaml` - OpenAPI specification
- `kas/docs/rewrap-protocol-guide.md` - Protocol documentation

---

## Configuration & Testing

**Enable Features:**
```bash
cd kas
cat > .env.local <<EOF
# Core Protocol
ENABLE_REWRAP_PROTOCOL=true
ENABLE_DPOP=true
ENABLE_SIGNATURE_VERIFICATION=true
ENABLE_POLICY_BINDING=true

# Federation
ENABLE_FEDERATION=true
FEDERATION_TIMEOUT_MS=10000
FEDERATION_MTLS_ENABLED=false  # Set to true after Phase 3.4

# Cryptography
KAS_WRAP_ALGORITHM=RSA-OAEP-256
KAS_SIGNING_ALGORITHM=RS256

# KAS Identity
KAS_ID=kas-usa
KAS_URL=http://kas-usa:8080

# MongoDB
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017
MONGODB_DATABASE=dive-v3
EOF
```

**Start KAS:**
```bash
npm run dev
```

**Test Endpoint:**
```bash
curl -X POST http://localhost:8080/rewrap \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -H "DPoP: <dpop-proof>" \
  -d @rewrap-request.json
```

**Run Tests:**
```bash
npm test
npm run build  # Verify TypeScript compilation
```

---

## Request for This Session

### Primary Goal
**Implement Phase 3.4: Federation Security (mTLS + Validation)**

### Specific Tasks
1. Create `kas/src/utils/mtls-config.ts` with certificate loading
2. Create `kas/src/middleware/federation-validator.middleware.ts`
3. Update `kas/src/services/kas-federation.service.ts::getHttpClient()` to use mTLS
4. Add X-Forwarded-By header validation
5. Implement federation depth limiting
6. Write 23+ security tests
7. Update documentation

### Constraints
- Follow best practices (no shortcuts, no workarounds)
- Run tests after implementation
- Commit to GitHub with conventional commit message
- Maintain backward compatibility with existing /rewrap endpoint
- Use environment variables for all mTLS certificate paths

### Success Metrics
- mTLS operational for inter-KAS requests
- Federation validation middleware prevents unauthorized forwarding
- Max federation depth enforced (prevent loops)
- 23+ security tests passing
- No TypeScript compilation errors

---

## Important Reminders

1. **MongoDB is SSOT:** KAS registry loads from `federation_spokes` collection, NOT JSON files
2. **Environment-Specific URLs:** NO hardcoded domains (`.dive25.com` or `localhost`)
3. **Signature Preservation:** NEVER re-sign downstream KAS results
4. **Feature Flags:** All new features gated behind environment variables
5. **Audit Logging:** Log all federation events with request correlation IDs
6. **Error Handling:** Fail-closed for security (deny on uncertainty)
7. **Circuit Breaker:** Check circuit state before forwarding
8. **Testing:** Write tests incrementally alongside implementation

---

## References

- **ACP-240 SUPP-5(A) AMDT 1** - Rewrap Protocol v1.0 (08 MAY 2025)
- **RFC 9449** - OAuth 2.0 Demonstrable Proof-of-Possession
- **Gap Analysis:** `kas/acp240-gap-analysis.json`
- **Implementation Plan:** `kas/IMPLEMENTATION-HANDOFF.md`
- **Latest Session:** `kas/PHASE3-SESSION-SUMMARY.md`
- **Git Commit:** `3af42e80` (Phase 3.1-3.3 complete)

---

**END OF CONTINUATION PROMPT**

Copy everything above this line into a new chat session to continue implementation.
