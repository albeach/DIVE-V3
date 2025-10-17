# Phase 3 Implementation Prompt

**FOR USE IN NEW CHAT SESSION**  
**Date Created:** 2025-10-16  
**Prerequisites:** Phase 0 ✅ + Phase 1 ✅ + Phase 2 ✅ Complete

---

## CONTEXT: Phase 0, Phase 1, and Phase 2 Completion

### Phase 0: Observability Baseline ✅ (COMPLETE)

**Branch:** `main` (merged from `feature/phase0-hardening-observability`)  
**Completion Date:** 2025-10-14

**Delivered:**
- Prometheus metrics service (`backend/src/services/metrics.service.ts`)
- Service Level Objectives (`docs/SLO.md`)
- Security baseline (Next.js 15.4.6 → 15.5.4, CRITICAL CVE fixes)
- IdP selector improvements (Industry flag, direct login enhancements)
- Documentation (7 comprehensive guides, 2,795 lines)

**Key Files:**
- `backend/src/services/metrics.service.ts` - Prometheus metrics
- `docs/SLO.md` - 5 SLOs defined (availability, latency, error rate, validation success, decision time)
- `docs/PHASE0-COMPLETION-SUMMARY.md` - Complete status

---

### Phase 1: Automated Security Validation ✅ (COMPLETE)

**Branch:** `main` (merged from `feature/phase1-validation-services`)  
**Completion Date:** 2025-10-15

**Delivered:**
1. **TLS Validation Service** (`backend/src/services/idp-validation.service.ts`, 450 lines)
   - Version ≥1.2 enforcement, cipher strength, certificate validation
   - Scoring: TLS 1.3=15pts, TLS 1.2=12pts, <1.2=0pts (fail)

2. **Crypto Algorithm Validator** (in idp-validation.service.ts, 200 lines)
   - OIDC JWKS validation (RS256, RS512, ES256, ES512, PS256, PS512)
   - SAML signature validation (SHA-256+ required)
   - Deny-list: MD5, SHA-1 (strict mode), HS1, RS1, 'none'
   - Scoring: SHA-256+=25pts, SHA-1=10pts (warn), MD5=0pts (fail)

3. **SAML Metadata Parser** (`backend/src/services/saml-metadata-parser.service.ts`, 310 lines)
   - XML validation, Entity ID extraction, SSO/SLO endpoints
   - X.509 certificate parsing, expiry detection

4. **OIDC Discovery Validator** (`backend/src/services/oidc-discovery.service.ts`, 300 lines)
   - .well-known/openid-configuration validation
   - JWKS reachability, MFA support detection (ACR values)

5. **MFA Detection Service** (`backend/src/services/mfa-detection.service.ts`, 200 lines)
   - ACR/AMR claims (OIDC), AuthnContextClassRef (SAML)
   - Scoring: Policy doc=20pts, ACR hints=15pts, none=0pts

6. **ValidationResultsPanel** (`frontend/src/components/admin/validation-results-panel.tsx`, 360 lines)
   - Color-coded status indicators (✅⚠️❌)
   - Preliminary score with tier badges (0-70 points)

**Test Status:** 100% passing (validated in idp-validation.test.ts)

**Key Files:**
- `backend/src/services/idp-validation.service.ts` - TLS/crypto validation
- `backend/src/services/saml-metadata-parser.service.ts` - SAML parsing
- `backend/src/services/oidc-discovery.service.ts` - OIDC discovery
- `backend/src/services/mfa-detection.service.ts` - MFA detection
- `backend/src/types/validation.types.ts` - Type definitions
- `backend/src/__tests__/idp-validation.test.ts` - 100% test coverage
- `docs/PHASE1-COMPLETE.md` - Phase 1 summary
- `docs/PHASE1-100-PERCENT-TESTS-PASSING.md` - Testing methodology

---

### Phase 2: Comprehensive Risk Scoring & Compliance Automation ✅ (COMPLETE)

**Branch:** `main` (merged from `feature/phase2-risk-scoring-compliance`)  
**Completion Date:** 2025-10-16  
**Merge Commit:** 903f0a4

**Delivered:**
1. **Comprehensive Risk Scoring Service** (`backend/src/services/risk-scoring.service.ts`, 650 lines)
   - 100-point comprehensive assessment (vs 70-point preliminary from Phase 1)
   - **Technical Security (40pts):** TLS (15) + Cryptography (25) from Phase 1
   - **Authentication Strength (30pts):** MFA enforcement (20) + Identity Assurance Level (10)
   - **Operational Maturity (20pts):** Uptime SLA (5) + Incident Response (5) + Security Patching (5) + Support (5)
   - **Compliance & Governance (10pts):** NATO Certification (5) + Audit Logging (3) + Data Residency (2)
   - Risk levels: Minimal (85-100), Low (70-84), Medium (50-69), High (<50)
   - **Test Coverage:** 96.95% (33/33 tests passing)

2. **Compliance Validation Service** (`backend/src/services/compliance-validation.service.ts`, 450 lines)
   - **ACP-240:** Policy-based access control, ABAC support, audit logging
   - **STANAG 4774:** Security labeling capability
   - **STANAG 4778:** Cryptographic binding support
   - **NIST 800-63-3:** Digital identity guidelines (IAL/AAL/FAL)
   - Automated gap analysis with recommendations

3. **Enhanced Approval Workflow** (`backend/src/services/idp-approval.service.ts`, +350 lines)
   - **Auto-approve:** Minimal risk (85+ points) → Immediate approval
   - **Fast-track:** Low risk (70-84 points) → 2hr SLA
   - **Standard review:** Medium risk (50-69 points) → 24hr SLA
   - **Auto-reject:** High risk (<50 points) → Immediate rejection
   - SLA tracking: `updateSLAStatus()`, `getSubmissionsBySLAStatus()`, `getFastTrackSubmissions()`

4. **Frontend UI Components** (5 new components, 896 lines)
   - `risk-score-badge.tsx` - Gold/Silver/Bronze/Fail tier visualization
   - `risk-breakdown.tsx` - 4-category breakdown with progress bars
   - `compliance-status-card.tsx` - ACP-240, STANAG, NIST status with evidence/gaps
   - `sla-countdown.tsx` - Real-time countdown with color-coded urgency
   - `risk-factor-analysis.tsx` - Detailed 11-factor analysis table
   - Integrated into `admin/approvals/page.tsx`

**Test Status:** 486/486 tests passing (100%)  
**Coverage:** 96.95% on risk-scoring.service.ts

**Key Files:**
- `backend/src/services/risk-scoring.service.ts` - Risk scoring engine
- `backend/src/services/compliance-validation.service.ts` - Compliance automation
- `backend/src/types/risk-scoring.types.ts` - Type definitions (400 lines)
- `backend/src/__tests__/risk-scoring.test.ts` - Comprehensive tests (33 tests)
- `frontend/src/components/admin/risk-*.tsx` - UI components
- `docs/PHASE2-COMPLETION-SUMMARY.md` - Phase 2 summary
- `PHASE2-UI-DEBUGGING-GUIDE.md` - UI troubleshooting guide
- `scripts/test-phase2-ui.sh` - UI testing script

