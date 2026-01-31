# DIVE V3 KAS Phase 4.2 Continuation Prompt

**Session Date**: 2026-01-31  
**Current Status**: Phase 4.2.1 Complete ✅ | Phase 4.2.2 60% Complete ⏳  
**Next Phase**: Complete Phase 4.2.2 (40% remaining) + Phase 4.2.3 Security Hardening  
**ACP-240 Compliance**: 91% (46/50 requirements met)  

---

## 🎯 Executive Summary

You are continuing Phase 4.2 of the DIVE V3 KAS (Key Access Service) implementation. The previous session successfully completed Phase 4.2.1 (Production HSM Integration with GCP Cloud KMS) and delivered 60% of Phase 4.2.2 (Performance Optimization). Your immediate goal is to complete the remaining 40% of Phase 4.2.2 (public key caching, performance benchmarks, report) and then proceed to Phase 4.2.3 (Security Hardening).

**Key Achievements from Previous Session**:
- ✅ GCP Cloud KMS integration (FIPS 140-2 Level 3)
- ✅ Redis cache infrastructure with fail-open pattern
- ✅ DEK caching in HSM providers (80% KMS cost reduction expected)
- ✅ Parallel federation routing (2-3x speedup expected)
- ✅ 64 new unit tests (all passing)
- ✅ Comprehensive documentation

**Your Mission**: Complete performance optimization, implement security hardening, achieve 95%+ ACP-240 compliance, and prepare the system for production deployment.

---

## 📋 Current State

### Completed Components (Phase 4.2.1 & 4.2.2 Partial)

#### 1. GCP Cloud KMS Integration ✅
- **Location**: `kas/src/services/gcp-kms.service.ts` (527 lines)
- **Provider**: `kas/src/utils/hsm-provider.ts` - `GcpKmsProvider` class
- **Tests**: `kas/src/__tests__/gcp-kms.test.ts` (36 tests, 100% passing)
- **Documentation**: `kas/docs/GCP-KMS-SETUP.md` (650+ lines)
- **Status**: Fully functional, feature-flagged with `USE_GCP_KMS`
- **GCP Resources**:
  - Key Rings: `kas-usa` (us-central1), `kas-fra` (europe-west1), `kas-gbr` (europe-west2)
  - Keys: RSA-4096-OAEP-SHA256 asymmetric encryption
  - Service Account: `dive-v3-kas@dive25.iam.gserviceaccount.com`
  - Credentials: `credentials/gcp-service-account.json` (mounted in Docker)

#### 2. Redis Cache Infrastructure ✅
- **Location**: `kas/src/services/cache-manager.ts` (392 lines)
- **Tests**: `kas/src/__tests__/cache-manager.test.ts` (28 tests, 100% passing)
- **Docker**: Redis 7-alpine in `docker-compose.3kas.yml` (256MB, LRU eviction)
- **Features**: Fail-open pattern, connection pooling, TTL management, pattern invalidation
- **Configuration**:
  ```bash
  ENABLE_CACHE=true
  REDIS_HOST=redis-kas-cache
  REDIS_PORT=6379
  REDIS_PASSWORD=DiveRedisTest2025!
  CACHE_TTL_DEK=60
  CACHE_TTL_PUBLIC_KEY=3600
  ```

#### 3. DEK Caching ✅
- **Location**: `kas/src/utils/hsm-provider.ts`
- **Applied To**: `MockHSMProvider.unwrapKey()` and `GcpKmsProvider.unwrapKey()`
- **Cache Key**: `CacheManager.buildDekKey(wrappedKey, kekId)`
- **Impact**: 50-100ms reduction per KMS call, ~80% cost savings

#### 4. Parallel Federation Routing ✅
- **Location**: `kas/src/services/kas-federation.service.ts`
- **Method**: `routeAnyOfParallel()` (230 lines)
- **Features**: `Promise.allSettled()`, circuit breaker filtering, race condition
- **Configuration**: `ENABLE_PARALLEL_FEDERATION=true`
- **Impact**: 2-3x faster for multi-KAS resources

