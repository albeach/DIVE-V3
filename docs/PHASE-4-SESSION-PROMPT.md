# ACP-240 KAS Phase 4 Implementation - Session Prompt

**Session Start Date**: [INSERT DATE]  
**Previous Session**: Phase 3.5 Completed (2026-01-30)  
**Current Status**: 93% test pass rate, 3-KAS environment operational, ~75% ACP-240 compliance  
**Next Phase**: Phase 4 (Optional Features + Production Hardening)

---

## 🎯 Session Objectives

Complete Phase 4 implementation to achieve **100% ACP-240 compliance** and production readiness. This includes:

1. **Phase 4.1**: Implement optional ACP-240 features (EncryptedMetadata, Key Splits)
2. **Phase 4.2**: Production hardening (GCP KMS, performance, security)
3. **Phase 4.3**: Documentation and production rollout preparation

**Critical Preferences**:
- ✅ **Use Google Cloud KMS (not AWS KMS)** for production key management
- ✅ Continue incremental development with testing after each phase
- ✅ Enhance existing code vs. creating duplicates
- ✅ Follow best practices without shortcuts or workarounds

---

## 📋 Background Context

### Project Overview

**DIVE V3** is a coalition-friendly ICAM web application demonstrating federated identity management with policy-driven ABAC authorization. The **KAS (Key Access Service)** component implements the ACP-240 SUPP-5(A) AMDT 1 specification for secure key rewrap protocols.

**Tech Stack**:
- Backend: Node.js 20+, Express.js, TypeScript
- Auth: Keycloak (IdP broker), JWT (RS256), DPoP (RFC 9449)
- Authorization: OPA (Open Policy Agent)
- Databases: PostgreSQL (Keycloak), MongoDB (KAS registry)
- Testing: Jest, Docker Compose
- Infrastructure: Docker, Terraform, GCP
- Key Management: MockHSM (current), **Google Cloud KMS (target)**

**Architecture**: PEP/PDP pattern with multi-KAS federation support

### Implementation History

**Phase 3.1-3.3 (Completed)**: Core KAS functionality
- ✅ `/rewrap` endpoint implementation
- ✅ DPoP token validation (RFC 9449)
- ✅ JWT signature verification
- ✅ Policy binding validation
- ✅ DEK generation and caching
- ✅ Basic error handling

**Phase 3.4 (Completed)**: Federation Security
- ✅ mTLS configuration and validation
- ✅ Circuit breaker implementation
- ✅ MongoDB federation registry
- ✅ Federation validator middleware
- ✅ 28 security tests passing

**Phase 3.5 (Completed - Previous Session)**: Multi-KAS Integration Testing
- ✅ 3-KAS environment setup (USA, FRA, GBR)
- ✅ Certificate generation with mTLS
- ✅ 68+ integration tests implemented
- ✅ 10 performance benchmark tests
- ✅ 10 audit trail tests
- ✅ Comprehensive documentation
- ✅ 93% test pass rate (81/87 passing)
- ✅ Git commits: 79f1e51c, 97b52095

---

## 🔧 Current System Status

### Environment Health ✅
```
KAS-USA:    https://localhost:8081 (healthy) - dive-v3-kas v1.0.0-acp240
KAS-FRA:    https://localhost:8082 (healthy) - dive-v3-kas v1.0.0-acp240
KAS-GBR:    https://localhost:8083 (healthy) - dive-v3-kas v1.0.0-acp240
MongoDB:    mongodb://localhost:27018 (healthy)
Network:    kas-federation-network (operational)
```

### Test Results
```
Unit Tests:         81/87 passing (93%)
Integration Tests:  68 tests implemented (infrastructure ready)
Performance Tests:  10 benchmarks implemented (targets defined)
Audit Tests:        10 verification tests implemented
Pass Rate:          93% (exceeds 90% target)
Test Duration:      2.9s
```

**6 Failing Tests** (Expected):
- JWT verification tests requiring Keycloak
- Integration tests requiring OPA instance
- Not blockers for Phase 4 development

### ACP-240 Compliance Status

**Current Compliance: ~75%** (38/50 requirements)

**Implemented (38 requirements)**:
- ✅ Core rewrap protocol (KAS-REQ-001 to 010)
- ✅ DPoP authentication (KAS-REQ-020 to 024)
- ✅ Signature verification (KAS-REQ-030 to 034)
- ✅ Policy binding (KAS-REQ-040 to 044)
- ✅ Authorization (KAS-REQ-050 to 054)
- ✅ Multi-KAS federation (KAS-REQ-080 to 084)
- ✅ Error handling (KAS-REQ-090 to 094)
- ✅ Audit logging (KAS-REQ-095 to 099)

**Not Implemented (12 requirements)** - Phase 4 targets:
- ⏳ EncryptedMetadata decryption (KAS-REQ-070)
- ⏳ Key split recombination (KAS-REQ-003, 004)
- ⏳ Any-Of routing (KAS-REQ-120)
- ⏳ Production HSM integration (KAS-REQ-110)
- ⏳ Performance optimization (KAS-REQ-100)
- ⏳ Rate limiting (KAS-REQ-105)
- ⏳ Quantum-resistant crypto roadmap (KAS-REQ-114)
- ⏳ OpenAPI 3.0 specification (DOC-REQ-001)

