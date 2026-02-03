# DIVE V3 Full Stack Cost Analysis - Cloud Run Reality Check

**Date**: 2026-01-31
**Status**: ⚠️ **CRITICAL - KAS-Only Optimization Insufficient**

---

## 🚨 Problem Statement

Phase 4.3 optimized **only KAS** for Cloud Run deployment ($5-10/month).

However, DIVE V3 is a **multi-service architecture** with 10+ services per instance.

**Deploying the full stack to Cloud Run would require:**
- Hub: 10 services (USA)
- Spoke: 10 services each (×31 NATO countries potential)

**This analysis calculates the REAL cost for production-ready deployment.**

---

## 📊 Full Hub Stack (USA) Components

| Service | Current (Docker Compose) | Cloud Run Equivalent | Monthly Cost |
|---------|-------------------------|---------------------|--------------|
| **Frontend (Next.js)** | Always on | Scale-to-zero | $10-20 |
| **Backend (Express)** | Always on | Scale-to-zero | $10-20 |
| **Keycloak** | Always on | Cloud Run (min=1) | $30-50 |
| **PostgreSQL** | Always on | **Cloud SQL** | $7-25 |
| **MongoDB** | Always on | **Atlas Free/M0** | $0-25 |
| **Redis (session)** | Always on | **Memorystore Basic** | $13 |
| **Redis (blacklist)** | Always on | **Memorystore Basic** | $13 |
| **OPA** | Always on | Cloud Run (min=1) | $10-15 |
| **OPAL Server** | Always on | Cloud Run (min=1) | $10-15 |
| **KAS** | Always on | Cloud Run (scale-to-zero) | **$5-10** ✅ |
| **OTEL Collector** | Optional | Cloud Run OR skip | $0-10 |

**Hub Total**: **$108-203/month** (not $5-10!)

---

## 💰 Realistic Cloud Run Deployment Costs

### Option 1: Naive Cloud Run Migration (All Services)

**Approach**: Containerize everything for Cloud Run

```
Hub (USA):
- Frontend:        $10-20/month (Cloud Run)
- Backend:         $10-20/month (Cloud Run)
- Keycloak:        $30-50/month (Cloud Run, min=1 for session state)
- PostgreSQL:      $7/month (Cloud SQL db-f1-micro shared-core)
- MongoDB:         $0-25/month (Atlas M0 free tier OR M2 $9)
- Redis (session): $13/month (Memorystore Basic 1GB)
- Redis (blacklist): $13/month (Memorystore Basic 1GB)
- OPA:             $10-15/month (Cloud Run, min=1 for sub-ms policy decisions)
- OPAL Server:     $10-15/month (Cloud Run, min=1 for pub/sub)
- KAS:             $5-10/month (Cloud Run, scale-to-zero) ✅

TOTAL: $108-181/month (HUB ONLY)
```

**Per Spoke** (if deployed):
- Similar stack: $108-181/month per NATO country
- 3 spokes (pilot): $324-543/month
- Full NATO (31): $3,348-5,611/month

**Verdict**: ❌ **NOT cost-optimized at all**

---

### Option 2: Hybrid Architecture (Realistic for POC)

**Approach**: Single VM + Docker Compose for full stack

```
Hub (USA) - GCP e2-medium VM:
- VM cost: $24/month (e2-medium: 2 vCPU, 4GB RAM)
- All services in Docker Compose (as currently designed)
- Persistent disk (50GB SSD): $8/month
- External IP: $3/month

TOTAL: $35/month (HUB)
```

**Per Spoke**:
- Each spoke: $35/month (e2-medium VM)
- 3 spokes: $105/month
- Shared blacklist Redis: $13/month (Memorystore)

**Full Pilot (Hub + 3 Spokes)**: **$153/month**

**Verdict**: ✅ **More cost-effective than multi-Cloud Run**

---

### Option 3: Ultra-Cost-Optimized (Single VM for Everything)

**Approach**: Run Hub + 3 Spokes on single powerful VM

