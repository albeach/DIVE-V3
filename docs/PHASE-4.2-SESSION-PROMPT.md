# ACP-240 KAS Phase 4.2 Implementation - Session Prompt

**Session Start Date**: [INSERT DATE]  
**Previous Session**: Phase 4.1 Completed (2026-01-31)  
**Current Status**: 89% ACP-240 compliance, Phase 4.1 complete (100% test pass rate)  
**Next Phase**: Phase 4.2 (Production Hardening) - GCP KMS Integration + Optimization

---

## 🎯 Session Objectives

Complete Phase 4.2 implementation to achieve **95%+ ACP-240 compliance** and production readiness. This includes:

1. **Phase 4.2.1**: Replace MockHSM with Google Cloud KMS (4-5 days)
2. **Phase 4.2.2**: Performance optimization (caching, pooling, parallel ops) (3-4 days)
3. **Phase 4.2.3**: Security hardening (rate limiting, input validation) (2-3 days)

**Critical Preferences**:
- ✅ **Use Google Cloud KMS** (not AWS KMS) - DIVE V3 uses GCP project `dive25`
- ✅ Continue incremental development with testing after each task
- ✅ Enhance existing code vs. creating duplicates
- ✅ Follow best practices without shortcuts

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
- Infrastructure: Docker, Terraform, **Google Cloud Platform (GCP)**
- Key Management: MockHSM (current), **Google Cloud KMS (target)**

**Architecture**: PEP/PDP pattern with multi-KAS federation support

### Previous Implementation History

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

**Phase 3.5 (Completed)**: Multi-KAS Integration Testing
- ✅ 3-KAS environment setup (USA, FRA, GBR)
- ✅ Certificate generation with mTLS
- ✅ 68+ integration tests implemented
- ✅ 10 performance benchmark tests
- ✅ 10 audit trail tests
- ✅ 93% test pass rate (81/87 passing)

**Phase 4.1 (Completed - Current Session)**: Optional ACP-240 Features
- ✅ **Phase 4.1.1**: EncryptedMetadata decryption (21 unit + 3 integration tests)
- ✅ **Phase 4.1.2**: Key split recombination - All-Of mode (24 unit + 3 integration tests)
- ✅ **Phase 4.1.3**: Any-Of KAS routing with failover (11 unit + 3 integration tests)
- ✅ **Total**: 56 unit tests + 9 integration tests (100% passing)
- ✅ Git commits: `ca39e46d`, `96e2aac4`, `778b782b`

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

### Test Results (Phase 4.1 Complete)
```
Unit Tests:         137/143 passing (96%)
  - Phase 4.1:      56/56 passing (100%)
  - Previous:       81/87 passing (93%)
Integration Tests:  77 tests implemented
  - Phase 4.1:      9 new tests (100% passing)
Performance Tests:  10 benchmarks (targets defined)
Audit Tests:        10 verification tests
Overall Pass Rate:  96% (exceeds 90% target)
Test Duration:      ~3-4s
```

### ACP-240 Compliance Status

**Current Compliance: ~89%** (45/50 requirements)

**Implemented (45 requirements)**:
- ✅ Core rewrap protocol (KAS-REQ-001 to 010)
- ✅ DPoP authentication (KAS-REQ-020 to 024)
- ✅ Signature verification (KAS-REQ-030 to 034)
- ✅ Policy binding (KAS-REQ-040 to 044)
- ✅ Authorization (KAS-REQ-050 to 054)
- ✅ **EncryptedMetadata (KAS-REQ-070)** - Phase 4.1.1 ✅
- ✅ **Key split recombination (KAS-REQ-003, 004)** - Phase 4.1.2 ✅
- ✅ Multi-KAS federation (KAS-REQ-080 to 084)
- ✅ Error handling (KAS-REQ-090 to 094)
- ✅ Audit logging (KAS-REQ-095 to 099)
- ✅ **Any-Of routing (KAS-REQ-120)** - Phase 4.1.3 ✅

**Not Implemented (5 requirements)** - Phase 4.2 targets:
- ⏳ **Production HSM integration (KAS-REQ-110)** - Phase 4.2.1 🎯
- ⏳ **Performance optimization (KAS-REQ-100)** - Phase 4.2.2 🎯
- ⏳ **Rate limiting (KAS-REQ-105)** - Phase 4.2.3 🎯
- ⏳ Quantum-resistant crypto roadmap (KAS-REQ-114) - Documentation
- ⏳ OpenAPI 3.0 specification (DOC-REQ-001) - Phase 4.3

---

## 📂 Key Artifacts from Phase 4.1

### New Services (Phase 4.1)
1. **kas/src/services/metadata-decryptor.ts** (452 lines)
   - AES-256-GCM and RSA-OAEP-256 decryption
   - Policy assertion validation
   - Policy hash verification
   - 21 unit tests (100% passing)

2. **kas/src/services/key-combiner.ts** (476 lines)
   - XOR recombination for 2-5 key splits
   - Split mode detection (single, allOf, anyOf)
   - Policy binding validation across splits
   - 24 unit tests (100% passing)