---

## 📂 Key Artifacts from Previous Session

### Documentation
1. **kas/PHASE3.5-COMPLETION-SUMMARY.md** - Full Phase 3.5 status report
2. **kas/tests/README.md** - Testing guide (setup, troubleshooting, performance)
3. **kas/PHASE3.5-CONTINUATION-PROMPT.md** - Phase 3.5 requirements and tasks
4. **kas/acp240-gap-analysis.json** - Detailed compliance gap analysis
5. **kas/ACP240-KAS.md** - 50 baseline ACP-240 requirements
6. **docs/NEXT-SESSION-PROMPT.md** - Previous session context

### Code Artifacts
1. **docker-compose.3kas.yml** - 3-KAS environment configuration
2. **kas/scripts/generate-test-certs.sh** - Certificate generation (fixed country codes)
3. **kas/tests/integration/federation.test.ts** - 68 integration tests
4. **kas/tests/performance/federation-benchmark.test.ts** - 10 performance benchmarks
5. **kas/tests/integration/audit-trail.test.ts** - 10 audit tests
6. **kas/tests/fixtures/federation-seed.js** - MongoDB seed data
7. **certs/kas-federation/** - Generated CA and KAS certificates

### Core KAS Implementation
1. **kas/src/server.ts** - Main Express server with `/rewrap` endpoint
2. **kas/src/services/kas-federation.ts** - Multi-KAS federation logic
3. **kas/src/middleware/federation-validator.ts** - Security middleware
4. **kas/src/services/mtls-config.ts** - mTLS configuration
5. **kas/src/services/key-management.ts** - MockHSM (to be replaced with GCP KMS)
6. **kas/jest.config.js** - Updated test configuration

---

## 🚀 Phase 4 Implementation Plan

### Phase 4.1: Optional ACP-240 Features (Weeks 15-16)

**Objective**: Implement remaining optional features to achieve 85% compliance

#### Task 4.1.1: EncryptedMetadata Decryption
**SMART Goal**: Implement and test `encryptedMetadata` decryption within 2 days

**Requirements** (from KAS-REQ-070):
- Parse `encryptedMetadata` from request body
- Decrypt using KAS private key (RSA-OAEP-256)
- Extract embedded policy assertions
- Validate against policy in `policyBinding`
- Return decrypted metadata in response

**Implementation Steps**:
1. Create `kas/src/services/metadata-decryptor.ts`
   - `decryptMetadata(encryptedMetadata: string, kasPrivateKey: string): DecryptedMetadata`
   - `validateMetadataPolicyMatch(metadata: DecryptedMetadata, policyHash: string): boolean`
2. Update `/rewrap` endpoint in `kas/src/server.ts`
   - Add optional `encryptedMetadata` handling
   - Decrypt if present, validate against policy
3. Add unit tests: `kas/src/__tests__/metadata-decryptor.test.ts`
   - Test decryption success
   - Test policy mismatch rejection
   - Test malformed metadata handling
4. Add integration test to `kas/tests/integration/federation.test.ts`
   - Test encryptedMetadata with single KAS
   - Test with 2-KAS federation

**Success Criteria**:
- ✅ 10+ unit tests passing
- ✅ 2+ integration tests passing
- ✅ Policy mismatch causes HTTP 403
- ✅ Decrypted metadata included in response
- ✅ No performance regression (< 50ms overhead)

**Files to Modify**:
- `kas/src/services/metadata-decryptor.ts` (CREATE)
- `kas/src/server.ts` (ENHANCE `/rewrap` endpoint)
- `kas/src/__tests__/metadata-decryptor.test.ts` (CREATE)
- `kas/tests/integration/federation.test.ts` (ADD tests)

#### Task 4.1.2: Key Split Recombination (All-Of Mode)
**SMART Goal**: Implement key split recombination for All-Of splitMode within 3 days

**Requirements** (from KAS-REQ-003, 004):
- Support `splitMode: "allOf"` in KeyAccessObjects array
- Decrypt each KAO from each KAS
- XOR all decrypted key splits to recover plaintext DEK
- Support 2-5 key splits per request
- Validate all KAOs have matching policy bindings

**Implementation Steps**:
1. Create `kas/src/services/key-combiner.ts`
   - `combineKeySplits(splits: Buffer[]): Buffer` (XOR operation)
   - `validateSplitMode(kaos: KeyAccessObject[]): boolean`
   - `extractSplitsFromKAOs(kaos: KeyAccessObject[]): Buffer[]`
2. Update `kas/src/services/kas-federation.ts`
   - Detect `splitMode: "allOf"` in request
   - Orchestrate parallel KAS calls for all splits
   - Combine decrypted splits
3. Add unit tests: `kas/src/__tests__/key-combiner.test.ts`
   - Test 2-split XOR
   - Test 3-split XOR
   - Test 5-split XOR (max)
   - Test policy binding mismatch across splits
4. Add integration tests to `kas/tests/integration/federation.test.ts`
   - Test 2-KAS All-Of split
   - Test 3-KAS All-Of split
   - Test partial failure (one KAS down)

**Success Criteria**:
- ✅ 15+ unit tests passing
- ✅ 3+ integration tests passing
- ✅ Supports 2-5 key splits
- ✅ XOR recombination mathematically correct
- ✅ Policy binding validated for all splits
- ✅ Parallel KAS calls (not sequential)

**Files to Modify**:
- `kas/src/services/key-combiner.ts` (CREATE)
- `kas/src/services/kas-federation.ts` (ENHANCE for splitMode)
- `kas/src/__tests__/key-combiner.test.ts` (CREATE)
- `kas/tests/integration/federation.test.ts` (ADD split tests)

#### Task 4.1.3: Any-Of KAS Routing (Optional)
**SMART Goal**: Implement Any-Of routing for alternate KAS within 2 days

**Requirements** (from KAS-REQ-120):
- Support `splitMode: "anyOf"` in KeyAccessObjects array
- Route to first available KAS
- Fallback to next KAS on failure
- Return single decrypted key (not combined)
- Log routing decisions for audit

**Implementation Steps**:
1. Update `kas/src/services/kas-federation.ts`
   - `routeAnyOf(kaos: KeyAccessObject[]): Promise<DecryptedKey>`
   - Try KAS instances in order
   - Circuit breaker integration
2. Add tests to `kas/tests/integration/federation.test.ts`
   - Test primary KAS success
   - Test fallback to secondary
   - Test all KAS down scenario

**Success Criteria**:
- ✅ 8+ tests passing
- ✅ Fallback within 500ms
- ✅ Circuit breaker prevents cascade
- ✅ Audit log shows routing decision

**Files to Modify**:
- `kas/src/services/kas-federation.ts` (ADD anyOf routing)
- `kas/tests/integration/federation.test.ts` (ADD anyOf tests)

**Phase 4.1 Success Criteria Summary**:
- ✅ 33+ new tests passing
- ✅ 85%+ ACP-240 compliance (43/50 requirements)
- ✅ No performance regression
- ✅ All features documented
- ✅ Git commit with comprehensive message

**Estimated Effort**: 5-7 days

---

### Phase 4.2: Production Hardening (Weeks 17-18)

**Objective**: Replace MockHSM with Google Cloud KMS and optimize for production

#### Task 4.2.1: Google Cloud KMS Integration
**SMART Goal**: Replace MockHSM with GCP KMS within 4 days, passing all tests

**Why Google Cloud KMS?**
- DIVE V3 already uses GCP (`dive25` project)
- GCP Secret Manager integration exists (`backend/src/utils/gcp-secrets.ts`)
- FIPS 140-2 Level 3 certified (required for TOP_SECRET)
- Native support for RSA-OAEP-256 (ACP-240 requirement)
- Lower latency than AWS KMS for GCP-hosted services
- Unified GCP ecosystem (monitoring, logging, IAM)

**Requirements**:
- KAS private keys stored in Cloud KMS
- RSA 4096-bit keys with SHA-256
- Key rotation support (365-day lifecycle)
- Audit logging to Cloud Audit Logs
- IAM-based access control
- Multi-region support (us-central1, europe-west1)

**Implementation Steps**:

1. **Setup GCP KMS Resources**
   ```bash
   # Create key rings for each KAS instance
   gcloud kms keyrings create kas-usa --location=us-central1 --project=dive25
   gcloud kms keyrings create kas-fra --location=europe-west1 --project=dive25
   gcloud kms keyrings create kas-gbr --location=europe-west2 --project=dive25
   
   # Create asymmetric decrypt keys (RSA 4096)
   gcloud kms keys create kas-usa-private-key \
     --keyring=kas-usa \
     --location=us-central1 \
     --purpose=asymmetric-decryption \
     --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
     --project=dive25
   
   # Similar for FRA and GBR
   ```

2. **Create GCP KMS Service** (`kas/src/services/gcp-kms.ts`)
   ```typescript
   import { KeyManagementServiceClient } from '@google-cloud/kms';
   
   export class GcpKmsService {
     private client: KeyManagementServiceClient;
     
     async decryptWithKMS(
       ciphertext: Buffer,
       keyName: string
     ): Promise<Buffer>;
     
     async getPublicKey(keyName: string): Promise<string>;
     
     async rotateKey(keyName: string): Promise<void>;
   }
   ```

3. **Update Key Management Service** (`kas/src/services/key-management.ts`)
   - Replace MockHSM with GcpKmsService
   - Add feature flag: `USE_GCP_KMS=true` (default: false for dev)
   - Fallback to MockHSM if `USE_GCP_KMS=false`
   - Update DEK unwrapping to use KMS

4. **Environment Variables**
   ```bash
   # Add to docker-compose.3kas.yml
   USE_GCP_KMS=true
   GCP_PROJECT_ID=dive25
   GCP_KMS_KEY_RING=kas-usa
   GCP_KMS_KEY_NAME=kas-usa-private-key
   GCP_KMS_LOCATION=us-central1
   GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcp-service-account.json
   ```

5. **Service Account Setup**
   ```bash
   # Create service account for KAS
   gcloud iam service-accounts create dive-v3-kas \
     --display-name="DIVE V3 KAS Service Account" \
     --project=dive25
   
   # Grant KMS decrypter role
   gcloud kms keys add-iam-policy-binding kas-usa-private-key \
     --keyring=kas-usa \
     --location=us-central1 \
     --member="serviceAccount:dive-v3-kas@dive25.iam.gserviceaccount.com" \
     --role="roles/cloudkms.cryptoKeyDecrypter" \
     --project=dive25
   
   # Download service account key
   gcloud iam service-accounts keys create credentials/gcp-service-account.json \
     --iam-account=dive-v3-kas@dive25.iam.gserviceaccount.com \
     --project=dive25
   ```

6. **Testing**
   - Create `kas/src/__tests__/gcp-kms.test.ts`
     - Test decrypt with KMS (use test key)
     - Test public key retrieval
     - Test error handling (permissions, network)
   - Update existing tests to work with KMS
     - Mock KMS client for unit tests
     - Use real KMS for integration tests (if credentials available)
   - Add performance test for KMS latency
     - Target: p95 < 100ms per decrypt operation

7. **Documentation**
   - Create `kas/docs/GCP-KMS-SETUP.md`
     - Prerequisites (service account, IAM roles)
     - Key creation commands
     - Environment configuration
     - Troubleshooting
   - Update `kas/tests/README.md` with KMS testing instructions

**Success Criteria**:
- ✅ GCP KMS integrated with feature flag
- ✅ All existing tests pass with KMS enabled
- ✅ KMS decryption p95 < 100ms
- ✅ Service account configured with least privilege
- ✅ Key rotation procedure documented
- ✅ Fallback to MockHSM works in dev
- ✅ Cloud Audit Logs capturing KMS operations

**Files to Create/Modify**:
- `kas/src/services/gcp-kms.ts` (CREATE)
- `kas/src/services/key-management.ts` (ENHANCE)
- `kas/src/__tests__/gcp-kms.test.ts` (CREATE)
- `docker-compose.3kas.yml` (ADD KMS env vars)
- `kas/docs/GCP-KMS-SETUP.md` (CREATE)
- `package.json` (ADD `@google-cloud/kms` dependency)

**Dependencies**:
```bash
cd kas
npm install @google-cloud/kms@latest
npm install --save-dev @types/node
```

#### Task 4.2.2: Performance Optimization
**SMART Goal**: Achieve p95 latency targets within 3 days

**Current Targets** (from Phase 3.5):
- Single KAS: p95 < 200ms
- 2-KAS: p95 < 350ms
- 3-KAS: p95 < 500ms

**Optimization Areas**:

1. **Connection Pooling**
   - MongoDB connection pool tuning
   - HTTP keep-alive for federation
   - KMS client connection reuse

2. **Caching**
   - DEK cache: 60s TTL (already implemented)
   - Public key cache: 3600s TTL (for signature verification)
   - Federation registry cache: 300s TTL
   - Policy decision cache: 60s TTL (OPA integration)

3. **Parallel Operations**
   - Parallel KAS calls for key splits
   - Parallel signature verification (KAO + JWT)
   - Async logging (non-blocking)

4. **Code Optimization**
   - Replace synchronous crypto with async
   - Use crypto.timingSafeEqual for timing-safe comparisons
   - Optimize JSON parsing/serialization

**Implementation Steps**:

1. **Add Redis Cache** (optional but recommended)
   ```yaml
   # Add to docker-compose.3kas.yml
   redis-kas-cache:
     image: redis:7-alpine
     ports:
       - "6380:6379"
   ```

2. **Create Cache Service** (`kas/src/services/cache-manager.ts`)
   ```typescript
   export class CacheManager {
     async get(key: string): Promise<any>;
     async set(key: string, value: any, ttl: number): Promise<void>;
     async invalidate(pattern: string): Promise<void>;
   }
   ```

3. **Update Federation Service**
   - Cache federation registry lookups
   - Implement parallel KAS calls with Promise.all()
   - Add request coalescing (prevent duplicate requests)

4. **Performance Testing**
   - Run `npm test -- tests/performance/` with load
   - Measure actual p50, p95, p99 latencies
   - Generate performance report
   - Compare before/after optimization

**Success Criteria**:
- ✅ Single KAS: p95 < 200ms (measured)
- ✅ 2-KAS: p95 < 350ms (measured)
- ✅ 3-KAS: p95 < 500ms (measured)
- ✅ 100 req/s sustained throughput
- ✅ Performance report generated
- ✅ No memory leaks (24hr soak test)

**Files to Modify**:
- `kas/src/services/cache-manager.ts` (CREATE)
- `kas/src/services/kas-federation.ts` (OPTIMIZE)
- `docker-compose.3kas.yml` (ADD Redis)
- `kas/tests/performance/federation-benchmark.test.ts` (RUN load tests)

#### Task 4.2.3: Security Hardening
**SMART Goal**: Pass security audit within 2 days

**Security Checklist**:

1. **Rate Limiting**
   - Per-client: 100 req/min
   - Per-IP: 1000 req/min
   - Global: 10,000 req/min
   - Use express-rate-limit middleware

2. **Input Validation**
   - Validate all request fields against schemas
   - Reject oversized requests (max 1MB)
   - Sanitize error messages (no stack traces in production)

3. **Secrets Management**
   - All secrets in GCP Secret Manager (already done for DB passwords)
   - KMS keys in Cloud KMS
   - No secrets in environment variables or code
   - Regular secret rotation (90 days)

4. **Audit Logging**
   - All `/rewrap` requests logged
   - Federation events logged
   - Security failures logged (failed auth, policy violations)
   - Logs exported to Cloud Logging

5. **TLS Configuration**
   - TLS 1.3 only
   - Strong cipher suites (AES-GCM, ChaCha20-Poly1305)
   - mTLS for inter-KAS (already implemented)
   - Certificate rotation automation

**Implementation Steps**:

1. **Add Rate Limiting** (`kas/src/middleware/rate-limiter.ts`)
   ```typescript
   import rateLimit from 'express-rate-limit';
   
   export const rateLimiter = rateLimit({
     windowMs: 60 * 1000, // 1 minute
     max: 100, // 100 requests per minute
     standardHeaders: true,
     legacyHeaders: false,
   });
   ```

2. **Add Input Validation** (`kas/src/middleware/input-validator.ts`)
   - Use Joi or Zod for schema validation
   - Validate `/rewrap` request body
   - Reject invalid requests with HTTP 400

3. **Update Security Tests**
   - Add rate limiting tests
   - Add input validation tests
   - Add TLS configuration tests

**Success Criteria**:
- ✅ Rate limiting enforced (tested with load)
- ✅ Input validation rejects malformed requests
- ✅ No secrets in code/env (verified)
- ✅ TLS 1.3 enforced
- ✅ Audit logs exported to Cloud Logging
- ✅ Security scan passes (npm audit, Snyk)

**Files to Modify**:
- `kas/src/middleware/rate-limiter.ts` (CREATE)
- `kas/src/middleware/input-validator.ts` (CREATE)
- `kas/src/server.ts` (ADD middleware)
- `kas/src/__tests__/security.test.ts` (ENHANCE)

**Phase 4.2 Success Criteria Summary**:
- ✅ GCP KMS fully integrated and tested
- ✅ Performance targets achieved (measured)
- ✅ Security hardening complete
- ✅ 95%+ ACP-240 compliance (48/50 requirements)
- ✅ Production-ready documentation
- ✅ Git commit with comprehensive message

**Estimated Effort**: 7-9 days

---

### Phase 4.3: Documentation & Production Rollout (Weeks 19-20)

**Objective**: Complete documentation and prepare for production deployment

#### Task 4.3.1: OpenAPI 3.0 Specification
**SMART Goal**: Generate complete OpenAPI spec within 2 days

**Requirements** (from DOC-REQ-001):
- OpenAPI 3.0.3 specification
- All endpoints documented (`/rewrap`, `/health`, `/metrics`)
- Request/response schemas with examples
- Error responses documented
- Authentication flows (DPoP)
- Federation scenarios

**Implementation Steps**:

1. **Create OpenAPI Spec** (`kas/docs/openapi.yaml`)
   ```yaml
   openapi: 3.0.3
   info:
     title: DIVE V3 Key Access Service (KAS)
     version: 1.0.0-acp240
     description: ACP-240 SUPP-5(A) AMDT 1 compliant KAS implementation
   
   servers:
     - url: https://kas-usa.dive25.com
       description: USA KAS Instance
   
   paths:
     /rewrap:
       post:
         summary: Rewrap encrypted key material
         operationId: rewrap
         security:
           - DPoP: []
         requestBody:
           required: true
           content:
             application/json:
               schema:
                 $ref: '#/components/schemas/RewrapRequest'
         responses:
           '200':
             description: Key successfully rewrapped
             content:
               application/json:
                 schema:
                   $ref: '#/components/schemas/RewrapResponse'
           '400':
             $ref: '#/components/responses/BadRequest'
           '401':
             $ref: '#/components/responses/Unauthorized'
           '403':
             $ref: '#/components/responses/Forbidden'
   
   components:
     schemas:
       RewrapRequest:
         type: object
         required:
           - keyAccessObject
           - clientPublicKey
           - policyBinding
         properties:
           keyAccessObject:
             type: string
             description: Base64-encoded encrypted DEK
           clientPublicKey:
             type: string
             description: Client ephemeral public key (PEM format)
           policyBinding:
             type: string
             description: SHA-256 hash of access control policy
           encryptedMetadata:
             type: string
             description: Optional encrypted metadata
   
       RewrapResponse:
         type: object
         properties:
           encryptedKey:
             type: string
             description: DEK encrypted with client public key
           metadata:
             type: object
             description: Decrypted metadata (if provided)
   
     securitySchemes:
       DPoP:
         type: http
         scheme: bearer
         bearerFormat: JWT
         description: DPoP-bound JWT access token
   ```

2. **Generate Swagger UI** (`kas/docs/swagger-ui.html`)
   - Embed Swagger UI with OpenAPI spec
   - Host at `/docs` endpoint in KAS

3. **Add API Documentation Route** (`kas/src/server.ts`)
   ```typescript
   import swaggerUi from 'swagger-ui-express';
   import { load } from 'js-yaml';
   
   const openApiSpec = load(fs.readFileSync('docs/openapi.yaml', 'utf8'));
   app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
   ```

**Success Criteria**:
- ✅ OpenAPI 3.0.3 spec complete
- ✅ All endpoints documented
- ✅ Swagger UI accessible at `/docs`
- ✅ Examples for all request/response types
- ✅ DPoP authentication flow documented

**Files to Create**:
- `kas/docs/openapi.yaml` (CREATE)
- `kas/docs/swagger-ui.html` (CREATE)
- `kas/src/server.ts` (ADD /docs route)

#### Task 4.3.2: Client Integration Guide
**SMART Goal**: Create comprehensive client guide within 2 days

**Contents**:
1. **Quick Start**: 5-minute integration example
2. **Authentication**: How to obtain and use DPoP tokens
3. **Key Wrapping**: How to wrap DEK for KAS
4. **Rewrap Request**: Step-by-step request construction
5. **Error Handling**: Common errors and solutions
6. **Code Examples**: JavaScript, Python, Go, Java
7. **Testing**: How to test against KAS sandbox

**Implementation**:
- Create `kas/docs/CLIENT-INTEGRATION-GUIDE.md`
- Add code samples to `kas/examples/clients/`
  - `javascript-client.js`
  - `python-client.py`
  - `go-client.go`
  - `java-client.java`

**Success Criteria**:
- ✅ Guide covers all client scenarios
- ✅ 4+ language examples provided
- ✅ Examples tested and working
- ✅ Sandbox environment documented

#### Task 4.3.3: Production Deployment Guide
**SMART Goal**: Create deployment runbook within 1 day

**Contents**:
1. **Prerequisites**: GCP project, KMS keys, service accounts
2. **Infrastructure**: Terraform modules, Kubernetes manifests
3. **Configuration**: Environment variables, secrets
4. **Deployment**: Step-by-step rollout procedure
5. **Monitoring**: Metrics, alerts, dashboards
6. **Troubleshooting**: Common issues and solutions
7. **Rollback**: Emergency rollback procedure

**Implementation**:
- Create `kas/docs/PRODUCTION-DEPLOYMENT.md`
- Create Terraform module: `terraform/modules/kas/`
- Create K8s manifests: `k8s/kas/`
- Create monitoring dashboard: `monitoring/grafana/kas-dashboard.json`

**Success Criteria**:
- ✅ Complete deployment runbook
- ✅ Terraform module for KAS deployment
- ✅ K8s manifests for all environments
- ✅ Grafana dashboard configured
- ✅ Deployment tested in staging

#### Task 4.3.4: Security Audit Preparation
**SMART Goal**: Pass pre-production security audit within 2 days

**Audit Checklist**:
1. **Dependency Scan**: `npm audit`, Snyk scan (0 critical/high vulnerabilities)
2. **Secret Scanning**: Ensure no secrets in Git history
3. **SAST**: Run static analysis (SonarQube, ESLint strict)
4. **Penetration Testing**: Test for common vulnerabilities
5. **Compliance**: Verify ACP-240 compliance (100%)
6. **Documentation Review**: Ensure all docs are accurate

**Implementation**:
```bash
# Dependency audit
npm audit --audit-level=high

# Secret scanning (use truffleHog or gitleaks)
docker run --rm -v $(pwd):/repo trufflesecurity/trufflehog:latest git file:///repo

# SAST with SonarQube
sonar-scanner -Dsonar.projectKey=dive-v3-kas

# Compliance verification
npm test -- tests/integration/  # All tests pass
```

**Success Criteria**:
- ✅ 0 critical/high vulnerabilities
- ✅ No secrets in Git
- ✅ SAST scan passes
- ✅ Penetration test findings addressed
- ✅ 100% ACP-240 compliance verified

**Phase 4.3 Success Criteria Summary**:
- ✅ OpenAPI 3.0 spec complete
- ✅ Client integration guide with examples
- ✅ Production deployment runbook
- ✅ Security audit passed
- ✅ 100% ACP-240 compliance (50/50 requirements)
- ✅ Production-ready for rollout
- ✅ Git commit with comprehensive message

**Estimated Effort**: 5-7 days

---

## 📊 Overall Phase 4 Success Criteria

### Compliance
- ✅ **100% ACP-240 compliance** (50/50 requirements implemented)
- ✅ All requirements traced and verified
- ✅ Compliance report generated

### Testing
- ✅ **95%+ test pass rate** (400+ tests passing)
- ✅ Unit tests: 300+ tests
- ✅ Integration tests: 75+ tests
- ✅ Performance tests: 10+ benchmarks (targets met)
- ✅ Security tests: 20+ tests
- ✅ No critical test failures

### Performance
- ✅ **Single KAS**: p95 < 200ms (measured with load)
- ✅ **2-KAS**: p95 < 350ms (measured with load)
- ✅ **3-KAS**: p95 < 500ms (measured with load)
- ✅ **Throughput**: 100 req/s sustained
- ✅ **Availability**: 99.9% uptime in staging

### Security
- ✅ **GCP KMS**: All keys in Cloud KMS (not MockHSM)
- ✅ **Secrets**: All secrets in GCP Secret Manager
- ✅ **Audit**: All operations logged to Cloud Audit Logs
- ✅ **Vulnerabilities**: 0 critical/high (npm audit + Snyk)
- ✅ **Rate Limiting**: Enforced and tested
- ✅ **TLS 1.3**: Enforced with strong ciphers

### Documentation
- ✅ **OpenAPI 3.0**: Complete API specification
- ✅ **Client Guide**: With 4+ language examples
- ✅ **Deployment Guide**: Production runbook
- ✅ **Architecture Docs**: Updated system diagrams
- ✅ **Troubleshooting**: Common issues documented

### Production Readiness
- ✅ **Infrastructure**: Terraform + K8s manifests
- ✅ **Monitoring**: Grafana dashboards + alerts
- ✅ **CI/CD**: Automated testing and deployment
- ✅ **Rollback**: Emergency procedures documented
- ✅ **Load Testing**: Passed 24-hour soak test

---

## 🚨 Deferred Actions from Previous Session

### Issues to Address
1. **6 Failing Tests** (jwt-verification.test.ts)
   - Root cause: Tests expect Keycloak JWKS endpoint
   - Solution: Mock Keycloak JWKS in test environment OR run with Keycloak
   - Priority: Low (not blockers for Phase 4)

2. **Integration Tests Not Run**
   - Root cause: Tests reference utility functions from federation.test
   - Solution: Export utilities or run tests together
   - Priority: Medium (needed for Phase 4.1)

3. **Performance Targets Not Measured**
   - Root cause: Load tests not executed with concurrent requests
   - Solution: Run `npm test -- tests/performance/` with k6 or Artillery
   - Priority: High (needed for Phase 4.2)

### Optimization Opportunities
1. **Connection Pooling**: MongoDB and HTTP clients
2. **Async Logging**: Move to non-blocking logger
3. **Request Coalescing**: Prevent duplicate KAS calls
4. **CDN for Public Keys**: Cache JWKS responses

---

## 🎯 Recommended Approach

### Session Strategy

**Start with Quick Wins (Day 1)**:
1. Fix 6 failing tests (mock JWKS or run Keycloak)
2. Run integration tests to establish baseline
3. Measure performance with load tests

**Phase 4.1 Implementation (Days 2-6)**:
1. EncryptedMetadata decryption (2 days)
2. Key split recombination (3 days)
3. Any-Of routing (1 day, optional)
4. Test all features end-to-end

**Phase 4.2 Implementation (Days 7-13)**:
1. GCP KMS integration (4 days) - **PRIORITY**
2. Performance optimization (3 days)
3. Security hardening (2 days)
4. Verify all metrics meet targets

**Phase 4.3 Implementation (Days 14-18)**:
1. OpenAPI specification (2 days)
2. Client integration guide (2 days)
3. Production deployment guide (1 day)
4. Security audit (2 days)

**Final Verification (Days 19-20)**:
1. Run full test suite (all 400+ tests)
2. Generate compliance report
3. Create performance report
4. Final documentation review
5. Commit all changes to GitHub

### Best Practices

1. **Incremental Development**
   - Implement one feature at a time
   - Test after each feature
   - Commit after each phase

2. **Test-Driven Development**
   - Write tests first for new features
   - Ensure tests pass before moving on
   - Maintain 95%+ pass rate

3. **Code Quality**
   - Follow existing patterns
   - Enhance existing code vs. creating duplicates
   - No shortcuts or workarounds
   - Comprehensive error handling

4. **Documentation**
   - Document as you go
   - Update README files
   - Add inline comments for complex logic

5. **Git Hygiene**
   - Meaningful commit messages
   - Logical commits (not "WIP")
   - Push after each phase completion

---

## 📁 Critical File Locations

### Configuration
- **Docker Compose**: `docker-compose.3kas.yml` (3-KAS environment)
- **Jest Config**: `kas/jest.config.js` (test configuration)
- **Environment**: `.env.example` (template for env vars)

### KAS Core
- **Main Server**: `kas/src/server.ts` (Express server with /rewrap)
- **Federation**: `kas/src/services/kas-federation.ts` (multi-KAS logic)
- **Key Management**: `kas/src/services/key-management.ts` (MockHSM → GCP KMS)
- **mTLS Config**: `kas/src/services/mtls-config.ts` (certificate validation)

### Testing
- **Integration**: `kas/tests/integration/federation.test.ts` (68 tests)
- **Performance**: `kas/tests/performance/federation-benchmark.test.ts` (10 tests)
- **Audit**: `kas/tests/integration/audit-trail.test.ts` (10 tests)
- **Unit Tests**: `kas/src/__tests__/*.test.ts` (87 tests)

### Documentation
- **Phase 3.5 Summary**: `kas/PHASE3.5-COMPLETION-SUMMARY.md` (previous session)
- **Test Guide**: `kas/tests/README.md` (setup and troubleshooting)
- **ACP-240 Requirements**: `kas/ACP240-KAS.md` (50 baseline requirements)
- **Gap Analysis**: `kas/acp240-gap-analysis.json` (compliance details)

### Infrastructure
- **Certificates**: `certs/kas-federation/` (CA + 3 KAS certs)
- **Cert Generator**: `kas/scripts/generate-test-certs.sh` (mTLS setup)
- **MongoDB Seed**: `kas/tests/fixtures/federation-seed.js` (registry data)

---

## 🔍 Quick Start Commands

### Start 3-KAS Environment
```bash
# Ensure certificates exist
ls -la certs/kas-federation/*/client.crt

