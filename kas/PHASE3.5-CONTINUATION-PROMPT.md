# ACP-240 KAS Phase 3.5+ Implementation - New Session Prompt

**Copy this entire document into a new chat session to continue implementation.**

---

## Session Context & Background

I need to continue implementing the ACP-240 SUPP-5(A) AMDT 1 rewrap protocol v1.0 for the DIVE V3 Key Access Service (KAS).

### Current Status (Phase 3.4 COMPLETED - 2026-01-30)

The KAS implementation has progressed from **22% to ~75% compliance** with ACP-240 specification through systematic phased implementation:

**✅ COMPLETED PHASES:**

**Phase 0: Foundation (COMPLETED)**
- Created comprehensive documentation ecosystem
- 50 baseline requirements documented (`kas/ACP240-KAS.md`)
- Gap analysis completed (`kas/acp240-gap-analysis.json` - 1,966 lines)
- Implementation plan established (`kas/IMPLEMENTATION-HANDOFF.md` - 1,003 lines)

**Phase 1: Core Protocol (COMPLETED)**
- Type definitions (`kas/src/types/rewrap.types.ts` - 363 lines)
- POST /rewrap endpoint (`kas/src/server.ts:717-1159` - 443 lines)
- Request validation middleware
- Asymmetric cryptography (unwrap/rewrap)
- Kid-based key routing

**Phase 2: Security & Integrity (COMPLETED)**
- DPoP verification middleware (`kas/src/middleware/dpop.middleware.ts`)
- Per-KAO signature verification (`kas/src/utils/crypto/kao-signature.ts`)
- PolicyBinding verification (`kas/src/utils/crypto/policy-binding.ts`)
- Result signing (`kas/src/utils/crypto/result-signing.ts`)

**Phase 3.1-3.3: Federation & Brokering (COMPLETED)**
- Foreign KAO detection (`kas/src/utils/kao-router.ts` - 267 lines)
- Spec-compliant /rewrap forwarding
- Response aggregation (`kas/src/utils/response-aggregator.ts` - 323 lines)
- MongoDB-backed KAS registry (`kas/src/utils/mongo-kas-registry-loader.ts` - 342 lines)

**Phase 3.4: Federation Security (COMPLETED - Latest Session)**
- ✅ mTLS configuration (`kas/src/utils/mtls-config.ts` - 343 lines)
- ✅ Federation validator middleware (`kas/src/middleware/federation-validator.middleware.ts` - 538 lines)
- ✅ Updated HTTP client integration (`kas/src/services/kas-federation.service.ts`)
- ✅ 28 comprehensive tests (`kas/src/__tests__/phase3.4-security.test.ts`)
- ✅ Git commits: 0ebb73ae, 6a1aa521

**Security Features Now Active:**
- PKI-based trust with mutual TLS
- X-Forwarded-By header validation
- Federation depth limiting (max 3 hops)
- Loop detection
- Classification/COI/country caps per federation agreement
- Complete audit trail for all federation events

**Current Compliance:** ~75% (37.5/50 requirements fully/partially implemented)

---

## Key Artifacts Reference

### Documentation
- `kas/CONTINUATION-PROMPT.md` - Original continuation prompt (557 lines)
- `kas/IMPLEMENTATION-HANDOFF.md` - Full 5-phase plan (1,003 lines)
- `kas/ACP240-KAS.md` - 50 baseline requirements (462 lines)
- `kas/acp240-gap-analysis.json` - Detailed gap analysis (1,966 lines)
- `kas/PHASE3.4-SUMMARY.md` - Phase 3.4 completion summary (472 lines)
- `kas/.env.example` - Configuration template with all feature flags

### Implemented Code (Phases 0-3.4)
**Core Protocol:**
- `kas/src/types/rewrap.types.ts` - Rewrap type definitions (363 lines)
- `kas/src/server.ts:717-1159` - /rewrap endpoint (443 lines)
- `kas/src/middleware/rewrap-validator.middleware.ts` - Request validation (316 lines)
- `kas/src/utils/crypto/rewrap.ts` - Cryptography (265 lines)
- `kas/src/utils/crypto/key-router.ts` - Key routing (347 lines)

**Security & Integrity:**
- `kas/src/middleware/dpop.middleware.ts` - DPoP verification (200 lines)
- `kas/src/utils/crypto/kao-signature.ts` - Signature verification (220 lines)
- `kas/src/utils/crypto/policy-binding.ts` - PolicyBinding (109 lines)
- `kas/src/utils/crypto/result-signing.ts` - Result signing (153 lines)