---

## PHASE 3 OBJECTIVE

**Goal:** Implement **Production Deployment Hardening, Performance Optimization, and Analytics Dashboard** to prepare DIVE V3 for production rollout.

**Business Impact:**
- **Production Readiness:** Security hardening, error handling, monitoring
- **Performance:** Sub-200ms authorization decisions, caching optimization
- **Analytics:** Real-time dashboards for security posture and risk metrics
- **Operational Excellence:** Health checks, graceful degradation, circuit breakers

**Scope:** Production-grade hardening (moving from pilot to production)

**Duration:** 3-4 weeks  
**Exit Criteria:** Production deployment successful, performance targets met, analytics operational

---

## DELIVERABLES

### 1. Production Security Hardening (5 days)

**Rate Limiting** (`backend/src/middleware/rate-limit.middleware.ts`, NEW, ~200 lines)

**Purpose:** Protect against DoS attacks and abuse

**Implementation:**
```typescript
import rateLimit from 'express-rate-limit';

// Different limits for different endpoint types
export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Stricter for auth endpoints
    skipSuccessfulRequests: true, // Only count failures
});

export const uploadRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 uploads per hour
});
```

**Apply to routes:**
- `/api/auth/*` - 5 req/15min (auth endpoints)
- `/api/resources/*` - 100 req/15min (general API)
- `/api/admin/*` - 50 req/15min (admin endpoints)
- `/api/upload` - 20 req/hour (file uploads)

**Test:** `rate-limit.middleware.test.ts` (10 tests)

---

**Input Validation & Sanitization** (`backend/src/middleware/validation.middleware.ts`, ENHANCE, ~150 lines)

**Add:**
- Request body size limits (10MB max)
- SQL injection prevention (though using MongoDB)
- XSS prevention in user inputs
- Path traversal prevention in file operations
- Regex DoS prevention

**Example:**
```typescript
import { body, validationResult } from 'express-validator';

export const validateIdPCreation = [
    body('alias')
        .trim()
        .isLength({ min: 3, max: 50 })
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Alias must be lowercase alphanumeric with hyphens'),
    body('displayName')
        .trim()
        .isLength({ min: 1, max: 100 })
        .escape(),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .escape(),
    // ... more validations
];
```

**Test:** `validation.middleware.test.ts` (15 tests)

---

**Security Headers** (`backend/src/middleware/security-headers.middleware.ts`, NEW, ~100 lines)

**Add HTTP security headers:**
```typescript
import helmet from 'helmet';

export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    frameguard: {
        action: 'deny',
    },
    noSniff: true,
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },
});
```

**Test:** Verify headers in responses

---

### 2. Performance Optimization (4 days)

**OPA Decision Caching Enhancement** (`backend/src/services/authz-cache.service.ts`, NEW, ~300 lines)

**Current:** Simple 60s TTL cache in authz.middleware  
**Enhanced:** Intelligent caching with invalidation

**Features:**
- Cache by subject + resource + action
- Configurable TTL based on classification (SECRET=30s, UNCLASSIFIED=300s)
- Manual cache invalidation on policy updates
- Cache statistics and hit rate monitoring
- LRU eviction strategy

**Example:**
```typescript
interface CacheKey {
    subject: string;
    resource: string;
    action: string;
}

interface CacheEntry {
    decision: IOPADecision;
    cachedAt: Date;
    ttl: number;
}

class AuthzCacheService {
    private cache: Map<string, CacheEntry>;
    private hitCount: number = 0;
    private missCount: number = 0;
    
    getCachedDecision(key: CacheKey): IOPADecision | null {
        // Check cache, validate TTL, return decision
    }
    
    cacheDecision(key: CacheKey, decision: IOPADecision, classification: string): void {
        // Determine TTL based on classification
        // Store with expiry
    }
    
    invalidateForResource(resourceId: string): void {
        // Remove all cache entries for a resource
    }
    
    getStats(): { hitRate: number, size: number } {
        // Return cache performance metrics
    }
}
```

**Test:** `authz-cache.service.test.ts` (20 tests)

---

**Database Query Optimization** (`backend/src/services/*.ts`, OPTIMIZE)

**Add indexes:**
```typescript
// In MongoDB initialization:
await db.collection('idp_submissions').createIndexes([
    { key: { status: 1, slaDeadline: 1 } }, // For SLA queries
    { key: { 'comprehensiveRiskScore.tier': 1 } }, // For tier filtering
    { key: { fastTrack: 1, slaDeadline: 1 } }, // For fast-track queue
    { key: { submittedAt: -1 } }, // For recent submissions
]);

await db.collection('audit_logs').createIndexes([
    { key: { timestamp: -1 } }, // Time-series queries
    { key: { acp240EventType: 1, timestamp: -1 } }, // Event type filtering
    { key: { subject: 1, timestamp: -1 } }, // User activity queries
    { key: { outcome: 1, timestamp: -1 } }, // Violation queries
]);

await db.collection('resources').createIndexes([
    { key: { resourceId: 1 }, unique: true },
    { key: { 'ztdf.policy.securityLabel.classification': 1 } },
    { key: { 'ztdf.policy.securityLabel.releasabilityTo': 1 } },
    { key: { createdAt: -1 } },
]);
```

**Add query optimization script:** `backend/src/scripts/optimize-database.ts`

**Test:** Verify query performance with `explain()`

---

**Response Compression** (`backend/src/middleware/compression.middleware.ts`, NEW)

**Add gzip compression:**
```typescript
import compression from 'compression';

export const compressionMiddleware = compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 6, // Balance between speed and compression ratio
});
```

**Expected:** 60-80% reduction in response sizes

---

### 3. Analytics Dashboard (5 days)

**Metrics Aggregation Service** (`backend/src/services/analytics.service.ts`, NEW, ~500 lines)

**Purpose:** Real-time analytics for security posture and operational metrics

**Endpoints:**
```typescript
// GET /api/admin/analytics/risk-distribution
// Returns: Distribution of IdP submissions by risk tier
{
    gold: 15,    // Auto-approved
    silver: 35,  // Fast-track
    bronze: 40,  // Standard review
    fail: 10     // Rejected
}

// GET /api/admin/analytics/compliance-trends
// Returns: Compliance scores over time
{
    dates: ['2025-10-01', '2025-10-02', ...],
    acp240: [85, 87, 90, ...],
    stanag4774: [70, 75, 80, ...],
    nist80063: [60, 65, 70, ...]
}

// GET /api/admin/analytics/sla-compliance
// Returns: SLA performance metrics
{
    fastTrackCompliance: 98.5,  // % within 2hr SLA
    standardCompliance: 95.2,   // % within 24hr SLA
    averageReviewTime: 1.2,     // hours
    exceededCount: 3
}

// GET /api/admin/analytics/authorization-metrics
// Returns: Authorization decision metrics
{
    totalDecisions: 10000,
    allowRate: 92.5,
    denyRate: 7.5,
    averageLatency: 45,  // ms
    cacheHitRate: 85.3
}

// GET /api/admin/analytics/security-posture
// Returns: Overall security health
{
    averageRiskScore: 78.5,
    complianceRate: 87.3,
    mfaAdoptionRate: 92.0,
    tls13AdoptionRate: 65.0
}
```

