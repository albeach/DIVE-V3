# DIVE V3 Phase 2: Foundation Hardening - Implementation Plan

**Document Version:** 1.0.0  
**Created:** 2025-12-01  
**Author:** Phase 2 Implementation Team  
**Status:** In Progress

---

## Executive Summary

Phase 2 focuses on hardening the DIVE V3 foundation to achieve **zero manual interventions** for deployment, **95%+ test coverage**, and **resilient infrastructure** that survives restarts, upgrades, and disasters.

### Phase 1 Completion Status ✅

| Component | Status | Details |
|-----------|--------|---------|
| USA Instance | ✅ Healthy | All 8 services running |
| FRA Instance | ✅ Healthy | All 8 services running |
| GBR Instance | ✅ Healthy | All 8 services running |
| DEU Instance | ✅ Healthy | Remote @ 192.168.42.120 |
| Terraform | ✅ Applied | All 4 instances in sync |
| OPA Policies | ✅ 163/163 | 100% test coverage |
| GCP Secrets | ✅ Working | 50 secrets managed |

---

## Phase 2 SMART Objectives

### Week 2 Day 1-2: CI/CD Pipeline (OBJECTIVE: Automated Deployment)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Manual deployment steps | 12 | 0 | All deployments via GitHub Actions |
| Deployment frequency | Weekly | Daily-capable | Push-to-deploy pipeline |
| Mean time to deploy | 30 min | <10 min | Automated pipeline timing |
| Rollback time | 15 min | <5 min | Automated rollback triggers |

**Deliverables:**
1. ✅ `ci-comprehensive.yml` - Already exists, enhancing
2. ✅ `ci-fast.yml` - Already exists, enhancing
3. 🔄 `deploy-production.yml` - NEW: Multi-instance deployment with approval
4. 🔄 `deploy-dev-server.yml` - Enhance for DEU remote deployment

### Week 2 Day 3: Terraform Remote State & Secret Rotation

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| State backend | Local | GCS | Remote state with locking |
| State drift tolerance | Unknown | Zero | Automated drift detection |
| Secret age | Unknown | <90 days | Quarterly rotation |
| Secret rotation automation | Manual | Automated | Scheduled rotation script |

**Deliverables:**
1. 🔄 GCS bucket for Terraform state
2. 🔄 Updated `terraform/instances/provider.tf` with GCS backend
3. 🔄 Secret rotation script (`scripts/rotate-secrets.sh`)
4. 🔄 Secret rotation GitHub Action (quarterly cron)

### Week 2 Day 4: Health Check & Monitoring

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Health check coverage | Partial | 100% | All services monitored |
| Auto-rollback triggers | None | Defined | Health check failures trigger rollback |
| Alerting rules | 0 | 12 | Critical path alerts |
| Grafana dashboards | 0 | 4 | Instance-specific dashboards |

**Deliverables:**
1. 🔄 `scripts/health-check-all.sh` - Comprehensive health verification
2. 🔄 Alertmanager rules in `monitoring/alertmanager.yml`
3. 🔄 Grafana dashboards from SSOT
4. 🔄 Auto-rollback mechanism

### Week 2 Day 5: Test Suite Completion

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| OPA test coverage | 100% | 100% | Maintain 163/163 |
| Backend test coverage | 94% | ≥95% | Jest coverage report |
| Frontend test coverage | ~60% | ≥60% | Jest coverage report |
| E2E test coverage | 0 | 6 flows | Playwright test suite |

**Deliverables:**
1. 🔄 Fix 11 failing backend test suites
2. 🔄 Playwright E2E test configuration
3. 🔄 6 critical E2E test scenarios
4. 🔄 Coverage reporting integration

---

## Implementation Details

### 1. Terraform GCS Remote State Backend

**GCS Bucket Configuration:**
```hcl
# terraform/instances/backend.tf
terraform {
  backend "gcs" {
    bucket  = "dive-v3-terraform-state"
    prefix  = "terraform/state"
    project = "dive25"
  }
}
```

**State Migration Steps:**
1. Create GCS bucket: `gsutil mb -p dive25 -l us-east4 gs://dive-v3-terraform-state`
2. Enable versioning: `gsutil versioning set on gs://dive-v3-terraform-state`
3. Migrate state: `terraform init -migrate-state` for each workspace

### 2. GitHub Actions Deployment Workflow

**Workflow Architecture:**
```
push/PR → ci-fast.yml → Build & Type Check → Approve
            ↓
        ci-comprehensive.yml → Full Test Suite
            ↓
        deploy-production.yml → Terraform Plan → Approval → Apply
            ↓
        Health Check → Success or Auto-Rollback
```

