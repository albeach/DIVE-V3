# KAS Cost Optimization Guide
# ACP-240 Phase 4.3 - Scaling Decision Tree & Budget Planning

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Target Audience**: Project Managers, Finance, DevOps

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Cost Optimization Philosophy](#cost-optimization-philosophy)
3. [Current Architecture (Baseline)](#current-architecture-baseline)
4. [Scaling Decision Tree](#scaling-decision-tree)
5. [Cost Breakdown by Traffic Level](#cost-breakdown-by-traffic-level)
6. [Infrastructure Upgrade Path](#infrastructure-upgrade-path)
7. [Cost vs. Performance Trade-offs](#cost-vs-performance-trade-offs)
8. [Budget Planning](#budget-planning)
9. [Cost Monitoring](#cost-monitoring)
10. [Optimization Recommendations](#optimization-recommendations)

---

## Executive Summary

### Current State

**Deployment**: Google Cloud Run (serverless, scale-to-zero)
**Cache**: In-memory (no Redis)
**Rate Limiting**: In-memory (no Redis)
**Database**: MongoDB (optional, can use static config)

### Cost Profile

| Traffic Level | Monthly Cost | Annual Cost | Cost per 1K Requests |
|--------------|--------------|-------------|----------------------|
| **Baseline (idle)** | **$0** | **$0** | N/A |
| **1,000 req/day** | **$5-10** | **$60-120** | **$0.16-0.33** |
| 5,000 req/day | $10-15 | $120-180 | $0.07-0.10 |
| 10,000 req/day | $15-25 (with Redis) | $180-300 | $0.05-0.08 |
| 50,000 req/day | $25-50 (with Redis) | $300-600 | $0.02-0.03 |
| 500,000 req/day | $200-300 (GKE) | $2,400-3,600 | $0.01-0.02 |

### Key Insight

**For <1,000 req/day pilot**: Cloud Run-only deployment costs **$5-10/month** - 95% cost reduction vs. full Phase 4.2 architecture ($200+/month).

### Target Achievement

✅ **Target: <$20/month achieved** for expected pilot traffic (<1,000 req/day)

---

## Cost Optimization Philosophy

### Guiding Principles

1. **Functionality First**: Never compromise security or core features for cost
2. **Pay for What You Use**: Leverage serverless and usage-based billing
3. **Scale on Evidence**: Add infrastructure only when traffic justifies it
4. **Optimize Iteratively**: Monitor, measure, adjust, repeat
5. **Document Trade-offs**: Be transparent about cost vs. performance

### Cost vs. Value Matrix

```
High Value, Low Cost: Cloud Run (scale-to-zero), GCP KMS, in-memory cache
High Value, High Cost: Redis (at high traffic), GKE (at very high traffic)
Low Value, High Cost: Persistent instances, over-provisioning, idle resources
Low Value, Low Cost: Excessive logging, unused features
```

### False Economy Pitfalls

**Avoid**:
- ❌ Disabling security features to save costs
- ❌ Using shared credentials instead of service accounts
- ❌ Skipping monitoring to avoid logging costs
- ❌ Under-provisioning causing service degradation

**Instead**:
- ✅ Use free tiers (Cloud Logging, Cloud Monitoring)
- ✅ Optimize cache hit rates (reduce KMS costs)
- ✅ Scale-to-zero when idle (Cloud Run strength)
- ✅ Right-size resources (512MB sufficient for pilot)

---

## Current Architecture (Baseline)

### Component Breakdown

```
┌────────────────────────────────────────────────────┐
│  Cloud Run (kas-usa)                               │
│  Cost: $5-10/month @ 1,000 req/day                 │
│  ├─ Container Time: $0.003/month                   │
│  ├─ CPU Time: $0.001/month                         │
│  └─ Memory: $0.001/month                           │
│  Free: First 2M requests/month                     │
└────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│  GCP Cloud KMS                                     │
│  Cost: $0.03 per 10,000 operations                 │
│  ├─ 1,000 req/day × 20% cache miss = 200 ops/day  │
│  └─ 6,000 ops/month = $0.02/month                  │
└────────────────────────────────────────────────────┘

TOTAL: $5.02-10.02/month @ 1,000 req/day
```

### What We're NOT Using (Cost Savings)

| Component | Monthly Cost | Why Not Needed (Yet) |
|-----------|--------------|----------------------|
| **Redis Memorystore** | $13-50 | In-memory cache sufficient for low traffic |
| **GKE Cluster** | $150+ | Cloud Run adequate for <50K req/day |
| **Load Balancer** | $20 | Cloud Run provides built-in LB |
| **Cloud Armor (WAF)** | $10+ | Rate limiting + validation sufficient |
| **Prometheus/Grafana** | $10-20 | Cloud Run metrics sufficient |
| **MongoDB Atlas** | $25+ | Optional; can use static config |

**Total Savings**: **$228-285/month** vs. full Phase 4.2 architecture

---

## Scaling Decision Tree

### Decision Flow

```
START: Current Traffic Level
  ↓
[1,000 req/day?]
  ├─ YES → Cloud Run only ($5-10/month) ← YOU ARE HERE
  │         ├─ Cache hit rate >70%? → STAY
  │         └─ Cache hit rate <70%? → Consider Redis
  ↓
[5,000 req/day?]
  ├─ YES → Evaluate cache performance
  │         ├─ Cache hit rate >70%? → Stay with Cloud Run
  │         └─ Cache hit rate <70%? → ADD REDIS (+$13/month)
  ↓
[10,000 req/day?]
  ├─ YES → Add Redis Memorystore Basic
  │         Cost: $18-25/month total
  │         Benefit: Distributed cache, better performance
  ↓
[50,000 req/day?]
  ├─ YES → Evaluate GKE migration
  │         ├─ Latency acceptable? → Stay with Cloud Run + Redis
  │         └─ Need lower latency? → MIGRATE TO GKE (+$150/month)
  ↓
[500,000 req/day?]
  ├─ YES → Full Phase 4.2 architecture
  │         Cost: $200-300/month
  │         Includes: GKE, Redis, monitoring, HA setup
  ↓
ENTERPRISE SCALE (>1M req/day)
  └─ Multi-region, CDN, managed services
     Cost: $500-1,000/month
```

### Decision Criteria

#### When to Add Redis ($13-25/month)

**Indicators**:
- ✅ Daily traffic >5,000 requests
- ✅ Cache hit rate <70%
- ✅ KMS costs >$1/month
- ✅ Multi-instance deployment (cache sharing needed)
- ✅ Rate limiting accuracy critical

**Expected Benefits**:
- 📈 Cache hit rate: 70% → 85-90%
- 📉 KMS operations: Reduce by 60%
- 📉 Latency: Reduce by 20-30ms
- 💰 Break-even: ~8,000 req/day

**Implementation**:
```bash
# 1. Create Redis Memorystore
gcloud redis instances create kas-cache \
  --region=us-central1 \
  --tier=basic \
  --size=1 \
  --redis-version=redis_7_0

# 2. Update environment
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-env-vars="CACHE_BACKEND=redis,REDIS_HOST=<redis-ip>"

# 3. Cost: $13/month (Basic tier, 1GB)
```

#### When to Migrate to GKE ($150-200/month)

**Indicators**:
- ✅ Daily traffic >50,000 requests
- ✅ Cold start latency unacceptable (>3s)
- ✅ Need persistent connections (WebSockets, long-polling)
- ✅ Need multi-region active-active
- ✅ Need fine-grained autoscaling control

**Expected Benefits**:
- 📉 Latency: Eliminate cold starts
- 📈 Availability: Multi-zone HA
- 📈 Control: Fine-grained resource management
- 💰 Break-even: ~80,000 req/day

**Trade-offs**:
- ❌ Higher baseline cost ($150/month vs. $0)
- ❌ More operational complexity
- ❌ Manual scaling configuration
- ✅ Better performance at high scale
- ✅ More control over infrastructure

---

## Cost Breakdown by Traffic Level

### Scenario 1: Pilot Phase (1,000 req/day)

**Infrastructure**:
- Cloud Run (kas-usa): scale-to-zero
- GCP KMS: usage-based
- No Redis, no MongoDB

**Cost Calculation**:
```
Cloud Run:
  - Requests: 30,000/month (within 2M free tier) = $0
  - Container time: 30,000 × 0.1s = 3,000s = 0.83 hours
    0.83 hours × $0.00002400/vCPU-second × 3600 = $0.072
  - Memory: 30,000 × 0.1s × 0.5GB = 1,500 GB-seconds
    1,500 × $0.00000250/GiB-second = $0.004

GCP KMS:
  - 1,000 req/day × 20% miss rate × 30 days = 6,000 operations
  - 6,000 × $0.03/10,000 = $0.018

Total: $0.094/month ≈ $0.10/month
```

**With safety margin**: **$5-10/month** (accounts for variability, monitoring, logs)

### Scenario 2: Growing Pilot (5,000 req/day)

**Infrastructure**:
- Cloud Run (kas-usa): same config
- GCP KMS: higher usage
- Consider Redis (optional)

**Cost Calculation**:
```
Cloud Run:
  - Requests: 150,000/month (within 2M free tier) = $0
  - Container time: 150,000 × 0.1s = 15,000s = 4.17 hours
    4.17 × $0.00002400/vCPU-second × 3600 = $0.36
  - Memory: 150,000 × 0.1s × 0.5GB = 7,500 GB-seconds
    7,500 × $0.00000250/GiB-second = $0.019

GCP KMS (with in-memory cache):
  - 5,000 req/day × 20% miss × 30 days = 30,000 operations
  - 30,000 × $0.03/10,000 = $0.09

Total: $0.47/month ≈ $0.50/month
```

**With safety margin**: **$10-15/month**

**Decision**: Monitor cache hit rate. If <70%, add Redis.

### Scenario 3: Production Lite (10,000 req/day)

**Infrastructure**:
- Cloud Run (kas-usa): same config
- GCP KMS: higher usage
- **Redis Memorystore Basic (1GB)**: $13/month

**Cost Calculation**:
```
Cloud Run:
  - Requests: 300,000/month (within 2M free tier) = $0
  - Container time: 300,000 × 0.1s = 30,000s = 8.33 hours
    8.33 × $0.00002400/vCPU-second × 3600 = $0.72
  - Memory: 300,000 × 0.1s × 0.5GB = 15,000 GB-seconds
    15,000 × $0.00000250/GiB-second = $0.038

GCP KMS (with Redis cache, 90% hit rate):
  - 10,000 req/day × 10% miss × 30 days = 30,000 operations
  - 30,000 × $0.03/10,000 = $0.09

Redis Memorystore Basic (1GB):
  - $13/month (fixed cost)

Total: $13.85/month ≈ $14/month
```

**With safety margin**: **$18-25/month**

### Scenario 4: Production Scale (50,000 req/day)

**Infrastructure**:
- Cloud Run (kas-usa): increased max instances
- GCP KMS: higher usage
- Redis Memorystore Basic (1GB)

**Cost Calculation**:
```
Cloud Run:
  - Requests: 1.5M/month (within 2M free tier) = $0
  - Container time: 1.5M × 0.1s = 150,000s = 41.67 hours
    41.67 × $0.00002400/vCPU-second × 3600 = $3.60
  - Memory: 1.5M × 0.1s × 0.5GB = 75,000 GB-seconds
    75,000 × $0.00000250/GiB-second = $0.19

GCP KMS (with Redis cache, 90% hit rate):
  - 50,000 req/day × 10% miss × 30 days = 150,000 operations
  - 150,000 × $0.03/10,000 = $0.45

Redis Memorystore Basic (1GB):
  - $13/month

Total: $17.24/month ≈ $17/month
```

**With safety margin**: **$25-50/month**

**Decision**: Monitor latency. If p95 >200ms or cold starts problematic, consider GKE.

### Scenario 5: High Scale (500,000 req/day)

**Infrastructure**:
- **GKE Cluster (3 nodes, e2-small)**: $150/month
- Redis Memorystore Standard (5GB, HA): $50/month
- GCP KMS: higher usage

**Cost Calculation**:
```
GKE Cluster:
  - 3 × e2-small (2 vCPU, 2GB) = $0.067/hour × 730 hours = $146.43
  - Persistent disk (30GB SSD): $5/month

Redis Memorystore Standard (5GB, HA):
  - $50/month (high availability)

GCP KMS:
  - 500,000 req/day × 10% miss × 30 days = 1.5M operations
  - 1.5M × $0.03/10,000 = $4.50

Load Balancer (Global):
  - $20/month base + data transfer

Total: $225.93/month ≈ $226/month
```

**With monitoring, backups**: **$250-300/month**

---

## Infrastructure Upgrade Path

### Stage 1: POC (Current) - Weeks 1-8

**Target**: <1,000 req/day
**Cost**: $5-10/month
**Infrastructure**:
- Cloud Run (scale-to-zero)
- In-memory cache
- No Redis, no GKE

**Upgrade Trigger**: Traffic >5,000 req/day OR cache hit rate <70%

### Stage 2: Pilot - Months 2-6

**Target**: 1,000-10,000 req/day
**Cost**: $10-25/month
**Infrastructure**:
- Cloud Run (same)
- **Add**: Redis Memorystore Basic (1GB)

**Upgrade Trigger**: Traffic >50,000 req/day OR latency issues

### Stage 3: Production - Months 6-12

**Target**: 10,000-100,000 req/day
**Cost**: $25-150/month
**Infrastructure**:
- Cloud Run (increased max instances) OR
- **Migrate**: GKE (3-node cluster)
- Redis Memorystore Standard (HA)

**Upgrade Trigger**: Traffic >500,000 req/day OR multi-region needed

### Stage 4: Enterprise - Year 2+

**Target**: 100,000-1,000,000 req/day
**Cost**: $300-1,000/month
**Infrastructure**:
- GKE (multi-region, auto-scaling)
- Redis Memorystore HA (multi-zone)
- Cloud CDN for JWKS
- Cloud Armor (WAF)
- Full monitoring stack

---

## Cost vs. Performance Trade-offs

### In-Memory Cache vs. Redis

| Aspect | In-Memory (Current) | Redis Memorystore |
|--------|---------------------|-------------------|
| **Cost** | $0/month | $13-50/month |
| **Cache Persistence** | ❌ Lost on restart | ✅ Persistent |
| **Multi-Instance** | ❌ Per-instance only | ✅ Shared across instances |
| **Cache Hit Rate** | 70-80% | 85-95% |
| **Setup Complexity** | ✅ Simple (built-in) | ⚠️ Requires provisioning |
| **Best For** | <5K req/day, single instance | >5K req/day, multi-instance |

**Recommendation**: Start with in-memory. Add Redis at 5,000+ req/day.

### Cloud Run vs. GKE

| Aspect | Cloud Run (Current) | GKE |
|--------|---------------------|-----|
| **Cost** | $5-50/month | $150-300/month |
| **Baseline Cost** | ✅ $0 (scale-to-zero) | ❌ $150/month (always on) |
| **Cold Start** | ⚠️ 1-3 seconds | ✅ None |
| **Scalability** | ✅ Auto (0-100 instances) | ⚠️ Manual configuration |
| **Ops Complexity** | ✅ Minimal (serverless) | ❌ High (Kubernetes) |
| **Best For** | <50K req/day, variable traffic | >50K req/day, consistent traffic |

**Recommendation**: Stay with Cloud Run until 50,000+ req/day OR cold start unacceptable.

### Scale-to-Zero vs. Min Instance

| Aspect | Scale-to-Zero (Current) | Min Instance = 1 |
|--------|-------------------------|------------------|
| **Cost** | ✅ $0 when idle | ❌ +$10/month (always on) |
| **Cold Start** | ⚠️ 1-3 seconds | ✅ None (always warm) |
| **User Experience** | ⚠️ First request slow | ✅ Always fast |
| **Best For** | Low traffic, cost-sensitive | High traffic, latency-sensitive |

**Recommendation**: Start with scale-to-zero. Add min instance if cold start complaints.

---

## Budget Planning

### Monthly Budget Scenarios

#### Scenario A: Pilot Phase (Recommended)

**Duration**: Months 1-6
**Budget**: **$20/month** (with 2× buffer)

```
Expected Cost: $5-10/month
Buffer (2×): $10-20/month
Total Budget: $20/month
```

**Contingency**:
- If traffic >5,000 req/day: Add Redis (+$13/month)
- Total ceiling: $33/month (still within 2× buffer)

#### Scenario B: Growing Pilot

**Duration**: Months 6-12
**Budget**: **$50/month**

```
Expected Cost: $18-25/month (Cloud Run + Redis)
Buffer (2×): $36-50/month
Total Budget: $50/month
```

**Contingency**:
- If traffic >50,000 req/day: Migrate to GKE
- Requires budget increase to $300/month

#### Scenario C: Production

**Duration**: Year 2+
**Budget**: **$300/month**

```
Expected Cost: $200-250/month (GKE + Redis + LB)
Buffer (1.2×): $240-300/month
Total Budget: $300/month
```

### Annual Budget Summary

| Phase | Duration | Monthly Budget | Annual Budget |
|-------|----------|----------------|---------------|
| **Pilot (Current)** | Months 1-6 | **$20** | **$120** |
| Growing Pilot | Months 6-12 | $50 | $300 |
| Production | Year 2+ | $300 | $3,600 |

### Budget Alerts

**Recommended Thresholds**:
- ⚠️ **50%** of budget: Review usage, optimize
- ⚠️ **75%** of budget: Investigate spike, forecast
- 🚨 **90%** of budget: Immediate action, escalate

**Setup**:
```bash
# $20/month budget alert
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="KAS Pilot Budget" \
  --budget-amount=20 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=75 \
  --threshold-rule=percent=90
```

---

## Cost Monitoring

### Daily Monitoring

**Automated Dashboard**:
```
Cloud Console → Billing → Reports
Filter: Service = Cloud Run, KMS
Time range: Last 7 days
```

**Key Metrics**:
1. **Daily Spend**: Should be <$0.70/day ($20/month)
2. **Cloud Run Costs**: Billable container time
3. **KMS Operations**: Number of decrypt operations
4. **Request Count**: Daily request volume

### Weekly Review

**Process** (every Monday):
1. Check previous week's spend
2. Calculate cost per 1,000 requests
3. Review traffic trends
4. Check cache hit rate
5. Forecast next month

**Template**:
```
Weekly Cost Review - Week of [DATE]

Spend:
  - Last 7 days: $X.XX
  - Projection (30 days): $Y.YY
  - Budget: $20/month
  - Status: ✅ On track / ⚠️ Watch / 🚨 Over

Traffic:
  - Daily average: X,XXX req/day
  - Peak day: X,XXX req
  - Cache hit rate: XX%

Recommendations:
  - [Action items if needed]
```

### Monthly Cost Report

**Template**:
```
Monthly Cost Report - [MONTH YEAR]

Summary:
  - Total spend: $XX.XX
  - Budget: $20.00
  - Variance: $X.XX (under/over)
  - Average daily: $X.XX

Breakdown:
  - Cloud Run: $X.XX (XX%)
  - GCP KMS: $X.XX (XX%)
  - Other: $X.XX (XX%)

Traffic:
  - Total requests: XXX,XXX
  - Daily average: X,XXX
  - Cost per 1K req: $X.XX

Next Month Forecast:
  - Expected traffic: X,XXX req/day
  - Expected cost: $XX.XX
  - Recommendation: [Stay/Upgrade/Optimize]
```

---

## Optimization Recommendations

### Short-Term Optimizations (Immediate)

#### 1. Optimize Cache TTL

**Goal**: Reduce KMS operations

```bash
# Current: DEK cache 60s, Public key 3600s
# Optimization: Increase DEK cache to 120s if acceptable

gcloud run services update kas-usa \
  --region=us-central1 \
  --set-env-vars="CACHE_TTL_DEK=120"

# Impact: 50% reduction in KMS operations
# Savings: ~$0.01/month (minimal, but good practice)
```

#### 2. Right-Size Memory

**Goal**: Reduce Cloud Run costs

```bash
# Current: 512MB (sufficient for pilot)
# If memory usage <50%: Keep as-is
# If memory usage >80%: Increase to 1GB

# Check memory usage first
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Memory" --limit=50

# Only increase if needed (OOM errors)
```

#### 3. Adjust Rate Limiting

**Goal**: Reduce unnecessary computation

```bash
# Current: 100 req/min per IP
# If no rate limit hits: Keep as-is
# If frequent 429s: Increase limits

# Check rate limit logs
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Rate limit exceeded" --limit=50
```

### Medium-Term Optimizations (1-3 months)

#### 4. Add Redis When Justified

**Trigger**: Traffic >5,000 req/day OR cache hit rate <70%

**Cost-Benefit Analysis**:
```
Cost: +$13/month
Benefit:
  - Cache hit rate: 70% → 90%
  - KMS operations: Reduce by 60%
  - KMS cost savings: $0.50/month (at 10K req/day)

Net cost increase: $12.50/month
Break-even: ~20,000 req/day
```

**Implementation**: See [Scaling Decision Tree](#scaling-decision-tree)

#### 5. Evaluate MongoDB Removal

**Goal**: Eliminate MongoDB cost (if using)

**Current**: Federation metadata in MongoDB
**Alternative**: Static JSON config file

**Cost Savings**: $25/month (if using MongoDB Atlas)

**Trade-off**: Manual config updates vs. dynamic federation

**Recommendation**: Use static config for pilot, add MongoDB at scale

### Long-Term Optimizations (6+ months)

#### 6. Multi-Region Deployment

**Trigger**: Geographic distribution needed OR >100K req/day

**Cost**: +100-200% (duplicate infrastructure)
**Benefit**: Lower latency, higher availability

**Recommendation**: Defer until traffic justifies it

#### 7. Reserved Capacity

**Trigger**: Consistent traffic >50K req/day

**Benefit**: 57% discount on committed use
**Requirement**: 1-year or 3-year commitment

**Example**:
```
Pay-as-you-go: $200/month
Committed use (1-year): $86/month (57% off)
Savings: $114/month = $1,368/year
```

**Recommendation**: Consider after 6 months of consistent production traffic

---

## Summary

### Current Recommendation

✅ **Stay with Cloud Run-only deployment**
✅ **Target: $5-10/month for pilot phase**
✅ **Monitor traffic and cache hit rate**
✅ **Add Redis at 5,000+ req/day**
✅ **Migrate to GKE at 50,000+ req/day**

### Key Takeaways

1. **Cost-Optimized**: Current architecture achieves <$20/month target
2. **Scalable**: Clear upgrade path as traffic grows
3. **Flexible**: Pay only for what you use
4. **Functional**: Zero compromise on security or features
5. **Evidence-Based**: Scale decisions driven by metrics

### Decision Matrix (Quick Reference)

| Traffic | Architecture | Monthly Cost | Action |
|---------|-------------|--------------|--------|
| **<1K/day** | **Cloud Run only** | **$5-10** | ✅ **Stay here** |
| 1-5K/day | Cloud Run only | $10-15 | Monitor cache |
| 5-10K/day | Cloud Run + Redis | $18-25 | Add Redis |
| 10-50K/day | Cloud Run + Redis | $25-50 | Optimize |
| 50-500K/day | GKE + Redis | $150-250 | Migrate to GKE |
| >500K/day | GKE + Full stack | $300-500 | Enterprise mode |

---

**Document Owner**: Finance + DevOps
**Review Schedule**: Monthly (during pilot), Quarterly (production)
**Last Review**: 2026-01-31
**Next Review**: 2026-02-28