**Federation:**
- `kas/src/types/federation.types.ts` - Federation types (252 lines)
- `kas/src/utils/kao-router.ts` - KAO routing (267 lines)
- `kas/src/utils/response-aggregator.ts` - Response aggregation (323 lines)
- `kas/src/utils/mongo-kas-registry-loader.ts` - MongoDB registry (342 lines)
- `kas/src/services/kas-federation.service.ts` - Federation service (851 lines)

**Federation Security (Phase 3.4 - NEW):**
- `kas/src/utils/mtls-config.ts` - mTLS configuration (343 lines)
- `kas/src/middleware/federation-validator.middleware.ts` - Federation validator (538 lines)
- `kas/src/__tests__/phase3.4-security.test.ts` - Security tests (560 lines, 28 tests)

### Test Coverage
- Unit tests: 150+
- Integration tests: 100+
- Security tests: 50+ (including 28 from Phase 3.4)
- Federation tests: 40+
- **Total: 340+ tests**

---

## CURRENT PRIORITY: Phase 3.5 - Multi-KAS Integration Testing (Week 14)

### Objective
Set up 3-KAS test environment and comprehensive testing to validate multi-KAS federation in realistic scenarios.

### SMART Goals
- **Specific:** Deploy 3-KAS environment (USA, FRA, GBR), run 68+ integration tests, achieve 90%+ coverage
- **Measurable:** 3 KAS instances operational, 68+ tests passing, p95 latency < 500ms for 3-KAS
- **Achievable:** Full team for 1 week (backend, platform, QA)
- **Relevant:** Validates multi-KAS federation in realistic scenario before production
- **Time-bound:** Complete by end of Week 14 (7 days)

### Tasks Breakdown

#### 3.5.1: 3-KAS Environment Setup (2 days)

**Infrastructure Components:**
```yaml
# docker-compose.3kas.yml (NEW - to create)
version: '3.8'
services:
  kas-usa:
    build: ./kas
    environment:
      - KAS_ID=kas-usa
      - KAS_URL=http://kas-usa:8080
      - ENABLE_REWRAP_PROTOCOL=true
      - ENABLE_FEDERATION=true
      - FEDERATION_MTLS_ENABLED=true
      - MTLS_CLIENT_CERT_KAS_FRA=/certs/usa/client.crt
      - MTLS_CLIENT_KEY_KAS_FRA=/certs/usa/client.key
    volumes:
      - ./certs/usa:/certs/usa:ro
    networks:
      - kas-federation
  
  kas-fra:
    build: ./kas
    environment:
      - KAS_ID=kas-fra
      - KAS_URL=http://kas-fra:8080
      - ENABLE_REWRAP_PROTOCOL=true
      - ENABLE_FEDERATION=true
      - FEDERATION_MTLS_ENABLED=true
    volumes:
      - ./certs/fra:/certs/fra:ro
    networks:
      - kas-federation
  
  kas-gbr:
    build: ./kas
    environment:
      - KAS_ID=kas-gbr
      - KAS_URL=http://kas-gbr:8080
      - ENABLE_REWRAP_PROTOCOL=true
      - ENABLE_FEDERATION=true
      - FEDERATION_MTLS_ENABLED=true
    volumes:
      - ./certs/gbr:/certs/gbr:ro
    networks:
      - kas-federation
  
  mongodb-shared:
    image: mongo:7
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
    volumes:
      - mongo-kas-federation:/data/db
    networks:
      - kas-federation

networks:
  kas-federation:
    driver: bridge

volumes:
  mongo-kas-federation:
```

