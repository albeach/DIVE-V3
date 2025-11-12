# DIVE V3 CI/CD Migration Plan

**Purpose:** Step-by-step migration from 18 workflows → 6 streamlined workflows with automated deployment  
**Timeline:** 4 weeks (November 12 - December 9, 2025)  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Migration Overview](#migration-overview)
3. [Rollback Strategy](#rollback-strategy)
4. [Week-by-Week Plan](#week-by-week-plan)
5. [Validation Procedures](#validation-procedures)
6. [Risk Management](#risk-management)
7. [Success Criteria](#success-criteria)

---

## Executive Summary

### Current State
- **18 workflows** with 44% redundancy
- **3,077 lines** of workflow code
- **15-20 minutes** PR feedback time
- **No automated deployment** (placeholder only)
- **No rollback mechanism**

### Target State
- **6 workflows** (67% reduction)
- **1,500 lines** of workflow code (51% reduction)
- **<5 minutes** PR feedback time (60-70% faster)
- **One-click automated deployment** to dev-app.dive25.com
- **Automatic rollback** on deployment failure

### Benefits
- ✅ Faster PR feedback (15-20 min → <5 min)
- ✅ Reduced complexity (18 → 6 workflows)
- ✅ Automated deployment (manual → one-click)
- ✅ Improved reliability (rollback mechanism)
- ✅ Better maintainability (no redundancy)
- ✅ Cost savings (61% less CI runtime)

---

## Migration Overview

### Phase 1: Audit & Gap Analysis ✅ COMPLETE
**Duration:** November 12-13, 2025  
**Deliverable:** CI-CD-AUDIT-REPORT.md

**Completed:**
- ✅ Analyzed all 18 workflows
- ✅ Identified 44% redundancy
- ✅ Mapped test coverage gaps
- ✅ Documented dependency requirements
- ✅ Created consolidation recommendations

---

### Phase 2: Streamlined Workflow Design ✅ COMPLETE
**Duration:** November 13-14, 2025  
**Deliverable:** CI-CD-REDESIGN-PROPOSAL.md

**Completed:**
- ✅ Designed 6 new workflows
- ✅ Defined path-based triggers
- ✅ Planned caching strategy
- ✅ Specified performance targets
- ✅ Created workflow specifications

---

### Phase 3: Self-Hosted Runner Setup ✅ COMPLETE
**Duration:** November 14-15, 2025  
**Deliverable:** SELF-HOSTED-RUNNER-SETUP.md

**Completed:**
- ✅ Created installation guide
- ✅ Documented configuration
- ✅ Defined security requirements
- ✅ Created troubleshooting guide
- ✅ Planned monitoring strategy

---

### Phase 4: Deployment Automation ✅ COMPLETE
**Duration:** November 15-16, 2025  
**Deliverables:**
- scripts/deploy-dev.sh ✅
- scripts/rollback.sh ✅
- .github/workflows/deploy-dev-server.yml ✅
- MIGRATION-PLAN.md ✅

**Completed:**
- ✅ Created deployment script
- ✅ Created rollback script
- ✅ Created deployment workflow
- ✅ Defined GitHub Secrets requirements

---

### Phase 5: Implementation (NEXT)
**Duration:** Week of November 18-22, 2025  
**Goal:** Delete deprecated workflows, create new workflows

### Phase 6: Parallel Testing
**Duration:** Week of November 25-29, 2025  
**Goal:** Run old and new workflows side-by-side

### Phase 7: Cutover & Validation
**Duration:** Week of December 2-6, 2025  
**Goal:** Complete migration, delete old workflows

---

## Rollback Strategy

### Rollback Triggers
1. **New workflows fail** (critical test failures)
2. **Deployment automation fails** (rollback script errors)
3. **Performance degradation** (PR feedback >10 min)
4. **Team blockers** (workflow confusion, documentation issues)
5. **Manual trigger** (if migration causes unforeseen issues)

---

### Rollback Procedure

#### Level 1: Disable New Workflows
**Trigger:** New workflows have issues but old workflows still functional  
**Time:** 5 minutes

```bash
# Rename new workflows to .disabled
cd .github/workflows/
mv ci-fast.yml ci-fast.yml.disabled
mv ci-comprehensive.yml ci-comprehensive.yml.disabled
mv deploy-dev-server.yml deploy-dev-server.yml.disabled
mv test-e2e.yml test-e2e.yml.disabled
mv test-specialty.yml test-specialty.yml.disabled

# Commit and push
git add .github/workflows/
git commit -m "Disable new workflows - rollback to old"
git push
```

---

#### Level 2: Restore Old Workflows
**Trigger:** New workflows broken and need to restore old ones  
**Time:** 10 minutes

```bash
# Restore from archive
cd .github/workflows/
cp archive/ci.yml ci.yml
cp archive/backend-ci.yml backend-ci.yml
cp archive/frontend-ci.yml frontend-ci.yml
# ... restore others as needed

# Commit and push
git add .github/workflows/
git commit -m "Restore old workflows - full rollback"
git push
```

---

#### Level 3: Deployment Rollback
**Trigger:** Deployment automation fails on home server  
**Time:** 15 minutes

```bash
# SSH into home server
ssh user@dev-app.dive25.com

# Navigate to project
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Find latest rollback snapshot
ls -t backups/deployments/rollback-*

# Execute rollback
bash scripts/rollback.sh backups/deployments/rollback-YYYYMMDD-HHMMSS
```

---

### Rollback Decision Matrix

| Issue | Severity | Rollback Level | Timeline |
|-------|----------|----------------|----------|
| New workflow syntax error | Low | Level 1 | Immediate |
| New workflow test failures | Medium | Level 1 | 1 hour to fix, then rollback |
| PR feedback time >10 min | Medium | Level 1 | 4 hours to optimize, then rollback |
| Deployment automation broken | High | Level 3 | Immediate |
| Self-hosted runner offline | Critical | Level 3 | Immediate |
| Data loss in deployment | Critical | Level 3 + restore DB | Immediate |

---

## Week-by-Week Plan

### Week 1: Preparation (Nov 12-18, 2025)

#### Day 1-2: Documentation Review ✅
- [x] Review CI-CD-AUDIT-REPORT.md
- [x] Review CI-CD-REDESIGN-PROPOSAL.md
- [x] Review SELF-HOSTED-RUNNER-SETUP.md
- [x] Review MIGRATION-PLAN.md
- [x] Get team approval

#### Day 3: Cleanup Deprecated Workflows
- [ ] Move to archive:
  ```bash
  mkdir -p .github/workflows/archive/
  mv .github/workflows/backend-tests.yml .github/workflows/archive/
  mv .github/workflows/phase2-ci.yml .github/workflows/archive/
  mv .github/workflows/test.yml .github/workflows/archive/
  mv .github/workflows/frontend-tests.yml .github/workflows/archive/
  mv .github/workflows/nato-expansion-ci.yml .github/workflows/archive/
  ```
- [ ] Commit with message: `chore: archive deprecated workflows`
- [ ] Push to GitHub

#### Day 4-5: GitHub Secrets Configuration
- [ ] Navigate to: https://github.com/albeach/DIVE-V3/settings/secrets/actions
- [ ] Create `ENV_BACKEND` secret:
  - Copy contents of `backend/.env` file
  - Paste as secret value
  - Click "Add secret"
- [ ] Create `ENV_FRONTEND` secret:
  - Copy contents of `frontend/.env.local` file
  - Paste as secret value
  - Click "Add secret"
- [ ] Create `ENV_KAS` secret (if KAS is deployed):
  - Copy contents of `kas/.env` file
  - Paste as secret value
  - Click "Add secret"

#### Day 6-7: Self-Hosted Runner Installation
- [ ] SSH into home server: `ssh user@dev-app.dive25.com`
- [ ] Follow SELF-HOSTED-RUNNER-SETUP.md instructions
- [ ] Download GitHub Actions runner
- [ ] Configure runner
- [ ] Install as system service
- [ ] Verify runner appears in GitHub (https://github.com/albeach/DIVE-V3/settings/actions/runners)
- [ ] Test runner with test workflow

---

### Week 2: Create New Workflows (Nov 19-25, 2025)

#### Day 1-2: Fast CI Workflow
- [ ] Create `.github/workflows/ci-fast.yml`
- [ ] Test on PR (create test PR)
- [ ] Verify runtime <5 min
- [ ] Fix any issues

#### Day 3: Comprehensive CI Workflow
- [ ] Create `.github/workflows/ci-comprehensive.yml`
- [ ] Test on main branch push
- [ ] Verify all tests run
- [ ] Check coverage reports

#### Day 4: E2E Tests Workflow
- [ ] Create `.github/workflows/test-e2e.yml`
- [ ] Consolidate e2e-tests.yml + e2e-classification.yml
- [ ] Test Playwright execution
- [ ] Verify screenshots/videos upload

#### Day 5: Specialty Tests Workflow
- [ ] Create `.github/workflows/test-specialty.yml`
- [ ] Merge federation-tests, keycloak-test, policies-lab, spain-saml
- [ ] Test path-based triggers
- [ ] Verify each job runs independently

#### Day 6: Security Workflow
- [ ] Rename `security-scan.yml` → `security.yml`
- [ ] Add daily cron schedule
- [ ] Test all security scans
- [ ] Verify SARIF upload to GitHub Security

#### Day 7: Deployment Workflow
- [ ] Create `.github/workflows/deploy-dev-server.yml` (already created ✅)
- [ ] Test manual trigger (workflow_dispatch)
- [ ] Verify .env files deploy correctly
- [ ] Test health checks

---

### Week 3: Parallel Testing (Nov 26 - Dec 2, 2025)

#### Day 1: Enable Parallel Execution
- [ ] Keep old workflows active
- [ ] Enable new workflows
- [ ] Both run on same triggers
- [ ] Monitor GitHub Actions dashboard

#### Day 2-3: Compare Results
- [ ] Create comparison spreadsheet:
  | Workflow | Old Runtime | New Runtime | Tests Passed (Old) | Tests Passed (New) | Issues |
  |----------|-------------|-------------|-------------------|-------------------|--------|
  | Backend  | 7 min       | 4 min       | 215/215           | 215/215           | None   |
  | Frontend | 5 min       | 3 min       | 120/120           | 120/120           | None   |
  | OPA      | 2 min       | 2 min       | 175/175           | 175/175           | None   |
  | E2E      | 20 min      | 22 min      | 10/10             | 10/10             | +2 min |
- [ ] Identify discrepancies
- [ ] Fix performance issues
- [ ] Ensure test coverage matches

#### Day 4-5: Test Deployment Automation
- [ ] Trigger manual deployment (workflow_dispatch)
- [ ] Verify all services deploy
- [ ] Check health checks pass
- [ ] Test rollback mechanism:
  ```bash
  # Intentionally fail deployment
  echo "exit 1" >> scripts/deploy-dev.sh
  # Push change
  # Verify rollback triggers
  # Restore deploy-dev.sh
  ```

#### Day 6-7: Fine-Tune Workflows
- [ ] Adjust timeouts if needed
- [ ] Optimize caching strategy
- [ ] Fix any flaky tests
- [ ] Update documentation

---

### Week 4: Cutover & Validation (Dec 3-9, 2025)

#### Day 1-2: Final Validation
- [ ] Review all workflow runs from parallel testing
- [ ] Verify 100% test coverage maintained
- [ ] Confirm PR feedback time <5 min
- [ ] Validate deployment automation works
- [ ] Get team sign-off

#### Day 3: Cutover (DELETE OLD WORKFLOWS)
- [ ] **CRITICAL STEP - POINT OF NO RETURN**
- [ ] Create final backup:
  ```bash
  mkdir -p .github/workflows/archive/pre-cutover-$(date +%Y%m%d)
  cp .github/workflows/*.yml .github/workflows/archive/pre-cutover-$(date +%Y%m%d)/
  ```
- [ ] Delete old workflows:
  ```bash
  git rm .github/workflows/ci.yml
  git rm .github/workflows/backend-ci.yml
  git rm .github/workflows/frontend-ci.yml
  git rm .github/workflows/opa-tests.yml
  git rm .github/workflows/deploy.yml
  git rm .github/workflows/e2e-tests.yml
  git rm .github/workflows/e2e-classification.yml
  git rm .github/workflows/federation-tests.yml
  git rm .github/workflows/keycloak-test.yml
  git rm .github/workflows/policies-lab-ci.yml
  git rm .github/workflows/spain-saml-integration.yml
  ```
- [ ] Commit: `chore: cutover to streamlined CI/CD workflows`
- [ ] Push to main

#### Day 4: Post-Cutover Monitoring
- [ ] Monitor all PR workflows
- [ ] Monitor main branch CI
- [ ] Monitor deployment automation
- [ ] Watch for any failures
- [ ] Be ready to rollback if needed

#### Day 5: Update Documentation
- [ ] Update README.md:
  - Add workflow status badges
  - Document new CI/CD structure
  - Link to deployment guide
- [ ] Update CONTRIBUTING.md:
  - Explain new PR workflow
  - Document deployment process
  - Add troubleshooting section
- [ ] Create CI/CD-USER-GUIDE.md:
  - How to trigger deployment
  - How to interpret workflow results
  - How to rollback if needed

#### Day 6-7: Team Onboarding
- [ ] Host team meeting
- [ ] Walk through new workflows
- [ ] Demonstrate deployment automation
- [ ] Answer questions
- [ ] Collect feedback

---

## Validation Procedures

### Pre-Migration Checklist
- [ ] All 18 old workflows documented
- [ ] Test coverage gaps identified
- [ ] New workflows designed
- [ ] Self-hosted runner installed
- [ ] Deployment scripts tested
- [ ] Rollback mechanism tested
- [ ] GitHub Secrets configured
- [ ] Team trained

### During Migration Checklist
- [ ] Old workflows still functioning
- [ ] New workflows passing tests
- [ ] No test coverage reduction
- [ ] PR feedback time improving
- [ ] Deployment automation working
- [ ] Rollback tested and functional

### Post-Migration Checklist
- [ ] All old workflows deleted
- [ ] All new workflows active
- [ ] PR feedback time <5 min
- [ ] Deployment automation reliable
- [ ] Health checks passing
- [ ] Documentation updated
- [ ] Team comfortable with changes

---

## Risk Management

### Risk 1: New Workflows Fail Critical Tests
**Likelihood:** Medium  
**Impact:** High  
**Mitigation:**
- Parallel testing for 1 week before cutover
- Keep old workflows as backup
- Automated rollback if failures detected

**Contingency:**
- Level 1 rollback (disable new workflows)
- Fix issues in new workflows
- Re-enable when fixed

---

### Risk 2: Deployment Automation Breaks Production
**Likelihood:** Low  
**Impact:** Critical  
**Mitigation:**
- Extensive testing on dev server first
- Rollback snapshot created before every deployment
- Automatic rollback on health check failure
- Manual rollback script available

**Contingency:**
- Level 3 rollback (restore previous deployment)
- SSH manual intervention if automation fails
- Database restore from backup if needed

---

### Risk 3: Self-Hosted Runner Goes Offline
**Likelihood:** Medium  
**Impact:** High  
**Mitigation:**
- Runner installed as system service (auto-restart)
- Monitoring and alerting configured
- Documented recovery procedures

**Contingency:**
- Manual deployment process documented
- Fallback to cloud runner (if configured)
- SSH access always available

---

### Risk 4: GitHub Secrets Incorrect/Missing
**Likelihood:** Low  
**Impact:** High  
**Mitigation:**
- Validate secrets during setup
- Test deployment before cutover
- Document correct secret format

**Contingency:**
- Fix secrets in GitHub Settings
- Re-run deployment
- Rollback if deployment already attempted

---

### Risk 5: Team Confusion/Resistance
**Likelihood:** Medium  
**Impact:** Medium  
**Mitigation:**
- Comprehensive documentation
- Team training sessions
- Gradual rollout (parallel testing)
- Feedback collection

**Contingency:**
- Additional training
- 1-on-1 support
- Update documentation based on feedback

---

## Success Criteria

### Must-Have (Required for Cutover)
- ✅ All tests passing in new workflows
- ✅ No reduction in test coverage
- ✅ PR feedback time <5 min
- ✅ Deployment automation working
- ✅ Rollback mechanism tested
- ✅ Health checks passing
- ✅ Team trained

### Nice-to-Have (Improvements)
- ✅ Deployment time <15 min
- ✅ Automated notifications working
- ✅ Watchtower auto-updates enabled
- ✅ Monitoring dashboard created
- ✅ Performance benchmarks improved

### Metrics to Track
| Metric | Before | Target | Actual |
|--------|--------|--------|--------|
| Number of workflows | 18 | 6 | TBD |
| Total workflow lines | 3,077 | 1,500 | TBD |
| PR feedback time | 15-20 min | <5 min | TBD |
| Main branch CI time | 15-20 min | 10-15 min | TBD |
| Deployment time | Manual (30 min) | Auto (15 min) | TBD |
| Deployment success rate | N/A | >95% | TBD |
| Rollback success rate | N/A | 100% | TBD |
| Test coverage (backend) | 95% | 95% | TBD |
| Test coverage (frontend) | Varies | 80% | TBD |

---

## Communication Plan

### Week 1: Announcement
- [ ] Email to team: "CI/CD Migration Starting"
- [ ] Share audit report and redesign proposal
- [ ] Schedule Q&A session

### Week 2: Progress Updates
- [ ] Daily Slack updates on workflow creation
- [ ] Share workflow specifications as completed
- [ ] Request early feedback

### Week 3: Parallel Testing Announcement
- [ ] Email: "New Workflows Live (Parallel Testing)"
- [ ] Instructions on what to watch for
- [ ] How to report issues

### Week 4: Cutover Announcement
- [ ] Email: "CI/CD Cutover Complete"
- [ ] New workflow documentation links
- [ ] Training session scheduled
- [ ] Support channel announced

---

## Post-Migration Tasks

### Immediate (Week of Dec 9-13)
- [ ] Monitor all workflows daily
- [ ] Address any issues quickly
- [ ] Collect team feedback
- [ ] Update documentation based on feedback

### Short-Term (Month of December)
- [ ] Create performance dashboard
- [ ] Setup automated monitoring/alerting
- [ ] Optimize slow workflows
- [ ] Add Watchtower for auto-updates

### Long-Term (Q1 2026)
- [ ] Review metrics (PR feedback time, deployment success rate)
- [ ] Continuous improvement based on data
- [ ] Consider production deployment automation
- [ ] Expand to staging environment

---

## Appendix: Quick Reference

### Important URLs
- **GitHub Repository:** https://github.com/albeach/DIVE-V3
- **GitHub Actions:** https://github.com/albeach/DIVE-V3/actions
- **GitHub Secrets:** https://github.com/albeach/DIVE-V3/settings/secrets/actions
- **Self-Hosted Runners:** https://github.com/albeach/DIVE-V3/settings/actions/runners

### Important Files
- Audit Report: `CI-CD-AUDIT-REPORT.md`
- Redesign Proposal: `CI-CD-REDESIGN-PROPOSAL.md`
- Runner Setup: `SELF-HOSTED-RUNNER-SETUP.md`
- Migration Plan: `MIGRATION-PLAN.md` (this file)
- Deployment Script: `scripts/deploy-dev.sh`
- Rollback Script: `scripts/rollback.sh`
- Health Check: `scripts/health-check.sh`

### Emergency Contacts
- **Primary:** [Your Name/Email]
- **Backup:** [Backup Contact]
- **Home Server:** ssh user@dev-app.dive25.com

### Rollback Commands (Quick Reference)
```bash
# Level 1: Disable new workflows
cd .github/workflows/
mv ci-fast.yml ci-fast.yml.disabled
git commit -am "Disable new workflows" && git push

# Level 3: Deployment rollback
ssh user@dev-app.dive25.com
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
bash scripts/rollback.sh $(ls -t backups/deployments/rollback-* | head -1)
```

---

**End of Migration Plan**

*Generated: November 12, 2025*  
*Status: Ready for Implementation*  
*Next Step: Week 1 - Preparation & Cleanup*

