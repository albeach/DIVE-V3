# DIVE V3 Implementation Plan

**Version**: 1.2
**Date**: December 18, 2025
**Updated**: December 19, 2025
**Duration**: 6 Weeks
**Status**: Phase 3 Complete - Phase 4 Pending

---

## Executive Summary

This implementation plan delivers fully automated, repeatable deployments for DIVE V3 across Local and GCP Compute Engine environments. The plan is structured in 6 phases with SMART goals, clear acceptance criteria, and rollback strategies.

**Key Deliverables**:
- ✅ One-command local deployment with clean-slate capability
- 🔲 Automated GCP Compute Engine provisioning (pending)
- ✅ Full Keycloak IdP automation (dynamic federation)
- ✅ CI/CD pipeline with quality gates
- 🔲 95%+ test pass rate (in progress)

### Progress Summary

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 0: Documentation | ✅ Complete | 100% |
| Phase 1: Local Foundation | ✅ Complete | 100% |
| Phase 2: Keycloak IdP | ✅ Complete | 100% |
| Phase 3: Hub Management | ✅ Complete | 100% |
| Phase 4: GCP Deployment | 🔲 Pending | 0% |
| Phase 5: CI/CD | 🔄 Partial | 60% |
| Phase 6: Testing | 🔲 Pending | 30% |

---

## Reference Documentation

| Document | Path | Description |
|----------|------|-------------|
| **AUDIT** | `docs/AUDIT.md` | Security audit and compliance requirements |
| **GAP_ANALYSIS** | `docs/GAP_ANALYSIS.md` | Gap analysis with outstanding items |
| **TARGET_ARCHITECTURE** | `docs/TARGET_ARCHITECTURE.md` | Target system architecture |
| **IMPLEMENTATION_PLAN** | `docs/IMPLEMENTATION_PLAN.md` | Phased implementation plan (this document) |
| **BACKLOG** | `docs/BACKLOG.md` | Detailed backlog items (DIVE-0xx tasks) |
| **CI_CD_PLAN** | `docs/CI_CD_PLAN.md` | CI/CD pipeline configuration |

---

## Phase Overview

| Phase | Duration | Focus | Key Deliverable | Status |
|-------|----------|-------|-----------------|--------|
| 0 | Week 1 | Documentation | AUDIT.md, GAP_ANALYSIS.md, TARGET_ARCHITECTURE.md | ✅ Complete |
| 1 | Week 2 | Local Foundation | Idempotent nuke, rollback, health JSON | ✅ Complete |
| 2 | Week 3 | Keycloak IdP | Dynamic IdP creation via federation link | ✅ Complete |
| 3 | Week 4 | Hub Management | Hub spoke registry, health aggregation | 🔄 In Progress |
| 4 | Week 5 | GCP Deployment | Terraform GCS, pilot deploy/rollback | 🔲 Pending |
| 5 | Week 6 | CI/CD Pipeline | Deploy gates, auto-rollback | 🔄 Partial |
| 6 | Week 6 | Testing | E2E coverage, fixture completion | 🔲 Pending |

---

## Phase 0: Audit & Documentation

**Timeline**: Week 1 (Dec 18-24, 2025)
**Owner**: DevOps Lead
**Status**: IN PROGRESS

### Objectives

Create comprehensive documentation of current state and target architecture.

### SMART Goals

| Goal | Specific | Measurable | Achievable | Relevant | Time-bound |
|------|----------|------------|------------|----------|------------|
| G0.1 | Document all 19 CLI modules | 19 modules inventoried | Yes | Foundation for gaps | 2 days |
| G0.2 | Identify all gaps vs user guide | 15+ gaps documented | Yes | Prioritize fixes | 2 days |
| G0.3 | Design target architecture | Diagrams for Local+GCP | Yes | Guide implementation | 1 day |

### Deliverables