**MongoDB Seed Data:**
```javascript
// kas/tests/fixtures/federation-spokes.json (NEW - to create)
db.federation_spokes.insertMany([
  {
    spokeId: "kas-usa",
    instanceCode: "USA",
    organization: "United States",
    kasUrl: "http://kas-usa:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["USA", "CAN", "GBR"],
    supportedCOIs: ["US-ONLY", "FVEY", "NATO"],
    authMethod: "jwt",
    metadata: {
      version: "1.0.0-acp240",
      capabilities: ["rewrap", "dpop", "federation"],
      contact: "kas-admin@usa.mil",
      lastVerified: "2026-01-30T00:00:00Z"
    }
  },
  {
    spokeId: "kas-fra",
    instanceCode: "FRA",
    organization: "France",
    kasUrl: "http://kas-fra:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["FRA", "DEU", "BEL"],
    supportedCOIs: ["NATO", "EU-RESTRICTED"],
    authMethod: "jwt",
    metadata: {
      version: "1.0.0-acp240",
      capabilities: ["rewrap", "dpop", "federation"],
      contact: "kas-admin@defense.gouv.fr",
      lastVerified: "2026-01-30T00:00:00Z"
    }
  },
  {
    spokeId: "kas-gbr",
    instanceCode: "GBR",
    organization: "United Kingdom",
    kasUrl: "http://kas-gbr:8080/rewrap",
    trustLevel: "high",
    supportedCountries: ["GBR", "USA", "CAN"],
    supportedCOIs: ["FVEY", "NATO", "AUKUS"],
    authMethod: "jwt",
    metadata: {
      version: "1.0.0-acp240",
      capabilities: ["rewrap", "dpop", "federation"],
      contact: "kas-admin@mod.gov.uk",
      lastVerified: "2026-01-30T00:00:00Z"
    }
  }
]);
```

**Certificate Generation Script:**
```bash
#!/bin/bash
# kas/scripts/generate-test-certs.sh (NEW - to create)

# Generate certificates for 3-KAS testing
# This creates mTLS certificates for USA, FRA, GBR

set -e

CERT_DIR="./certs/kas-federation"
mkdir -p $CERT_DIR/{usa,fra,gbr,ca}

# Generate CA
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
  -keyout $CERT_DIR/ca/ca.key \
  -out $CERT_DIR/ca/ca.crt \
  -subj "/CN=KAS Federation Test CA"

# Generate certificates for each KAS
for country in usa fra gbr; do
  # Generate key
  openssl genrsa -out $CERT_DIR/$country/client.key 4096
  
  # Generate CSR
  openssl req -new -key $CERT_DIR/$country/client.key \
    -out $CERT_DIR/$country/client.csr \
    -subj "/CN=kas-$country/O=Test/C=${country^^}"
  
  # Sign with CA
  openssl x509 -req -in $CERT_DIR/$country/client.csr \
    -CA $CERT_DIR/ca/ca.crt \
    -CAkey $CERT_DIR/ca/ca.key \
    -CAcreateserial \
    -out $CERT_DIR/$country/client.crt \
    -days 365
  
  # Copy CA cert to each directory
  cp $CERT_DIR/ca/ca.crt $CERT_DIR/$country/ca.crt
done

echo "✅ Certificates generated successfully"
```

**Setup Tasks:**
1. Create `docker-compose.3kas.yml`
2. Create certificate generation script
3. Generate test certificates
4. Create MongoDB seed script
5. Test environment health checks

**Tests:** 5 environment tests (all KAS healthy, registry loaded, network connectivity, mTLS handshake, cross-KAS ping)

#### 3.5.2: Integration Test Suite (2 days)

**File:** `kas/tests/integration/federation.test.ts` (NEW - to create)

**Test Categories:**

