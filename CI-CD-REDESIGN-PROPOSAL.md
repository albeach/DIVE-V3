# DIVE V3 CI/CD Redesign Proposal

**Date:** November 12, 2025  
**Phase:** 2 of 7 (Streamlined Workflow Design)  
**Goal:** Reduce 18 workflows → 6 workflows with 60-70% faster PR feedback

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Proposed Workflow Structure](#proposed-workflow-structure)
3. [Workflow Specifications](#workflow-specifications)
4. [Migration Strategy](#migration-strategy)
5. [Performance Targets](#performance-targets)
6. [Implementation Timeline](#implementation-timeline)

---

## Design Principles

### 1. Fast Feedback Loop
- **PR CI must complete in <5 minutes** (currently 15-20 min)
- Run only what's necessary for quick validation
- Defer comprehensive tests to post-merge or nightly

### 2. Path-Based Optimization
- Trigger only relevant workflows based on file changes
- Use GitHub Actions `paths` filters effectively
- Avoid running all tests for documentation changes

### 3. Parallel Execution
- Maximize job parallelization where dependencies allow
- Independent tests run concurrently
- Use GitHub Actions service containers for isolation

### 4. Comprehensive Validation
- Main branch gets full test suite (not PRs)
- Nightly builds run complete validation
- No reduction in test coverage (just better orchestration)

### 5. Fail-Fast Strategy
- Critical checks (build, type check, lint) run first
- Stop pipeline early if basics fail
- Save compute time and provide faster feedback

### 6. Clear Separation of Concerns
- **Fast CI:** Build + quick validation
- **Comprehensive CI:** Full test suite
- **Deployment:** Home server automation
- **E2E:** Browser-based integration tests
- **Specialty:** Feature-specific tests (federation, Keycloak, etc.)
- **Security:** Vulnerability scanning + compliance

---

## Proposed Workflow Structure

```
.github/workflows/
├── ci-fast.yml              # PR feedback (<5 min) - CRITICAL PATH
├── ci-comprehensive.yml     # Full test suite (main branch, nightly)
├── deploy-dev-server.yml    # Home server deployment (self-hosted runner)
├── test-e2e.yml            # End-to-end tests (Playwright)
├── test-specialty.yml       # Federation, Keycloak, Policies Lab, Spain SAML
├── security.yml            # Security scans (renamed from security-scan.yml)
└── archive/                # Legacy workflows (for reference)
    ├── nato-expansion-ci.yml
    └── ...
```

**Total:** 6 active workflows (down from 18)

---

## Workflow Specifications

### 1. ci-fast.yml - Fast PR Feedback (<5 min)

**Purpose:** Provide rapid feedback on PRs with essential validation only

**Triggers:**
- `pull_request` to `main` or `develop`
- Path filters: Only run if relevant files changed

**Jobs:**

#### Job 1: backend-essentials (2-3 min)
```yaml
- Install dependencies (with cache)
- TypeScript type check (fail-fast)
- ESLint (fail-fast)
- Build (verify compilation)
```
**Services:** None (pure static analysis)

#### Job 2: frontend-essentials (2-3 min)
```yaml
- Install dependencies (with cache)
- TypeScript type check (fail-fast)
- ESLint
- Next.js build
```
**Services:** None

#### Job 3: opa-check (1 min)
```yaml
- Setup OPA (with cache)
- Compile policies (opa check)
- Quick smoke test (1-2 critical policy tests)
```
**Services:** None

#### Job 4: terraform-validate (1 min)
```yaml
- Terraform fmt check
- Terraform init -backend=false
- Terraform validate
```
**Services:** None

**Total Runtime:** 3-5 minutes (parallel execution)

**Path Filters:**
```yaml
paths:
  - 'backend/src/**'
  - 'frontend/src/**'
  - 'policies/**'
  - 'terraform/**'
  - '.github/workflows/ci-fast.yml'
paths-ignore:
  - '**/*.md'
  - 'docs/**'
  - '**/*.txt'
  - 'scripts/**'
```

**Success Criteria:**
- ✅ Code compiles without errors
- ✅ No linting errors
- ✅ Policies compile correctly
- ✅ Terraform config valid

**Skip Conditions:**
- Documentation-only changes
- Script-only changes
- README updates

---

### 2. ci-comprehensive.yml - Full Test Suite (10-15 min)

**Purpose:** Run complete validation with full test coverage

**Triggers:**
- `push` to `main` branch (post-merge validation)
- `schedule` cron: `0 2 * * *` (nightly at 2 AM UTC)
- `workflow_dispatch` (manual trigger)

**Jobs:**

#### Job 1: backend-tests (5-7 min)
```yaml
services:
  mongodb:
    image: mongo:7.0
  opa:
    image: openpolicyagent/opa:0.68.0-rootless

steps:
  - Install dependencies (with cache)
  - Run unit tests
  - Run integration tests
  - Run audit-log tests (ADDED - gap fix)
  - Run COI logic lint (ADDED - gap fix)
  - Upload coverage report
```

**Coverage Thresholds:**
- Global: 95% (branches, functions, lines, statements)
- Critical services: 100% (risk-scoring, authz-cache)

#### Job 2: frontend-tests (3-4 min)
```yaml
steps:
  - Install dependencies (with cache)
  - Run Jest unit tests
  - Run component tests
  - Upload coverage report
```

#### Job 3: opa-tests (2-3 min)
```yaml
steps:
  - Setup OPA (use setup-opa action)
  - Run all policy tests
  - Run AAL/FAL comprehensive tests
  - Run OPA benchmark (ADDED - gap fix)
  - Generate coverage report
  - Upload results
```

#### Job 4: performance-tests (2-3 min)
```yaml
services:
  mongodb:
    image: mongo:7.0
  opa:
    image: openpolicyagent/opa:0.68.0-rootless

steps:
  - Install dependencies
  - Run authorization latency tests
  - Run throughput tests (100 req/s target)
  - Upload benchmark results
```

#### Job 5: docker-build (3-4 min)
```yaml
steps:
  - Set up Docker Buildx (with cache)
  - Build backend image
  - Build frontend image
  - Build KAS image
  - Verify image sizes (<500MB backend, <200MB frontend)
```

#### Job 6: security-audit (2 min)
```yaml
steps:
  - Backend npm audit (production, high severity)
  - Frontend npm audit (production, high severity)
  - KAS npm audit (production, high severity)
  - Check for hardcoded secrets (regex scan)
```

#### Job 7: coverage-summary (1 min)
```yaml
needs: [backend-tests, frontend-tests, opa-tests]
steps:
  - Download all coverage reports
  - Generate combined summary
  - Comment on commit (if PR)
  - Upload to Codecov
```

**Total Runtime:** 10-15 minutes (with parallelization)

**Artifacts:**
- Coverage reports (30 days retention)
- Test results (7 days retention)
- Performance benchmarks (30 days retention)
- Docker image manifests (7 days retention)

---

### 3. deploy-dev-server.yml - Home Server Deployment

**Purpose:** Automated deployment to dev-app.dive25.com

**Triggers:**
- `push` to `main` branch (auto-deploy on merge)
- `workflow_dispatch` (manual deploy with environment selector)

**Runs On:** `self-hosted` runner (dive-v3-dev-server)

**Jobs:**

#### Job 1: pre-deployment-validation (2-3 min)
```yaml
steps:
  - Checkout code
  - Verify .env files exist (from GitHub Secrets)
  - Run smoke tests (scripts/smoke-test.sh)
  - Check disk space (>10GB required)
  - Check running containers (backup current state)
```

#### Job 2: backup-current-state (1-2 min)
```yaml
steps:
  - Export current container states
  - Backup database volumes
  - Save current .env files
  - Create rollback snapshot
```

#### Job 3: deploy-services (5-7 min)
```yaml
steps:
  - Stop services (graceful shutdown, 30s timeout)
  - Pull latest Docker images
  - Deploy .env files (from GitHub Secrets)
  - Start services (docker-compose up -d)
  - Wait for services to be healthy (timeout: 5 min)
```

**Service Startup Order:**
1. PostgreSQL → wait for health
2. MongoDB → wait for health
3. Redis → wait for health
4. OPA → wait for health
5. AuthzForce → wait for health
6. Keycloak → wait for health (60s timeout)
7. Backend → wait for health (30s timeout)
8. Frontend → wait for health (30s timeout)
9. KAS → wait for health (30s timeout)

#### Job 4: health-checks (2-3 min)
```yaml
steps:
  - Check PostgreSQL connection
  - Check MongoDB connection
  - Check Redis connection
  - Check OPA policy endpoint
  - Check Keycloak realms (11 realms)
  - Check Backend API (/health)
  - Check Frontend (/)
  - Check KAS (/health)
```

**Health Check Criteria:**
- All 8 services respond with 200 OK
- Keycloak all 11 realms accessible
- Backend API returns correct version
- Frontend renders without errors
- Database connections established

#### Job 5: smoke-tests (2-3 min)
```yaml
steps:
  - Run scripts/smoke-test.sh
  - Test authentication flow (basic)
  - Test authorization decision (OPA)
  - Test resource retrieval (MongoDB)
  - Verify session persistence (Redis)
```

#### Job 6: rollback-on-failure
```yaml
if: failure()
steps:
  - Stop new deployment
  - Restore previous container states
  - Restore previous .env files
  - Restore database volumes (if needed)
  - Restart services with rollback
  - Verify rollback health checks
  - Notify failure (GitHub issue + log)
```

#### Job 7: cleanup (1 min)
```yaml
if: success()
steps:
  - Remove old Docker images
  - Remove dangling volumes
  - Clean up old logs (>30 days)
  - Update deployment history
  - Notify success (GitHub commit status)
```

**Total Runtime:** 10-15 minutes (sequential deployment)

**Environment Variables (GitHub Secrets):**
- `ENV_BACKEND` - Backend .env file content
- `ENV_FRONTEND` - Frontend .env.local file content
- `ENV_KAS` - KAS .env file content
- `CLOUDFLARE_TUNNEL_TOKEN` - Cloudflare tunnel token (optional)

**Rollback Triggers:**
- Health check failure (any service)
- Smoke test failure
- Timeout (>5 min for service startup)
- Manual trigger (workflow_dispatch)

**Success Notification:**
```
✅ Deployment to dev-app.dive25.com successful!
📦 Commit: abc1234
🕒 Timestamp: 2025-11-12 14:30:00 UTC
🌐 Frontend: https://dev-app.dive25.com
🔧 Backend: https://dev-api.dive25.com
🔐 Keycloak: https://dev-auth.dive25.com
```

---

### 4. test-e2e.yml - End-to-End Tests

**Purpose:** Browser-based integration testing with Playwright

**Triggers:**
- `push` to `main` branch
- `workflow_dispatch` (manual trigger)
- Path filters: frontend/**, backend/** changes

**Jobs:**

#### Job 1: e2e-authentication (5-7 min)
```yaml
services:
  mongodb:
    image: mongo:7.0
  postgres:
    image: postgres:15-alpine

steps:
  - Install frontend dependencies
  - Install Playwright browsers (chromium only)
  - Setup database (NextAuth tables)
  - Build Next.js app
  - Run authentication E2E tests:
    - Login flows (all 11 realms)
    - MFA conditional enforcement
    - Session persistence
    - Logout flows
```

#### Job 2: e2e-authorization (5-7 min)
```yaml
services:
  mongodb:
    image: mongo:7.0
  postgres:
    image: postgres:15-alpine

steps:
  - Run authorization E2E tests:
    - Clearance-based access control
    - Releasability checks
    - COI membership validation
    - Classification equivalency scenarios
```

#### Job 3: e2e-classification-equivalency (5-7 min)
```yaml
steps:
  - Run classification E2E tests:
    - German GEHEIM ↔ US SECRET
    - French SECRET DÉFENSE ↔ German GEHEIM
    - Multi-nation document sharing
    - 12×4 equivalency matrix validation
```

#### Job 4: e2e-resource-management (5-7 min)
```yaml
steps:
  - Run resource E2E tests:
    - Document upload (with classification)
    - Document search (with filters)
    - Document download (with authorization)
    - Encrypted resource access (KAS integration)
```

**Total Runtime:** 20-25 minutes (can run in parallel)

**Artifacts:**
- Playwright HTML report (30 days)
- Screenshots on failure (7 days)
- Videos on failure (7 days)
- Trace files (7 days)

**Optimization:**
- Only run on main branch (not PRs)
- Use Playwright sharding for parallelization
- Cache Playwright browsers

---

### 5. test-specialty.yml - Feature-Specific Tests

**Purpose:** Specialty feature testing (Federation, Keycloak, Policies Lab, Spain SAML)

**Triggers:**
- Path-based: Only run if relevant files changed
- `workflow_dispatch` (manual trigger)

**Jobs:**

#### Job 1: federation-tests (10-12 min)
```yaml
services:
  redis:
    image: redis:7-alpine
  postgres:
    image: postgres:15-alpine
  mongodb:
    image: mongo:7

steps:
  - Generate OAuth signing keys
  - Run OAuth integration tests
  - Run SCIM integration tests
  - Run Federation protocol tests
  - Run OAuth security tests (OWASP)
  - Validate standards (RFC 6749, SCIM 2.0)
  - Upload coverage
```

**Triggers:**
```yaml
paths:
  - 'backend/src/controllers/oauth.controller.ts'
  - 'backend/src/controllers/scim.controller.ts'
  - 'backend/src/services/sp-management.service.ts'
  - 'backend/src/services/authorization-code.service.ts'
```

#### Job 2: keycloak-tests (15-20 min)
```yaml
steps:
  - Start Docker Compose (postgres + keycloak)
  - Wait for Keycloak (60s timeout)
  - Test health check
  - Test 11 realm configuration
  - Test federation configuration
  - Test authentication flows (Terraform test users)
  - Test token validation
  - Security checks (no custom SPIs, no hardcoded secrets)
```

**Triggers:**
```yaml
paths:
  - 'keycloak/**'
  - 'terraform/**'
  - 'scripts/test-keycloak-*.sh'
```

#### Job 3: policies-lab-tests (10-12 min)
```yaml
services:
  mongodb:
    image: mongo:7
  opa:
    image: openpolicyagent/opa:1.9.0

steps:
  - Run policy validation tests
  - Run policy execution tests
  - Run XACML adapter tests
  - Run integration tests
  - Run frontend component tests
  - Run E2E tests (policy upload, validation, execution)
```

**Triggers:**
```yaml
paths:
  - 'backend/src/services/policy-*.ts'
  - 'backend/src/adapters/xacml-adapter.ts'
  - 'frontend/src/components/policies-lab/**'
```

#### Job 4: spain-saml-tests (8-10 min)
```yaml
steps:
  - Build SimpleSAMLphp Docker image
  - Start SimpleSAMLphp service
  - Test SAML metadata endpoint
  - Test Spanish test user configuration
  - Run clearance normalization tests (SECRETO → SECRET)
  - Run OPA policy tests (ESP country code)
  - Validate Terraform configuration
```

**Triggers:**
```yaml
paths:
  - 'external-idps/spain-saml/**'
  - 'terraform/external-idp-spain-saml.tf'
  - 'backend/src/services/clearance-normalization.service.ts'
```

**Total Runtime:** Varies (only runs if relevant files changed)

**Optimization:**
- Use matrix strategy for parallel execution
- Only run relevant job based on path filter
- Share service containers where possible

---

### 6. security.yml - Security Scanning

**Purpose:** Comprehensive security vulnerability scanning

**Triggers:**
- `push` to `main` or `develop`
- `pull_request` to `main`
- `schedule` cron: `0 2 * * *` (daily at 2 AM UTC)

**Jobs:**

#### Job 1: npm-audit (2-3 min)
```yaml
strategy:
  matrix:
    workspace: [backend, frontend, kas]

steps:
  - Setup Node.js
  - Run npm audit --production --audit-level=moderate
  - Generate audit report JSON
  - Upload artifact
```

#### Job 2: dependency-check (5-7 min)
```yaml
steps:
  - Run OWASP Dependency-Check
  - Scan all dependencies (backend, frontend, kas)
  - Generate HTML report
  - Upload to artifacts
```

#### Job 3: secret-scan (3-5 min)
```yaml
steps:
  - Run TruffleHog (full git history)
  - Check for hardcoded secrets
  - Verify no API keys in code
  - Check for passwords in config files
```

#### Job 4: docker-scan (5-7 min)
```yaml
strategy:
  matrix:
    service: [backend, frontend, kas]

steps:
  - Build Docker image
  - Run Trivy vulnerability scanner
  - Generate SARIF report
  - Upload to GitHub Security tab
```

#### Job 5: terraform-security (3-4 min)
```yaml
steps:
  - Run tfsec (Terraform security scanner)
  - Run Checkov (infrastructure security)
  - Generate SARIF reports
  - Upload to GitHub Security tab
```

#### Job 6: code-quality (5-7 min)
```yaml
steps:
  - Setup SonarCloud
  - Run SonarCloud scan
  - Upload backend/frontend/kas code
  - Include coverage reports
  - Check quality gate
```

**Total Runtime:** 15-20 minutes (mostly parallel)

**Artifacts:**
- Audit reports (30 days)
- SARIF reports (uploaded to GitHub Security)
- SonarCloud results (external)

**Notifications:**
- Create GitHub issue on HIGH/CRITICAL vulnerabilities
- Comment on PR with security scan results
- Daily summary via GitHub Discussions

---

## Workflow Comparison

### Before (Current State)

| Workflow | Lines | Runtime | Redundancy | Value |
|----------|-------|---------|------------|-------|
| ci.yml | 517 | 15-20 min | High (duplicates 4 workflows) | ⚠️ Monolithic |
| backend-ci.yml | 102 | 5-7 min | 95% overlap with ci.yml | ❌ Redundant |
| backend-tests.yml | 116 | DISABLED | N/A | ❌ Deprecated |
| frontend-ci.yml | 91 | 5-7 min | 70% overlap with ci.yml | ⚠️ Partial |
| frontend-tests.yml | 76 | 4-5 min | 100% overlap with frontend-ci.yml | ❌ Redundant |
| opa-tests.yml | 99 | 2-3 min | 80% overlap with ci.yml | ⚠️ Partial |
| deploy.yml | 80 | N/A | N/A | ❌ Placeholder |
| e2e-tests.yml | 107 | 15-20 min | Some overlap | ✅ Unique |
| e2e-classification.yml | 118 | 10-12 min | Should merge with e2e-tests | ⚠️ Partial |
| federation-tests.yml | 332 | 15-20 min | None | ✅ Unique |
| keycloak-test.yml | 394 | 20-25 min | None | ✅ Unique |
| nato-expansion-ci.yml | 362 | 20-25 min | Legacy | 📦 Archive |
| phase2-ci.yml | 145 | DISABLED | N/A | ❌ Deprecated |
| policies-lab-ci.yml | 321 | 15-20 min | None | ✅ Unique |
| security-scan.yml | 152 | 15-20 min | Partial overlap with ci.yml | ✅ Unique |
| spain-saml-integration.yml | 227 | 10-12 min | None | ✅ Unique |
| terraform-ci.yml | 70 | 2-3 min | None | ✅ Unique |
| test.yml | 129 | 10-12 min | 100% redundant | ❌ Delete |
| **TOTAL** | **3,077** | **~180 min total** | **~44% overlap** | **Mixed** |

### After (Proposed State)

| Workflow | Lines | Runtime | Redundancy | Value |
|----------|-------|---------|------------|-------|
| ci-fast.yml | 150 | **3-5 min** | None | ✅ PR feedback |
| ci-comprehensive.yml | 300 | 10-15 min | None | ✅ Full validation |
| deploy-dev-server.yml | 200 | 10-15 min | None | ✅ Automated deploy |
| test-e2e.yml | 250 | 20-25 min | None | ✅ Browser tests |
| test-specialty.yml | 400 | 10-20 min (path-based) | None | ✅ Feature tests |
| security.yml | 200 | 15-20 min | None | ✅ Security scans |
| **TOTAL** | **1,500** | **~70 min total** | **0% overlap** | **✅ All unique** |

**Improvements:**
- **51% fewer lines** (3,077 → 1,500)
- **61% faster total runtime** (180 min → 70 min)
- **67% fewer workflows** (18 → 6)
- **0% redundancy** (44% → 0%)
- **60-70% faster PR feedback** (15-20 min → 3-5 min)

---

## Path-Based Trigger Strategy

### ci-fast.yml (PR Feedback)
```yaml
on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'backend/src/**'
      - 'frontend/src/**'
      - 'policies/**'
      - 'terraform/**'
      - '.github/workflows/ci-fast.yml'
    paths-ignore:
      - '**/*.md'
      - 'docs/**'
      - 'scripts/**'
      - '**/*.txt'
```

### ci-comprehensive.yml (Main Branch)
```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:
```

### deploy-dev-server.yml (Auto-Deploy)
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'development'
        type: choice
        options:
          - development
          - staging
```

### test-e2e.yml (E2E Tests)
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  pull_request:
    branches: [main]
    paths:
      - 'frontend/**'
      - 'backend/**'
```

### test-specialty.yml (Feature Tests)
```yaml
on:
  push:
    branches: [main, develop]
    paths:
      - 'backend/src/controllers/oauth.controller.ts'
      - 'backend/src/controllers/scim.controller.ts'
      - 'backend/src/services/sp-management.service.ts'
      - 'keycloak/**'
      - 'terraform/**'
      - 'backend/src/services/policy-*.ts'
      - 'external-idps/spain-saml/**'
  pull_request:
    branches: [main]
    paths:
      - 'backend/src/controllers/oauth.controller.ts'
      - 'keycloak/**'
      - 'terraform/**'
  workflow_dispatch:
```

### security.yml (Security Scans)
```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:
```

---

## Caching Strategy

### 1. Node Modules Cache
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: |
      backend/package-lock.json
      frontend/package-lock.json
      kas/package-lock.json
```

### 2. Build Artifacts Cache
```yaml
- name: Cache Build Artifacts
  uses: actions/cache@v4
  with:
    path: |
      backend/dist
      frontend/.next
    key: ${{ runner.os }}-build-${{ hashFiles('backend/src/**', 'frontend/src/**') }}
    restore-keys: |
      ${{ runner.os }}-build-
```

### 3. OPA Binary Cache
```yaml
- name: Cache OPA Binary
  uses: actions/cache@v4
  with:
    path: ~/bin/opa
    key: opa-v0.68.0
```

### 4. Playwright Browsers Cache
```yaml
- name: Cache Playwright Browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('frontend/package-lock.json') }}
```

### 5. Docker Layer Cache
```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
  with:
    driver-opts: |
      image=moby/buildkit:latest
      
- name: Cache Docker layers
  uses: actions/cache@v4
  with:
    path: /tmp/.buildx-cache
    key: ${{ runner.os }}-buildx-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-buildx-
```

**Estimated Savings:** 2-3 minutes per workflow run

---

## Migration Strategy

### Week 1: Preparation & Cleanup
**Goal:** Remove deprecated workflows, prepare for new structure

**Tasks:**
1. ✅ Archive legacy workflows
   - Move nato-expansion-ci.yml to `.github/workflows/archive/`
   - Document archival reason in README

2. ✅ Delete deprecated workflows
   - Delete backend-tests.yml (DISABLED)
   - Delete phase2-ci.yml (DISABLED)
   - Delete test.yml (100% redundant)
   - Delete frontend-tests.yml (redundant)

3. ✅ Fix test coverage gaps
   - Add `npm run test:audit-logs` to ci.yml
   - Add `npm run lint:coi` to ci.yml
   - Add OPA benchmark to ci.yml
   - Add smoke tests script to repository

4. ✅ Setup GitHub Secrets
   - Add ENV_BACKEND (backend .env content)
   - Add ENV_FRONTEND (frontend .env.local content)
   - Add ENV_KAS (KAS .env content)

**Validation:**
- Verify existing CI still works
- No broken workflows
- All tests still passing

---

### Week 2: Create New Workflows
**Goal:** Implement new streamlined workflows

**Tasks:**
1. ✅ Create ci-fast.yml
   - Fast PR feedback (<5 min)
   - Build + type check + lint only
   - Path-based triggers

2. ✅ Create ci-comprehensive.yml
   - Full test suite (main branch)
   - All unit/integration tests
   - Coverage reports
   - Performance tests

3. ✅ Create test-e2e.yml
   - Consolidate e2e-tests.yml + e2e-classification.yml
   - Playwright browser tests
   - Full stack integration

4. ✅ Create test-specialty.yml
   - Merge federation-tests.yml
   - Merge keycloak-test.yml
   - Merge policies-lab-ci.yml
   - Merge spain-saml-integration.yml
   - Path-based triggers

5. ✅ Rename security-scan.yml → security.yml
   - Keep existing functionality
   - Add daily cron schedule
   - Improve notifications

**Validation:**
- Run new workflows in parallel with old ones
- Compare test results (should be identical)
- Verify no tests are missed

---

### Week 3: Deployment Automation
**Goal:** Implement self-hosted runner and deployment workflow

**Tasks:**
1. ✅ Setup self-hosted runner on home server
   - Install GitHub Actions runner
   - Configure as system service
   - Label: `self-hosted`, `dive-v3-dev-server`

2. ✅ Create deployment scripts
   - `scripts/deploy-dev.sh` (main orchestration)
   - `scripts/rollback.sh` (automatic rollback)
   - Enhance `scripts/health-check.sh` (8 service validation)

3. ✅ Create deploy-dev-server.yml
   - Auto-deploy on push to main
   - Manual trigger with environment selector
   - Pre-deployment validation
   - Zero-downtime rolling update
   - Health checks
   - Automatic rollback on failure

4. ✅ Add Watchtower integration
   - Add Watchtower service to docker-compose.yml
   - Label services for auto-update
   - Configure cleanup and monitoring

**Validation:**
- Test manual deployment (workflow_dispatch)
- Test auto-deployment (push to main)
- Test rollback mechanism
- Verify health checks work
- Test Watchtower auto-update

---

### Week 4: Cutover & Validation
**Goal:** Transition to new workflows, deprecate old ones

**Tasks:**
1. ✅ Parallel testing (1 week)
   - Run old and new workflows side-by-side
   - Compare results
   - Identify discrepancies
   - Fine-tune new workflows

2. ✅ Performance validation
   - Measure PR feedback time
   - Measure main branch CI time
   - Validate <5 min PR feedback
   - Validate 10-15 min comprehensive CI

3. ✅ Delete old workflows
   - Delete ci.yml (replaced by ci-fast + ci-comprehensive)
   - Delete backend-ci.yml (merged into ci-comprehensive)
   - Delete frontend-ci.yml (merged into ci-fast + test-e2e)
   - Delete opa-tests.yml (merged into ci-comprehensive)
   - Delete deploy.yml (replaced by deploy-dev-server)
   - Delete e2e-tests.yml (merged into test-e2e)
   - Delete e2e-classification.yml (merged into test-e2e)
   - Delete federation-tests.yml (merged into test-specialty)
   - Delete keycloak-test.yml (merged into test-specialty)
   - Delete policies-lab-ci.yml (merged into test-specialty)
   - Delete spain-saml-integration.yml (merged into test-specialty)

4. ✅ Update documentation
   - Update README.md with new workflow structure
   - Document deployment process
   - Create runbook for rollback
   - Update CONTRIBUTING.md

5. ✅ Team communication
   - Announce new workflows
   - Share performance improvements
   - Provide migration guide
   - Answer questions

**Validation:**
- All tests passing in new workflows
- No reduction in test coverage
- PR feedback time <5 min
- Deployment automation working
- Team onboarded and comfortable

---

## Performance Targets

### PR Feedback Time
- **Current:** 15-20 minutes
- **Target:** <5 minutes
- **Improvement:** 60-70% faster

### Main Branch CI Time
- **Current:** 15-20 minutes
- **Target:** 10-15 minutes
- **Improvement:** 20-30% faster

### Total CI Runtime (all workflows)
- **Current:** ~180 minutes total
- **Target:** ~70 minutes total
- **Improvement:** 61% reduction

### Deployment Time
- **Current:** Manual (15-30 minutes)
- **Target:** Automated (10-15 minutes)
- **Improvement:** Faster + more reliable

### Test Coverage
- **Current:** 95% (backend), varies (frontend)
- **Target:** 95% (backend), 80% (frontend)
- **Improvement:** No reduction, better tracking

---

## Risk Mitigation

### Risk 1: New Workflows Break Tests
**Mitigation:**
- Run old and new workflows in parallel for 1 week
- Compare results before cutover
- Keep old workflows as backup (disabled)

### Risk 2: Self-Hosted Runner Fails
**Mitigation:**
- Document runner setup for quick recovery
- Keep runner as system service (auto-restart)
- Alert on runner downtime
- Fallback: manual deployment process documented

### Risk 3: Rollback Doesn't Work
**Mitigation:**
- Test rollback mechanism before cutover
- Keep database volume backups
- Document manual rollback procedure
- Alert on deployment failures

### Risk 4: Path Filters Miss Tests
**Mitigation:**
- Comprehensive path filter testing
- Nightly comprehensive CI catches everything
- Manual workflow_dispatch for edge cases

### Risk 5: Caching Causes Stale Builds
**Mitigation:**
- Cache keys include file hashes
- Invalidate cache on package.json changes
- Manual cache clear via workflow_dispatch

---

## Success Criteria

### Phase 2 Complete When:
- ✅ All 6 new workflows created
- ✅ No test coverage reduction
- ✅ PR feedback time <5 min achieved
- ✅ Deployment automation working
- ✅ Rollback mechanism tested
- ✅ Documentation updated
- ✅ Team onboarded

### Long-Term Success Metrics:
- ✅ 100% of deployments succeed (or rollback)
- ✅ Zero production incidents from failed deployments
- ✅ <5 min average PR feedback time
- ✅ 95%+ developer satisfaction with CI/CD
- ✅ <1% false positive rate (flaky tests)

---

## Implementation Timeline

### Week 1 (November 12-18, 2025)
- Day 1-2: Audit complete, proposal reviewed
- Day 3-4: Delete deprecated workflows, archive legacy
- Day 5-7: Fix test coverage gaps, setup GitHub Secrets

### Week 2 (November 19-25, 2025)
- Day 1-3: Create ci-fast.yml + ci-comprehensive.yml
- Day 4-5: Create test-e2e.yml + test-specialty.yml
- Day 6-7: Rename security-scan.yml, add caching

### Week 3 (November 26 - December 2, 2025)
- Day 1-2: Setup self-hosted runner on home server
- Day 3-4: Create deployment scripts
- Day 5-6: Create deploy-dev-server.yml
- Day 7: Add Watchtower integration

### Week 4 (December 3-9, 2025)
- Day 1-5: Parallel testing (old + new workflows)
- Day 6: Cutover (delete old workflows)
- Day 7: Update documentation, team communication

**Target Completion:** December 9, 2025

---

## Next Steps

**Phase 2 Complete** ✅ - This redesign proposal

**Phase 3 Next:** Self-Hosted Runner Setup
1. Install GitHub Actions runner on home server
2. Configure as system service
3. Test runner connectivity
4. Label runner for deployment workflow

**Approval Required:**
- ✅ Workflow structure approved
- ✅ Performance targets acceptable
- ✅ Migration timeline feasible
- ✅ Risk mitigation acceptable

---

**End of CI/CD Redesign Proposal**

*Generated: November 12, 2025*  
*Phase: 2 of 7*  
*Next: Phase 3 - Self-Hosted Runner Setup*