3. **kas/src/services/kas-federation.service.ts** (enhanced)
   - `routeAnyOf()` method for failover routing
   - Circuit breaker integration
   - KAS ID extraction from KAO
   - 11 unit tests (100% passing)

### Test Files (Phase 4.1)
1. **kas/src/__tests__/metadata-decryptor.test.ts** (497 lines)
2. **kas/src/__tests__/key-combiner.test.ts** (682 lines)
3. **kas/src/__tests__/anyof-routing.test.ts** (499 lines)
4. **kas/tests/integration/federation.test.ts** (enhanced with 9 tests)

### Core KAS Implementation (Existing)
1. **kas/src/server.ts** - Main Express server with `/rewrap` endpoint
2. **kas/src/services/kas-federation.ts** - Multi-KAS federation logic
3. **kas/src/middleware/federation-validator.ts** - Security middleware
4. **kas/src/services/mtls-config.ts** - mTLS configuration
5. **kas/src/services/key-management.ts** - MockHSM (⚠️ TO BE REPLACED)
6. **kas/jest.config.js** - Test configuration

### Documentation
1. **kas/PHASE3.5-COMPLETION-SUMMARY.md** - Phase 3.5 status report
2. **kas/tests/README.md** - Testing guide (setup, troubleshooting)
3. **kas/acp240-gap-analysis.json** - Detailed compliance gap analysis
4. **kas/ACP240-KAS.md** - 50 baseline ACP-240 requirements

---

## 🚀 Phase 4.2 Implementation Plan

### Phase 4.2.1: Google Cloud KMS Integration (Days 1-5)

**SMART Goal**: Replace MockHSM with GCP Cloud KMS within 4-5 days, passing all tests

#### Why Google Cloud KMS?
- ✅ DIVE V3 already uses GCP (`dive25` project)
- ✅ GCP Secret Manager integration exists (`backend/src/utils/gcp-secrets.ts`)
- ✅ FIPS 140-2 Level 3 certified (required for TOP_SECRET)
- ✅ Native support for RSA-OAEP-256 (ACP-240 requirement)
- ✅ Lower latency than AWS KMS for GCP-hosted services
- ✅ Unified GCP ecosystem (monitoring, logging, IAM)
- ✅ Multi-region support (us-central1, europe-west1, europe-west2)

#### Requirements
- KAS private keys stored in Cloud KMS
- RSA 4096-bit keys with SHA-256
- Key rotation support (365-day lifecycle)
- Audit logging to Cloud Audit Logs
- IAM-based access control
- Multi-region support for 3-KAS environment

#### Task 4.2.1.1: Setup GCP KMS Resources (Day 1)

**Commands**:
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

gcloud kms keys create kas-fra-private-key \
  --keyring=kas-fra \
  --location=europe-west1 \
  --purpose=asymmetric-decryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25

gcloud kms keys create kas-gbr-private-key \
  --keyring=kas-gbr \
  --location=europe-west2 \
  --purpose=asymmetric-decryption \
  --default-algorithm=rsa-decrypt-oaep-4096-sha256 \
  --project=dive25

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

# Repeat for FRA and GBR key rings

# Download service account key
gcloud iam service-accounts keys create credentials/gcp-service-account.json \
  --iam-account=dive-v3-kas@dive25.iam.gserviceaccount.com \
  --project=dive25
```

**Success Criteria**:
- ✅ 3 key rings created (usa, fra, gbr)
- ✅ 3 asymmetric decrypt keys created (RSA 4096)
- ✅ Service account created with KMS permissions
- ✅ Service account key downloaded
- ✅ IAM roles verified

#### Task 4.2.1.2: Create GCP KMS Service (Days 2-3)

**File**: `kas/src/services/gcp-kms.ts` (CREATE)

**Implementation**:
```typescript
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { kasLogger } from '../utils/kas-logger';

export class GcpKmsService {
  private client: KeyManagementServiceClient;
  
  constructor() {
    this.client = new KeyManagementServiceClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GCP_PROJECT_ID || 'dive25',
    });
  }
  
  /**
   * Decrypt ciphertext using Cloud KMS asymmetric key
   * 
   * @param ciphertext - Base64-encoded encrypted data
   * @param keyName - Full KMS key resource name
   * @returns Decrypted plaintext
   */
  async decryptWithKMS(
    ciphertext: Buffer,
    keyName: string
  ): Promise<Buffer> {
    const [result] = await this.client.asymmetricDecrypt({
      name: keyName,
      ciphertext,
    });
    
    if (!result.plaintext) {
      throw new Error('KMS decryption returned empty plaintext');
    }
    
    return Buffer.from(result.plaintext);
  }
  
  /**
   * Get public key from Cloud KMS
   * 
   * @param keyName - Full KMS key resource name
   * @returns PEM-encoded public key
   */
  async getPublicKey(keyName: string): Promise<string> {
    const [publicKey] = await this.client.getPublicKey({
      name: keyName,
    });
    
    if (!publicKey.pem) {
      throw new Error('KMS returned empty public key');
    }
    
    return publicKey.pem;
  }
  
  /**
   * Create new key version (rotation)
   * 
   * @param keyName - Full KMS key resource name
   */
  async rotateKey(keyName: string): Promise<void> {
    const [keyVersion] = await this.client.createCryptoKeyVersion({
      parent: keyName,
    });
    
    kasLogger.info('KMS key rotated', {
      keyName,
      newVersion: keyVersion.name,
    });
  }
  
  /**
   * Build key resource name
   * 
   * @param location - GCP region (us-central1, europe-west1)
   * @param keyRingId - Key ring ID (kas-usa, kas-fra)
   * @param keyId - Key ID (kas-usa-private-key)
   * @returns Full resource name
   */
  buildKeyName(location: string, keyRingId: string, keyId: string): string {
    const projectId = process.env.GCP_PROJECT_ID || 'dive25';
    return `projects/${projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys/${keyId}`;
  }
}