**Implementation:**
- Aggregate data from `idp_submissions`, `audit_logs`, metrics
- Cache results (5-minute TTL)
- Support date range filtering
- Export to CSV/JSON

**Test:** `analytics.service.test.ts` (25 tests)

---

**Analytics Dashboard UI** (`frontend/src/app/admin/analytics/page.tsx`, NEW, ~400 lines)

**Components:**

**A. Risk Distribution Chart**
```tsx
<PieChart 
    data={[
        { name: 'Gold', value: 15, color: '#FFD700' },
        { name: 'Silver', value: 35, color: '#C0C0C0' },
        { name: 'Bronze', value: 40, color: '#CD7F32' },
        { name: 'Fail', value: 10, color: '#DC2626' }
    ]}
/>
```

**B. Compliance Trends Line Chart**
```tsx
<LineChart
    data={complianceTrends}
    lines={['ACP-240', 'STANAG 4774', 'NIST 800-63']}
    xAxis="date"
    yAxis="score"
/>
```

**C. SLA Performance Metrics**
```tsx
<MetricsCard
    title="SLA Compliance"
    metrics={[
        { label: 'Fast-Track', value: '98.5%', target: '95%', status: 'good' },
        { label: 'Standard', value: '95.2%', target: '95%', status: 'good' },
        { label: 'Avg Review Time', value: '1.2hr', target: '<2hr', status: 'good' }
    ]}
/>
```

**D. Authorization Metrics**
```tsx
<StatsGrid
    stats={[
        { label: 'Total Decisions', value: '10,000', change: '+12%' },
        { label: 'Allow Rate', value: '92.5%', change: '+2%' },
        { label: 'Avg Latency', value: '45ms', change: '-5ms' },
        { label: 'Cache Hit Rate', value: '85.3%', change: '+3%' }
    ]}
/>
```

**Libraries:** Use `recharts` or `chart.js` for visualization

**Test:** Manual QA testing (10 scenarios)

---

### 4. Health Checks & Monitoring (2 days)

**Health Check Service** (`backend/src/services/health.service.ts`, NEW, ~250 lines)

**Endpoints:**
```typescript
// GET /health (public, no auth)
// Basic health check for load balancers
{
    status: 'healthy' | 'degraded' | 'unhealthy',
    timestamp: '2025-10-16T12:00:00.000Z',
    uptime: 86400 // seconds
}

// GET /health/detailed (admin auth required)
// Comprehensive health status
{
    status: 'healthy',
    timestamp: '2025-10-16T12:00:00.000Z',
    services: {
        mongodb: { status: 'up', responseTime: 5 },
        keycloak: { status: 'up', responseTime: 120 },
        opa: { status: 'up', responseTime: 3 },
        kas: { status: 'up', responseTime: 15 }
    },
    metrics: {
        activeIdPs: 4,
        pendingApprovals: 2,
        cacheSizeDecisions: 1250,
        cacheSizeJWKS: 4
    },
    memory: {
        used: 256,  // MB
        total: 512,
        percentage: 50
    }
}

// GET /health/ready (Kubernetes readiness probe)
// Returns 200 if ready to accept traffic
{
    ready: true,
    checks: {
        mongodb: true,
        opa: true,
        keycloak: true
    }
}

// GET /health/live (Kubernetes liveness probe)
// Returns 200 if process is alive
{
    alive: true
}
```

**Check dependencies:**
- MongoDB: Can connect and query
- OPA: Can reach decision endpoint
- Keycloak: Can fetch JWKS
- KAS (if deployed): Can reach key endpoint

**Test:** `health.service.test.ts` (15 tests)

---

**Circuit Breaker Pattern** (`backend/src/utils/circuit-breaker.ts`, NEW, ~200 lines)

**Purpose:** Prevent cascading failures when external services fail

**Implementation:**
```typescript
enum CircuitState {
    CLOSED,   // Normal operation
    OPEN,     // Failing, reject requests
    HALF_OPEN // Testing if service recovered
}

class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: Date | null = null;
    
    constructor(
        private threshold: number = 5,     // Failures before opening
        private timeout: number = 60000,   // Time before retry (ms)
        private successThreshold: number = 2 // Successes to close
    ) {}
    
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - this.lastFailureTime! >= this.timeout) {
                this.state = CircuitState.HALF_OPEN;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    private onSuccess(): void {
        this.failureCount = 0;
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
            }
        }
    }
    
    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = new Date();
        if (this.failureCount >= this.threshold) {
            this.state = CircuitState.OPEN;
        }
    }
}

// Apply to external service calls:
const opaCircuitBreaker = new CircuitBreaker(5, 60000, 2);

export async function callOPAWithCircuitBreaker(input: IOPAInput): Promise<IOPADecision> {
    return opaCircuitBreaker.execute(() => callOPA(input));
}
```

**Test:** `circuit-breaker.test.ts` (12 tests)

---

### 5. Performance Testing & Optimization (3 days)

**Load Testing** (`backend/src/__tests__/performance/load.test.ts`, NEW, ~300 lines)

**Test scenarios:**
```typescript
describe('Performance - Load Testing', () => {
    it('should handle 100 concurrent authorization requests', async () => {
        const requests = Array.from({ length: 100 }, () =>
            authorizeResource(randomUser(), randomResource())
        );
        
        const start = Date.now();
        await Promise.all(requests);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(5000); // 100 requests in <5s
    });
    
    it('should maintain p95 latency <200ms under load', async () => {
        const latencies: number[] = [];
        
        for (let i = 0; i < 1000; i++) {
            const start = Date.now();
            await authorizeResource(testUser, testResource);
            latencies.push(Date.now() - start);
        }
        
        const p95 = percentile(latencies, 95);
        expect(p95).toBeLessThan(200);
    });
    
    it('should handle burst traffic (1000 req/s for 10s)', async () => {
        // Simulate burst traffic
    });
});
```

**Metrics to track:**
- p50, p95, p99 latency
- Throughput (requests/second)
- Error rate under load
- Cache hit rate
- Memory usage
- CPU usage

**Tools:** Use `autocannon` or `k6` for load testing

---

**Query Optimization Report** (`backend/performance-report.md`, NEW)

**Analyze slow queries:**
- MongoDB query explain plans
- OPA policy evaluation time
- JWKS fetch time
- Database connection pool usage

**Generate report:**
```bash
npm run analyze-performance

# Output:
# ============================================
# Performance Analysis Report
# ============================================
# 
# Slow Queries (>100ms):
# - idp_submissions.find({status: 'pending'}) - 145ms
#   → Add index on status field
# 
# OPA Policy Evaluation:
# - Average: 12ms
# - p95: 25ms
# - p99: 45ms
# 
# Cache Performance:
# - Hit rate: 85.3%
# - Miss rate: 14.7%
# - Eviction rate: 2.1%
```

---

### 6. Graceful Degradation (2 days)

**Fallback Strategies** (Enhance existing services)