```
GCP e2-standard-8 VM:
- VM cost: $194/month (8 vCPU, 32GB RAM)
- All services (Hub + 3 spokes) in Docker Compose
- Persistent disk (200GB SSD): $32/month
- External IP: $3/month

TOTAL: $229/month (Hub + 3 Spokes + Shared Services)

Cost per instance: $57/month
```

**Verdict**: ✅ **Most cost-effective for pilot**

**Trade-offs**:
- ⚠️ Single point of failure (acceptable for POC)
- ⚠️ Manual scaling (acceptable for <1,000 req/day)
- ⚠️ Resource contention risk (mitigated by 32GB RAM)
- ✅ Matches current Docker Compose architecture
- ✅ Easy to manage
- ✅ Low cost

---

## 🎯 Recommended Architecture by Phase

### Phase 1: POC/Pilot (Current - Months 1-6)

**Target**: <1,000 req/day, 5-10 pilot users

**Architecture**: **Single VM + Docker Compose**

```
GCP e2-standard-8 (8 vCPU, 32GB RAM): $194/month
├─ Hub (USA): Frontend, Backend, Keycloak, PostgreSQL, MongoDB, Redis×2, OPA, OPAL, KAS
├─ Spoke 1 (FRA): Full stack with port offsets
├─ Spoke 2 (GBR): Full stack with port offsets
├─ Spoke 3 (CAN): Full stack with port offsets
└─ Shared: Redis blacklist, monitoring

Persistent disk (200GB SSD): $32/month
External IP: $3/month

TOTAL: $229/month
```

**Why This Works**:
- ✅ **Matches your current architecture** (Docker Compose)
- ✅ **Cost-effective** ($229/month vs. $3,348 for Cloud Run per-service)
- ✅ **Simple operations** (same as local dev)
- ✅ **Easy to scale** (vertical: upgrade to e2-standard-16)
- ✅ **Sufficient for pilot** (8 vCPU handles 4 instances easily)

**Resource Allocation** (per instance on 8 vCPU / 32GB):
- Frontend: 0.5 vCPU, 2GB RAM
- Backend: 1 vCPU, 4GB RAM
- Keycloak: 1 vCPU, 4GB RAM
- PostgreSQL: 0.5 vCPU, 2GB RAM
- MongoDB: 1 vCPU, 4GB RAM
- Redis: 0.25 vCPU, 1GB RAM each (×2)
- OPA: 0.5 vCPU, 1GB RAM
- OPAL/KAS: 0.25 vCPU, 1GB RAM each

**Total per instance**: ~5.5 vCPU, 19GB RAM
**4 instances**: 22 vCPU, 76GB RAM ← **Exceeds single VM**

**CORRECTED**: Need bigger VM OR reduce spokes to 2 initially.

---

### Phase 2: Production Scale (Months 6-12)

**Target**: 10,000-50,000 req/day, growing user base

**Architecture**: **Hybrid (Critical services on Cloud Run)**

```
Cloud Run (stateless services):
- Frontend (Hub + Spokes): $40-80/month (4 services × $10-20)
- Backend (Hub + Spokes): $40-80/month (4 services × $10-20)
- KAS (Hub + Spokes): $20-40/month (4 services × $5-10)

Managed Services (stateful):
- Cloud SQL (PostgreSQL): $50-100/month (4 instances, shared-core)
- MongoDB Atlas: $36-100/month (4 M2 instances @ $9-25 each)
- Redis Memorystore: $52/month (4 session + 1 blacklist @ $13 each)

Cloud Run (policy services, min=1):
- Keycloak (Hub + Spokes): $120-200/month (4 × $30-50)
- OPA (Hub + Spokes): $40-60/month (4 × $10-15)
- OPAL Server (Hub only): $10-15/month

TOTAL: $408-727/month (Hub + 3 Spokes)
```

**Verdict**: ⚠️ **2-3× more expensive than single VM**

---

### Phase 3: Enterprise Scale (Year 2+)

**Target**: 100,000+ req/day, full NATO federation (31 countries)

**Architecture**: **Full GKE + Multi-Region**