export const gcpKmsService = new GcpKmsService();
```

**Unit Tests**: `kas/src/__tests__/gcp-kms.test.ts` (CREATE)
- Test decrypt with KMS (use test key)
- Test public key retrieval
- Test key rotation
- Test error handling (permissions, network)
- Test key name builder
- **Target**: 10+ tests, 100% pass rate

**Success Criteria**:
- ✅ GcpKmsService class implemented
- ✅ All CRUD operations for KMS keys
- ✅ 10+ unit tests passing
- ✅ Error handling for network/permissions failures
- ✅ Comprehensive logging

#### Task 4.2.1.3: Update Key Management Service (Day 3)

**File**: `kas/src/services/key-management.ts` (MODIFY)

**Changes**:
1. Replace MockHSM with GcpKmsService
2. Add feature flag: `USE_GCP_KMS=true` (default: false for dev)
3. Fallback to MockHSM if `USE_GCP_KMS=false`
4. Update DEK unwrapping to use KMS
5. Cache KMS public keys (TTL: 3600s)

**Example**:
```typescript
import { gcpKmsService } from './gcp-kms';

export class KeyManagementService {
  private useGcpKms: boolean;
  
  constructor() {
    this.useGcpKms = process.env.USE_GCP_KMS === 'true';
  }
  
  async unwrapDEK(wrappedKey: string, kid: string): Promise<Buffer> {
    if (this.useGcpKms) {
      // Use GCP KMS
      const keyName = this.getKmsKeyName(kid);
      const ciphertext = Buffer.from(wrappedKey, 'base64');
      return await gcpKmsService.decryptWithKMS(ciphertext, keyName);
    } else {
      // Fallback to MockHSM (dev mode)
      return this.mockHsmUnwrap(wrappedKey);
    }
  }
  
  private getKmsKeyName(kid: string): string {
    // Map kid to KMS key name
    // e.g., "kas-usa-001" -> "projects/dive25/locations/us-central1/..."
    const mapping = {
      'kas-usa-001': gcpKmsService.buildKeyName('us-central1', 'kas-usa', 'kas-usa-private-key'),
      'kas-fra-001': gcpKmsService.buildKeyName('europe-west1', 'kas-fra', 'kas-fra-private-key'),
      'kas-gbr-001': gcpKmsService.buildKeyName('europe-west2', 'kas-gbr', 'kas-gbr-private-key'),
    };
    
    return mapping[kid] || mapping['kas-usa-001'];
  }
}
```

**Success Criteria**:
- ✅ Feature flag implemented (USE_GCP_KMS)
- ✅ All existing tests pass with KMS enabled
- ✅ Fallback to MockHSM works in dev
- ✅ KMS key mapping correct for 3-KAS environment

#### Task 4.2.1.4: Environment Configuration (Day 4)

**Environment Variables** (add to `docker-compose.3kas.yml`):
```yaml
kas-usa:
  environment:
    USE_GCP_KMS: "true"
    GCP_PROJECT_ID: "dive25"
    GCP_KMS_KEY_RING: "kas-usa"
    GCP_KMS_KEY_NAME: "kas-usa-private-key"
    GCP_KMS_LOCATION: "us-central1"
    GOOGLE_APPLICATION_CREDENTIALS: "/app/credentials/gcp-service-account.json"
  volumes:
    - ./credentials:/app/credentials:ro

kas-fra:
  environment:
    USE_GCP_KMS: "true"
    GCP_PROJECT_ID: "dive25"
    GCP_KMS_KEY_RING: "kas-fra"
    GCP_KMS_KEY_NAME: "kas-fra-private-key"
    GCP_KMS_LOCATION: "europe-west1"
    GOOGLE_APPLICATION_CREDENTIALS: "/app/credentials/gcp-service-account.json"
  volumes:
    - ./credentials:/app/credentials:ro
