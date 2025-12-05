# DIVE V3 - MongoDB Resource Seeding Implementation Plan
## 7,000 Resources Per Instance with Full COI/Classification/Multi-KAS Coverage

**Date:** November 29, 2025  
**Version:** 1.0.0  
**Status:** Implementation Ready

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current State Audit](#current-state-audit)
3. [Gap Analysis](#gap-analysis)
4. [Phased Implementation Plan](#phased-implementation-plan)
5. [Success Criteria](#success-criteria)
6. [Risk Mitigation](#risk-mitigation)

---

## 1. Executive Summary

### Objective
Seed **7,000 ZTDF-encrypted resources** per DIVE V3 instance (USA, FRA, GBR, DEU) with comprehensive variation of:
- **Classifications**: UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET
- **COIs**: 28+ validated templates (US-ONLY, FVEY, NATO, NATO-COSMIC, bilateral, multi-COI, etc.)
- **Multi-KAS**: Single, dual, and triple KAS configurations
- **Releasability**: Instance-specific and coalition-wide distribution
- **Industry Access**: Government-only and industry-accessible resources

### Deliverables
1. ✅ Complete audit of existing deployment procedures
2. ✅ Comprehensive gap analysis
3. ✅ Phased implementation plan with SMART goals
4. 🚧 Production-ready seed script (`seed-instance-resources.ts`)
5. 🚧 Integration with deployment orchestration
6. 🚧 Validation and testing infrastructure

---

## 2. Current State Audit

### 2.1 Existing Seeding Infrastructure

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Basic Seed Script | `backend/src/scripts/seed-resources.ts` | ✅ Working | Uses test fixtures, ~10 resources |
| 7K Document Seed | `backend/src/scripts/seed-7000-ztdf-documents.ts` | ✅ Working | Single instance, configurable quantity |
| 1K Fixed Seed | `backend/src/scripts/seed-1000-ztdf-documents-fixed.ts` | ✅ Working | COI coherence validation |
| Federation Agreements | `backend/src/scripts/seed-federation-agreements.ts` | ✅ Working | 3 sample agreements |
| Test Fixtures | `backend/src/__tests__/helpers/test-fixtures.ts` | ✅ Working | Industry access control |

### 2.2 Existing Deployment Infrastructure

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Instance Deployment | `scripts/deploy-dive-instance.sh` | ✅ Mature | 10 instances supported |
| Federation Deployment | `scripts/deploy-federation.sh` | ✅ Mature | Full orchestration |
| Docker Compose (USA) | `docker-compose.yml` | ✅ Complete | All services defined |
| Docker Compose (FRA/GBR/DEU) | `docker-compose.{code}.yml` | ✅ Generated | Auto-generated per instance |
| Terraform Modules | `terraform/modules/federated-instance/` | ✅ Mature | Keycloak configuration |

### 2.3 COI Validation Infrastructure

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| COI Validation Service | `backend/src/services/coi-validation.service.ts` | ✅ Production | MongoDB-backed COI keys |
| COI Key Service | `backend/src/services/coi-key.service.ts` | ✅ Production | Dynamic COI membership |
| ZTDF Types | `backend/src/types/ztdf.types.ts` | ✅ Complete | STANAG 4774 compliant |
| KAS Registry | `config/kas-registry.json` | ✅ Complete | 4 KAS servers defined |

### 2.4 Current Package.json Scripts

```json
{
  "seed-database": "tsx src/scripts/seed-7000-ztdf-documents.ts",
  "seed-ztdf": "tsx src/scripts/seed-ztdf-resources.ts",
  "seed:fixed": "tsx src/scripts/seed-1000-ztdf-documents-fixed.ts"
}
```

---

## 3. Gap Analysis

### 3.1 Critical Gaps

| Gap ID | Description | Impact | Priority |
|--------|-------------|--------|----------|
| G1 | **No instance-aware seeding** - All scripts target single MongoDB | Cannot seed per-instance | 🔴 Critical |
| G2 | **No deployment integration** - Seeding not in deployment flow | Manual step required | 🔴 Critical |
| G3 | **No instance-specific KAS URLs** - Hardcoded KAS endpoint | Multi-KAS broken | 🔴 Critical |
| G4 | **No idempotent seeding** - Full wipe on re-run | Data loss risk | 🟡 High |
| G5 | **No validation endpoint** - No way to verify seed completeness | Testing blind spot | 🟡 High |
| G6 | **No incremental seeding** - Cannot add resources to existing data | Inflexible | 🟢 Medium |
| G7 | **No seed manifest** - No record of what was seeded | Audit gap | 🟢 Medium |

### 3.2 Detailed Gap Analysis

#### G1: No Instance-Aware Seeding
**Current State:**
```typescript
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://admin:password@mongo:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
```

**Required State:**
- Accept `--instance=USA|FRA|GBR|DEU` parameter
- Read instance config from `config/federation-registry.json`
- Connect to instance-specific MongoDB (ports 27017, 27018, 27019, 27020)
- Use instance-specific database names (`dive-v3`, `dive-v3-fra`, etc.)

#### G2: No Deployment Integration
**Current State:**
- `deploy-dive-instance.sh` has no seeding step
- `deploy-federation.sh` has no seeding step
- Manual `npm run seed-database` required after deployment

**Required State:**
- Add optional `--seed` flag to `deploy-dive-instance.sh`
- Add `seed_resources()` function to deployment flow
- Support `--seed-count=7000` parameter

#### G3: No Instance-Specific KAS URLs
**Current State:**
```typescript
const KAS_URL = process.env.KAS_URL || 'https://kas:8080';
const kasInstances = [
    { kasId: 'dive-v3-kas-pilot', kasUrl: `${KAS_URL}/request-key` },
    // ... all same endpoint
];
```

**Required State:**
- Read KAS registry from `config/kas-registry.json`
- Generate documents with instance-appropriate KAS URLs
- Support cross-KAS documents (e.g., USA document accessible via FRA KAS)

#### G4: No Idempotent Seeding
**Current State:**
```typescript
const deleteResult = await collection.deleteMany({
    resourceId: { $regex: /^doc-generated-/ }
});
```
Deletes ALL generated documents before seeding.

**Required State:**
- Preserve existing documents by default
- Add `--replace` flag for full replacement
- Add `--update` flag for upsert behavior
- Version tracking for seeded documents

#### G5: No Validation Endpoint
**Current State:**
- No API endpoint to check seed status
- No health check for resource availability
- Manual MongoDB queries required

**Required State:**
- Add `GET /api/resources/seed-status` endpoint
- Return counts by classification, COI, KAS
- Include expected vs actual metrics

### 3.3 COI Template Distribution Requirements

Based on existing templates in `seed-7000-ztdf-documents.ts`:

| Category | Templates | Target % | Expected Count (7K) |
|----------|-----------|----------|---------------------|
| US-ONLY | 2 | 7% | 490 |
| Bilateral (CAN-US, GBR-US, FRA-US) | 3 | 11% | 770 |
| FVEY | 1 | 7% | 490 |
| AUKUS | 1 | 4% | 280 |
| NATO | 2 | 7% | 490 |
| Regional Commands (EUCOM, PACOM, etc.) | 5 | 18% | 1,260 |
| Multi-COI | 5 | 18% | 1,260 |
| No-Affiliation (Alpha, Beta, Gamma) | 5 | 18% | 1,260 |
| No COI | 3 | 10% | 700 |
| **Total** | **28** | **100%** | **7,000** |

### 3.4 Classification Distribution Requirements

| Classification | Target % | Expected Count (7K) |
|----------------|----------|---------------------|
| UNCLASSIFIED | 20% | 1,400 |
| RESTRICTED | 15% | 1,050 |
| CONFIDENTIAL | 25% | 1,750 |
| SECRET | 25% | 1,750 |
| TOP_SECRET | 15% | 1,050 |
| **Total** | **100%** | **7,000** |

### 3.5 Multi-KAS Distribution Requirements

| KAS Configuration | Target % | Expected Count (7K) |
|-------------------|----------|---------------------|
| Single KAS (local) | 50% | 3,500 |
| Dual KAS (local + partner) | 30% | 2,100 |
| Triple KAS (local + 2 partners) | 20% | 1,400 |
| **Total** | **100%** | **7,000** |

---

## 4. Phased Implementation Plan

### Phase 1: Core Seeding Script (Week 1)
**Duration:** 3 days  
**SMART Goal:** Create instance-aware seeding script that can seed 7,000 resources to any instance with validated COI coherence within 60 seconds.

#### Deliverables
1. `backend/src/scripts/seed-instance-resources.ts`
2. Instance configuration loader from `federation-registry.json`
3. KAS registry integration
4. Dry-run validation mode

#### Success Criteria
- [ ] Script accepts `--instance=USA|FRA|GBR|DEU` parameter
- [ ] Script reads MongoDB connection from federation registry
- [ ] Script generates resources with instance-appropriate KAS URLs
- [ ] 100% of generated documents pass COI coherence validation
- [ ] Seeding completes in < 60 seconds for 7,000 documents
- [ ] Classification distribution within ±2% of targets
- [ ] Multi-KAS distribution within ±2% of targets

### Phase 2: Deployment Integration (Week 1)
**Duration:** 2 days  
**SMART Goal:** Integrate seeding into deployment scripts with automatic execution during new instance deployment.

#### Deliverables
1. Updated `scripts/deploy-dive-instance.sh` with `--seed` flag
2. Updated `scripts/deploy-federation.sh` with seeding orchestration
3. `scripts/seed-all-instances.sh` standalone script
4. Health check for MongoDB readiness before seeding

#### Success Criteria
- [ ] `./scripts/deploy-dive-instance.sh USA --new --seed` seeds resources automatically
- [ ] `./scripts/deploy-federation.sh deploy --seed` seeds all instances
- [ ] Seeding waits for MongoDB health check before starting
- [ ] Seeding failure does not block deployment (non-blocking)
- [ ] Seeding logs written to `logs/seed-{instance}-{timestamp}.log`

### Phase 3: Validation & Monitoring (Week 2)
**Duration:** 2 days  
**SMART Goal:** Implement validation endpoints and monitoring for seed status with 100% coverage of distribution metrics.

#### Deliverables
1. `GET /api/resources/seed-status` endpoint
2. `GET /api/resources/distribution` endpoint (classification, COI, KAS breakdown)
3. Seed manifest generation (`seed-manifest-{instance}-{timestamp}.json`)
4. Integration tests for seeding

#### Success Criteria
- [ ] `/api/resources/seed-status` returns expected vs actual counts
- [ ] `/api/resources/distribution` returns classification/COI/KAS breakdown
- [ ] Seed manifest records: timestamp, count, checksum, instance
- [ ] Jest tests validate seed script with MongoDB Memory Server
- [ ] Distribution variance < 5% from targets

### Phase 4: Instance-Specific Content (Week 2)
**Duration:** 2 days  
**SMART Goal:** Customize resource content and metadata to reflect instance-specific scenarios with 100% instance attribution.

#### Deliverables
1. Instance-specific title templates (e.g., "French Defense Ministry Report")
2. Instance-specific owner organizations
3. Instance-weighted COI distributions (e.g., FRA has more EU-RESTRICTED)
4. Originating country alignment

#### Success Criteria
- [ ] USA instance: 70% US-affiliated COIs
- [ ] FRA instance: 60% NATO/EU-affiliated COIs
- [ ] GBR instance: 65% FVEY/NATO-affiliated COIs
- [ ] DEU instance: 60% NATO/EU-affiliated COIs
- [ ] All resources have matching `originatingCountry` and instance
- [ ] Resource titles reflect instance context

### Phase 5: Resilience & Scalability (Week 3)
**Duration:** 2 days  
**SMART Goal:** Ensure seeding is resilient to failures and can scale to 20,000+ documents per instance.

#### Deliverables
1. Batch transaction support with rollback
2. Progress checkpoint/resume capability
3. Parallel instance seeding
4. Resource limit configuration

#### Success Criteria
- [ ] Seeding resumes from checkpoint after failure
- [ ] Failed batch does not corrupt existing data
- [ ] Can seed 20,000 documents in < 3 minutes
- [ ] Memory usage < 512MB during seeding
- [ ] CPU usage < 80% during seeding

### Phase 6: Testing & Documentation (Week 3)
**Duration:** 2 days  
**SMART Goal:** Comprehensive test coverage and documentation for production deployment.

#### Deliverables
1. Unit tests for seed script (80%+ coverage)
2. Integration tests against real MongoDB
3. E2E test: deploy instance + verify resources
4. Updated deployment documentation

#### Success Criteria
- [ ] 80%+ code coverage for seed script
- [ ] Integration test with 1000 documents passes
- [ ] E2E test completes in CI pipeline
- [ ] Documentation includes troubleshooting guide
- [ ] Runbook for manual seeding operations

---

## 5. Success Criteria Summary

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Documents per instance | 7,000 | MongoDB count |
| Seeding time | < 60s | Script execution time |
| COI coherence pass rate | 100% | Validation service |
| Classification distribution variance | < 2% | Aggregation query |
| Multi-KAS distribution variance | < 2% | KAO count analysis |
| Test coverage | > 80% | Jest coverage report |

### Qualitative Criteria
- [ ] Seeding is fully automated in deployment pipeline
- [ ] No manual intervention required for new instance deployment
- [ ] Seeding is idempotent and safe to re-run
- [ ] Clear audit trail of seeded resources
- [ ] Easy to customize COI/classification distributions

---

## 6. Risk Mitigation

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MongoDB connection timeout during large seed | Medium | High | Batch processing with 100-doc batches, connection pooling |
| COI validation failure blocks seeding | Low | High | Pre-validated templates, skip-on-error mode with logging |
| Deployment script changes break seeding | Medium | Medium | Integration tests, backward-compatible flags |
| Memory exhaustion with 7K documents | Low | Medium | Stream processing, batch commits |
| Instance misconfiguration | Medium | Medium | Registry schema validation, dry-run mode |

### Rollback Plan
1. **Checkpoint Recovery:** Resume from last successful batch
2. **Full Rollback:** Delete documents by seed batch ID
3. **Manual Override:** Direct MongoDB commands documented
4. **Backup Restore:** MongoDB dump before seeding (optional)

---

## Implementation Files

### New Files to Create
```
backend/src/scripts/seed-instance-resources.ts     # Main seeding script
backend/src/scripts/seed-validation.ts             # Validation utilities
backend/src/routes/seed-status.routes.ts           # Status API endpoints
scripts/seed-all-instances.sh                      # Orchestration script
```

### Files to Modify
```
scripts/deploy-dive-instance.sh                    # Add --seed flag
scripts/deploy-federation.sh                       # Add seeding orchestration
backend/package.json                               # Add new npm scripts
config/federation-registry.json                    # Add seed configuration
```

---

## Next Steps

1. **Immediate:** Review and approve this implementation plan
2. **Day 1:** Begin Phase 1 - Create `seed-instance-resources.ts`
3. **Day 3:** Complete Phase 1, begin Phase 2
4. **Day 5:** Complete Phase 2, validate deployment integration
5. **Week 2:** Complete Phases 3-4
6. **Week 3:** Complete Phases 5-6, production deployment

---

*Document maintained by: DIVE V3 Engineering Team*
*Last updated: November 29, 2025*