**When OPA fails:**
```typescript
// In authz.middleware.ts
try {
    decision = await callOPAWithCircuitBreaker(opaInput);
} catch (error) {
    if (circuitBreakerOpen) {
        // Fallback: Use cached decision if available
        const cached = await getCachedDecision(cacheKey);
        if (cached && cached.age < 300000) { // 5 minutes
            logger.warn('OPA unavailable, using cached decision', {
                resourceId,
                cacheAge: cached.age
            });
            return cached.decision;
        }
        
        // Ultimate fallback: DENY (fail-closed)
        logger.error('OPA unavailable and no cache, denying access', {
            resourceId
        });
        return { allow: false, reason: 'Authorization service unavailable' };
    }
}
```

**When MongoDB fails:**
```typescript
// Return cached data or graceful error
if (mongoDBDown) {
    return {
        success: false,
        error: 'Database temporarily unavailable',
        message: 'Service degraded - using cached data where available'
    };
}
```

**When Keycloak fails:**
```typescript
// Use cached JWKS for JWT validation
if (jwksCacheMiss && keycloakDown) {
    logger.warn('Keycloak unavailable, rejecting new tokens');
    // Still validate cached tokens
}
```

**Test:** `graceful-degradation.test.ts` (10 scenarios)

---

### 7. Comprehensive Integration Tests (3 days)

**End-to-End Test Suite** (`backend/src/__tests__/integration/phase3-e2e.test.ts`, NEW, ~600 lines)

**Test complete workflows:**

**A. Full IdP Lifecycle (Gold Tier)**
```typescript
it('should handle complete gold-tier IdP lifecycle', async () => {
    // 1. Create IdP with perfect score
    const submission = await createIdP({
        alias: 'test-gold-e2e',
        ...perfectConfig,
        operationalData: {
            uptimeSLA: '99.9%',
            incidentResponse: '24/7',
            securityPatching: '<30 days',
            supportContacts: ['noc@example.com', 'support@example.com']
        },
        complianceDocuments: {
            acp240Certificate: 'cert.pdf',
            mfaPolicy: 'mfa.pdf'
        }
    });
    
    // 2. Verify Phase 1 validation passed
    expect(submission.validationResults.tlsCheck.pass).toBe(true);
    expect(submission.preliminaryScore.total).toBeGreaterThan(60);
    
    // 3. Verify Phase 2 risk scoring
    expect(submission.comprehensiveRiskScore.total).toBeGreaterThanOrEqual(85);
    expect(submission.comprehensiveRiskScore.tier).toBe('gold');
    
    // 4. Verify auto-approval
    expect(submission.approvalDecision.action).toBe('auto-approve');
    expect(submission.status).toBe('approved');
    
    // 5. Verify IdP created in Keycloak
    const idp = await keycloakAdminService.getIdentityProvider('test-gold-e2e');
    expect(idp).toBeDefined();
    expect(idp.enabled).toBe(true);
    
    // 6. Verify metrics recorded
    const metrics = await metricsService.getMetrics();
    expect(metrics.autoApprovalCount).toBeGreaterThan(0);
});
```

**B. Fast-Track Workflow (Silver Tier)**
```typescript
it('should handle fast-track approval workflow', async () => {
    // Create silver-tier IdP
    // Verify it enters fast-track queue
    // Verify 2hr SLA set
    // Manually approve
    // Verify metrics
});
```

**C. Standard Review Workflow (Bronze Tier)**
```typescript
it('should handle standard review workflow', async () => {
    // Create bronze-tier IdP
    // Verify 24hr SLA
    // Test SLA status updates (within → approaching → exceeded)
    // Manually approve
});
```

**D. Auto-Rejection (Fail Tier)**
```typescript
it('should auto-reject high-risk IdP', async () => {
    // Create fail-tier IdP (TLS 1.0, no MFA, no ops data)
    // Verify auto-rejection
    // Verify IdP NOT created in Keycloak
    // Verify rejection reason includes recommendations
});
```

**E. SLA Monitoring**
```typescript
it('should update SLA status as deadline approaches', async () => {
    // Create submission with 2hr SLA
    // Mock time passage
    // Call updateSLAStatus()
    // Verify status: within → approaching → exceeded
});
```

**F. Performance Under Load**
```typescript
it('should maintain performance with 50 concurrent IdP creations', async () => {
    const submissions = Array.from({ length: 50 }, (_, i) => 
        createIdP({ alias: `load-test-${i}`, ...config })
    );
    
    const start = Date.now();
    await Promise.all(submissions);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(30000); // 50 submissions in <30s
});
```

**Target:** 30+ integration tests, all passing

---

### 8. Production Deployment Configuration (2 days)

**Production Environment Variables** (`backend/.env.production.example`, NEW)

```bash
# Production Configuration
NODE_ENV=production

# Strict Security Mode
VALIDATION_STRICT_MODE=true
ALLOW_SELF_SIGNED_CERTS=false
TLS_MIN_VERSION=1.3

# Compliance Requirements (Strict)
COMPLIANCE_STRICT_MODE=true
REQUIRE_ACP240_CERT=true
REQUIRE_MFA_POLICY_DOC=true

# Auto-Triage Thresholds (Stricter for production)
AUTO_APPROVE_THRESHOLD=90  # Higher bar
FAST_TRACK_THRESHOLD=75
AUTO_REJECT_THRESHOLD=55

# SLA (Stricter for production)
FAST_TRACK_SLA_HOURS=1
STANDARD_REVIEW_SLA_HOURS=12
DETAILED_REVIEW_SLA_HOURS=48

# Rate Limiting (Production)
API_RATE_LIMIT=50
AUTH_RATE_LIMIT=3
UPLOAD_RATE_LIMIT=10

# Performance
OPA_DECISION_CACHE_TTL=30  # 30s for SECRET+
JWKS_CACHE_TTL=1800        # 30min
DATABASE_POOL_SIZE=20

# Monitoring
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
ENABLE_ANALYTICS=true
LOG_LEVEL=info

# External Services (Production URLs)
KEYCLOAK_URL=https://keycloak.dive-v3.mil
OPA_URL=https://opa.dive-v3.mil
MONGODB_URL=mongodb://mongo-primary:27017,mongo-secondary:27017/dive-v3?replicaSet=rs0
KAS_URL=https://kas.dive-v3.mil
```

**Production Checklist:**
- [ ] All secrets in environment variables (no hardcoded values)
- [ ] TLS 1.3 enforced
- [ ] Self-signed certificates rejected
- [ ] Rate limiting enabled
- [ ] Circuit breakers configured
- [ ] Health checks enabled
- [ ] Monitoring enabled
- [ ] Error tracking (Sentry/similar) configured
- [ ] Log aggregation (ELK/similar) configured

---

**Docker Compose Production** (`docker-compose.prod.yml`, NEW)

**Add:**
- Multi-stage builds for smaller images
- Non-root users
- Read-only filesystems where possible
- Resource limits
- Health checks
- Restart policies

**Example:**
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    image: dive-v3-backend:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    user: "node:node"
```

---

### 9. Documentation Updates (2 days)

**A. Update Implementation Plan** (`docs/IMPLEMENTATION-PLAN.md`)

Add Phase 3 section:
```markdown
## Phase 3: Production Hardening & Analytics ✅