| Deliverable | Acceptance Criteria | File |
|-------------|---------------------|------|
| AUDIT.md | Documents 19 modules, 108 tests, 20+ workflows, GCP integration | `docs/AUDIT.md` |
| GAP_ANALYSIS.md | 15+ gaps with severity, impact, fix, effort | `docs/GAP_ANALYSIS.md` |
| TARGET_ARCHITECTURE.md | Local and GCP diagrams, rollback design | `docs/TARGET_ARCHITECTURE.md` |
| IMPLEMENTATION_PLAN.md | SMART goals for all phases | `docs/IMPLEMENTATION_PLAN.md` |
| BACKLOG.md | GitHub Issues format with epics | `docs/BACKLOG.md` |
| CI_CD_PLAN.md | Pipeline structure, quality gates | `docs/CI_CD_PLAN.md` |

### Success Criteria

- [ ] All 6 documentation files created
- [ ] PR review approved by 2 team members
- [ ] No unaddressed blockers in gap analysis

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Incomplete codebase scan | Low | Medium | Use automated tools |
| Missing tribal knowledge | Medium | Low | Interview stakeholders |

### Rollback Plan

N/A - Documentation only, no system changes.

---

## Phase 1: Local Foundation

**Timeline**: Week 2 (Dec 25-31, 2025)
**Owner**: DevOps Lead
**Dependencies**: Phase 0 complete

### Objectives

Achieve idempotent, one-command local deployment with rollback capability.

### SMART Goals

| Goal | Specific | Measurable | Achievable | Relevant | Time-bound |
|------|----------|------------|------------|----------|------------|
| G1.1 | Make `cmd_nuke` fully idempotent | Run 3x with no errors | Yes | Clean slate | 1 day |
| G1.2 | Add `--confirm` flag to nuke | Prompt required unless --force | Yes | Safety | 0.5 day |
| G1.3 | Implement deploy checkpoint | State saved before destructive ops | Yes | Rollback | 1.5 days |
| G1.4 | Add rollback command | Restore from checkpoint | Yes | Recovery | 1 day |
| G1.5 | Add `--json` to health | Structured output with exit codes | Yes | Automation | 0.5 day |
| G1.6 | Auto-load spoke secrets | No manual `secrets load` | Yes | UX | 0.5 day |
| G1.7 | Increase Keycloak timeout | 180s with backoff | Yes | Reliability | 0.5 day |

### Tasks

| Task ID | Description | File(s) | Effort |
|---------|-------------|---------|--------|
| T1.1 | Implement idempotent nuke | `scripts/dive-modules/deploy.sh` | 4h |
| T1.2 | Add --confirm flag | `scripts/dive-modules/deploy.sh` | 2h |
| T1.3 | Create checkpoint functions | `scripts/dive-modules/common.sh` | 6h |
| T1.4 | Implement rollback command | `scripts/dive-modules/deploy.sh` | 4h |
| T1.5 | Add --json to health | `scripts/dive-modules/status.sh` | 2h |
| T1.6 | Auto-load secrets in spoke | `scripts/dive-modules/spoke.sh` | 2h |
| T1.7 | Increase Keycloak timeout | `scripts/dive-modules/core.sh` | 2h |
| T1.8 | Create Phase 1 tests | `tests/docker/phase1-foundation.sh` | 4h |

### Acceptance Tests

```bash
# T1.1: Idempotent nuke
./dive nuke --confirm && ./dive nuke --confirm && ./dive nuke --confirm
# Expected: No errors on repeated runs

# T1.2: Confirmation prompt
./dive nuke
# Expected: Prompts for 'yes' confirmation

# T1.3-T1.4: Checkpoint and rollback
./dive deploy
./dive checkpoint create
# Modify something
./dive rollback
# Expected: Restored to checkpoint state

# T1.5: JSON health output
./dive health --json | jq '.services | keys'
# Expected: ["backend", "frontend", "keycloak", "mongodb", "opa", "opal", "redis"]

# T1.6: Auto secrets
unset POSTGRES_PASSWORD
./dive --instance fra spoke up
# Expected: Secrets loaded automatically, no error

# T1.7: Timeout
KEYCLOAK_WAIT_TIMEOUT=30 ./dive up
# Expected: Uses 30s timeout instead of default
```

### Success Criteria

- [ ] `./dive nuke --confirm` runs 3x consecutively without errors
- [ ] `./dive rollback` restores from checkpoint
- [ ] `./dive health --json` returns valid JSON with exit code
- [ ] All 9 Phase 0 baseline tests pass
- [ ] New Phase 1 tests pass

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Volume backup too slow | Medium | Low | Compress with gzip |
| Checkpoint storage full | Low | Medium | Limit to 3 checkpoints |
| Rollback incomplete | Medium | High | Test all services |