```

**Success Criteria**:
- ✅ Environment variables configured for all 3 KAS
- ✅ Service account credentials mounted
- ✅ Docker Compose updated
- ✅ .env.example updated with KMS variables

#### Task 4.2.1.5: Testing & Performance (Day 5)

**Test Updates**:
1. Update existing tests to mock KMS client
2. Add integration tests with real KMS (if credentials available)
3. Add performance test for KMS latency
   - Target: p95 < 100ms per decrypt operation
4. Run full test suite with `USE_GCP_KMS=true`

**Performance Benchmarks**:
```bash
cd kas
USE_GCP_KMS=true npm test -- tests/performance/
```

**Expected Results**:
- Single KAS: p95 < 200ms
- 2-KAS: p95 < 350ms
- 3-KAS: p95 < 500ms
- KMS overhead: < 100ms per call

**Success Criteria**:
- ✅ All existing tests pass with KMS enabled
- ✅ KMS decryption p95 < 100ms
- ✅ No performance regression from Phase 4.1
- ✅ Service account permissions verified
- ✅ Cloud Audit Logs capturing KMS operations

#### Task 4.2.1.6: Documentation (Day 5)

**File**: `kas/docs/GCP-KMS-SETUP.md` (CREATE)

**Contents**:
1. Prerequisites (GCP project, service account)
2. Key creation commands (copy from above)
3. IAM role configuration
4. Environment variable setup
5. Key rotation procedures
6. Troubleshooting guide
7. Cost estimation

**Update**: `kas/tests/README.md` with KMS testing instructions

**Success Criteria**:
- ✅ Complete GCP KMS setup guide
- ✅ Troubleshooting section
- ✅ Key rotation documented
- ✅ Cost estimation included

#### Phase 4.2.1 Success Criteria Summary
- ✅ GCP KMS integrated with feature flag
- ✅ All existing tests pass (137+ tests)
- ✅ KMS decryption p95 < 100ms
- ✅ Service account configured with least privilege
- ✅ Key rotation procedure documented
- ✅ Fallback to MockHSM works in dev
- ✅ Cloud Audit Logs capturing KMS operations
- ✅ 10+ new KMS tests passing

**Dependencies**:
```bash
cd kas
npm install @google-cloud/kms@latest
```

**Estimated Effort**: 4-5 days

---

### Phase 4.2.2: Performance Optimization (Days 6-9)

**SMART Goal**: Achieve p95 latency targets and 100 req/s throughput within 3-4 days

#### Current Performance Targets
- Single KAS: p95 < 200ms
- 2-KAS: p95 < 350ms
- 3-KAS: p95 < 500ms
- Throughput: 100 req/s sustained

#### Task 4.2.2.1: Add Redis Cache (Day 6)

**Docker Compose** (add to `docker-compose.3kas.yml`):
```yaml
redis-kas-cache:
  image: redis:7-alpine
  ports:
    - "6380:6379"
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  networks:
    - kas-federation-network
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 3
```

**Success Criteria**:
- ✅ Redis instance deployed
- ✅ Connection pooling configured
- ✅ Health check passing

#### Task 4.2.2.2: Create Cache Manager (Day 6)

**File**: `kas/src/services/cache-manager.ts` (CREATE)

**Implementation**:
```typescript
import Redis from 'ioredis';
import { kasLogger } from '../utils/kas-logger';

export class CacheManager {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380', 10),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set(key: string, value: any, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
  
  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.redis.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  }
}

export const cacheManager = new CacheManager();
```

**Cache Strategies**:
1. **DEK Cache**: 60s TTL (already implemented in-memory)
2. **Public Key Cache**: 3600s TTL (for JWT/KAO signature verification)
3. **Federation Registry Cache**: 300s TTL (KAS registry lookups)
4. **Policy Decision Cache**: 60s TTL (OPA integration - optional)

**Success Criteria**:
- ✅ CacheManager class implemented
- ✅ Redis connection with retry logic
- ✅ Health check endpoint
- ✅ 8+ unit tests passing

#### Task 4.2.2.3: Optimize Federation Service (Day 7)

**Changes**:
1. Cache federation registry lookups (300s TTL)
2. Implement parallel KAS calls with `Promise.all()`
3. Add request coalescing (prevent duplicate requests)
4. Connection pooling for HTTP clients

**Example**:
```typescript
// Before: Sequential KAS calls
for (const kao of kaos) {
  const result = await processKAO(kao);
  results.push(result);
}

// After: Parallel KAS calls
const promises = kaos.map(kao => processKAO(kao));
const results = await Promise.allSettled(promises);
```

**Success Criteria**:
- ✅ Federation registry cached (300s)
- ✅ Parallel KAS calls for All-Of splits
- ✅ Request coalescing implemented
- ✅ HTTP keep-alive enabled

#### Task 4.2.2.4: Optimize Crypto Operations (Day 8)

**Changes**:
1. Replace synchronous crypto with async where possible
2. Use `crypto.timingSafeEqual` for timing-safe comparisons
3. Optimize JSON parsing/serialization
4. Buffer pooling for large operations

**Success Criteria**:
- ✅ Async crypto operations
- ✅ Timing-safe comparisons
- ✅ Optimized JSON handling

#### Task 4.2.2.5: Performance Testing (Day 9)

**Load Tests**:
```bash
cd kas
npm test -- tests/performance/federation-benchmark.test.ts

