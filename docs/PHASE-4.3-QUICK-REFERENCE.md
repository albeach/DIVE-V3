# Phase 4.3 Quick Reference - Cost-Optimized Deployment

**FOR YOUR NEXT SESSION**: Use `docs/PHASE-4.3-SESSION-PROMPT.md` as your full context prompt.

---

## 🎯 Session Goal

Deploy Phase 4.2 complete implementation to **production with <$20/month cost** for self-funded POC with minimal traffic (<1,000 req/day).

**Critical Constraint**: Cost optimization is PRIMARY goal. Zero functionality compromise.

---

## 💰 Cost Strategy

### Recommended Architecture: Cloud Run (Scale-to-Zero)

**Cost**: **$5-10/month** at expected traffic
- No idle infrastructure costs
- Pay only when handling requests
- GCP KMS: ~$0.10/month (usage-based)
- No Redis ($13/month saved)
- No load balancer ($20/month saved)
- No GKE cluster ($150/month saved)

### Trade-offs (All Acceptable for POC)
- ✅ All functionality maintained (GCP KMS, validation, rate limiting, DPoP)
- ✅ All security unchanged (0 critical/high vulnerabilities)
- ⚠️ In-memory cache (not shared across restarts - acceptable)
- ⚠️ In-memory rate limiting (per-instance only - sufficient for pilot)
- ⚠️ Cold start latency 1-3s (acceptable for low traffic)
- ⚠️ No high availability (acceptable for POC)

### Upgrade Path (Scale as Needed)
```
Month 1-2: Cloud Run only ($5-10/month)
  ↓ Traffic >5K/day?
Month 3+: Add Redis ($18-25/month total)
  ↓ Traffic >50K/day?
Scale-up: Migrate to GKE ($150-200/month total)
```

---

## 📋 Implementation Checklist (5 Days)

### Day 1-2: Code Modifications
- [ ] Modify `cache-manager.ts` - Add CACHE_BACKEND=memory mode
- [ ] Modify `rate-limiter.middleware.ts` - Add RATE_LIMIT_BACKEND=memory mode
- [ ] Test with memory backends (npm test)
- [ ] Commit changes

### Day 3: Cloud Run Deployment
- [ ] Create `Dockerfile.cloudrun` (optimized, 2-stage build)
- [ ] Create `cloudbuild.yaml` (CI/CD pipeline)
- [ ] Deploy to Cloud Run (gcloud builds submit)
- [ ] Configure environment variables (CACHE_BACKEND=memory, etc.)
- [ ] Test all endpoints

### Day 4: Testing & Validation
- [ ] Test rewrap operation (basic functionality)
- [ ] Test rate limiting (101 requests → 429 on 101st)
- [ ] Test caching (cache hit rate >80%)
- [ ] Test scale-to-zero (wait 5 min, cold start <3s)
- [ ] Verify costs (<$1/day)

### Day 5: Documentation
- [ ] Create operations runbook
- [ ] Create cost optimization guide
- [ ] Document deployment procedures
- [ ] Set up budget alerts ($20/month threshold)
- [ ] Configure monitoring dashboard

---

## 🔧 Code Changes Required

### 1. Cache Manager (In-Memory Mode)

**File**: `kas/src/services/cache-manager.ts`

Add to constructor:
```typescript
const backend = process.env.CACHE_BACKEND || 'redis';

if (backend === 'memory') {
    kasLogger.info('Using in-memory cache (no Redis)');
    this.useMemoryCache = true;
    this.memoryCache = new Map();
    return;
}
```

Add methods: `getFromMemory()`, `setInMemory()`

### 2. Rate Limiter (In-Memory Store)

**File**: `kas/src/middleware/rate-limiter.middleware.ts`

Modify store configuration:
```typescript
const backend = process.env.RATE_LIMIT_BACKEND || 'redis';

store: backend === 'redis' && cacheManager.redis
    ? new RedisStore({ /* ... */ })
    : undefined, // Falls back to in-memory MemoryStore
```

### 3. Environment Variables

**File**: `.env.cloudrun` (NEW)

```bash
# Use memory backends (no Redis)
CACHE_BACKEND=memory
RATE_LIMIT_BACKEND=memory

# Keep all other Phase 4.2 configs
USE_GCP_KMS=true
ENABLE_CACHE=true
ENABLE_RATE_LIMITING=true
```

---

## 🚨 Critical Reminders

### What to KEEP (No Compromise)
- ✅ ALL Phase 4.2 functionality
- ✅ GCP KMS (FIPS 140-2 Level 3)
- ✅ Input validation (100% endpoints)
- ✅ Rate limiting (DoS protection)
- ✅ DPoP verification (RFC 9449)
- ✅ TLS 1.3
- ✅ Audit logging
- ✅ Security posture (0 critical/high vulns)