**Status:** Complete (2025-10-XX)  
**Duration:** 3 weeks  

**Delivered:**
- Production security hardening (rate limiting, validation, headers)
- Performance optimization (caching, indexing, compression)
- Analytics dashboard (risk distribution, compliance trends, SLA metrics)
- Health checks and monitoring (detailed status, K8s probes)
- Circuit breaker pattern for resilience
- Integration test suite (30+ E2E tests)
- Production deployment configuration

**Exit Criteria Met:** 8/8
- ✅ Rate limiting operational
- ✅ Performance targets met (p95 <200ms)
- ✅ Analytics dashboard functional
- ✅ Health checks passing
- ✅ Circuit breakers tested
- ✅ Integration tests 100% passing
- ✅ Production config complete
- ✅ Documentation updated
```

**B. Update CHANGELOG.md**

```markdown
## [Phase 3] - 2025-10-XX

### Added - Production Hardening & Analytics

**Security Hardening:**
- Rate limiting middleware (API: 100 req/15min, Auth: 5 req/15min, Upload: 20 req/hr)
- Enhanced input validation with express-validator
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Request body size limits
- XSS and injection prevention

**Performance Optimization:**
- Intelligent OPA decision caching (classification-based TTL)
- MongoDB query optimization (10+ indexes added)
- Response compression (gzip, 60-80% reduction)
- Database connection pooling optimized
- Cache statistics and monitoring

**Analytics Dashboard:**
- Risk distribution visualization (pie chart)
- Compliance trends over time (line chart)
- SLA compliance metrics (98.5% fast-track, 95.2% standard)
- Authorization decision metrics (allow rate, latency, cache hit rate)
- Security posture overview

**Monitoring & Health:**
- Detailed health check endpoint (/health/detailed)
- Kubernetes readiness probe (/health/ready)
- Kubernetes liveness probe (/health/live)
- Service dependency monitoring (MongoDB, OPA, Keycloak, KAS)
- Circuit breaker pattern for external services

**Integration Testing:**
- 30+ end-to-end test scenarios
- Complete IdP lifecycle tests (gold/silver/bronze/fail tiers)
- SLA monitoring simulation
- Load testing (100 concurrent requests)
- Performance benchmarks

**Production Configuration:**
- .env.production.example with production-grade settings
- Docker Compose production configuration
- Stricter thresholds and timeouts
- Resource limits and health checks
- Security-first defaults

### Changed
- authz.middleware.ts: Added circuit breaker for OPA calls
- All services: Added comprehensive error handling
- Database: Added 10+ indexes for performance
- Metrics service: Added cache statistics

### Performance
- Authorization latency: p95 <200ms (target met)
- Throughput: >100 req/s sustained
- Cache hit rate: >85%
- Database query time: <50ms average

### Security
- Rate limiting prevents DoS attacks
- Input validation prevents injection
- Security headers prevent XSS/clickjacking
- Circuit breakers prevent cascading failures
- All secrets externalized

### Documentation
- Implementation plan updated (Phase 3 section)
- CHANGELOG updated (Phase 3 entry)
- README updated (Phase 3 features)
- Performance benchmarking guide added
- Production deployment checklist added
```

**C. Update README.md**

Add Phase 3 features section:
```markdown
### 🔒 Production Security Hardening (Phase 3 - NEW!)

**Enterprise-grade security for production deployment:**

- **Rate Limiting**
  - API endpoints: 100 requests per 15 minutes
  - Authentication: 5 attempts per 15 minutes
  - File uploads: 20 per hour
  - IP-based throttling with Redis backend

- **Input Validation**
  - Request body size limits (10MB max)
  - SQL injection prevention
  - XSS prevention with input sanitization
  - Path traversal prevention
  - Regex DoS prevention

- **Security Headers**
  - Content Security Policy (CSP)
  - HTTP Strict Transport Security (HSTS)
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin

**Business Impact:**
- 99.9% uptime through circuit breakers
- Zero successful injection attacks
- DoS attack mitigation
- PCI/HIPAA compliance support

---

### ⚡ Performance Optimization (Phase 3 - NEW!)

**Sub-200ms authorization decisions at scale:**

- **Intelligent Caching**
  - Classification-based TTL (SECRET=30s, UNCLASSIFIED=300s)
  - Cache hit rate >85%
  - Manual invalidation on policy updates
  - LRU eviction strategy

- **Database Optimization**
  - 10+ indexes for hot queries
  - Query explain plan analysis
  - Connection pooling optimized
  - Aggregation pipeline optimization

- **Response Compression**
  - gzip compression (level 6)
  - 60-80% payload size reduction
  - Conditional compression based on content type

- **Load Testing Results**
  - 100 concurrent requests: <5s
  - 1000 sequential requests: p95 <200ms
  - Sustained throughput: >100 req/s
  - Memory usage: <512MB under load

---

### 📊 Analytics Dashboard (Phase 3 - NEW!)

**Real-time security posture and operational analytics:**

- **Risk Distribution**
  - Pie chart: Gold/Silver/Bronze/Fail tier distribution
  - Trend over time
  - Drill-down by tier

- **Compliance Trends**
  - Line chart: ACP-240, STANAG, NIST scores over time
  - Average compliance rate: 87.3%
  - Gap analysis with recommendations

- **SLA Performance**
  - Fast-track compliance: 98.5% (target: 95%)
  - Standard review compliance: 95.2% (target: 95%)
  - Average review time: 1.2hr (target: <2hr)
  - SLA exceeded count and alerts

- **Authorization Metrics**
  - Total decisions: 10,000+
  - Allow rate: 92.5%
  - Deny rate: 7.5%
  - Average latency: 45ms (p95: 185ms)
  - Cache hit rate: 85.3%

- **Security Posture**
  - Average risk score: 78.5/100
  - MFA adoption rate: 92%
  - TLS 1.3 adoption: 65%
  - Compliance rate: 87.3%

**Access:** http://localhost:3000/admin/analytics

---

### 🏥 Health Monitoring (Phase 3 - NEW!)

**Comprehensive health checks for production operations:**

- **Basic Health** (GET /health)
  - Status: healthy/degraded/unhealthy
  - Uptime tracking
  - Response time: <10ms

- **Detailed Health** (GET /health/detailed)
  - All service statuses (MongoDB, OPA, Keycloak, KAS)
  - Response times per service
  - Active connections
  - Cache sizes
  - Memory usage
  - Circuit breaker states

- **Readiness Probe** (GET /health/ready)
  - Kubernetes-compatible
  - Checks all dependencies ready
  - Returns 200 when ready to serve traffic

- **Liveness Probe** (GET /health/live)
  - Kubernetes-compatible
  - Simple process health check
  - Returns 200 if process alive

- **Circuit Breakers**
  - OPA: 5 failures → open, 60s timeout
  - Keycloak: 3 failures → open, 30s timeout
  - MongoDB: 5 failures → open, 60s timeout
  - Graceful degradation on circuit open