# Run with load testing tool (k6 or Artillery)
k6 run tests/performance/load-test.js
```

**Metrics to Capture**:
- p50, p95, p99 latencies
- Throughput (req/s)
- Error rate
- Memory usage
- CPU usage

**Success Criteria**:
- ✅ Single KAS: p95 < 200ms (measured)
- ✅ 2-KAS: p95 < 350ms (measured)
- ✅ 3-KAS: p95 < 500ms (measured)
- ✅ 100 req/s sustained throughput
- ✅ No memory leaks (24hr soak test)

#### Task 4.2.2.6: Generate Performance Report (Day 9)

**File**: `kas/docs/PERFORMANCE-REPORT.md` (CREATE)

**Contents**:
1. Performance metrics (before/after)
2. Optimization techniques applied
3. Benchmark results
4. Bottleneck analysis
5. Recommendations for further optimization

**Success Criteria**:
- ✅ Complete performance report
- ✅ Before/after comparison
- ✅ Targets met or exceeded

#### Phase 4.2.2 Success Criteria Summary
- ✅ Redis cache integrated
- ✅ Federation service optimized (parallel calls)
- ✅ Crypto operations optimized
- ✅ Performance targets met (measured)
- ✅ 100 req/s sustained
- ✅ Performance report generated

**Estimated Effort**: 3-4 days

---

### Phase 4.2.3: Security Hardening (Days 10-12)

**SMART Goal**: Pass security audit within 2-3 days

#### Task 4.2.3.1: Add Rate Limiting (Day 10)

**File**: `kas/src/middleware/rate-limiter.ts` (CREATE)

**Implementation**:
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { cacheManager } from '../services/cache-manager';

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per client
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    client: cacheManager['redis'], // Use existing Redis connection
    prefix: 'rl:',
  }),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again later.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

// Global rate limiter (per IP)
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // 1000 requests per minute globally per IP
  store: new RedisStore({
    client: cacheManager['redis'],
    prefix: 'rl:global:',
  }),
});
```

**Apply to Server**:
```typescript
// In kas/src/server.ts
app.use(globalRateLimiter);
app.post('/rewrap', rateLimiter, async (req, res) => {
  // ... existing handler
});
```

**Rate Limits**:
- Per-client: 100 req/min
- Per-IP: 1000 req/min
- Global: 10,000 req/min

**Success Criteria**:
- ✅ Rate limiting enforced
- ✅ Redis-backed (distributed)
- ✅ 5+ tests passing
- ✅ Appropriate HTTP 429 responses

#### Task 4.2.3.2: Add Input Validation (Day 10)

**File**: `kas/src/middleware/input-validator.ts` (CREATE)

**Implementation**:
```typescript
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const rewrapRequestSchema = Joi.object({
  clientPublicKey: Joi.alternatives().try(
    Joi.string().min(100).max(10000), // PEM format
    Joi.object() // JWK format
  ).required(),
  requests: Joi.array().min(1).max(10).items(
    Joi.object({
      policy: Joi.object().required(),
      keyAccessObjects: Joi.array().min(1).max(20).items(
        Joi.object({
          keyAccessObjectId: Joi.string().required(),
          wrappedKey: Joi.string().base64().required(),
          url: Joi.string().uri().required(),
          kid: Joi.string().required(),
          policyBinding: Joi.string().base64().required(),
          signature: Joi.object().required(),
        })
      ).required(),
    })
  ).required(),
});

export function validateRewrapInput(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { error } = rewrapRequestSchema.validate(req.body, {
    abortEarly: false,
  });
  
  if (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid request body',
      details: error.details.map(d => d.message),
    });
  }
  
  // Check request size
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > 1024 * 1024) { // 1MB limit
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds 1MB limit',
    });
  }
  
  next();
}
```

**Success Criteria**:
- ✅ Input validation for all endpoints
- ✅ Request size limits (1MB)
- ✅ Schema validation with Joi
- ✅ 8+ tests passing

#### Task 4.2.3.3: Enhance TLS Configuration (Day 11)

**File**: `kas/src/server.ts` (MODIFY)

**Changes**:
```typescript
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
  
  // TLS 1.3 only
  minVersion: 'TLSv1.3' as const,
  maxVersion: 'TLSv1.3' as const,
  
  // Strong cipher suites
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
  ].join(':'),
  
  // Reject unauthorized clients (mTLS)
  requestCert: true,
  rejectUnauthorized: true,
  ca: fs.readFileSync(path.join(certPath, 'ca.crt')),
};
```

**Success Criteria**:
- ✅ TLS 1.3 enforced
- ✅ Strong cipher suites only
- ✅ mTLS for inter-KAS (already implemented)
- ✅ Certificate validation tests passing

#### Task 4.2.3.4: Sanitize Error Messages (Day 11)

**Changes**:
1. Remove stack traces in production
2. Sanitize sensitive data from logs
3. Generic error messages to clients
4. Detailed errors only in audit logs