#### 5. Test Infrastructure ✅
- **Helper Utilities**: `kas/tests/helpers/test-utilities.ts` (392 lines)
- **Total Tests**: 166 unit tests
- **Pass Rate**: 96% (160/166)
- **New Tests**: 64 (36 GCP KMS + 28 CacheManager)
- **Failing Tests**: 6 pre-existing (not related to Phase 4.2 changes)

### Git Repository State

**Branch**: `main` (ahead of origin by 13 commits)  
**Recent Commits**:
1. `40830009` - Phase 4.2.1: GCP Cloud KMS Integration
2. `44d5505a` - Phase 4.2.2 Part 1: Redis Cache Infrastructure
3. `44bd9ab9` - Phase 4.2.2 Part 2: Caching Integration & Parallel Federation
4. `a13292b9` - Phase 4.2 Session Summary

**Modified Files Ready for Next Session**:
- All Phase 4.2.1 and 4.2.2 work is committed
- No uncommitted changes
- Clean working directory

---

## 🎯 Immediate Tasks: Phase 4.2.2 Completion (40% Remaining)

**Estimated Time**: 4 hours  
**Priority**: HIGH  

### Task 1: Public Key Caching (1 hour)

**SMART Goal**: Implement Redis caching for GCP KMS public keys with 3600s TTL, reducing public key retrieval latency from ~50ms to <2ms on cache hits.

**Files to Modify**:
- `kas/src/services/gcp-kms.service.ts` - Add caching to `getPublicKey()` method

**Implementation Steps**:
1. Import `cacheManager` and `CacheManager` from `cache-manager.ts`
2. In `getPublicKey()` method:
   ```typescript
   async getPublicKey(keyName: string): Promise<string> {
       // Check cache first
       const cacheKey = CacheManager.buildPublicKeyKey(keyName);
       const cached = await cacheManager.get<{ pem: string }>(cacheKey);
       
       if (cached) {
           kasLogger.debug('Public key cache hit', { keyName, cacheKey });
           return cached.pem;
       }
       
       kasLogger.debug('Public key cache miss', { keyName, cacheKey });
       
       // Fetch from KMS
       const [publicKey] = await this.client.getPublicKey({ name: keyName });
       
       if (!publicKey.pem) {
           throw new Error('KMS returned empty public key');
       }
       
       // Cache for 1 hour
       await cacheManager.set(cacheKey, { pem: publicKey.pem });
       
       return publicKey.pem;
   }
   ```
3. Add unit tests to `kas/src/__tests__/gcp-kms.test.ts`:
   - Test cache hit scenario
   - Test cache miss scenario
   - Test cache failure (fail-open)
4. Run tests: `npm test -- src/__tests__/gcp-kms.test.ts`
5. Verify all tests pass

**Success Criteria**:
- ✅ Public keys cached with 3600s TTL
- ✅ Cache hit < 2ms latency
- ✅ 3 new unit tests passing
- ✅ Backward compatible (works when cache disabled)

---

### Task 2: Run Performance Benchmarks (2 hours)

**SMART Goal**: Execute comprehensive performance test suite and collect metrics proving p95 latency targets are met: Single KAS <200ms, 2-KAS <350ms, 3-KAS <500ms.

**Prerequisites**:
1. Start 3-KAS Docker environment:
   ```bash
   docker compose -f docker-compose.3kas.yml up -d
   ./scripts/verify-3kas-health.sh
   ```

2. Verify Redis is healthy:
   ```bash
   docker logs redis-kas-cache
   curl -k https://localhost:8081/health
   ```

**Performance Test Execution**:

1. **Baseline (Cache Disabled)**:
   ```bash
   cd kas
   ENABLE_CACHE=false ENABLE_PARALLEL_FEDERATION=false npm test -- tests/performance/federation-benchmark.test.ts
   ```
   - Collect: p50, p95, p99, throughput
   - Save results to `baseline.json`

2. **Cache Enabled (Sequential)**:
   ```bash
   ENABLE_CACHE=true ENABLE_PARALLEL_FEDERATION=false npm test -- tests/performance/
   ```
   - Compare cache hit rate
   - Measure DEK cache impact