**Configuration:** See `backend/.env.production.example`
```

---

### 10. GitHub CI/CD Updates (1 day)

**Update `.github/workflows/phase2-ci.yml` → `.github/workflows/ci.yml`**

**Add Phase 3 jobs:**

```yaml
  performance-tests:
    name: Performance & Load Testing
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
      opa:
        image: openpolicyagent/opa:0.68.0-rootless
        ports:
          - 8181:8181
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: cd backend && npm ci
      
      - name: Run Performance Tests
        run: cd backend && npm run test:performance
      
      - name: Verify p95 Latency <200ms
        run: |
          cd backend
          # Extract p95 from test output and verify
      
      - name: Verify Cache Hit Rate >80%
        run: |
          cd backend
          # Check cache statistics

  integration-tests:
    name: End-to-End Integration Tests
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
      opa:
        image: openpolicyagent/opa:0.68.0-rootless
      keycloak:
        image: quay.io/keycloak/keycloak:23.0
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Integration Tests
        run: cd backend && npm run test:integration
      
      - name: Verify All E2E Scenarios Pass
        run: |
          cd backend
          npm test -- phase3-e2e.test.ts
  
  security-hardening:
    name: Security Hardening Verification
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Security Audit
        run: cd backend && npm audit --production --audit-level=critical
      
      - name: Verify Rate Limiting Configured
        run: |
          grep -q "rateLimit" backend/src/middleware/rate-limit.middleware.ts
      
      - name: Verify Security Headers
        run: |
          grep -q "helmet" backend/src/middleware/security-headers.middleware.ts
      
      - name: Check for Hardcoded Secrets
        run: |
          ! grep -r "password.*=.*['\"]" backend/src --include="*.ts" --exclude-dir=__tests__

  production-build:
    name: Production Build Verification
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Production Docker Image
        run: docker build -f backend/Dockerfile.prod -t dive-v3-backend:test .
      
      - name: Verify Image Size <500MB
        run: |
          SIZE=$(docker image inspect dive-v3-backend:test --format='{{.Size}}')
          if [ $SIZE -gt 524288000 ]; then
            echo "Image too large: $SIZE bytes"
            exit 1
          fi
```

---

## IMPLEMENTATION STRATEGY

### Week 1: Security & Performance Foundation
**Days 1-2:** Security hardening (rate limiting, validation, headers)  
**Days 3-4:** Performance optimization (caching, indexing, compression)  
**Day 5:** Testing and QA

### Week 2: Analytics & Monitoring
**Days 1-2:** Analytics service backend  
**Days 3-4:** Analytics dashboard frontend  
**Day 5:** Health checks and circuit breakers

### Week 3: Integration & Deployment
**Days 1-2:** End-to-end integration tests  
**Days 3-4:** Production configuration and deployment prep  
**Day 5:** Final QA and documentation

---

## REFERENCE MATERIALS

### Critical - Read First

**Phase 0 & 1 Documentation:**
1. `docs/PHASE0-COMPLETION-SUMMARY.md` - Observability baseline
2. `docs/PHASE1-COMPLETE.md` - Security validation summary
3. `docs/PHASE1-100-PERCENT-TESTS-PASSING.md` - Testing methodology
4. `backend/src/services/idp-validation.service.ts` - Validation patterns
5. `backend/src/__tests__/idp-validation.test.ts` - Test patterns

**Phase 2 Documentation:**
6. `docs/PHASE2-COMPLETION-SUMMARY.md` - Risk scoring summary
7. `backend/src/services/risk-scoring.service.ts` - Service patterns
8. `backend/src/__tests__/risk-scoring.test.ts` - Test patterns (96.95% coverage)
9. `backend/src/types/risk-scoring.types.ts` - Type definition style
10. `PHASE2-UI-DEBUGGING-GUIDE.md` - UI integration patterns

**Architecture & Patterns:**
11. `docs/SLO.md` - Service level objectives
12. `backend/src/middleware/authz.middleware.ts` - PEP pattern
13. `backend/src/services/metrics.service.ts` - Prometheus metrics

---

## SUCCESS CRITERIA (Phase 3 Exit)

### Code (100% Complete)
- [ ] Rate limiting middleware implemented and tested
- [ ] Input validation comprehensive
- [ ] Security headers configured
- [ ] Caching service implemented (intelligent TTL)
- [ ] Database indexes created (10+)
- [ ] Compression enabled
- [ ] Analytics service implemented
- [ ] Analytics dashboard UI complete
- [ ] Health check endpoints implemented
- [ ] Circuit breakers implemented
- [ ] All unit tests passing (>95% coverage)
- [ ] All integration tests passing (30+ scenarios)
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (no new warnings)

### Performance (100% Met)
- [ ] Authorization p95 latency <200ms
- [ ] Cache hit rate >85%
- [ ] Database queries <50ms average
- [ ] Throughput >100 req/s sustained
- [ ] Load testing passes (100 concurrent requests)

### Security (100% Met)
- [ ] Rate limiting tested and working
- [ ] No hardcoded secrets
- [ ] Security headers verified
- [ ] Input validation comprehensive
- [ ] Circuit breakers prevent cascading failures

### Testing (100% Met)
- [ ] All unit tests passing
- [ ] 30+ integration tests passing
- [ ] Performance tests passing
- [ ] Load tests passing
- [ ] Security tests passing
- [ ] No skipped tests
- [ ] Coverage >95% on new code

### Documentation (100% Complete)
- [ ] Implementation plan updated (Phase 3 section)
- [ ] CHANGELOG updated (Phase 3 entry)
- [ ] README updated (Phase 3 features)
- [ ] Performance benchmarking guide written
- [ ] Production deployment guide written
- [ ] API documentation updated

### CI/CD (100% Working)
- [ ] All CI/CD jobs passing
- [ ] Performance tests in pipeline
- [ ] Integration tests in pipeline
- [ ] Security checks in pipeline
- [ ] Production build verification
- [ ] Docker image size check

---

## TESTING REQUIREMENTS

### Unit Tests (Target: >95% coverage)

**Required test files:**
1. `rate-limit.middleware.test.ts` (10 tests)
2. `validation.middleware.test.ts` (15 tests)
3. `authz-cache.service.test.ts` (20 tests)
4. `analytics.service.test.ts` (25 tests)
5. `health.service.test.ts` (15 tests)
6. `circuit-breaker.test.ts` (12 tests)

**Total:** ~100 new tests

### Integration Tests (Target: 30+ scenarios)

**Required test file:**
`phase3-e2e.test.ts` (30+ tests)

**Scenarios:**
- Complete IdP lifecycle (all tiers)
- SLA monitoring and updates
- Performance under load
- Graceful degradation
- Circuit breaker behavior
- Cache invalidation
- Analytics data aggregation

### Performance Tests

**Required:**
- Load testing (100 concurrent requests <5s)
- Latency testing (p95 <200ms)
- Throughput testing (>100 req/s)
- Cache performance
- Database performance

### Manual QA Testing

**10 Test Scenarios:**
1. Submit IdP and verify auto-triage
2. Monitor SLA countdown in real-time
3. View analytics dashboard (all charts)
4. Test rate limiting (exceed limit, verify 429)
5. Test circuit breaker (stop OPA, verify fallback)
6. Check health endpoints (/health, /health/detailed, /health/ready, /health/live)
7. Load test with 50 concurrent IdP submissions
8. Verify compression (check response headers)
9. Test graceful degradation (stop MongoDB, verify error handling)
10. Review all security headers in browser DevTools

---

## CI/CD REQUIREMENTS

### Required CI/CD Jobs

**1. Backend Build & TypeScript**
- Install dependencies
- TypeScript type check
- Build compilation
- Verify artifacts

**2. Backend Tests**
- All unit tests
- All integration tests  
- Coverage verification (>95%)

**3. Performance Tests**
- Run load tests
- Verify p95 latency <200ms
- Verify cache hit rate >80%
- Verify throughput >100 req/s

**4. Security Checks**
- npm audit (0 critical CVEs)
- Rate limiting verification
- Security headers verification
- No hardcoded secrets check

**5. Production Build**
- Build Docker image
- Verify image size <500MB
- Security scan image

**Success Criteria:**
- ✅ All jobs passing (green)
- ✅ No test failures
- ✅ Performance targets met
- ✅ Security checks passed
- ✅ Build successful

---

## PROMPT FOR AI ASSISTANT (NEW CHAT)

```
**Role & Tone:**
Act as a senior DevOps engineer and performance optimization expert with expertise in Node.js, Express.js, production security hardening, performance testing, and analytics. Be implementation-focused, test-driven, and production-oriented.