```typescript
// 1. Single KAS Tests (10 tests)
describe('Single KAS Operations', () => {
  it('should handle local KAOs only', ...);
  it('should sign results with local KAS key', ...);
  it('should enforce local policy evaluation', ...);
  it('should handle DPoP verification', ...);
  it('should validate policyBinding', ...);
  it('should reject invalid signatures', ...);
  it('should handle classification caps', ...);
  it('should validate COI restrictions', ...);
  it('should audit all operations', ...);
  it('should handle error responses', ...);
});

// 2. 2-KAS Tests (15 tests)
describe('2-KAS Federation (USA → FRA)', () => {
  it('should forward foreign KAOs', ...);
  it('should preserve policy associations', ...);
  it('should aggregate responses', ...);
  it('should preserve downstream signatures', ...);
  it('should add X-Forwarded-By header', ...);
  it('should validate federation agreements', ...);
  it('should enforce classification caps', ...);
  it('should handle partial failures', ...);
  it('should respect circuit breaker', ...);
  it('should correlate audit trails', ...);
  it('should handle timeout gracefully', ...);
  it('should retry transient failures', ...);
  it('should validate mTLS certificates', ...);
  it('should reject untrusted forwarders', ...);
  it('should enforce max federation depth', ...);
});

// 3. 3-KAS Tests (10 tests)
describe('3-KAS Federation (USA + FRA + GBR)', () => {
  it('should forward to multiple KAS', ...);
  it('should aggregate results from all KAS', ...);
  it('should handle mixed success/failure', ...);
  it('should preserve all signatures', ...);
  it('should maintain policy grouping', ...);
  it('should correlate federation IDs', ...);
  it('should handle complex forwarding chains', ...);
  it('should detect and prevent loops', ...);
  it('should enforce depth across chain', ...);
  it('should audit complete trail', ...);
});

// 4. Failure Scenarios (15 tests)
describe('Federation Failure Handling', () => {
  it('should handle KAS unavailable', ...);
  it('should trigger circuit breaker', ...);
  it('should recover from circuit breaker', ...);
  it('should handle network timeout', ...);
  it('should handle connection refused', ...);
  it('should handle TLS handshake failure', ...);
  it('should handle invalid certificates', ...);
  it('should handle malformed responses', ...);
  it('should handle partial KAO failures', ...);
  it('should return successful results despite failures', ...);
  it('should audit all failures', ...);
  it('should track error metrics', ...);
  it('should handle MongoDB unavailable', ...);
  it('should handle OPA unavailable', ...);
  it('should fail closed on security violations', ...);
});

// 5. Signature Preservation (8 tests)
describe('Signature Preservation', () => {
  it('should not re-sign downstream results', ...);
  it('should preserve signature metadata', ...);
  it('should allow client verification of all signatures', ...);
  it('should track signing KAS per result', ...);
  it('should handle signature verification failures', ...);
  it('should validate signature algorithms', ...);
  it('should handle multiple signature formats', ...);
  it('should audit signature verification events', ...);
});

// 6. Policy Association (10 tests)
describe('Policy Association Preservation', () => {
  it('should group KAOs by policy', ...);
  it('should forward policy with KAOs', ...);
  it('should maintain grouping in response', ...);
  it('should handle multiple policies per request', ...);
  it('should evaluate each policy independently', ...);
  it('should return results grouped by policyId', ...);
  it('should preserve policy translations', ...);
  it('should handle policy conflicts', ...);
  it('should validate policyBinding per group', ...);
  it('should audit policy evaluations', ...);
});
```

**Total:** 68 integration tests

**Implementation Steps:**
1. Create test fixtures (JWT tokens, keyAccessObjects, policies)
2. Implement test utilities (request builders, assertion helpers)
3. Write single-KAS baseline tests
4. Add 2-KAS federation tests
5. Add 3-KAS aggregation tests
6. Add failure scenario tests
7. Add signature preservation tests
8. Add policy association tests

#### 3.5.3: Performance Benchmarking (2 days)

**Metrics to Measure:**

```typescript
// kas/tests/performance/federation-benchmark.ts (NEW - to create)

interface IPerformanceMetrics {
  // Latency metrics
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  
  // Throughput metrics
  requestsPerSecond: number;
  concurrentConnections: number;
  
  // Federation metrics
  localLatency: number;
  federationOverhead: number;
  networkLatency: number;
  
  // Error metrics
  errorRate: number;
  timeoutRate: number;
  circuitBreakerTrips: number;
}

describe('Performance Benchmarks', () => {
  it('should measure single-KAS latency', async () => {
    // Target: p95 < 200ms
  });
  
  it('should measure 2-KAS latency', async () => {
    // Target: p95 < 350ms
  });
  
  it('should measure 3-KAS latency', async () => {
    // Target: p95 < 500ms
  });
  
  it('should measure throughput at 10 req/s', async () => {
    // Target: 0% errors
  });
  
  it('should measure throughput at 50 req/s', async () => {
    // Target: < 1% errors
  });
  
  it('should measure throughput at 100 req/s', async () => {
    // Target: < 5% errors
  });
  
  it('should measure federation overhead', async () => {
    // Target: < 150ms per hop
  });
  
  it('should measure circuit breaker recovery', async () => {
    // Target: < 60s recovery time
  });
  
  it('should measure connection pooling efficiency', async () => {
    // Target: 90%+ connection reuse
  });
  
  it('should generate performance report', async () => {
    // Output: kas/tests/performance/report.json
  });
});
```

**Target Performance:**
- Single KAS: p95 < 200ms, 100 req/s
- 2-KAS: p95 < 350ms, 75 req/s
- 3-KAS: p95 < 500ms, 50 req/s
- Federation overhead: < 150ms per hop
- Circuit breaker recovery: < 60s