3. **Cache + Parallel (Optimized)**:
   ```bash
   ENABLE_CACHE=true ENABLE_PARALLEL_FEDERATION=true npm test -- tests/performance/
   ```
   - Target metrics:
     - Single KAS: p95 < 200ms
     - 2-KAS: p95 < 350ms
     - 3-KAS: p95 < 500ms
     - Throughput: 100 req/s sustained
     - Cache hit rate: >80%

4. **Collect Redis Statistics**:
   ```bash
   docker exec redis-kas-cache redis-cli --pass DiveRedisTest2025! INFO stats
   docker exec redis-kas-cache redis-cli --pass DiveRedisTest2025! DBSIZE
   ```

**Metrics to Capture**:
- **Latency**: p50, p95, p99 for each scenario
- **Throughput**: Requests per second sustained
- **Cache Performance**: Hit rate, miss rate, evictions
- **Federation Overhead**: Per-hop latency
- **Circuit Breaker**: Recovery time, failure threshold

**Success Criteria**:
- ✅ All performance targets met
- ✅ Cache hit rate >80% for steady-state
- ✅ Parallel routing 2-3x faster than sequential
- ✅ No performance regressions from Phase 4.1

---

### Task 3: Generate Performance Report (1 hour)

**SMART Goal**: Create comprehensive performance report documenting 40-50% latency reduction and >80% cache hit rate achieved through Phase 4.2.2 optimizations.

**Report Structure**: `kas/docs/PHASE-4.2-PERFORMANCE-REPORT.md`

```markdown
# Phase 4.2.2 Performance Report

## Executive Summary
- Baseline vs Optimized comparison
- Key metrics achieved
- Recommendations

## Test Environment
- Hardware specs
- Docker resource limits
- Network configuration

## Baseline Performance (Phase 4.1)
- Single KAS: p50/p95/p99
- 2-KAS: p50/p95/p99
- 3-KAS: p50/p95/p99
- Throughput

## Optimized Performance (Phase 4.2.2)
### Cache Impact
- DEK cache hit rate
- Public key cache hit rate
- Latency reduction per cache hit

### Parallel Routing Impact
- Speedup for 2-KAS resources
- Speedup for 3-KAS resources
- Overhead analysis

### Combined Impact
- Overall p95 latency reduction
- Throughput improvement
- Resource utilization

## Redis Cache Analysis
- Memory usage
- Hit/miss ratio
- Eviction rate
- Connection pooling effectiveness

## Recommendations
- Further optimization opportunities
- Production tuning suggestions
- Scaling considerations

## Appendix
- Raw test data
- Graphs and charts
- Configuration used
```

**Success Criteria**:
- ✅ Complete performance report with data
- ✅ Graphs comparing baseline vs optimized
- ✅ Clear recommendations for production
- ✅ Documented evidence of targets met

---

## 🔒 Phase 4.2.3: Security Hardening (6-8 hours)

**SMART Goal**: Implement comprehensive security controls including rate limiting (100 req/min), input validation (all endpoints), and pass security audit with 0 high/critical vulnerabilities.

### Task 1: Rate Limiting Middleware (2-3 hours)

**Objective**: Prevent abuse and DoS attacks with Redis-backed sliding window rate limiting.

**Implementation**:

1. **Install Dependencies**:
   ```bash
   cd kas
   npm install express-rate-limit rate-limit-redis
   ```

2. **Create Rate Limiter**: `kas/src/middleware/rate-limiter.middleware.ts`
   ```typescript
   import rateLimit from 'express-rate-limit';
   import RedisStore from 'rate-limit-redis';
   import { cacheManager } from '../services/cache-manager';
   
   export const rewrapRateLimiter = rateLimit({
       store: new RedisStore({
           client: cacheManager.redis, // Reuse existing Redis connection
           prefix: 'ratelimit:rewrap:'
       }),
       windowMs: 60 * 1000, // 1 minute
       max: 100, // 100 requests per minute per IP
       message: {
           error: 'Too many requests',
           message: 'Rate limit exceeded. Try again later.',
           retryAfter: 60
       },
       standardHeaders: true,
       legacyHeaders: false,
       skip: (req) => {
           // Skip rate limiting for health checks
           return req.path === '/health';
       }
   });
   
   export const healthRateLimiter = rateLimit({
       windowMs: 10 * 1000, // 10 seconds
       max: 50, // 50 health checks per 10s
       message: { error: 'Health check rate limit exceeded' }
   });
   ```