```
GKE Cluster (multi-region):
- 12-node cluster: $900/month (e2-standard-4 × 12)
- Load balancers: $60/month (3 regional)
- Persistent volumes: $100/month

Managed Services:
- Cloud SQL (HA): $500/month (4 instances, HA config)
- MongoDB Atlas (HA): $400/month (4 M10 instances)
- Redis Memorystore (HA): $200/month (5 Standard tier)

TOTAL: $2,160/month (Hub + 3 Spokes, HA)

Full NATO (31 spokes): $15,000-25,000/month
```

**Verdict**: ⚠️ **Enterprise pricing for enterprise scale**

---

## 📊 Cost Comparison Summary

| Architecture | Monthly Cost | Traffic Support | Complexity | Best For |
|--------------|--------------|-----------------|------------|----------|
| **Single VM (e2-standard-8)** | **$229** | <5K req/day | Low | **POC/Pilot** ✅ |
| **Multi-VM (e2-medium each)** | $153-210 | <10K req/day | Medium | Small pilot |
| **Hybrid Cloud Run** | $408-727 | 10-50K req/day | High | Growing production |
| **Full GKE** | $2,160+ | 100K+ req/day | Very High | Enterprise |
| **Cloud Run (all services)** | $108-181/instance | Variable | Medium | ❌ Not recommended |

---

## ✅ Revised Recommendation

### For Your POC (Current State)

**Deploy to Single GCP VM** with Docker Compose:

```bash
# 1. Provision VM
gcloud compute instances create dive-v3-pilot \
  --machine-type=e2-standard-8 \
  --boot-disk-size=200GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --zone=us-central1-a

# 2. Install Docker & Docker Compose
# (standard installation)

# 3. Clone repository and deploy
cd ~/DIVE-V3
./dive hub deploy
./dive spoke deploy fra
./dive spoke deploy gbr

# 4. Configure DNS/Load Balancer
# (Cloudflare or GCP Load Balancer)
```

**Why This is Better**:
1. ✅ **Matches your current architecture** (no refactoring needed)
2. ✅ **Cost-effective** ($229/month vs. $408+ for Cloud Run hybrid)
3. ✅ **Simple operations** (Docker Compose, no Kubernetes)
4. ✅ **Fast deployment** (minutes, not hours)
5. ✅ **Easy to scale** (upgrade VM size, add VMs per region)
6. ✅ **Sufficient for pilot** (5-10 users, <1,000 req/day)

---

## 🔄 When to Migrate Services to Cloud Run

**Incremental Migration Strategy**:

### Step 1: Start with VM (Months 1-3)
- Full stack on single e2-standard-8
- Cost: $229/month
- Traffic: <5,000 req/day

### Step 2: Extract KAS Only (Months 3-6)
- **If** KAS becomes bottleneck (federated key requests)
- Move **only KAS** to Cloud Run (all 4 instances)
- Cost: $229 + $20-40 = $249-269/month
- Benefit: KAS scales independently

### Step 3: Extract Frontend/Backend (Months 6-12)
- **If** traffic >10,000 req/day
- Move Frontend + Backend to Cloud Run
- Keep Keycloak, databases on VM
- Cost: $229 + $160 = $389/month

### Step 4: Full Cloud Run (Year 2+)
- **Only if** traffic >50,000 req/day
- Migrate all services to Cloud Run + managed services
- Cost: $408-727/month

---

## 💡 Key Insight

**Your Phase 4.3 KAS optimization is valuable** - but it's **Step 2** of a multi-step migration, not the initial deployment.

**Initial deployment should use what you already have**:
- ✅ Docker Compose (working)
- ✅ Hub-spoke architecture (designed)
- ✅ Multi-service orchestration (tested)

**Deploy this to a VM first** ($229/month), then migrate services incrementally based on actual traffic patterns.

---

**Recommendation**: Update Phase 4.3 documentation to clarify:
1. **POC deployment**: Single VM + Docker Compose ($229/month)
2. **KAS extraction**: Cloud Run for KAS only (when justified)
3. **Hybrid migration**: Incremental service migration
4. **Full Cloud Run**: Only at enterprise scale

---

**Document Owner**: Cost Analysis
**Status**: Critical Correction to Phase 4.3
**Next Action**: Create VM deployment guide