**Tools:**
- Artillery for load testing
- k6 for stress testing
- Custom Node.js benchmark scripts
- Grafana for visualization

#### 3.5.4: End-to-End Scenarios (1 day)

**Scenario 1: Local Only**
- USA client requests USA-only resource
- All KAOs local to kas-usa
- Expected: Single KAS evaluation, no federation

**Scenario 2: Simple Federation**
- USA client requests FRA resource
- KAOs split: 2 USA, 1 FRA
- Expected: Forwarding to kas-fra, response aggregation

**Scenario 3: Multi-National Resource**
- USA client requests NATO resource
- KAOs split: 2 USA, 2 FRA, 1 GBR
- Expected: Forwarding to all 3 KAS, complete aggregation

**Scenario 4: Circuit Breaker**
- FRA KAS down
- Client requests multi-national resource
- Expected: Circuit breaker prevents FRA attempts, USA + GBR succeed

**Scenario 5: Partial Failure**
- FRA KAS returns error for 1 KAO
- USA + GBR succeed
- Expected: Mixed results, FRA error included in response

**Scenario 6: Federation Loop Prevention**
- Malicious X-Forwarded-By: "kas-usa, kas-fra, kas-usa"
- Expected: Request rejected with loop detection

**Scenario 7: Depth Limit**
- X-Forwarded-By chain exceeds MAX_FEDERATION_DEPTH
- Expected: Request rejected with depth exceeded

**Scenario 8: Classification Cap**
- USA → FRA federation agreement maxClassification: SECRET
- Client requests TOP_SECRET resource
- Expected: Federation denied

**Tests:** 15 E2E tests (2-3 variations per scenario)

#### 3.5.5: Federation Audit Trail (1 day)

**Audit Verification:**

```typescript
// kas/tests/integration/audit-trail.test.ts (NEW - to create)

describe('Federation Audit Trail', () => {
  it('should log X-Forwarded-By in all KAS', async () => {
    // Verify audit logs in USA, FRA, GBR all show chain
  });
  
  it('should correlate federation request IDs', async () => {
    // Same federationRequestId across all KAS
  });
  
  it('should track forwarding decisions', async () => {
    // FEDERATION_ALLOWED/DENIED events logged
  });
  
  it('should audit all security checks', async () => {
    // mTLS, X-Forwarded-By, depth, agreement checks logged
  });
  
  it('should preserve audit trail completeness', async () => {
    // No gaps in audit trail across KAS instances
  });
  
  it('should handle audit log rotation', async () => {
    // Logs rotated without data loss
  });
  
  it('should export audit trail to SIEM', async () => {
    // Compatible with common SIEM formats
  });
  
  it('should generate compliance reports', async () => {
    // ACP-240 section 6 compliance
  });
  
  it('should detect suspicious patterns', async () => {
    // Multiple denials, loop attempts, etc.
  });
  
  it('should maintain audit trail for 90+ days', async () => {
    // Per ACP-240 requirements
  });
});
```

**Deliverables:**
1. Audit trail verification suite (10 tests)
2. Sample audit trail analysis scripts
3. SIEM integration documentation
4. Compliance report template

### Success Criteria (Phase 3.5)

- ✅ 3-KAS environment operational
- ✅ All KAS instances healthy and connected
- ✅ MongoDB federation registry populated
- ✅ mTLS working between all KAS pairs
- ✅ 68+ integration tests passing
- ✅ Performance targets met:
  - Single KAS: p95 < 200ms
  - 2-KAS: p95 < 350ms  
  - 3-KAS: p95 < 500ms
  - Throughput: 50+ req/s sustained
- ✅ Signature preservation verified across all hops
- ✅ Policy associations maintained in responses
- ✅ Audit trail complete and correlated
- ✅ Circuit breaker functional
- ✅ Federation depth limiting enforced
- ✅ Loop detection working

### Deliverables

1. **Infrastructure:**
   - `docker-compose.3kas.yml`
   - Certificate generation script
   - MongoDB seed script
   - Health check utilities

2. **Test Suite:**
   - `kas/tests/integration/federation.test.ts` (68+ tests)
   - `kas/tests/performance/federation-benchmark.ts` (10 tests)
   - `kas/tests/integration/audit-trail.test.ts` (10 tests)

3. **Documentation:**
   - 3-KAS setup guide
   - Troubleshooting guide for federation issues
   - Performance benchmark report
   - Audit trail analysis guide