**Approval Gates:**
- Terraform changes: Required reviewer approval
- Production deployment: Manual approval gate
- DEU deployment: SSH-based deployment with verification

### 3. Secret Rotation Automation

**Rotation Schedule:**
- Keycloak admin passwords: Quarterly
- PostgreSQL passwords: Quarterly
- MongoDB passwords: Quarterly
- JWT/Auth secrets: Quarterly
- Federation secrets: Annually (after coordination with partners)

**Rotation Process:**
1. Generate new secret value
2. Update GCP Secret Manager (new version)
3. Restart affected services
4. Verify service health
5. Audit log the rotation event

### 4. Health Check System

**Health Check Endpoints:**
| Instance | Frontend | Backend | Keycloak | OPA | KAS |
|----------|----------|---------|----------|-----|-----|
| USA | usa-app.dive25.com | usa-api.dive25.com/health | usa-idp.dive25.com/health/ready | localhost:8181/health | localhost:8090/health |
| FRA | fra-app.dive25.com | fra-api.dive25.com/health | fra-idp.dive25.com/health/ready | localhost:8182/health | localhost:8091/health |
| GBR | gbr-app.dive25.com | gbr-api.dive25.com/health | gbr-idp.dive25.com/health/ready | localhost:8183/health | localhost:8092/health |
| DEU | deu-app.prosecurity.biz | deu-api.prosecurity.biz/health | deu-idp.prosecurity.biz/health/ready | remote:8181/health | remote:8080/health |

**Auto-Rollback Triggers:**
- Frontend: 3 consecutive failed health checks (>2 min)
- Backend: API 5xx error rate >5% for 2 min
- Keycloak: Health endpoint unhealthy for 5 min
- Database: Connection failures for 1 min

### 5. E2E Test Scenarios

**6 Critical Paths:**

1. **Authentication Flow**
   - Navigate to USA frontend → Select IdP → Login → Verify session

2. **Federation Login**
   - Navigate to FRA frontend → Select USA IdP → Cross-instance auth → Verify claims

3. **Resource Access (Clearance Check)**
   - Authenticate as SECRET user → Access SECRET resource → Verify allowed
   - Authenticate as CONFIDENTIAL user → Access SECRET resource → Verify denied

4. **MFA Enrollment (AAL2/AAL3)**
   - Login as TOP_SECRET user → Verify WebAuthn prompt → Complete enrollment

5. **ZTDF Download**
   - Authenticate → Request encrypted resource → KAS key release → Decrypt

6. **Admin Operations**
   - Admin login → Create user → Assign clearance → Verify attributes

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GCS state corruption | Low | High | Enable versioning, daily backups |
| Secret rotation service disruption | Medium | Medium | Rolling restart strategy |
| DEU remote deployment failure | Medium | Medium | SSH retry logic, manual fallback |
| E2E test flakiness | High | Low | Retry mechanisms, isolated test data |

---

## Success Criteria Checklist

### Day 1-2 (CI/CD Pipeline)
- [ ] Terraform GCS backend configured
- [ ] State migrated for all 4 instances
- [ ] `deploy-production.yml` workflow created
- [ ] Approval gates configured
- [ ] DEU remote deployment integrated

### Day 3 (Secrets & Rotation)
- [ ] Secret rotation script created
- [ ] Quarterly rotation cron configured
- [ ] Rotation audit logging implemented
- [ ] Documentation updated

### Day 4 (Monitoring)
- [ ] Health check script comprehensive
- [ ] Alertmanager rules configured (12 rules)
- [ ] Grafana dashboards created (4 dashboards)
- [ ] Auto-rollback mechanism tested

### Day 5 (Testing)
- [ ] Backend test failures fixed (≤6 failing)
- [ ] Playwright E2E suite configured
- [ ] 6 critical E2E scenarios implemented
- [ ] Coverage reporting in CI

---

## Appendix A: File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `terraform/instances/backend.tf` | Create | GCS state backend |
| `.github/workflows/deploy-production.yml` | Create | Deployment workflow |
| `scripts/rotate-secrets.sh` | Create | Secret rotation |
| `scripts/health-check-all.sh` | Create | Health verification |
| `monitoring/alertmanager-rules.yml` | Create | Alert rules |
| `monitoring/grafana/dashboards/*.json` | Create | Dashboards |
| `tests/e2e/playwright.config.ts` | Create | E2E config |
| `tests/e2e/*.spec.ts` | Create | E2E test files |

---

## Next Steps

1. **Immediate**: Begin Terraform GCS backend configuration
2. **Parallel**: Start deployment workflow creation
3. **Day 3**: Implement secret rotation
4. **Day 4**: Configure monitoring
5. **Day 5**: Complete test suite