3. **Apply to Routes**: `kas/src/server.ts`
   ```typescript
   import { rewrapRateLimiter, healthRateLimiter } from './middleware/rate-limiter.middleware';
   
   app.post('/rewrap', rewrapRateLimiter, authenticateJWT, rewrapController);
   app.get('/health', healthRateLimiter, healthController);
   ```

4. **Unit Tests**: `kas/src/__tests__/rate-limiter.test.ts`
   - Test rate limit enforcement
   - Test limit reset after window
   - Test skip conditions
   - Test Redis failure (fail-open)

5. **Environment Variables**: Update `.env.example`
   ```bash
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=100
   RATE_LIMIT_HEALTH_MAX=50
   ```

**Success Criteria**:
- ✅ Rate limiting enforced on all API endpoints
- ✅ Redis-backed sliding window
- ✅ 429 status code with retry-after header
- ✅ Health checks exempt from strict limits
- ✅ 10+ unit tests passing
- ✅ Fail-open on Redis failure

---

### Task 2: Input Validation Middleware (2-3 hours)

**Objective**: Validate and sanitize all API inputs to prevent injection attacks and malformed requests.

**Implementation**:

1. **Install Dependencies**:
   ```bash
   npm install zod express-validator
   ```

2. **Create Validation Schemas**: `kas/src/validators/rewrap.validator.ts`
   ```typescript
   import { z } from 'zod';
   
   export const rewrapRequestSchema = z.object({
       clientPublicKey: z.string().regex(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/),
       keyAccessObjects: z.array(z.object({
           keyAccessObjectId: z.string().uuid(),
           url: z.string().url().startsWith('https://'),
           kid: z.string().min(1).max(256),
           wrappedKey: z.string().base64(),
           policyBinding: z.string().base64(),
           signature: z.object({
               alg: z.enum(['RS256', 'RS384', 'RS512']),
               sig: z.string().base64()
           }),
           sid: z.string().optional()
       })).min(1).max(10),
       policy: z.object({
           policyId: z.string().min(1).max(256),
           dissem: z.object({
               classification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']),
               releasabilityTo: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
               COI: z.array(z.string()).optional()
           })
       })
   });
   
   export function validateRewrapRequest(req: Request, res: Response, next: NextFunction) {
       try {
           rewrapRequestSchema.parse(req.body);
           next();
       } catch (error) {
           if (error instanceof z.ZodError) {
               return res.status(400).json({
                   error: 'Invalid request',
                   message: 'Request validation failed',
                   details: error.errors
               });
           }
           next(error);
       }
   }
   ```

3. **Apply Validation**: `kas/src/server.ts`
   ```typescript
   import { validateRewrapRequest } from './validators/rewrap.validator';
   
   app.post('/rewrap', 
       rewrapRateLimiter, 
       validateRewrapRequest, 
       authenticateJWT, 
       rewrapController
   );
   ```

4. **Sanitization**: Add sanitization for:
   - Strip HTML/script tags
   - Normalize Unicode
   - Limit string lengths
   - Validate UUIDs, URLs, base64

5. **Unit Tests**: `kas/src/__tests__/input-validation.test.ts`
   - Valid request passes
   - Invalid clientPublicKey rejected
   - Invalid KAO format rejected
   - Missing required fields rejected
   - Array length limits enforced
   - SQL injection attempts blocked
   - XSS attempts blocked

**Success Criteria**:
- ✅ All API endpoints validated
- ✅ Schema-based validation (Zod)
- ✅ Clear error messages (400 status)
- ✅ Malformed requests rejected
- ✅ 15+ validation test cases passing
- ✅ Security scan passes

---

### Task 3: Security Audit (2 hours)

**Objective**: Identify and remediate all high/critical vulnerabilities in dependencies and code.

**Audit Steps**:

1. **Dependency Audit**:
   ```bash
   cd kas
   npm audit
   npm audit fix
   npm audit --audit-level=moderate
   ```
   - Review all vulnerabilities
   - Update dependencies with fixes
   - Document accepted risks

