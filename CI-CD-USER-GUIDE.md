# DIVE V3 CI/CD User Guide

**Version:** 2.0  
**Last Updated:** November 14, 2025  
**Migration Status:** Week 4 - Optimization Complete ✅  

---

## Table of Contents

1. [Overview](#overview)
2. [Understanding Workflows](#understanding-workflows)
3. [Pull Request Process](#pull-request-process)
4. [Deployment Process](#deployment-process)
5. [Rollback Process](#rollback-process)
6. [Troubleshooting](#troubleshooting)
7. [Performance Monitoring](#performance-monitoring)
8. [FAQ](#faq)

---

## Overview

### What is CI/CD?

**CI (Continuous Integration):** Automatically test code changes when you create a Pull Request  
**CD (Continuous Deployment):** Automatically or manually deploy code to servers

### Why Do We Use CI/CD?

- ✅ **Fast Feedback:** Know within 5 minutes if your code has issues
- ✅ **Prevent Bugs:** Catch problems before they reach production
- ✅ **Consistent Deployment:** Same process every time
- ✅ **Automatic Rollback:** Failed deployments automatically revert

### DIVE V3 CI/CD Pipeline

```
┌──────────────┐
│  Code Change │
└──────┬───────┘
       │
       ├─ Pull Request ──→ ci-fast.yml (< 5 min) ──→ Pass? ──→ Merge to main
       │                                               │
       │                                               ├─ Fail? ──→ Fix issues
       │
       └─ Main Branch ───→ ci-comprehensive.yml (10-15 min)
                              │
                              ├─ Manual Trigger ──→ deploy-dev-server.yml (6-8 min)
                              │                            │
                              │                            ├─ Success ──→ Live on dev-app.dive25.com
                              │                            │
                              │                            └─ Failure ──→ Automatic Rollback
```

---

## Understanding Workflows

DIVE V3 uses **6 streamlined workflows** (reduced from 18):

### 1. ci-fast.yml - Fast PR Feedback

**When it runs:**
- Every Pull Request to `main` or `develop`
- Only if code files change (not documentation)

**What it does:**
- ✅ Checks if code compiles
- ✅ Runs linters (ESLint)
- ✅ Validates types (TypeScript)
- ✅ Verifies policies compile (OPA)
- ✅ Validates Terraform configuration

**Runtime:** <5 minutes

**Path Filters:**
```
Runs when:  backend/src/**, frontend/src/**, policies/**, terraform/**
Skips when: **.md, docs/**, scripts/**
```

**What you see:**
- GitHub shows "CI - Fast PR Feedback" check
- Green ✅ = Good to merge
- Red ❌ = Fix issues before merge

---

### 2. ci-comprehensive.yml - Full Test Suite

**When it runs:**
- Every push to `main` (after PR merge)
- Daily at 2 AM UTC (scheduled)
- Manual trigger (workflow_dispatch)

**What it does:**
- ✅ Backend unit tests (95% coverage required)
- ✅ Backend integration tests
- ✅ Frontend unit tests
- ✅ OPA policy tests
- ✅ Performance tests
- ✅ Docker image builds
- ✅ Security audits
- ✅ Coverage reports

**Runtime:** 10-15 minutes (actual: ~4-5 min)

**What you see:**
- GitHub shows "CI - Comprehensive Test Suite"
- Runs in background after merge
- Failures trigger email notifications

---

### 3. test-e2e.yml - End-to-End Tests

**When it runs:**
- Pull Requests (if frontend/backend changed)
- Push to `main`
- Manual trigger

**What it does:**
- ✅ Browser tests (Playwright)
- ✅ Authentication flows
- ✅ Authorization checks
- ✅ Classification equivalency
- ✅ Resource management

**Runtime:** 20-25 minutes

**What you see:**
- GitHub shows "E2E Tests"
- 4 parallel jobs (Authentication, Authorization, Classification, Resources)
- Screenshots/videos available if tests fail

---

### 4. test-specialty.yml - Feature-Specific Tests

**When it runs:**
- **Smart Triggers:** Only if commit message mentions feature
- Examples: "federation", "keycloak", "spain", "saml"

**What it does:**
- ✅ Federation tests (OAuth, SCIM)
- ✅ Keycloak integration tests
- ✅ Policies Lab tests
- ✅ Spain SAML tests

**Runtime:** Variable (only relevant tests run)

**Smart Behavior:**
```bash
# This commit triggers Spain SAML tests:
git commit -m "fix(saml): update Spain metadata"

# This commit skips all specialty tests:
git commit -m "fix(api): update resource endpoint"
```

---

### 5. security.yml - Security Scanning

**When it runs:**
- Pull Requests
- Push to `main`
- Daily at 2 AM UTC (scheduled)

**What it does:**
- ✅ NPM security audit
- ✅ OWASP dependency check
- ✅ Secret scanning (TruffleHog)
- ✅ Docker image scanning (Trivy)
- ✅ Terraform security (tfsec, Checkov)

**Runtime:** Variable

**What you see:**
- Security findings in GitHub Security tab
- SARIF reports uploaded
- Detailed vulnerability reports

---

### 6. deploy-dev-server.yml - Automated Deployment

**When it runs:**
- **Manual trigger only** (no automatic deployments)

**What it does:**
- ✅ Deploys to dev-app.dive25.com
- ✅ Updates .env files
- ✅ Restarts Docker services
- ✅ Runs health checks
- ✅ **Automatic rollback on failure**

**Runtime:** 6-8 minutes

**Endpoints:**
- Frontend: https://dev-app.dive25.com
- Backend: https://dev-api.dive25.com
- Keycloak: https://dev-auth.dive25.com

---

## Pull Request Process

### Step 1: Create Your Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Step 2: Make Changes

- Write code
- Add tests
- Update documentation

### Step 3: Commit with Conventional Commits

```bash
git commit -m "feat(auth): add MFA support"
git commit -m "fix(api): resolve CORS issue"
git commit -m "test(e2e): add login flow tests"
```

### Step 4: Push and Create PR

```bash
git push -u origin feature/your-feature-name
```

Then go to GitHub and click "Create Pull Request".

### Step 5: Watch CI Checks

**What GitHub Shows:**

```
✅ CI - Fast PR Feedback (4m 32s)
   ✅ Backend - Build & Type Check
   ✅ Frontend - Build & Type Check
   ✅ OPA - Policy Compilation
   ✅ Terraform - Validation

⏳ E2E Tests (running)
   ⏳ E2E - Authentication Flows
   ⏳ E2E - Authorization Checks
   
✅ Security Scanning (3m 15s)
```

### Step 6: Fix Issues (if any)

If checks fail:

```bash
# Backend issues
cd backend
npm run typecheck
npm run lint
npm run build

# Frontend issues
cd frontend
npm run typecheck
npm run lint  
npm run build

# Run tests locally
npm test
```

Then commit and push fixes:

```bash
git add .
git commit -m "fix: resolve linting errors"
git push
```

CI will automatically re-run.

### Step 7: Merge PR

Once all checks pass ✅:
1. Get approval from reviewer
2. Resolve all conversations
3. Click "Squash and merge" or "Merge pull request"
4. Delete branch after merge

### Step 8: Post-Merge

After merge:
- ci-comprehensive.yml runs automatically on `main`
- Your changes are now in main branch
- Ready for deployment (manual trigger)

---

## Deployment Process

### When to Deploy

- ✅ After successful merge to `main`
- ✅ When ci-comprehensive.yml passes
- ✅ When ready for testing on dev server
- ❌ Don't deploy during active development
- ❌ Don't deploy if tests are failing

### Option 1: Deploy via GitHub UI

**Step-by-Step:**

1. Go to https://github.com/albeach/DIVE-V3/actions

2. Click "Deploy to Dev Server" in left sidebar

3. Click "Run workflow" button (top right)

4. Select branch (usually `main`)

5. Click green "Run workflow" button

6. Wait 6-8 minutes

**Monitoring Deployment:**

Click on the running workflow to watch progress:

```
✅ Pre-Deployment Checks (30s)
   ✅ Check disk space
   ✅ Verify Docker

✅ Deploy Environment Files (15s)
   ✅ Deploy backend .env
   ✅ Deploy frontend .env.local

✅ Execute Deployment (6m)
   ✅ Pull latest code
   ✅ Fix permissions
   ✅ Start services
   ⏳ Wait for healthchecks...
   
⏳ Post-Deployment Configuration (2m)
   ⏳ Initialize PostgreSQL
   ⏳ Apply Terraform
   ⏳ Seed MongoDB
```

### Option 2: Deploy via GitHub CLI

```bash
# Trigger deployment
gh workflow run deploy-dev-server.yml

# Watch deployment
gh run watch

# Or list recent runs
gh run list --workflow=deploy-dev-server.yml --limit 3
```

### Verify Deployment

**Automatic Verification:**
The workflow automatically checks:
- All Docker containers healthy
- Health endpoints responding
- Public URLs accessible

**Manual Verification:**

```bash
# Check frontend
curl -I https://dev-app.dive25.com

# Check backend API
curl -I https://dev-api.dive25.com/health

# Check Keycloak
curl -I https://dev-auth.dive25.com/realms/dive-v3-broker
```

**Browser Verification:**
1. Visit https://dev-app.dive25.com
2. Click "Login"
3. Select an IdP (USA, France, Canada, etc.)
4. Login with test credentials
5. Verify you can see resources

### What Happens During Deployment

1. **Backup Created:** Automatic snapshot for rollback
2. **Services Stopped:** Graceful shutdown
3. **Code Updated:** Git pull latest from branch
4. **Services Started:** Docker Compose up
5. **Health Checks:** Wait for all services
6. **Database Init:** PostgreSQL tables, Terraform, MongoDB seed
7. **Verification:** All endpoints tested
8. **Cleanup:** Old images removed

**If anything fails → Automatic Rollback!**

---

## Rollback Process

### Automatic Rollback

**Triggers automatically when:**
- Health checks fail after deployment
- Service fails to start
- Database initialization fails
- Post-deployment verification fails

**What it does:**
1. Stops current deployment
2. Restores .env files from snapshot
3. Restarts services with previous configuration
4. Verifies rollback health
5. Notifies via workflow status

**You don't need to do anything** - it's automatic!

### Manual Rollback

If automatic rollback fails or you need to rollback manually:

#### Option 1: Via Deployment Workflow

Re-run a previous successful deployment:

1. Go to https://github.com/albeach/DIVE-V3/actions
2. Click "Deploy to Dev Server"
3. Find last successful run
4. Click "Re-run jobs"

#### Option 2: Via SSH

```bash
# SSH into server
ssh user@dev-app.dive25.com

# Navigate to project
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# List available snapshots
ls -t backups/deployments/rollback-*

# Execute rollback
./scripts/rollback.sh backups/deployments/rollback-YYYYMMDD-HHMMSS

# Verify health
./scripts/health-check.sh
```

#### Option 3: Git Revert

If deployment itself succeeded but code has issues:

```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# Trigger new deployment with reverted code
gh workflow run deploy-dev-server.yml
```

---

## Troubleshooting

### Common Issues

#### Issue: "CI - Fast PR Feedback didn't run"

**Cause:** Path filters - only runs when code changes

**Solution:** Check what changed:
```bash
git diff main --name-only
```

If only `.md`, `docs/**`, or `scripts/**` changed, ci-fast.yml won't run (by design).

**To force run:** Make a small change to a code file (e.g., add comment in `backend/src/server.ts`)

---

#### Issue: "Tests pass locally but fail in CI"

**Causes:**
1. Environment variables differ
2. Service timing issues
3. Flaky tests

**Solutions:**
```bash
# Run with CI environment
NODE_ENV=test npm test

# Check for timing issues
npm test -- --runInBand

# Check service dependencies
docker-compose ps
docker-compose logs
```

---

#### Issue: "Deployment failed"

**Check deployment logs:**
```bash
gh run list --workflow=deploy-dev-server.yml --limit 1
gh run view <run-id> --log
```

**Common causes:**
1. **Disk space <10GB**
   - Solution: Cleanup happens automatically, but check if failed before cleanup

2. **Services unhealthy**
   - Solution: Check Docker logs
   ```bash
   ssh user@dev-app.dive25.com
   docker-compose logs keycloak
   docker-compose logs backend
   ```

3. **Terraform apply failed**
   - Solution: Check Terraform state
   ```bash
   cd terraform
   terraform plan
   ```

**Note:** Automatic rollback should restore previous state

---

#### Issue: "Rollback didn't work"

**Manual recovery:**

```bash
# SSH into server
ssh user@dev-app.dive25.com

# Stop all services
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker-compose down

# Checkout last known good commit
git log --oneline -5  # Find last good commit
git checkout <commit-hash>

# Restart services
docker-compose up -d

# Wait for health checks
./scripts/health-check.sh
```

---

### Getting Help

**Check these first:**
1. GitHub Actions logs
2. Docker logs: `docker-compose logs <service>`
3. Health check: `./scripts/health-check.sh`
4. This guide

**Still stuck?**
- Create GitHub Issue
- Contact: [Your Name/Email]
- Slack: #dive-v3-support

---

## Performance Monitoring

### Performance Dashboard (Week 4 ✅)

**Every CI run now includes an automated Performance Dashboard!**

**How to access:**
1. Go to `Actions` → `CI - Comprehensive Test Suite`
2. Click any workflow run
3. Click the `Summary` tab
4. Scroll to see **📈 CI/CD Performance Dashboard**

**Dashboard sections:**
- **Critical Path Status:** Pass/fail for 6 components
- **Performance Baselines:** Current vs targets for 6 metrics
- **Performance Trends:** Recent improvements
- **Known Deferred Items:** Context for expected failures
- **Quick Actions:** What to do next

**Week 4 Baselines (Achieved):**
- authz.middleware: **2.3s** (was 193s, 99% improvement!)
- Frontend tests: **52s** (target: <120s)
- OPA tests: **5s** (target: <30s)
- Cache hit rate: **100%** (target: >80%)
- Total CI time: **~5min** (target: <8min)

**For detailed usage:** See `CI-CD-MONITORING-RUNBOOK.md`

---

### Workflow Performance

**View workflow runtimes:**

```bash
# List recent runs
gh run list --limit 10

# View specific workflow
gh run list --workflow=ci-fast.yml --limit 5

# Check performance
gh run view <run-id>

# Open dashboard in browser
gh run view <run-id> --web  # Then click Summary tab
```

**Expected Runtimes (Week 4 Optimized):**
- ci-fast.yml: <5 minutes
- ci-comprehensive.yml: **~5 minutes** (was 10-15 min)
- test-e2e.yml: 20-25 minutes (infrastructure setup needed)
- deploy-dev-server.yml: 6-8 minutes

**If slower than expected:**
1. Check GitHub Actions status page
2. Check for service startup delays
3. Review test logs for hanging tests

### Deployment Health

**Check service health:**

```bash
# All services
curl -k https://dev-api.dive25.com/health

# Individual services
docker-compose ps
docker-compose top
```

**Monitor endpoints:**
- Frontend: https://dev-app.dive25.com
- Backend API: https://dev-api.dive25.com/health
- Keycloak: https://dev-auth.dive25.com/realms/dive-v3-broker

### Performance Metrics

**Key Metrics:**
- PR feedback time: <5 minutes ✅
- Main branch CI time: 10-15 minutes
- Deployment time: 6-8 minutes
- Deployment success rate: >95%
- Rollback success rate: 100%

**Where to find:**
- GitHub Actions dashboard
- Workflow run summaries
- `.github/workflows/` logs

---

## FAQ

### Q: Why didn't ci-fast.yml run on my PR?

**A:** Path filters. It only runs when code files change:
- `backend/src/**`
- `frontend/src/**`
- `policies/**`
- `terraform/**`

Documentation-only changes (`*.md`, `docs/**`) don't trigger it.

---

### Q: How do I skip CI on a commit?

**A:** You shouldn't! But if you must:

```bash
git commit -m "docs: update README [skip ci]"
```

**Note:** Only use for documentation that doesn't affect code.

---

### Q: Can I trigger deployment from a feature branch?

**A:** Yes! In workflow_dispatch, select your branch. But:
- ⚠️ Use for testing only
- ⚠️ Main branch is recommended
- ⚠️ Feature branches may not have all changes

---

### Q: What if deployment is taking longer than 8 minutes?

**A:** Normal causes:
- First deployment after fresh install
- Terraform creating new resources
- MongoDB seeding large dataset

**Check progress:**
```bash
gh run watch
```

If stuck >15 minutes, check logs for hanging services.

---

### Q: How do I re-run a failed workflow?

**Option 1: GitHub UI**
1. Go to Actions tab
2. Click failed workflow run
3. Click "Re-run failed jobs" or "Re-run all jobs"

**Option 2: GitHub CLI**
```bash
gh run rerun <run-id>
```

---

### Q: Can I run workflows locally?

**Tests:** Yes!
```bash
cd backend && npm test
cd frontend && npm test
cd policies && opa test . -v
```

**Full Workflows:** No, but you can simulate:
```bash
# Simulate ci-fast.yml
cd backend
npm ci
npx tsc --noEmit
npm run lint
npm run build

cd ../frontend
npm ci --legacy-peer-deps
npx tsc --noEmit
npm run lint
npm run build
```

---

### Q: Where are deployment logs?

**GitHub Actions:**
https://github.com/albeach/DIVE-V3/actions/workflows/deploy-dev-server.yml

**Server logs:**
```bash
ssh user@dev-app.dive25.com
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker-compose logs
```

---

### Q: How do I check if deployment is live?

**Quick check:**
```bash
curl -I https://dev-app.dive25.com
curl -I https://dev-api.dive25.com/health
```

**Full verification:**
1. Visit https://dev-app.dive25.com
2. Login with test user
3. View resources

---

### Q: What's the difference between `main` and `develop`?

**Main:** Production-ready code, deployed to dev server  
**Develop:** Integration branch for features (if using GitFlow)

**Current setup:** Direct to `main` (simplified workflow)

---

## Quick Reference

### Common Commands

```bash
# Create PR
git checkout -b feature/name
git commit -m "feat: description"
git push -u origin feature/name

# Check CI status
gh pr checks

# Trigger deployment
gh workflow run deploy-dev-server.yml

# Watch deployment
gh run watch

# List recent runs
gh run list --limit 10

# View logs
gh run view <run-id> --log

# Re-run failed
gh run rerun <run-id>

# Check deployment
curl -I https://dev-app.dive25.com
curl -I https://dev-api.dive25.com/health
```

### Workflow Status Checks

**Pull Request:**
- ✅ CI - Fast PR Feedback (<5 min)
- ✅ E2E Tests (20-25 min)
- ✅ Security Scanning
- ✅ Terraform CI (if terraform changed)

**Main Branch:**
- ✅ CI - Comprehensive Test Suite (10-15 min)
- 🔘 Deploy to Dev Server (manual)

---

## Summary

**CI/CD in 3 steps:**

1. **Create PR** → ci-fast.yml runs → Fix issues → Merge
2. **After merge** → ci-comprehensive.yml runs → Verify passes
3. **Deploy** → Manual trigger → Automatic rollback if fails

**Key Points:**
- ⚡ Fast feedback (<5 min)
- ✅ Automated testing
- 🔄 Automatic rollback
- 📊 Performance monitoring
- 🛡️ Security scanning

---

**Questions?** Check [CONTRIBUTING.md](CONTRIBUTING.md) or create an issue!

---

*CI/CD User Guide - Version 1.0*  
*Last Updated: November 14, 2025*  
*Week 3: Post-Migration*