**Example**:
```typescript
// Before
res.status(500).json({
  error: error.stack, // ❌ Leaks implementation details
});

// After
res.status(500).json({
  error: 'Internal Server Error',
  requestId: req.headers['x-request-id'], // For support
  // Stack trace logged internally only
});
```

**Success Criteria**:
- ✅ No stack traces in responses
- ✅ Sanitized error messages
- ✅ Detailed errors in audit logs only

#### Task 4.2.3.5: Security Audit (Day 12)

**Audit Checklist**:
1. **Dependency Scan**: `npm audit --audit-level=high`
2. **Secret Scanning**: Run truffleHog or gitleaks
3. **SAST**: Run static analysis (ESLint strict, SonarQube)
4. **Penetration Testing**: Test common vulnerabilities
5. **Compliance**: Verify 100% ACP-240 compliance

**Commands**:
```bash
# Dependency audit
npm audit --audit-level=high

# Secret scanning (use truffleHog)
docker run --rm -v $(pwd):/repo trufflesecurity/trufflehog:latest git file:///repo

# SAST with ESLint
npm run lint -- --max-warnings=0

# Run all tests
npm test
```

**Success Criteria**:
- ✅ 0 critical/high vulnerabilities
- ✅ No secrets in Git
- ✅ SAST scan passes
- ✅ All 150+ tests passing

#### Task 4.2.3.6: Update Security Documentation (Day 12)

**File**: `kas/docs/SECURITY.md` (CREATE)

**Contents**:
1. Security architecture overview
2. Authentication & authorization
3. Encryption at rest and in transit
4. Key management (GCP KMS)
5. Audit logging
6. Rate limiting
7. Incident response procedures
8. Security contact information

**Success Criteria**:
- ✅ Complete security documentation
- ✅ Incident response plan
- ✅ Security best practices

#### Phase 4.2.3 Success Criteria Summary
- ✅ Rate limiting enforced (tested with load)
- ✅ Input validation rejects malformed requests
- ✅ No secrets in code/env (verified)
- ✅ TLS 1.3 enforced
- ✅ 0 critical/high vulnerabilities
- ✅ Security documentation complete

**Estimated Effort**: 2-3 days

---

## 📊 Overall Phase 4.2 Success Criteria

### Compliance
- ✅ **95%+ ACP-240 compliance** (48/50 requirements implemented)
- ✅ KAS-REQ-110: Production HSM (GCP KMS) ✅
- ✅ KAS-REQ-100: Performance optimization ✅
- ✅ KAS-REQ-105: Rate limiting ✅
- ✅ All requirements traced and verified

### Testing
- ✅ **95%+ test pass rate** (150+ tests passing)
- ✅ Unit tests: 150+ tests
- ✅ Integration tests: 80+ tests
- ✅ Performance tests: 10+ benchmarks (targets met)
- ✅ Security tests: 25+ tests
- ✅ No critical test failures

### Performance (Measured with Load)
- ✅ **Single KAS**: p95 < 200ms
- ✅ **2-KAS**: p95 < 350ms
- ✅ **3-KAS**: p95 < 500ms
- ✅ **Throughput**: 100 req/s sustained
- ✅ **KMS Overhead**: < 100ms per operation

### Security
- ✅ **GCP KMS**: All keys in Cloud KMS (not MockHSM)
- ✅ **Secrets**: All secrets in GCP Secret Manager
- ✅ **Audit**: All operations logged to Cloud Audit Logs
- ✅ **Vulnerabilities**: 0 critical/high (npm audit + scan)
- ✅ **Rate Limiting**: Enforced and tested
- ✅ **TLS 1.3**: Enforced with strong ciphers
- ✅ **Input Validation**: All endpoints validated

### Production Readiness
- ✅ **GCP KMS**: Fully integrated and tested
- ✅ **Monitoring**: Cloud Monitoring integration
- ✅ **Caching**: Redis for performance
- ✅ **Documentation**: Complete and accurate
- ✅ **Load Testing**: Passed 24-hour soak test

---

## 🚨 Deferred Actions from Previous Sessions

### Issues to Address (If Time Permits)
1. **6 Failing Tests** (jwt-verification.test.ts) - Low Priority
   - Root cause: Tests expect Keycloak JWKS endpoint
   - Solution: Mock Keycloak JWKS in test environment OR run with Keycloak
   - Status: Not blockers for Phase 4.2

2. **Integration Tests Cleanup** - Low Priority
   - Some tests reference utility functions from other test files
   - Solution: Export utilities or consolidate test helpers
   - Status: Tests run successfully, just needs cleanup

### Optimization Opportunities (Phase 4.3+)
1. **CDN for Public Keys**: Cache JWKS responses
2. **Async Logging**: Move to non-blocking logger
3. **Connection Pooling**: MongoDB and HTTP clients (partially done)
4. **Request Coalescing**: Prevent duplicate KAS calls (Phase 4.2.2)

---

## 🎯 Recommended Approach

### Session Strategy

**Day 1: GCP KMS Setup**
1. Create GCP KMS resources (key rings, keys, service account)
2. Verify IAM permissions
3. Download service account credentials