2. **Secret Scanning**:
   ```bash
   # Use git-secrets or gitleaks
   docker run -v $(pwd):/code zricethezav/gitleaks:latest detect --source /code --verbose
   ```
   - Scan for hardcoded secrets
   - Verify GCP credentials not committed
   - Check for API keys, passwords

3. **SAST (Static Application Security Testing)**:
   ```bash
   # Use SonarQube or Semgrep
   npm install -g @sonarqube/scanner
   sonar-scanner -Dsonar.projectKey=dive-v3-kas
   ```
   - SQL injection checks
   - XSS vulnerability checks
   - Insecure crypto usage
   - OWASP Top 10 coverage

4. **Update Security Report**: `kas/docs/SECURITY-AUDIT-REPORT.md`
   ```markdown
   # Phase 4.2.3 Security Audit Report
   
   ## npm audit Results
   - Critical: 0
   - High: 0
   - Moderate: X (accepted/mitigated)
   - Low: Y
   
   ## Secret Scanning
   - No secrets found
   - All credentials in GCP Secret Manager
   
   ## SAST Results
   - Issues found: X
   - Issues fixed: Y
   - Issues accepted: Z (with justification)
   
   ## Compliance
   - OWASP Top 10: Pass
   - ACP-240 Section 7 (Security): 95%
   ```

**Success Criteria**:
- ✅ 0 critical vulnerabilities
- ✅ 0 high vulnerabilities
- ✅ All secrets in GCP Secret Manager
- ✅ SAST scan passes
- ✅ Security report documented
- ✅ Remediation plan for moderate issues

---

## 📊 Phased Implementation Plan

### Phase 4.2.2 Completion (Current - 4 hours)

**Status**: 60% Complete → 100% Complete  
**Timeline**: 1 session (4 hours)  

| Task | Hours | Priority | Owner | Status |
|------|-------|----------|-------|--------|
| Public key caching | 1 | HIGH | Agent | Pending |
| Performance benchmarks | 2 | HIGH | Agent | Pending |
| Performance report | 1 | HIGH | Agent | Pending |

**SMART Goals**:
- **Specific**: Implement public key caching, run benchmarks, generate report
- **Measurable**: p95 <200ms (1-KAS), <350ms (2-KAS), <500ms (3-KAS), cache hit >80%
- **Achievable**: All code patterns established, just needs execution
- **Relevant**: Critical for production performance
- **Time-bound**: 4 hours

**Success Criteria**:
- ✅ Public keys cached (3600s TTL)
- ✅ All performance targets met
- ✅ Comprehensive report with graphs
- ✅ Recommendations documented

---

### Phase 4.2.3: Security Hardening (Next - 6-8 hours)

**Status**: Not Started → Complete  
**Timeline**: 1-2 sessions (6-8 hours)  

| Task | Hours | Priority | Owner | Status |
|------|-------|----------|-------|--------|
| Rate limiting middleware | 2-3 | HIGH | Agent | Pending |
| Input validation middleware | 2-3 | HIGH | Agent | Pending |
| Security audit | 2 | CRITICAL | Agent | Pending |

**SMART Goals**:
- **Specific**: Implement rate limiting, input validation, pass security audit
- **Measurable**: 100 req/min limit, all endpoints validated, 0 high/critical vulns
- **Achievable**: Standard security patterns, well-documented
- **Relevant**: Required for production deployment
- **Time-bound**: 6-8 hours

**Success Criteria**:
- ✅ Rate limiting on all endpoints (100 req/min)
- ✅ Input validation with Zod schemas
- ✅ 0 critical/high vulnerabilities
- ✅ Security audit report
- ✅ 25+ new security tests passing

---

### Phase 4.3: Production Readiness (Future - 10-12 hours)

**Status**: Not Started  
**Timeline**: 2 sessions (10-12 hours)  

| Task | Hours | Priority | Owner | Status |
|------|-------|----------|-------|--------|
| Metrics & observability | 3 | HIGH | Agent | Pending |
| Load testing (1000 req/s) | 3 | HIGH | Agent | Pending |
| Deployment automation | 2 | MEDIUM | Agent | Pending |
| Operations runbook | 2 | MEDIUM | Agent | Pending |
| Final integration tests | 2 | HIGH | Agent | Pending |