4. **Artifacts:**
   - Test coverage report (target: 90%+)
   - Performance metrics dashboard
   - Federation audit trail samples

---

## Remaining Implementation Phases

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
- Implement XOR/AES-KW/Shamir recombination algorithms
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
- Run performance benchmarks
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
- **Measurable:** OpenAPI spec complete, 400+ tests passing, 90%+ coverage, zero critical bugs
- **Achievable:** Full team for 2 weeks
- **Relevant:** Ensures production readiness and operational success
- **Time-bound:** Complete by end of Week 20

**Tasks:**

#### 5.1: API Documentation (Week 19)
- Complete `kas/docs/rewrap-api.yaml` OpenAPI 3.0 specification
- Create `kas/docs/rewrap-protocol-guide.md`
- Create client integration guide with example code (TypeScript, Python, Java)

#### 5.2: Operational Runbooks (Week 19)
- Create deployment checklist
- Create troubleshooting guide
- Create security incident response procedures
- Create key rotation procedures
- Create certificate management procedures

#### 5.3: Comprehensive Testing (Week 19-20)
- Achieve 90%+ test coverage (400+ tests total)
- Conduct interoperability testing with external ACP-240 client
- Run full test suite in CI/CD
- Load testing at scale (1000+ concurrent connections)

#### 5.4: Security Audit (Week 20)
- External security review of DPoP, signatures, policyBinding
- Penetration testing
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
- ✅ 400+ tests passing with 90%+ coverage
- ✅ Security audit passed
- ✅ Production rollout complete at 100%
- ✅ Zero critical bugs
- ✅ Target: 90%+ ACP-240 compliance (45+/50 requirements)

---

## Open Questions Requiring Resolution

From `kas/acp240-gap-analysis.json::open_questions`:

1. **Q1 (KAS-REQ-013):** Does the ZTDF manifest include type='wrapped' and protocol='kas' fields?
   - **Needed:** Sample ZTDF manifest with full keyAccessObject structure
   - **Impact:** Field validation logic

2. **Q3 (KAS-REQ-033):** How are client DPoP public keys registered and distributed?
   - **Needed:** Client registration flow, key distribution mechanism
   - **Impact:** DPoP verification trust model

3. **Q4 (KAS-REQ-051):** How many KAS key pairs exist per instance? What is the kid naming scheme?
   - **Needed:** KAS key generation scripts, key inventory
   - **Impact:** Kid-based key selection logic

4. **Q5 (KAS-REQ-070):** What is the structure and format of encryptedMetadata?
   - **Needed:** ZTDF encryption specification, sample encrypted metadata
   - **Impact:** Metadata decryption implementation (Phase 4)

5. **Q6 (KAS-REQ-083):** Does each KAS use the same signing key as its KEK, or separate signing keys?
   - **Needed:** Key management architecture documentation
   - **Impact:** Signing key infrastructure

6. **Q9 (KAS-REQ-120):** What is the key split recombination algorithm (XOR, AES-KW, Shamir)?
   - **Needed:** ZTDF All-Of mode specification
   - **Impact:** Key split implementation (Phase 4)

7. **Q10 (PERFORMANCE):** What are the latency and throughput SLA targets?
   - **Needed:** Performance benchmarks, SLA targets
   - **Impact:** Optimization priorities

---

## Configuration & Environment

### Required Environment Variables

```bash
# Core Configuration
KAS_PORT=8080
HTTPS_ENABLED=true
KAS_ID=kas-usa
KAS_URL=http://kas-usa:8080

# Feature Flags
ENABLE_REWRAP_PROTOCOL=true
ENABLE_FEDERATION=true
ENABLE_DPOP=true
ENABLE_SIGNATURE_VERIFICATION=true
ENABLE_POLICY_BINDING=true

# Federation Configuration (Phase 3.4+)
FEDERATION_TIMEOUT_MS=10000
FEDERATION_MAX_RETRIES=3
FEDERATION_MAX_DEPTH=3
FEDERATION_MTLS_ENABLED=true

# mTLS Configuration (Phase 3.4+)
# Per-KAS certificates
MTLS_CLIENT_CERT_KAS_FRA=/certs/usa/client.crt
MTLS_CLIENT_KEY_KAS_FRA=/certs/usa/client.key
MTLS_CA_CERT_KAS_FRA=/certs/ca/ca.crt

# Shared/default certificates
MTLS_CLIENT_CERT=/certs/default/client.crt
MTLS_CLIENT_KEY=/certs/default/client.key
MTLS_CA_CERT=/certs/ca/ca.crt

# MongoDB
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017
MONGODB_DATABASE=dive-v3

# OPA
OPA_URL=https://localhost:8181

# Keycloak
KEYCLOAK_URL=https://localhost:8443
KEYCLOAK_REALM=dive-v3-broker

# HSM
KAS_HSM_PROVIDER=mock  # or aws-kms, azure-hsm
```