**Days 2-3: GCP KMS Service Implementation**
1. Create GcpKmsService class
2. Write 10+ unit tests
3. Update key-management.ts with feature flag
4. Verify MockHSM fallback

**Days 4-5: GCP KMS Integration & Testing**
1. Update environment configuration
2. Run full test suite with KMS enabled
3. Performance benchmarks
4. Document setup procedures

**Days 6-7: Performance Optimization - Caching**
1. Deploy Redis instance
2. Create CacheManager service
3. Optimize federation service (parallel calls)
4. Test cache hit rates

**Days 8-9: Performance Optimization - Testing**
1. Optimize crypto operations
2. Run load tests
3. Measure performance metrics
4. Generate performance report

**Days 10-11: Security Hardening**
1. Add rate limiting
2. Add input validation
3. Enhance TLS configuration
4. Sanitize error messages

**Day 12: Security Audit & Documentation**
1. Run security scans
2. Verify compliance
3. Update security documentation
4. Final testing

### Best Practices

1. **Incremental Development**
   - Implement one feature at a time
   - Test after each feature
   - Commit after each task completion

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
   - Meaningful commit messages (follow existing pattern)
   - Logical commits (not "WIP")
   - Commit after each task completion

---

## 📁 Critical File Locations

### Configuration
- **Docker Compose**: `docker-compose.3kas.yml` (3-KAS environment)
- **Jest Config**: `kas/jest.config.js` (test configuration)
- **Environment**: `.env.example` (template for env vars)

### KAS Core
- **Main Server**: `kas/src/server.ts` (Express server with /rewrap)
- **Federation**: `kas/src/services/kas-federation.service.ts` (multi-KAS logic)
- **Key Management**: `kas/src/services/key-management.ts` (⚠️ TO BE REPLACED with GCP KMS)
- **mTLS Config**: `kas/src/services/mtls-config.ts` (certificate validation)

### Phase 4.1 Services (New)
- **Metadata Decryptor**: `kas/src/services/metadata-decryptor.ts`
- **Key Combiner**: `kas/src/services/key-combiner.ts`
- **Any-Of Routing**: `kas/src/services/kas-federation.service.ts` (routeAnyOf method)

### Testing
- **Unit Tests**: `kas/src/__tests__/*.test.ts` (137+ tests)
- **Integration**: `kas/tests/integration/federation.test.ts` (77 tests)
- **Performance**: `kas/tests/performance/federation-benchmark.test.ts` (10 tests)
- **Audit**: `kas/tests/integration/audit-trail.test.ts` (10 tests)

### Documentation
- **Phase 4.1 Summary**: Current session (not yet written)
- **Phase 3.5 Summary**: `kas/PHASE3.5-COMPLETION-SUMMARY.md`
- **Test Guide**: `kas/tests/README.md`
- **ACP-240 Requirements**: `kas/ACP240-KAS.md` (50 baseline requirements)
- **Gap Analysis**: `kas/acp240-gap-analysis.json`

### Infrastructure
- **Certificates**: `certs/kas-federation/` (CA + 3 KAS certs)
- **Cert Generator**: `kas/scripts/generate-test-certs.sh`
- **MongoDB Seed**: `kas/tests/fixtures/federation-seed.js`
- **GCP Credentials**: `credentials/gcp-service-account.json` (TO BE CREATED)

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
npm test -- src/__tests__/gcp-kms.test.ts
```

### GCP KMS Commands
```bash
# Verify KMS access
gcloud kms keys list --location=us-central1 --keyring=kas-usa --project=dive25

# Test decrypt
gcloud kms asymmetric-decrypt \
  --key=kas-usa-private-key \
  --keyring=kas-usa \
  --location=us-central1 \
  --ciphertext-file=test-ciphertext.bin \
  --output-file=test-plaintext.bin \
  --project=dive25

# View audit logs
gcloud logging read "resource.type=cloudkms_cryptokey" --limit=10 --project=dive25
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

# Redis
docker exec -it redis-kas-cache redis-cli INFO stats
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
5. **Cost**: More cost-effective for our request volume (~$0.03 per 10k operations)
6. **Multi-region**: Natural fit for 3-KAS architecture (us-central1, europe-west1, europe-west2)

### Why Redis for Caching?
1. **Performance**: Sub-millisecond latency
2. **TTL Support**: Native expiration for cache entries
3. **Atomic Operations**: Safe concurrent access
4. **Proven**: Battle-tested in production environments
5. **Distributed**: Rate limiting across multiple KAS instances

### Feature Flag Strategy
- `USE_GCP_KMS=true` in production
- `USE_GCP_KMS=false` in development (fallback to MockHSM)
- Allows testing both code paths
- Easy rollback if issues arise

---

## 📈 Expected Timeline

| Phase | Tasks | Duration | Cumulative |
|-------|-------|----------|------------|
| **Phase 4.2.1** | GCP KMS Integration | 4-5 days | Days 1-5 |
| **Phase 4.2.2** | Performance Optimization | 3-4 days | Days 6-9 |
| **Phase 4.2.3** | Security Hardening | 2-3 days | Days 10-12 |
| **Total** | **Phase 4.2 Complete** | **9-12 days** | **~2 weeks** |