**Objective:**
Implement Phase 3 of the DIVE V3 system: Production Deployment Hardening, Performance Optimization, and Analytics Dashboard to prepare for production rollout.

**Context - Phase 0, 1, and 2 Complete:**

Phase 0 established observability baseline (merged to main):
- ✅ Prometheus metrics service
- ✅ 5 Service Level Objectives (docs/SLO.md)
- ✅ Security audit baseline

Phase 1 implemented automated security validation (merged to main):
- ✅ 5 validation services: TLS, crypto, SAML, OIDC, MFA
- ✅ Preliminary risk scoring (0-70 points)
- ✅ ValidationResultsPanel UI component
- ✅ 100% test coverage
- ✅ Comprehensive documentation

Phase 2 implemented comprehensive risk scoring and compliance (merged to main):
- ✅ 100-point risk assessment engine
- ✅ Compliance validation (ACP-240, STANAG, NIST)
- ✅ Auto-triage workflow (auto-approve, fast-track, standard, reject)
- ✅ SLA tracking and management
- ✅ 5 frontend UI components (risk visualization)
- ✅ 486/486 tests passing (100%)
- ✅ 96.95% coverage on risk-scoring.service.ts

**Current State:**
- All Phase 0, 1, and 2 features operational in production
- 486 tests passing (100% pass rate)
- IdP approval workflow: Preliminary validation → Risk scoring → Auto-triage → SLA tracking
- Admin dashboard: Risk scores, compliance cards, SLA countdowns visible
- **Gap:** Need production hardening, performance optimization, analytics

**Your Task:**

Implement Phase 3 production hardening and analytics:

1. **Production Security Hardening** (5 days)
   - File: backend/src/middleware/rate-limit.middleware.ts (NEW, ~200 lines)
   - File: backend/src/middleware/security-headers.middleware.ts (NEW, ~100 lines)
   - Enhanced: backend/src/middleware/validation.middleware.ts (~150 lines)
   - Implement rate limiting (API, auth, upload endpoints)
   - Add security headers (CSP, HSTS, etc.)
   - Comprehensive input validation
   - Test: 40+ tests

2. **Performance Optimization** (4 days)
   - File: backend/src/services/authz-cache.service.ts (NEW, ~300 lines)
   - Enhanced: All database queries with indexes
   - File: backend/src/middleware/compression.middleware.ts (NEW)
   - Intelligent caching with classification-based TTL
   - Database query optimization (10+ indexes)
   - Response compression (gzip)
   - Test: 20+ tests, performance benchmarks

3. **Analytics Dashboard** (5 days)
   - File: backend/src/services/analytics.service.ts (NEW, ~500 lines)
   - File: frontend/src/app/admin/analytics/page.tsx (NEW, ~400 lines)
   - Risk distribution, compliance trends, SLA metrics, authz metrics
   - Real-time charts (pie, line, bar)
   - Export to CSV/JSON
   - Test: 25+ backend tests, manual QA for UI

4. **Health Checks & Monitoring** (2 days)
   - File: backend/src/services/health.service.ts (NEW, ~250 lines)
   - File: backend/src/utils/circuit-breaker.ts (NEW, ~200 lines)
   - Endpoints: /health, /health/detailed, /health/ready, /health/live
   - Circuit breakers for external services (OPA, Keycloak, MongoDB)
   - Graceful degradation patterns
   - Test: 27+ tests

5. **Integration Testing** (3 days)
   - File: backend/src/__tests__/integration/phase3-e2e.test.ts (NEW, ~600 lines)
   - 30+ end-to-end scenarios
   - Complete IdP lifecycle tests (all tiers)
   - Performance under load
   - Graceful degradation
   - Test: All integration tests passing

6. **Production Configuration** (2 days)
   - File: backend/.env.production.example (NEW)
   - File: docker-compose.prod.yml (NEW)
   - Production-grade settings
   - Docker multi-stage builds
   - Resource limits and health checks

7. **Documentation** (2 days)
   - Update: docs/IMPLEMENTATION-PLAN.md (Phase 3 section)
   - Update: CHANGELOG.md (Phase 3 entry)
   - Update: README.md (Phase 3 features)
   - New: docs/PERFORMANCE-BENCHMARKING-GUIDE.md
   - New: docs/PRODUCTION-DEPLOYMENT-GUIDE.md

8. **CI/CD Pipeline** (1 day)
   - Update: .github/workflows/ci.yml (add Phase 3 jobs)
   - Jobs: Performance tests, integration tests, security checks
   - All jobs must pass

**Technical Specifications:**

Reference Phase 1 & 2 patterns from:
- `backend/src/services/idp-validation.service.ts` (service structure)
- `backend/src/services/risk-scoring.service.ts` (service structure)
- `backend/src/__tests__/idp-validation.test.ts` (test patterns)
- `backend/src/__tests__/risk-scoring.test.ts` (test patterns, 100% passing)
- `backend/src/types/validation.types.ts` (type definition style)
- `backend/src/types/risk-scoring.types.ts` (type definition style)

Environment variables:
```bash
# Rate Limiting
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=5
UPLOAD_RATE_LIMIT_MAX=20

# Caching
OPA_CACHE_TTL_SECRET=30
OPA_CACHE_TTL_CONFIDENTIAL=60
OPA_CACHE_TTL_UNCLASSIFIED=300
CACHE_MAX_SIZE=10000

# Performance
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=6
DATABASE_POOL_SIZE=20

# Circuit Breakers
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000

# Analytics
ANALYTICS_CACHE_TTL=300
ENABLE_ANALYTICS=true

# Health Checks
ENABLE_HEALTH_CHECKS=true
HEALTH_CHECK_INTERVAL=30
```