### Rollback Plan

```bash
# Revert module changes
git checkout HEAD~1 -- scripts/dive-modules/deploy.sh
git checkout HEAD~1 -- scripts/dive-modules/common.sh
git checkout HEAD~1 -- scripts/dive-modules/status.sh
```

### Quality Gate

- All Phase 0 and Phase 1 tests pass
- Manual validation of nuke/rollback cycle
- PR review approved

---

## Phase 2: Keycloak IdP Automation

**Timeline**: Week 3 (Dec 18-19, 2025)
**Owner**: Backend Lead
**Dependencies**: Phase 1 complete
**Status**: ✅ COMPLETE

### Objectives

Automate Keycloak IdP creation via dynamic federation link commands, eliminating manual setup.

### ✅ Completed Goals

| Goal | Specific | Measurable | Outcome | Status |
|------|----------|------------|---------|--------|
| G2.1 | Remove hardcoded IdPs from realm JSON | Clean realm template | IdPs now created dynamically | ✅ Done |
| G2.2 | Create dynamic IdP federation | `./dive federation link` | All NATO nations supported | ✅ Done |
| G2.3 | Add user profile templates | 32 locale-specific profiles | All NATO nations covered | ✅ Done |
| G2.4 | Create IdP verification script | 6-point verification | `scripts/verify-idps.sh` | ✅ Done |
| G2.5 | Create localized mappers | NATO attribute mappings | 32 mapper templates | ✅ Done |

### Completed Tasks

| Task ID | Description | File(s) | Status |
|---------|-------------|---------|--------|
| T2.1 | Remove hardcoded IdPs from realm JSON | `keycloak/realms/dive-v3-broker.json` | ✅ Done |
| T2.2 | Create apply-user-profile.sh | `scripts/spoke-init/apply-user-profile.sh` | ✅ Done |
| T2.3 | Create configure-localized-mappers.sh | `scripts/spoke-init/configure-localized-mappers.sh` | ✅ Done |
| T2.4 | Enhance init-keycloak.sh | `scripts/spoke-init/init-keycloak.sh` | ✅ Done |
| T2.5 | Create IdP verification script | `scripts/verify-idps.sh` | ✅ Done |
| T2.6 | Create Phase 2 tests | `tests/docker/phase2-idp-automation.sh` | ✅ Done (36 tests) |

### Acceptance Tests

```bash
# T2.1-T2.3: IdPs created on startup
./dive nuke --confirm && ./dive up
./dive exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password $KEYCLOAK_ADMIN_PASSWORD
./dive exec keycloak /opt/keycloak/bin/kcadm.sh get identity-provider/instances -r dive-v3-broker
# Expected: Returns 4 IdPs (usa-idp, gbr-idp, fra-idp, deu-idp)

# T2.3: Protocol mappers
./dive exec keycloak /opt/keycloak/bin/kcadm.sh get identity-provider/instances/usa-idp/mappers -r dive-v3-broker
# Expected: Returns clearance, acpCOI, countryOfAffiliation mappers

# T2.5: Verification script
./scripts/verify-idps.sh
# Expected: All 4 IdPs verified
```

### Success Criteria

- [x] IdPs created dynamically via `./dive federation link <CODE>`
- [x] Hardcoded IdPs removed from realm JSON
- [x] User profile templates applied automatically
- [x] Localized mappers configured for NATO attributes
- [x] IdP verification script works (`scripts/verify-idps.sh`)
- [x] 36 Phase 2 tests passing

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| JSON syntax errors | Medium | High | Validate with jq |
| Secret injection fails | Low | High | Test in isolation |
| IdP URLs incorrect | Medium | Medium | Environment-specific configs |

### Rollback Plan

```bash
# Revert to manual IdP creation
git checkout HEAD~1 -- keycloak/realms/dive-v3-broker.json
git checkout HEAD~1 -- keycloak/scripts/import-realm.sh
# Re-deploy with manual IdP setup
```

### Quality Gate

- All Phase 0, 1, and 2 tests pass
- Federation E2E tests pass
- Manual login test via each IdP

---

## Phase 3: GCP Compute Engine Deployment