### Start 3-KAS Environment

```bash
# Generate certificates
cd kas
./scripts/generate-test-certs.sh

# Seed MongoDB
mongosh < tests/fixtures/federation-spokes.json

# Start environment
docker-compose -f docker-compose.3kas.yml up -d

# Verify health
curl http://localhost:8081/health  # USA
curl http://localhost:8082/health  # FRA
curl http://localhost:8083/health  # GBR

# Run tests
npm run test:integration
npm run test:performance
```

---

## Request for This Session

### Primary Goal
**Implement Phase 3.5: Multi-KAS Integration Testing**

### Specific Tasks
1. Create `docker-compose.3kas.yml` for 3-KAS environment
2. Create `kas/scripts/generate-test-certs.sh` for certificate generation
3. Generate test certificates for USA, FRA, GBR
4. Create MongoDB seed script with federation_spokes data
5. Create `kas/tests/integration/federation.test.ts` with 68+ tests
6. Create `kas/tests/performance/federation-benchmark.ts` with 10 tests
7. Create `kas/tests/integration/audit-trail.test.ts` with 10 tests
8. Run all tests and verify success
9. Generate performance report
10. Document setup and troubleshooting
11. Commit all changes to GitHub

### Constraints
- Follow best practices (no shortcuts, no workarounds)
- All test categories must be implemented (68+ tests minimum)
- Performance targets must be measured and documented
- Complete audit trail verification
- Use existing Phase 3.4 mTLS and validation code
- Maintain backward compatibility

### Success Metrics
- 3-KAS environment operational
- 68+ integration tests passing
- 10 performance tests passing
- 10 audit tests passing
- Performance report generated
- p95 latency < 500ms for 3-KAS
- Throughput: 50+ req/s sustained
- Complete documentation

---

## Important Reminders

1. **MongoDB is SSOT:** KAS registry loads from `federation_spokes` collection
2. **Environment-Specific URLs:** NO hardcoded domains (use service discovery)
3. **Signature Preservation:** NEVER re-sign downstream KAS results
4. **Feature Flags:** All features gated behind environment variables
5. **Audit Logging:** Log all federation events with request correlation IDs
6. **Error Handling:** Fail-closed for security (deny on uncertainty)
7. **Circuit Breaker:** Check circuit state before forwarding
8. **Testing:** Write tests incrementally alongside implementation
9. **mTLS:** Use existing mtls-config.ts utility from Phase 3.4
10. **Federation Validator:** Use existing middleware from Phase 3.4

---

## Code Quality Standards

### TypeScript
- Strictly typed interfaces for all API structures
- No `any` types (use `unknown` if truly unknown)
- Explicit return types on all functions
- Comprehensive JSDoc comments

### Testing
- Unit tests: >80% coverage
- Integration tests: All happy + error paths
- Performance tests: Measure baseline + optimized
- Clear test descriptions
- Arrange-Act-Assert pattern

### Documentation
- README for each major component
- API documentation (OpenAPI 3.0)
- Troubleshooting guides
- Configuration examples

### Git Commits
- Conventional Commits format
- Clear, descriptive messages
- Reference phase and requirement IDs
- Run pre-commit checks

---

## References

- **ACP-240 SUPP-5(A) AMDT 1** - Rewrap Protocol v1.0 (08 MAY 2025)
- **RFC 9449** - OAuth 2.0 Demonstrable Proof-of-Possession
- **Gap Analysis:** `kas/acp240-gap-analysis.json`
- **Implementation Plan:** `kas/IMPLEMENTATION-HANDOFF.md`
- **Phase 3.4 Summary:** `kas/PHASE3.4-SUMMARY.md`
- **Latest Commits:** 0ebb73ae (Phase 3.4 implementation), 6a1aa521 (Phase 3.4 docs)

---

**END OF PHASE 3.5 CONTINUATION PROMPT**

Copy everything above this line into a new chat session to continue implementation.