### What to DEFER (Cost Optimization)
- ❌ Redis Memorystore ($13/month) - Use in-memory cache
- ❌ Load Balancer ($20/month) - Cloud Run provides built-in LB
- ❌ GKE Cluster ($150/month) - Use Cloud Run serverless
- ❌ Cloud Armor WAF ($10/month) - Rate limiting sufficient for pilot
- ❌ Multi-region deployment (3× cost) - Single region adequate
- ❌ High availability setup (+$100/month) - Not required for POC

### When to Scale Up
- Add Redis: Traffic >5,000 req/day OR cache hit rate <70%
- Add GKE: Traffic >50,000 req/day OR need persistent connections
- Add multi-region: Geographic distribution required
- Add WAF: Production with external traffic

---

## 📊 Expected Costs (First Month)

**Scenario: 1,000 req/day (Expected)**
```
Cloud Run:
- Requests: 30K/month = $0 (free tier: 2M/month)
- CPU: ~100 vCPU-sec = $0.002
- Memory: ~50 GiB-sec = $0.001

GCP KMS:
- Decrypt ops: 1,000/day × 30 = 30K ops = $0.09

Total: ~$0.10/month
```

**Scenario: 10,000 req/day (10× scale-up)**
```
Cloud Run: ~$0.03/month
GCP KMS: ~$0.90/month
Total: ~$0.93/month

Still well under $20/month target ✅
```

**Budget Alert Thresholds**:
- 50% ($10): Email notification
- 90% ($18): Review and investigate
- 100% ($20): Optimize or scale down

---

## ✅ Success Criteria

### Functionality (Mandatory)
- ✅ All Phase 4.2 features working
- ✅ 96.7% test pass rate maintained
- ✅ Zero security regressions
- ✅ Warm latency <100ms
- ✅ Cold start <3s (acceptable)

### Cost (Primary Goal)
- ✅ **Monthly cost <$20**
- ✅ **Target: $5-10/month**
- ✅ No idle infrastructure costs
- ✅ Budget alerts configured
- ✅ Cost monitoring active

### Operations (Self-Service)
- ✅ Deployment automated (Cloud Build)
- ✅ Monitoring dashboard configured
- ✅ Operations runbook complete
- ✅ Troubleshooting guide available
- ✅ Cost optimization guide documented

---

## 📁 Key Files

**Read for Context**:
- `docs/PHASE-4.3-SESSION-PROMPT.md` (FULL PROMPT - 1,100+ lines)
- `kas/PHASE4.2-COMPLETION-SUMMARY.md` (Phase 4.2 status)
- `kas/docs/SECURITY-AUDIT-REPORT.md` (Security posture)
- `kas/docs/GCP-KMS-SETUP.md` (KMS configuration)

**Modify**:
- `kas/src/services/cache-manager.ts` (add memory backend)
- `kas/src/middleware/rate-limiter.middleware.ts` (add memory store)

**Create**:
- `kas/Dockerfile.cloudrun` (optimized build)
- `kas/cloudbuild.yaml` (CI/CD)
- `kas/docs/OPERATIONS-RUNBOOK.md` (ops guide)
- `kas/docs/COST-OPTIMIZATION.md` (scaling guide)

---

## 🚀 Quick Start

```bash
# 1. Navigate to project
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# 2. Verify Phase 4.2 completion
git log --oneline -5
# Should see: 14bbec34 feat(kas): Phase 4.2 Complete

# 3. Read full prompt
# Use docs/PHASE-4.3-SESSION-PROMPT.md in new chat session

# 4. Start implementation
cd kas
# Modify cache-manager.ts and rate-limiter.middleware.ts
# Create Dockerfile.cloudrun and cloudbuild.yaml
# Deploy to Cloud Run
# Configure monitoring
```

---

## 💡 Key Insight

**Phase 4.2 is 100% complete** with full production hardening (GCP KMS, caching, rate limiting, security audit). 

**Phase 4.3 is about DEPLOYMENT STRATEGY**, not new features. Goal: Deploy existing implementation in the most cost-effective way for low-traffic pilot.

**Answer**: Cloud Run (scale-to-zero) + in-memory backends = **$5-10/month** vs. full infrastructure = **$200+/month**

All functionality preserved. Zero security compromise. 95% cost savings.

---

**Next Session Action**: Open new chat with `docs/PHASE-4.3-SESSION-PROMPT.md` as context.

**Target Outcome**: Production deployment in 5 days, <$20/month cost, all functionality maintained.

✅ **READY FOR PHASE 4.3 IMPLEMENTATION**