**Timeline**: Week 4 (Jan 8-14, 2026)
**Owner**: DevOps Lead
**Dependencies**: Phase 2 complete
**Status**: ✅ COMPLETE (December 19, 2025)

### Objectives

Automate GCP Compute Engine provisioning with Terraform and implement rollback.

### ✅ Completed Goals

| Goal | Specific | Measurable | Outcome | Status |
|------|----------|------------|---------|--------|
| G3.1 | Configure Terraform GCS backend | State in gs://dive25-tfstate | `terraform/*/backend.tf` configured | ✅ Done |
| G3.2 | Create VM provisioning module | e2-standard-4 with Docker | `terraform/modules/compute-vm/` | ✅ Done |
| G3.3 | Implement `pilot deploy` | Full bootstrap from scratch | `./dive --env gcp pilot deploy` | ✅ Done |
| G3.4 | Implement `pilot rollback` | Restore from GCS checkpoint | GCS checkpoint storage | ✅ Done |
| G3.5 | Add VM health monitoring | Health check script on VM | `--json` flag for automation | ✅ Done |

### Completed Tasks

| Task ID | Description | File(s) | Status |
|---------|-------------|---------|--------|
| T3.1 | Create GCS bucket for state | `terraform/*/backend.tf` | ✅ Done |
| T3.2 | Add backend config to modules | `terraform/pilot/backend.tf`, `terraform/spoke/backend.tf` | ✅ Done |
| T3.3 | Create compute-vm module | `terraform/modules/compute-vm/` | ✅ Done |
| T3.4 | Create startup script | `terraform/modules/compute-vm/startup-script.sh` | ✅ Done |
| T3.5 | Implement pilot deploy | `scripts/dive-modules/pilot.sh` | ✅ Done |
| T3.6 | Implement pilot rollback | `scripts/dive-modules/pilot.sh` | ✅ Done |
| T3.7 | Add GCS checkpoint storage | `scripts/dive-modules/pilot.sh` | ✅ Done |
| T3.8 | Create Phase 3 tests | `tests/gcp/phase3-pilot.sh` | ✅ Done (10 tests) |

### Acceptance Tests

```bash
# T3.1-T3.2: Remote state configured
cd terraform/pilot && terraform init
terraform state list  # Uses GCS backend

# T3.3-T3.5: Pilot deploy works
./dive --env gcp pilot deploy
# Expected: VM provisioned, Docker installed, services running

# T3.5: Idempotent re-deploy
./dive --env gcp pilot deploy
# Expected: Terraform shows 0 changes

# T3.6: Rollback
./dive --env gcp pilot checkpoint create
# Make changes
./dive --env gcp pilot rollback
# Expected: Restored to checkpoint

# T3.5: Health monitoring with JSON
./dive --env gcp pilot health --json
# Expected: JSON with VM status, services health
```

### Success Criteria

- [x] Terraform uses GCS backend for all modules
- [x] `./dive --env gcp pilot deploy` provisions working stack from scratch
- [x] Re-running deploy shows 0 Terraform changes (idempotent)
- [x] `./dive --env gcp pilot rollback` restores from checkpoint
- [x] VM health checks pass with `--json` output
- [x] All Phase 3 tests pass (10/10)

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GCP quota exceeded | Low | High | Request quota increase |
| SSH key issues | Medium | Medium | Use gcloud ssh |
| Docker install fails | Low | High | Use verified startup script |

### Rollback Plan

```bash
# Destroy GCP resources
./dive --env gcp pilot destroy --confirm
# Revert module changes
git checkout HEAD~1 -- scripts/dive-modules/pilot.sh
git checkout HEAD~1 -- terraform/
```

### Quality Gate

- All Phase 0-3 tests pass
- Manual GCP deploy/rollback cycle verified
- VM accessible via SSH

---

## Phase 4: CI/CD Pipeline

**Timeline**: Week 5 (Jan 15-21, 2026)
**Owner**: DevOps Lead
**Dependencies**: Phase 3 complete

### Objectives

Implement CI/CD pipeline with quality gates and automatic rollback.

### SMART Goals

