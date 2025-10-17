# CI/CD Guide - DIVE V3

**Phase 4 - CI/CD & QA Automation**  
**Date:** October 17, 2025  
**Version:** 1.0.0

## Table of Contents

1. [Overview](#overview)
2. [GitHub Actions CI Pipeline](#github-actions-ci-pipeline)
3. [Deployment Workflows](#deployment-workflows)
4. [Quality Gates](#quality-gates)
5. [Local Development](#local-development)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Overview

DIVE V3 uses GitHub Actions for comprehensive continuous integration and deployment automation. Every code change is automatically tested, validated, and optionally deployed through a series of quality gates.

### Key Features
- **10 automated CI jobs** run on every PR
- **Automated deployment** to staging and production
- **Quality gates** prevent broken code from merging
- **Security scanning** catches vulnerabilities early
- **Performance regression detection** via automated benchmarks
- **Pre-commit validation** prevents bad commits locally

### CI/CD Architecture

```
┌─────────────────┐
│  Git Push/PR    │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────────────────┐
│            GitHub Actions CI Pipeline                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Backend  │  │Frontend  │  │   OPA    │         │
│  │  Build   │  │  Build   │  │ Policy   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │              │                │
│  ┌────v─────┐  ┌───v──────┐  ┌───v──────┐         │
│  │  Unit    │  │ Security │  │  Docker  │         │
│  │  Tests   │  │  Audit   │  │  Build   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │              │                │
│  ┌────v─────┐  ┌───v──────┐  ┌───v──────┐         │
│  │Integration│ │Performance│ │ Coverage │         │
│  │  Tests   │  │  Tests   │  │  Report  │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       └─────────────┴──────────────┘                │
│                     │                                │
│                     v                                │
│            ┌────────────────┐                        │
│            │  All Jobs Pass │                        │
│            └────────┬───────┘                        │
└─────────────────────┼────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         v                         v
  ┌──────────────┐         ┌──────────────┐
  │   Staging    │         │  Production  │
  │  Deployment  │         │  Deployment  │
  │ (on main)    │         │ (on release) │
  └──────────────┘         └──────────────┘
```

---

## GitHub Actions CI Pipeline

### Workflow File
`.github/workflows/ci.yml` (430 lines)

### Trigger Events
```yaml
on:
  push:
    branches: [main, 'feature/**']
  pull_request:
    branches: [main]
```

### Jobs Overview

#### 1. Backend Build & Type Check
**Purpose:** Validate TypeScript compilation and generate build artifacts

**Steps:**
1. Checkout code
2. Setup Node.js 20 with npm caching
3. Install dependencies (`npm ci`)
4. TypeScript type check (`tsc --noEmit`)
5. Build (`npm run build`)
6. Verify build artifacts exist
7. Upload artifacts for other jobs

**Duration:** ~2 minutes  
**Fail Conditions:** TypeScript errors, build failures, missing artifacts

#### 2. Backend Unit Tests
**Purpose:** Run comprehensive unit test suite

**Services:**
- MongoDB 7.0 (for database tests)
- OPA 0.68.0 (for policy tests)

**Steps:**
1. Checkout code
2. Setup Node.js 20
3. Install dependencies
4. Wait for services to be healthy
5. Run unit tests (`npm run test:unit`)
6. Upload test results and coverage

**Environment Variables:**
```bash
NODE_ENV=test
MONGODB_URL=mongodb://localhost:27017/dive-v3-test
OPA_URL=http://localhost:8181
JWT_SECRET=test-jwt-secret-for-ci
JWT_ISSUER=dive-v3-test
JWT_AUDIENCE=dive-v3-api-test
```

**Duration:** ~5 minutes  
**Fail Conditions:** Test failures, coverage below threshold

#### 3. Backend Integration Tests
**Purpose:** Test full stack integration with all services

**Services:**
- MongoDB 7.0
- OPA 0.68.0
- (Keycloak 23.0 for full integration)

**Steps:**
1. Load OPA policies via HTTP API
2. Run integration tests (`npm run test:integration`)
3. Verify service interactions

**Duration:** ~4 minutes  
**Fail Conditions:** Integration failures, service unavailable

#### 4. OPA Policy Tests
**Purpose:** Validate Rego policy compilation and unit tests

**Steps:**
1. Download and install OPA binary (v0.68.0)
2. Run policy tests (`opa test . -v`)
3. Verify policy compilation (`opa check`)
4. Generate coverage report

**Duration:** ~1 minute  
**Fail Conditions:** Policy syntax errors, test failures

#### 5. Frontend Build & Type Check
**Purpose:** Validate Next.js build and TypeScript compilation

**Steps:**
1. Install dependencies with `--legacy-peer-deps`
2. TypeScript type check (`tsc --noEmit`)
3. Build Next.js app (`npm run build`)
4. Verify `.next` directory exists

**Duration:** ~3 minutes  
**Fail Conditions:** TypeScript errors, build failures

#### 6. Security Audit
**Purpose:** Scan for vulnerabilities and hardcoded secrets

**Steps:**
1. Backend npm audit (`npm audit --production --audit-level=high`)
2. Frontend npm audit
3. Hardcoded secrets scan (grep patterns)

**Patterns Checked:**
- `password\s*=\s*['"]`
- `secret\s*=\s*['"]`
- `api_key\s*=\s*['"]`

**Duration:** ~2 minutes  
**Fail Conditions:** High/critical vulnerabilities, hardcoded secrets found

#### 7. Performance Tests
**Purpose:** Run automated performance benchmarks

**Services:**
- MongoDB 7.0
- OPA 0.68.0

**Tests:**
- Cache hit rate validation (>80%)
- Database query performance
- Authorization latency

**Duration:** ~3 minutes  
**Fail Conditions:** Performance below SLO targets

#### 8. Code Quality (ESLint)
**Purpose:** Enforce code quality standards

**Steps:**
1. Run backend ESLint (`npm run lint`)
2. Run frontend ESLint

**Duration:** ~2 minutes  
**Fail Conditions:** ESLint errors (warnings are tolerated)

#### 9. Docker Build
**Purpose:** Verify production Docker images build successfully

**Steps:**
1. Setup Docker Buildx
2. Build backend image (`docker build backend/`)
3. Build frontend image (`docker build frontend/`)
4. Verify image sizes (warn if too large)

**Duration:** ~5 minutes  
**Fail Conditions:** Docker build failures

#### 10. Coverage Report
**Purpose:** Aggregate code coverage and enforce thresholds

**Requirements:**
- **Global:** >95% for branches, functions, lines, statements
- **Critical Services:** 100% coverage
  - `risk-scoring.service.ts`
  - `authz-cache.service.ts`

**Steps:**
1. Run tests with coverage (`npm run test -- --coverage`)
2. Generate coverage summary
3. Upload coverage reports (30-day retention)

**Duration:** ~5 minutes  
**Fail Conditions:** Coverage below thresholds

### Total CI Duration
**Target:** <10 minutes (parallel execution)  
**Typical:** 8-12 minutes

---

## Deployment Workflows

### Staging Deployment

**Trigger:** Push to `main` branch

**Workflow:** `.github/workflows/deploy.yml`

**Steps:**
1. Build Docker images with `docker-compose.prod.yml`
2. Tag images: `staging-${{ github.sha }}` and `staging-latest`
3. Run pre-deployment validation
4. Display deployment summary

**Manual Steps (Commented Out):**
```yaml
# Push to container registry
# Deploy to staging server via SSH
# Run database migrations
# Restart services
# Verify health checks
# Run smoke tests
```

**To Enable Production Deployment:**
1. Configure GitHub secrets:
   - `DOCKER_REGISTRY_URL`
   - `DOCKER_REGISTRY_USERNAME`
   - `DOCKER_REGISTRY_TOKEN`
   - `STAGING_HOST`
   - `STAGING_USERNAME`
   - `STAGING_SSH_KEY`
2. Uncomment deployment steps in workflow
3. Test in staging environment first

### Production Deployment

**Trigger:** Release tag (`v*`)

**Steps:**
1. Extract version from tag
2. Build production images
3. Tag images: `$version` and `production-latest`
4. Run comprehensive pre-deployment tests
5. Display deployment summary

**Manual Production Steps:**
```bash
# 1. Create backup
# 2. Run database migrations
# 3. Blue-green deployment
# 4. Gradual traffic shift (10% → 50% → 100%)
# 5. Monitor SLOs for 15 minutes
# 6. Rollback if issues detected
```

**Rollback Procedure:**
```bash
# Tag previous version as production-latest
docker tag dive-v3-backend:v1.2.3 dive-v3-backend:production-latest
docker tag dive-v3-frontend:v1.2.3 dive-v3-frontend:production-latest

# Restart services
docker-compose restart
```

---

## Quality Gates

### Required Status Checks

All 10 CI jobs must pass before a PR can be merged:

1. ✅ Backend Build & Type Check
2. ✅ Backend Unit Tests
3. ✅ Backend Integration Tests
4. ✅ OPA Policy Tests
5. ✅ Frontend Build & Type Check
6. ✅ Security Audit
7. ✅ Performance Tests
8. ✅ Code Quality (ESLint)
9. ✅ Docker Build
10. ✅ Coverage Report

### Branch Protection Rules

**Recommended Settings:**
```yaml
branches:
  main:
    protection:
      required_status_checks:
        strict: true
        contexts:
          - "Backend - Build & Type Check"
          - "Backend - Unit Tests"
          - "Backend - Integration Tests"
          - "OPA - Policy Tests"
          - "Frontend - Build & Type Check"
          - "Security - Dependency Audit"
          - "Performance - Benchmarks"
          - "Code Quality - ESLint"
          - "Docker - Production Build"
          - "Coverage - Code Coverage Report"
      required_pull_request_reviews:
        required_approving_review_count: 1
      enforce_admins: true
      restrictions: null
```

### Coverage Thresholds

**Global (95%):**
```javascript
{
  global: {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95
  }
}
```

**Critical Services (100%):**
- `risk-scoring.service.ts`
- `authz-cache.service.ts`

**Other Services (95%):**
- `authz.middleware.ts`
- `idp-validation.service.ts`
- `compliance-validation.service.ts`
- `analytics.service.ts`
- `health.service.ts`

---

## Local Development

### Pre-Commit Hooks

**Setup:**
```bash
# Install dependencies
npm install

# Initialize Husky
npm run prepare
```

**What Runs on Commit:**
1. Lint-staged (automatic fixing)
2. TypeScript type checking
3. Unit tests (backend)

**Skip Pre-Commit (Use Sparingly):**
```bash
git commit --no-verify -m "message"
```

### Running CI Locally

**Backend Build:**
```bash
cd backend
npm ci
npx tsc --noEmit
npm run build
```

**Unit Tests:**
```bash
cd backend
npm run test:unit
```

**Coverage:**
```bash
cd backend
npm run test:coverage
```

**Linting:**
```bash
cd backend
npm run lint
```

**Security Audit:**
```bash
cd backend
npm audit --production --audit-level=high
```

### Running QA Scripts Locally

**Smoke Tests:**
```bash
./scripts/smoke-test.sh
```

**Performance Benchmarks:**
```bash
./scripts/performance-benchmark.sh
```

**Full QA Validation:**
```bash
./scripts/qa-validation.sh
```

---

## Troubleshooting

### Common CI Failures

#### "TypeScript compilation failed"
**Cause:** Type errors in code  
**Fix:**
```bash
cd backend
npx tsc --noEmit
# Or
cd frontend
npx tsc --noEmit
```

#### "Tests failed"
**Cause:** Test failures or flaky tests  
**Fix:**
```bash
cd backend
npm test -- --verbose
```

Check for:
- MongoDB connection issues
- OPA policy loading failures
- Race conditions in tests

#### "Coverage below threshold"
**Cause:** New code not adequately tested  
**Fix:**
```bash
cd backend
npm run test:coverage
# Review coverage report in coverage/lcov-report/index.html
```

Add tests for uncovered code paths.

#### "Docker build failed"
**Cause:** Missing dependencies, Dockerfile errors  
**Fix:**
```bash
cd backend
docker build -t test-backend .
# Or
cd frontend
docker build -t test-frontend .
```

#### "Service containers not healthy"
**Cause:** MongoDB or OPA not starting  
**Fix:**
- Check service configuration in workflow
- Verify health check commands
- Increase wait time

### Debugging CI Jobs

**View Full Logs:**
1. Go to GitHub Actions tab
2. Click on failed workflow run
3. Click on failed job
4. Expand failed step

**Download Artifacts:**
- Test results: `backend-test-results`
- Coverage reports: `coverage-report`
- Build artifacts: `backend-dist`, `frontend-build`

**Re-run Failed Jobs:**
- Click "Re-run failed jobs" button
- Or "Re-run all jobs" to start fresh

---

## Best Practices

### Writing CI-Friendly Code

1. **Keep tests fast** - Target <15s per test file
2. **Avoid flaky tests** - Use deterministic test data
3. **Clean up resources** - Always close database connections
4. **Mock external services** - Don't rely on real APIs
5. **Use TypeScript strict mode** - Catch errors early

### PR Workflow

1. **Create feature branch** from `main`
2. **Make changes** and commit locally
3. **Run tests locally** before pushing
4. **Push to GitHub** and open PR
5. **Wait for CI** to pass (8-12 minutes)
6. **Address failures** if any
7. **Request review** after CI passes
8. **Merge** after approval and CI pass

### CI Performance Optimization

1. **Use npm ci** instead of `npm install` (faster, deterministic)
2. **Cache dependencies** with GitHub Actions cache
3. **Run jobs in parallel** where possible
4. **Use maxWorkers** to limit parallel test execution
5. **Skip unnecessary steps** (e.g., linting unchanged files)

### Monitoring CI Health

**Key Metrics:**
- CI duration (target: <10 minutes)
- Pass rate (target: >95%)
- Flaky test count (target: 0)
- Queue time (target: <1 minute)

**Dashboard:** GitHub Actions Insights tab

---

## GitHub Secrets Configuration

### Required Secrets (For Deployment)

**Container Registry:**
- `DOCKER_REGISTRY_URL`: Container registry URL
- `DOCKER_REGISTRY_USERNAME`: Registry username
- `DOCKER_REGISTRY_TOKEN`: Registry access token

**Staging Environment:**
- `STAGING_HOST`: Staging server hostname
- `STAGING_USERNAME`: SSH username
- `STAGING_SSH_KEY`: SSH private key (base64 encoded)

**Production Environment:**
- `PRODUCTION_HOST`: Production server hostname
- `PRODUCTION_USERNAME`: SSH username
- `PRODUCTION_SSH_KEY`: SSH private key

**Optional:**
- `CODECOV_TOKEN`: Codecov upload token
- `SLACK_WEBHOOK`: Slack notification webhook

### Setting Secrets

1. Go to GitHub repo Settings
2. Navigate to Secrets and variables → Actions
3. Click "New repository secret"
4. Enter name and value
5. Click "Add secret"

---

## Resources

### Documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Jest Coverage Configuration](https://jestjs.io/docs/configuration#coveragethreshold-object)

### Related Docs
- `docs/QA-AUTOMATION-GUIDE.md` - QA testing procedures
- `docs/PRODUCTION-DEPLOYMENT-GUIDE.md` - Production deployment runbook
- `docs/PERFORMANCE-BENCHMARKING-GUIDE.md` - Performance testing
- `.github/pull_request_template.md` - PR checklist

---

**Last Updated:** October 17, 2025  
**Phase 4 - CI/CD & QA Automation**