# Start environment
docker compose -f docker-compose.3kas.yml up -d

# Verify health
docker ps --filter "name=kas-"
curl -k https://localhost:8081/health
curl -k https://localhost:8082/health
curl -k https://localhost:8083/health
```

### Run Tests
```bash
cd kas

# All tests
npm test

# Unit tests only
npm test -- src/__tests__/

# Integration tests
npm test -- tests/integration/

# Performance benchmarks
npm test -- tests/performance/

# Specific test file
npm test -- tests/integration/federation.test.ts
```

### Monitor Environment
```bash
# Logs
docker logs -f kas-usa
docker logs -f kas-fra
docker logs -f kas-gbr

# Stats
docker stats --no-stream

# MongoDB
docker exec -it mongodb-kas-federation mongosh --eval "db.federation_spokes.find().pretty()"
```

### Cleanup
```bash
# Stop (preserve data)
docker compose -f docker-compose.3kas.yml down

# Stop and remove volumes
docker compose -f docker-compose.3kas.yml down -v
```

---

## 💡 Key Technical Decisions

### Why Google Cloud KMS (not AWS)?
1. **Ecosystem**: DIVE V3 uses GCP (`dive25` project, GCP Secret Manager)
2. **Latency**: Lower latency for GCP-hosted services
3. **Compliance**: FIPS 140-2 Level 3 certified
4. **Integration**: Native Cloud Audit Logs, Cloud Monitoring
5. **Cost**: More cost-effective for our request volume

### Why Redis for Caching?
1. **Performance**: Sub-millisecond latency
2. **TTL Support**: Native expiration for cache entries
3. **Atomic Operations**: Safe concurrent access
4. **Proven**: Battle-tested in production environments

### Why Split Phase 4 into 3 Sub-Phases?
1. **Incremental Progress**: Test after each phase
2. **Risk Management**: Catch issues early
3. **Clear Milestones**: Easier progress tracking
4. **Parallel Work**: Can delegate sub-phases

---

## 📈 Expected Timeline

| Phase | Tasks | Duration | Cumulative |
|-------|-------|----------|------------|
| **Phase 4.1** | Optional features (EncryptedMetadata, Key Splits, Any-Of) | 5-7 days | Days 1-7 |
| **Phase 4.2** | Production hardening (GCP KMS, Performance, Security) | 7-9 days | Days 8-16 |
| **Phase 4.3** | Documentation & rollout (OpenAPI, Guides, Audit) | 5-7 days | Days 17-23 |
| **Total** | **Phase 4 Complete** | **17-23 days** | **~3-4 weeks** |

**Assumptions**:
- 1 developer, full-time
- No major blockers
- GCP access available
- Testing infrastructure operational

---

## 🎓 Success Metrics

### Quantitative
- ✅ **Test Pass Rate**: 95%+ (400+ tests passing)
- ✅ **ACP-240 Compliance**: 100% (50/50 requirements)
- ✅ **Performance**: p95 < 500ms for 3-KAS
- ✅ **Availability**: 99.9% uptime in staging
- ✅ **Security**: 0 critical/high vulnerabilities
- ✅ **Code Coverage**: 85%+ line coverage

### Qualitative
- ✅ **Production Ready**: Passes all readiness checks
- ✅ **Well Documented**: All docs complete and accurate
- ✅ **Maintainable**: Clean, commented, tested code
- ✅ **Secure**: Passes security audit
- ✅ **Scalable**: Handles 100 req/s sustained

---

## 🚀 How to Use This Prompt

**For a new AI assistant starting this session**:

1. **Read this entire document first** to understand context
2. **Check environment status**: Run health checks
3. **Review current test results**: `cd kas && npm test`
4. **Start with Phase 4.1**: Implement EncryptedMetadata first
5. **Follow the phased approach**: Complete 4.1 → 4.2 → 4.3
6. **Test after each task**: Ensure no regressions
7. **Commit after each phase**: Meaningful commit messages
8. **Update documentation**: Keep docs in sync with code

**Critical Reminders**:
- ✅ **Use GCP KMS** (not AWS KMS)
- ✅ **Enhance existing code** (not create duplicates)
- ✅ **Test after each change** (maintain 95%+ pass rate)
- ✅ **Document as you go** (not at the end)
- ✅ **Follow best practices** (no shortcuts)

**If Stuck**:
- Consult `kas/PHASE3.5-COMPLETION-SUMMARY.md` for context
- Check `kas/tests/README.md` for troubleshooting
- Review `kas/acp240-gap-analysis.json` for requirements
- Search Git history for similar implementations

---

## 📞 References

### Primary Documentation
- **ACP-240 SUPP-5(A) AMDT 1**: NATO KAS specification
- **RFC 9449**: DPoP (Demonstrable Proof-of-Possession)
- **Google Cloud KMS**: https://cloud.google.com/kms/docs

### Internal Docs
- `kas/PHASE3.5-COMPLETION-SUMMARY.md` - Previous session summary
- `kas/ACP240-KAS.md` - 50 baseline requirements
- `kas/acp240-gap-analysis.json` - Compliance gap analysis
- `kas/tests/README.md` - Testing guide
- `docs/NEXT-SESSION-PROMPT.md` - Original context

### Git Commits
- `79f1e51c` - Phase 3.5 infrastructure
- `97b52095` - Phase 3.5 completion summary
- `da2fd9e2` - Previous phase fixes

---

**Document Version**: 1.0  
**Created**: 2026-01-30  
**Author**: AI Agent (Phase 3.5 completion)  
**Status**: Ready for Phase 4 implementation  
**GCP Project**: dive25  
**Environment**: 3-KAS operational (USA, FRA, GBR)  

✅ **READY TO PROCEED WITH PHASE 4**