| Goal | Specific | Measurable | Achievable | Relevant | Time-bound |
|------|----------|------------|------------|----------|------------|
| G4.1 | Add deploy dry-run to PRs | PR blocked if dry-run fails | Yes | Quality gate | 1 day |
| G4.2 | Create GCP deploy workflow | Auto-deploy on main merge | Yes | Automation | 1 day |
| G4.3 | Implement auto-rollback | Rollback on E2E failure | Yes | Resilience | 1 day |
| G4.4 | Add semantic versioning | Images tagged with version | Yes | Traceability | 0.5 day |
| G4.5 | Create deployment dashboard | GitHub Actions summary | Yes | Visibility | 0.5 day |

### Tasks

| Task ID | Description | File(s) | Effort |
|---------|-------------|---------|--------|
| T4.1 | Create dive-pr-checks.yml | `.github/workflows/dive-pr-checks.yml` | 4h |
| T4.2 | Create dive-deploy.yml | `.github/workflows/dive-deploy.yml` | 4h |
| T4.3 | Add rollback job | `.github/workflows/dive-deploy.yml` | 2h |
| T4.4 | Add version tagging | `.github/workflows/dive-deploy.yml` | 2h |
| T4.5 | Create dashboard step | `.github/workflows/dive-deploy.yml` | 2h |
| T4.6 | Add GCP service account | GitHub Secrets | 1h |
| T4.7 | Create Phase 4 tests | `tests/ci/phase4-pipeline.sh` | 4h |

### Acceptance Tests

```bash
# T4.1: PR checks block bad deploys
# Create PR with broken compose
# Expected: dive-pr-checks fails, PR cannot merge

# T4.2: Auto-deploy on main
# Merge PR to main
# Expected: dive-deploy runs, dev environment updated

# T4.3: Auto-rollback on failure
# Deploy with failing E2E test
# Expected: Rollback job triggers, dev restored

# T4.4: Version tags
docker images | grep dive-v3
# Expected: Images tagged with git SHA and semver
```

### Success Criteria

- [ ] PRs with broken deploys cannot merge
- [ ] Main merges auto-deploy to dev
- [ ] E2E failures trigger automatic rollback
- [ ] Docker images tagged with semantic versions
- [ ] All 108 Docker tests pass in CI

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CI timeouts | Medium | Medium | Increase timeout, add caching |
| Flaky tests | High | Medium | Add retry logic |
| Secrets exposure | Low | High | Use GitHub encrypted secrets |

### Rollback Plan

```bash
# Disable failing workflow
# Manual deploy to restore dev
./dive --env gcp pilot deploy
```

### Quality Gate

- All 108 Docker phase tests pass in CI
- Manual PR test with intentional failure
- Successful auto-deploy to dev

---

## Phase 5: Testing Suite Completion

**Timeline**: Week 6 (Jan 22-28, 2026)
**Owner**: QA Lead
**Dependencies**: Phase 4 complete

### Objectives

Complete test coverage for new automation and achieve 95%+ pass rate.

### SMART Goals

| Goal | Specific | Measurable | Achievable | Relevant | Time-bound |
|------|----------|------------|------------|----------|------------|
| G5.1 | Create local deploy E2E test | Full nuke→deploy→verify | Yes | Validation | 1 day |
| G5.2 | Create GCP deploy E2E test | Pilot lifecycle test | Yes | Validation | 1 day |
| G5.3 | Add IdP login tests | Login via all 4 IdPs | Yes | Federation | 1 day |
| G5.4 | Create missing fixtures | All referenced fixtures exist | Yes | Reliability | 1 day |
| G5.5 | Achieve 95% pass rate | 95%+ tests pass | Yes | Quality | 1 day |

### Tasks

| Task ID | Description | File(s) | Effort |
|---------|-------------|---------|--------|
| T5.1 | Create local deploy E2E | `tests/e2e/local-deploy.test.sh` | 4h |
| T5.2 | Create GCP deploy E2E | `tests/e2e/gcp-deploy.test.sh` | 4h |
| T5.3 | Create IdP login tests | `tests/e2e/idp-login.test.sh` | 4h |
| T5.4 | Audit missing fixtures | `tests/fixtures/` | 2h |
| T5.5 | Generate spoke configs | `tests/fixtures/federation/spoke-configs/` | 4h |
| T5.6 | Create dynamic-test-runner.sh | `scripts/dynamic-test-runner.sh` | 4h |
| T5.7 | Fix flaky tests | Various | 4h |
| T5.8 | Create test summary report | `tests/COVERAGE.md` | 2h |