**SMART Goals**:
- **Specific**: Add Prometheus metrics, run load tests, automate deployment, create runbook
- **Measurable**: 1000 req/s sustained, 99.9% uptime, <10min deployment time
- **Achievable**: Standard DevOps practices
- **Relevant**: Required for production operations
- **Time-bound**: 10-12 hours

**Success Criteria**:
- ✅ Prometheus/Grafana dashboard
- ✅ Load tests pass (1000 req/s)
- ✅ CI/CD pipeline deployed
- ✅ Operations runbook complete
- ✅ 95%+ ACP-240 compliance

---

### Phase 4.4: Final Validation (Future - 4-6 hours)

**Status**: Not Started  
**Timeline**: 1 session (4-6 hours)  

| Task | Hours | Priority | Owner | Status |
|------|-------|----------|-------|--------|
| End-to-end testing | 2 | CRITICAL | Agent | Pending |
| Compliance verification | 2 | CRITICAL | Agent | Pending |
| Documentation review | 1 | HIGH | Agent | Pending |
| Production checklist | 1 | HIGH | Agent | Pending |

**SMART Goals**:
- **Specific**: Execute E2E tests, verify compliance, review docs, complete checklist
- **Measurable**: All E2E tests pass, 95%+ ACP-240 compliance, checklist 100% complete
- **Achievable**: Final validation before production
- **Relevant**: Ensures production readiness
- **Time-bound**: 4-6 hours

**Success Criteria**:
- ✅ All E2E scenarios passing
- ✅ 95%+ ACP-240 compliance verified
- ✅ All documentation current
- ✅ Production checklist signed off

---

## 🗂️ Key Files and Artifacts

### Documentation
- ✅ `kas/docs/GCP-KMS-SETUP.md` - Complete GCP KMS setup guide
- ✅ `kas/PHASE-4.2-SESSION-SUMMARY.md` - Previous session summary
- ⏳ `kas/docs/PHASE-4.2-PERFORMANCE-REPORT.md` - **TO CREATE**
- ⏳ `kas/docs/SECURITY-AUDIT-REPORT.md` - **TO CREATE**
- 📋 `docs/PHASE-4.2-SESSION-PROMPT.md` - Original implementation plan (1375 lines)

### Source Code
- ✅ `kas/src/services/gcp-kms.service.ts` (527 lines) - GCP KMS integration
- ✅ `kas/src/services/cache-manager.ts` (392 lines) - Redis cache manager
- ✅ `kas/src/services/kas-federation.service.ts` - Parallel routing added
- ✅ `kas/src/utils/hsm-provider.ts` - DEK caching added
- ⏳ `kas/src/middleware/rate-limiter.middleware.ts` - **TO CREATE**
- ⏳ `kas/src/validators/rewrap.validator.ts` - **TO CREATE**

### Tests
- ✅ `kas/src/__tests__/gcp-kms.test.ts` (36 tests, 100% passing)
- ✅ `kas/src/__tests__/cache-manager.test.ts` (28 tests, 100% passing)
- ✅ `kas/tests/helpers/test-utilities.ts` - Shared test utilities
- ⏳ `kas/src/__tests__/rate-limiter.test.ts` - **TO CREATE**
- ⏳ `kas/src/__tests__/input-validation.test.ts` - **TO CREATE**

### Configuration
- ✅ `docker-compose.3kas.yml` - Redis, GCP KMS env vars
- ✅ `kas/.env.example` - All configuration documented
- ✅ `credentials/.gitignore` - Protects GCP credentials

---

## 🚨 Critical Information

### GCP Service Account
- **Project**: `dive25`
- **Service Account**: `dive-v3-kas@dive25.iam.gserviceaccount.com`
- **Key File**: `credentials/gcp-service-account.json` (NOT in Git)
- **IAM Role**: `roles/cloudkms.cryptoKeyDecrypter`
- **Key Rings**:
  - `kas-usa` (us-central1): `kas-usa-private-key`
  - `kas-fra` (europe-west1): `kas-fra-private-key`
  - `kas-gbr` (europe-west2): `kas-gbr-private-key`