**Success Criteria (Phase 3 Exit):**

Quantitative:
- ✅ All tests passing (target: 100%, minimum: 95%)
- ✅ Performance: p95 <200ms
- ✅ Throughput: >100 req/s
- ✅ Cache hit rate: >85%
- ✅ Coverage: >95% on new code
- ✅ Security: 0 critical CVEs
- ✅ All CI/CD jobs passing

Qualitative:
- ✅ Production-ready security posture
- ✅ Performance meets SLOs
- ✅ Analytics provide actionable insights
- ✅ Graceful degradation tested
- ✅ No regression in Phase 0/1/2 features

**Constraints:**

1. **Build on Phase 2 Foundation:**
   - Reuse existing services (don't rewrite)
   - Follow established patterns (service singletons, TypeScript strict)
   - Maintain backward compatibility

2. **Code Quality:**
   - TypeScript strict mode
   - 100% test pass rate (no shortcuts)
   - ESLint passing
   - Comprehensive JSDoc comments

3. **Testing:**
   - Every service must have >95% coverage
   - Integration tests for critical paths
   - Performance benchmarks documented
   - Load testing results validated
   - CI/CD must pass

4. **Documentation:**
   - Update all 3: CHANGELOG, README, implementation plan
   - Write performance benchmarking guide
   - Write production deployment guide
   - API documentation for new endpoints

**Reference Files to Read:**

Critical (read first):
1. docs/PHASE2-COMPLETION-SUMMARY.md - What was delivered in Phase 2
2. backend/src/services/risk-scoring.service.ts - Service patterns
3. backend/src/__tests__/risk-scoring.test.ts - Test patterns (100% passing)
4. docs/SLO.md - Service level objectives to meet
5. docs/IMPLEMENTATION-PLAN.md - Overall project plan

Supporting:
6. backend/src/middleware/authz.middleware.ts - Middleware patterns
7. backend/src/services/metrics.service.ts - Metrics patterns
8. backend/src/services/idp-approval.service.ts - Approval workflow
9. PHASE2-UI-DEBUGGING-GUIDE.md - Integration patterns

**Deliverables:**

1. Production security hardening (rate limiting, validation, headers)
2. Performance optimization (caching, indexing, compression)
3. Analytics service (5 endpoints, data aggregation)
4. Analytics dashboard (5 visualizations)
5. Health checks (4 endpoints)
6. Circuit breakers (3 services)
7. Integration tests (30+ scenarios)
8. Production configuration (.env.production, docker-compose.prod)
9. Updated documentation (CHANGELOG, README, guides)
10. CI/CD pipeline (all Phase 3 jobs)

**Timeline:**

Week 1: Security hardening + performance optimization
Week 2: Analytics dashboard + health monitoring
Week 3: Integration testing + production config + documentation

**Now proceed with implementation following Phase 2 best practices: comprehensive testing, no shortcuts, 100% pass rate, complete documentation. Ensure ALL tests pass before declaring complete.**
```

---

## FILE STRUCTURE TO CREATE

```
dive-v3/
├── backend/src/
│   ├── middleware/
│   │   ├── rate-limit.middleware.ts              (NEW - 200 lines)
│   │   ├── security-headers.middleware.ts        (NEW - 100 lines)
│   │   ├── compression.middleware.ts             (NEW - 50 lines)
│   │   └── validation.middleware.ts              (ENHANCE - +150 lines)
│   │
│   ├── services/
│   │   ├── authz-cache.service.ts                (NEW - 300 lines)
│   │   ├── analytics.service.ts                  (NEW - 500 lines)
│   │   └── health.service.ts                     (NEW - 250 lines)
│   │
│   ├── utils/
│   │   └── circuit-breaker.ts                    (NEW - 200 lines)
│   │
│   ├── scripts/
│   │   └── optimize-database.ts                  (NEW - 150 lines)
│   │
│   ├── __tests__/
│   │   ├── rate-limit.middleware.test.ts         (NEW - 200 lines)
│   │   ├── authz-cache.service.test.ts           (NEW - 400 lines)
│   │   ├── analytics.service.test.ts             (NEW - 500 lines)
│   │   ├── health.service.test.ts                (NEW - 300 lines)
│   │   ├── circuit-breaker.test.ts               (NEW - 250 lines)
│   │   └── integration/
│   │       └── phase3-e2e.test.ts                (NEW - 600 lines)
│   │
│   ├── .env.production.example                   (NEW - 150 lines)
│   └── Dockerfile.prod                           (NEW - 50 lines)
│
├── frontend/src/
│   ├── app/admin/analytics/
│   │   └── page.tsx                              (NEW - 400 lines)
│   │
│   └── components/analytics/
│       ├── risk-distribution-chart.tsx           (NEW - 150 lines)
│       ├── compliance-trends-chart.tsx           (NEW - 200 lines)
│       ├── sla-metrics-card.tsx                  (NEW - 150 lines)
│       └── authz-metrics-card.tsx                (NEW - 150 lines)
│
├── .github/workflows/
│   └── ci.yml                                    (UPDATE - add Phase 3 jobs)
│
├── docs/
│   ├── IMPLEMENTATION-PLAN.md                    (UPDATE - Phase 3 section)
│   ├── PERFORMANCE-BENCHMARKING-GUIDE.md         (NEW - 400 lines)
│   └── PRODUCTION-DEPLOYMENT-GUIDE.md            (NEW - 500 lines)
│
├── docker-compose.prod.yml                       (NEW - 200 lines)
├── CHANGELOG.md                                  (UPDATE - Phase 3 entry)
└── README.md                                     (UPDATE - Phase 3 features)
```

**Estimated Lines of Code:**
- Services: ~1,650 lines
- Tests: ~2,250 lines
- Frontend: ~1,050 lines
- Middleware: ~500 lines
- Documentation: ~1,500 lines
- **Total:** ~6,950 lines

---

## IMPORTANT NOTES

### Testing Standards (From Phase 2)
- **100% pass rate required** - No skipped tests without clear justification
- **>95% coverage** on all new code
- **Best practices:** Proper mocking (`jest.spyOn`), unique IDs, cleanup
- **Sequential execution:** Use `--runInBand` to prevent test interference
- **No shortcuts:** Fix root causes, not symptoms

### Code Quality (From Phase 2)
- **TypeScript strict mode** - Zero compilation errors
- **ESLint clean** - Zero warnings on new code
- **JSDoc comments** - All public functions documented
- **Type safety** - No `any` types without justification

### Documentation (From Phase 2)
- **Update all 3:** CHANGELOG, README, implementation plan
- **Write guides:** Performance benchmarking, production deployment
- **Code examples:** Include usage examples in documentation

### CI/CD (New for Phase 3)
- **All jobs must pass** before merge
- **Performance tests** must meet targets
- **Security checks** must be clean
- **Integration tests** must cover critical paths

---

**BEGIN IMPLEMENTATION USING PHASE 2 AS TEMPLATE. MAINTAIN QUALITY STANDARDS: COMPREHENSIVE TESTING, NO SHORTCUTS, 100% PASS RATE, COMPLETE DOCUMENTATION.**