### Acceptance Tests

```bash
# T5.1: Local deploy E2E
./tests/e2e/local-deploy.test.sh
# Expected: Full cycle passes

# T5.2: GCP deploy E2E
./tests/e2e/gcp-deploy.test.sh
# Expected: Pilot lifecycle passes

# T5.3: IdP login tests
./tests/e2e/idp-login.test.sh
# Expected: All 4 IdPs tested

# T5.5: 95% pass rate
./dive test all
# Expected: 95%+ tests pass
```

### Success Criteria

- [ ] Local deploy E2E test passes
- [ ] GCP deploy E2E test passes
- [ ] IdP login tests pass for all 4 IdPs
- [ ] All referenced fixtures exist
- [ ] 95%+ overall test pass rate
- [ ] No flaky tests (3 consecutive passes)

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Test environment issues | Medium | Medium | Use isolated environments |
| Flaky tests remain | Medium | Low | Add retry logic, fix root cause |
| GCP test costs | Low | Low | Use spot instances |

### Rollback Plan

```bash
# Disable failing tests
# Create issues for fixes
# Maintain 90% target temporarily
```

### Quality Gate

- 95%+ test pass rate
- No blocker issues open
- Documentation updated

---

## Definition of Done (All Phases)

### Phase Completion Checklist

- [ ] All SMART goals met
- [ ] All acceptance tests pass
- [ ] PR review approved
- [ ] Documentation updated
- [ ] No blocker issues
- [ ] Rollback verified

### Project Completion Checklist

- [ ] `./dive nuke --confirm && ./dive deploy` < 5 minutes
- [ ] `./dive --env gcp pilot deploy` provisions working stack
- [ ] All 4 IdPs (USA, GBR, FRA, DEU) functional after deploy
- [ ] PRs blocked if deploy dry-run fails
- [ ] 95%+ test pass rate
- [ ] `./dive --env gcp pilot rollback` restores previous state
- [ ] All 6 documentation files reviewed and merged

---

## Resource Requirements

### Team

| Role | Allocation | Phase |
|------|------------|-------|
| DevOps Lead | 100% | 0-5 |
| Backend Lead | 50% | 2-3 |
| QA Lead | 50% | 4-5 |
| Reviewer | 10% | All |

### Infrastructure

| Resource | Environment | Cost |
|----------|-------------|------|
| e2-standard-4 | Dev | ~$100/month |
| GCS Storage | State/Checkpoints | ~$5/month |
| GitHub Actions | CI/CD | Free tier |

### Tools

| Tool | Purpose | License |
|------|---------|---------|
| Terraform | IaC | Open Source |
| Docker | Containers | Free |
| gcloud CLI | GCP | Free |
| ShellCheck | Linting | Open Source |

---

## Appendix: Timeline Visualization

```
Week 1 (Dec 18-24)    Week 2 (Dec 25-31)    Week 3 (Jan 1-7)
├─ Phase 0 ─────────┤├─ Phase 1 ──────────┤├─ Phase 2 ──────────┤
│ Documentation     ││ Local Foundation   ││ Keycloak IdP       │
│ AUDIT.md          ││ Idempotent nuke    ││ Realm JSON IdPs    │
│ GAP_ANALYSIS.md   ││ Rollback           ││ Secrets injection  │
│ ARCHITECTURE.md   ││ Health JSON        ││ Protocol mappers   │
└───────────────────┘└────────────────────┘└────────────────────┘

Week 4 (Jan 8-14)     Week 5 (Jan 15-21)    Week 6 (Jan 22-28)
├─ Phase 3 ──────────┤├─ Phase 4 ──────────┤├─ Phase 5 ──────────┤
│ GCP Deployment     ││ CI/CD Pipeline     ││ Testing            │
│ Terraform GCS      ││ PR checks          ││ E2E tests          │
│ Pilot deploy       ││ Auto-deploy        ││ Fixtures           │
│ Pilot rollback     ││ Auto-rollback      ││ 95% pass rate      │
└────────────────────┘└────────────────────┘└────────────────────┘
```