**Assumptions**:
- 1 developer, full-time
- No major blockers
- GCP access available (project: dive25)
- Testing infrastructure operational

---

## 🎓 Success Metrics

### Quantitative
- ✅ **Test Pass Rate**: 95%+ (150+ tests passing)
- ✅ **ACP-240 Compliance**: 95%+ (48/50 requirements)
- ✅ **Performance**: p95 < 500ms for 3-KAS (measured)
- ✅ **Throughput**: 100 req/s sustained
- ✅ **Security**: 0 critical/high vulnerabilities
- ✅ **Code Coverage**: 85%+ line coverage

### Qualitative
- ✅ **Production Ready**: GCP KMS integrated
- ✅ **Well Documented**: Setup guides complete
- ✅ **Maintainable**: Clean, tested, production code
- ✅ **Secure**: Rate limiting, input validation, TLS 1.3
- ✅ **Performant**: Caching, parallel ops, optimized crypto

---

## 🚀 How to Use This Prompt

**For a new AI assistant starting this session**:

1. **Read this entire document first** to understand context
2. **Check environment status**: Run health checks
3. **Verify GCP access**: `gcloud auth list` and `gcloud projects list`
4. **Review current test results**: `cd kas && npm test`
5. **Start with Phase 4.2.1**: GCP KMS setup and integration
6. **Follow the phased approach**: Complete 4.2.1 → 4.2.2 → 4.2.3
7. **Test after each task**: Ensure no regressions
8. **Commit after each major task**: Meaningful commit messages
9. **Update documentation**: Keep docs in sync with code

**Critical Reminders**:
- ✅ **Use GCP KMS** (not AWS KMS) - DIVE V3 uses GCP project `dive25`
- ✅ **Feature flag first** (USE_GCP_KMS) - allows dev/prod flexibility
- ✅ **Test with KMS enabled** - all 137+ tests must pass
- ✅ **Measure performance** - verify targets met with load tests
- ✅ **Document as you go** - setup guides, troubleshooting

**If Stuck**:
- Consult `kas/PHASE3.5-COMPLETION-SUMMARY.md` for Phase 3.5 context
- Check `kas/tests/README.md` for testing troubleshooting
- Review `kas/acp240-gap-analysis.json` for requirements
- Search Git history for similar implementations
- Check GCP documentation: https://cloud.google.com/kms/docs

---

## 📞 References

### Primary Documentation
- **ACP-240 SUPP-5(A) AMDT 1**: NATO KAS specification
- **RFC 9449**: DPoP (Demonstrable Proof-of-Possession)
- **Google Cloud KMS**: https://cloud.google.com/kms/docs
- **GCP IAM**: https://cloud.google.com/iam/docs

### Internal Docs
- `kas/PHASE3.5-COMPLETION-SUMMARY.md` - Phase 3.5 summary
- `kas/ACP240-KAS.md` - 50 baseline requirements
- `kas/acp240-gap-analysis.json` - Compliance gap analysis
- `kas/tests/README.md` - Testing guide
- `docs/PHASE-4-SESSION-PROMPT.md` - Original Phase 4 plan

### Git Commits (Phase 4.1)
- `ca39e46d` - Phase 4.1.1: EncryptedMetadata decryption
- `96e2aac4` - Phase 4.1.2: Key split recombination (All-Of)
- `778b782b` - Phase 4.1.3: Any-Of routing with failover

### GCP Resources
- **Project**: dive25
- **Regions**: us-central1 (USA), europe-west1 (FRA), europe-west2 (GBR)
- **Service Account**: dive-v3-kas@dive25.iam.gserviceaccount.com (to be created)

---

## 📋 Pre-Session Checklist

Before starting Phase 4.2, verify:

- [ ] GCP project `dive25` access confirmed
- [ ] `gcloud` CLI installed and authenticated
- [ ] Docker Compose environment healthy (3-KAS)
- [ ] All Phase 4.1 tests passing (56 unit + 9 integration)
- [ ] Git status clean (Phase 4.1 commits pushed)
- [ ] Node.js 20+ and npm installed
- [ ] Redis 7+ available (will be added in Phase 4.2.2)
- [ ] Test environment operational

### GCP Prerequisites
```bash
# Verify GCP access
gcloud auth list
gcloud projects list | grep dive25
gcloud config set project dive25

# Verify KMS API enabled
gcloud services list --enabled | grep cloudkms

# Enable if not already enabled
gcloud services enable cloudkms.googleapis.com
```

---

**Document Version**: 1.0  
**Created**: 2026-01-31  
**Author**: AI Agent (Phase 4.1 completion)  
**Status**: Ready for Phase 4.2 implementation  
**GCP Project**: dive25  
**Environment**: 3-KAS operational (USA, FRA, GBR)  
**Current Compliance**: 89% (45/50 requirements)  
**Target Compliance**: 95% (48/50 requirements)

✅ **READY TO PROCEED WITH PHASE 4.2 - GCP KMS INTEGRATION**