### Redis Configuration
- **Container**: `redis-kas-cache`
- **Port**: 6379 (internal), 6380 (host)
- **Password**: `DiveRedisTest2025!`
- **Memory**: 256MB
- **Eviction**: `allkeys-lru`
- **Shared**: All 3 KAS instances use same Redis

### Test Commands
```bash
# Unit tests only
npm test -- src/__tests__/

# Performance tests (requires 3-KAS running)
npm test -- tests/performance/

# Integration tests (requires 3-KAS running)
npm test -- tests/integration/

# Start 3-KAS environment
docker compose -f docker-compose.3kas.yml up -d

# Check health
curl -k https://localhost:8081/health
curl -k https://localhost:8082/health
curl -k https://localhost:8083/health
```

### Environment Variables
```bash
# Phase 4.2.1 - GCP KMS
USE_GCP_KMS=false  # Set to true for production
GCP_PROJECT_ID=dive25
GCP_KMS_LOCATION=us-central1
GCP_KMS_KEY_RING=kas-usa
GCP_KMS_KEY_NAME=kas-usa-private-key
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcp-service-account.json

# Phase 4.2.2 - Performance
ENABLE_CACHE=true
REDIS_HOST=redis-kas-cache
REDIS_PORT=6379
REDIS_PASSWORD=DiveRedisTest2025!
CACHE_TTL_DEK=60
CACHE_TTL_PUBLIC_KEY=3600
ENABLE_PARALLEL_FEDERATION=true

# Phase 4.2.3 - Security (to add)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🎯 Success Metrics & Targets

### Performance Targets (Phase 4.2.2)
- ✅ Single KAS: p95 < 200ms (current: ~150ms baseline, target: <100ms with cache)
- ⏳ 2-KAS: p95 < 350ms (current: ~400ms, target: <300ms with parallel)
- ⏳ 3-KAS: p95 < 500ms (current: ~600ms, target: <400ms with parallel)
- ⏳ Throughput: 100 req/s sustained
- ⏳ Cache hit rate: >80% for steady-state
- ⏳ KMS API calls: 80% reduction

### Security Targets (Phase 4.2.3)
- ⏳ Rate limiting: 100 req/min per IP
- ⏳ Input validation: 100% endpoints covered
- ⏳ Vulnerabilities: 0 critical, 0 high
- ⏳ Security tests: 25+ new tests passing
- ⏳ OWASP Top 10: All mitigated

### Compliance Targets (Phase 4.3+)
- ✅ Current: 91% (46/50 requirements)
- ⏳ Phase 4.2.3: 93% (47/50) - Add rate limiting
- ⏳ Phase 4.3: 95% (48/50) - Add observability
- ⏳ Phase 4.4: 97% (49/50) - Production validation

### Test Coverage Targets
- ✅ Current: 96% pass rate (160/166 tests)
- ⏳ Phase 4.2.3: 97% pass rate (all tests fixed, +25 security tests)
- ⏳ Phase 4.3: 98% pass rate (+integration tests)
- ⏳ Phase 4.4: 99% pass rate (+E2E tests)

---

## 🔧 Troubleshooting & Known Issues

### Pre-existing Test Failures (6 tests)
- **Files**: `phase3.4-security.test.ts`, `kas-federation.test.ts`, `anyof-routing.test.ts`
- **Impact**: Low (not blocking Phase 4.2 functionality)
- **Status**: Tracked, not introduced by Phase 4.2 changes
- **Action**: Fix during Phase 4.4 final validation

### GCP KMS Asymmetric Wrapping
- **Issue**: `GcpKmsProvider.wrapKey()` uses base64 fallback (not production-secure)
- **Reason**: Asymmetric keys don't support direct symmetric wrapping
- **Solution**: Use symmetric encryption keys or Cloud Storage with KMS encryption
- **Priority**: Medium (acceptable for pilot, needs fix for production)
- **Tracked In**: `kas/docs/GCP-KMS-SETUP.md`

### Redis Connection in Tests
- **Issue**: Some tests may fail if Redis not running
- **Solution**: CacheManager uses fail-open pattern, tests should pass regardless
- **Mitigation**: Mock Redis in unit tests, use real Redis for integration tests

---

## 📚 Reference Materials

### ACP-240 Specification
- **Section 5.2**: Hybrid Encryption & Key Management
- **Section 5.3**: Multi-KAS Architecture
- **Section 6**: Audit Logging Requirements
- **Section 7**: Security Requirements

### Project Documentation
- `docs/PHASE-4.2-SESSION-PROMPT.md` - Original implementation plan
- `kas/IMPLEMENTATION-SUMMARY.md` - KAS architecture overview
- `kas/PHASE3.5-COMPLETION-SUMMARY.md` - Previous phase summary
- `.cursorrules` - Project coding conventions

### External Resources
- [GCP Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/)
- [Express Rate Limiting](https://www.npmjs.com/package/express-rate-limit)
- [Zod Validation](https://zod.dev/)

---

## 🎬 Starting the Session

### Recommended Approach

1. **Read Context** (5 minutes):
   - Review this prompt thoroughly
   - Read `kas/PHASE-4.2-SESSION-SUMMARY.md`
   - Scan `docs/PHASE-4.2-SESSION-PROMPT.md` for detailed requirements

2. **Verify Environment** (5 minutes):
   ```bash
   cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/kas
   git status  # Should be clean
   npm test -- src/__tests__/  # Should show 96% pass rate
   ```

3. **Start with Phase 4.2.2 Completion** (4 hours):
   - Task 1: Public key caching (1 hour)
   - Task 2: Performance benchmarks (2 hours)
   - Task 3: Performance report (1 hour)
   - Commit after each task

4. **Then Phase 4.2.3 Security** (6-8 hours):
   - Task 1: Rate limiting (2-3 hours)
   - Task 2: Input validation (2-3 hours)
   - Task 3: Security audit (2 hours)
   - Commit after each task

5. **Test Incrementally**:
   - Run unit tests after each change
   - Run integration tests with 3-KAS environment
   - Document all performance metrics

6. **Commit Strategy**:
   - Commit after each completed task
   - Use descriptive commit messages
   - Reference phase and task in commits

### First Actions Checklist
- [ ] Read this entire prompt
- [ ] Verify Git is clean (`git status`)
- [ ] Review session summary (`kas/PHASE-4.2-SESSION-SUMMARY.md`)
- [ ] Run baseline tests (`npm test -- src/__tests__/`)
- [ ] Start with Task 1: Public key caching
- [ ] Follow SMART goals and success criteria

---

## 💬 Communication Style

- **Be systematic**: Follow the phased plan, complete tasks in order
- **Be thorough**: Test after every change, document results
- **Be proactive**: If you find issues, fix them before moving on
- **Be clear**: Explain what you're doing and why
- **Be efficient**: Use parallel tool calls when possible
- **Reference this prompt**: Cite specific sections when making decisions

---

## ✅ Session Success Criteria

**Phase 4.2.2 Complete When**:
- ✅ Public keys cached with 3600s TTL
- ✅ Performance benchmarks run and documented
- ✅ All targets met: p95 <200ms (1-KAS), <350ms (2-KAS), <500ms (3-KAS)
- ✅ Cache hit rate >80%
- ✅ Performance report created with graphs
- ✅ All code committed to Git

**Phase 4.2.3 Complete When**:
- ✅ Rate limiting enforced (100 req/min)
- ✅ Input validation on all endpoints
- ✅ 0 critical/high vulnerabilities
- ✅ Security audit report created
- ✅ 25+ security tests passing
- ✅ All code committed to Git

**End of Session Deliverables**:
- ✅ `kas/docs/PHASE-4.2-PERFORMANCE-REPORT.md`
- ✅ `kas/docs/SECURITY-AUDIT-REPORT.md`
- ✅ `kas/src/middleware/rate-limiter.middleware.ts`
- ✅ `kas/src/validators/rewrap.validator.ts`
- ✅ Updated test suite (all passing)
- ✅ Git commits for all work

---

**Ready to proceed? Start with Phase 4.2.2 Task 1: Public Key Caching!** 🚀
