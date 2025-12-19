# DIVE V3 CI/CD Plan

**Version**: 1.0  
**Date**: December 18, 2025  
**Status**: Ready for Implementation

---

## Executive Summary

This document defines the CI/CD pipeline architecture for DIVE V3, implementing quality gates, automated deployments, and rollback mechanisms. The pipeline supports both local development validation and GCP Compute Engine deployments.

**Key Capabilities**:
- PR validation in < 5 minutes
- Auto-deploy to dev on main merge
- Automatic rollback on E2E failure
- Semantic versioning for Docker images

---

## Pipeline Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DIVE V3 CI/CD Pipeline                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Feature Branch                                 │  │
│  │                                                                        │  │
│  │   Developer Push                                                       │  │
│  │        │                                                               │  │
│  │        ▼                                                               │  │
│  │   ┌─────────────────────────────────────────────────────────────┐    │  │
│  │   │                  Pre-commit Hooks                            │    │  │
│  │   │   shellcheck │ terraform fmt │ eslint │ prettier             │    │  │
│  │   └─────────────────────────────────────────────────────────────┘    │  │
│  │                                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼ Pull Request                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    PR Validation (< 5 min)                            │  │
│  │                                                                        │  │
│  │   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │  │
│  │   │  Lint  │  │  Unit  │  │  OPA   │  │Compose │  │ Deploy │        │  │
│  │   │        │──│ Tests  │──│ Tests  │──│Validate│──│Dry-Run │        │  │
│  │   └────────┘  └────────┘  └────────┘  └────────┘  └────────┘        │  │
│  │                                                                        │  │
│  │   Gate: All checks must pass to enable merge                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼ Merge to Main                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Deploy Pipeline (< 15 min)                         │  │
│  │                                                                        │  │
│  │   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │  │
│  │   │ Build  │──│  Push  │──│Checkpoint──│ Deploy │──│  E2E   │        │  │
│  │   │ Images │  │Registry│  │ Create │  │   Dev  │  │ Tests  │        │  │
│  │   └────────┘  └────────┘  └────────┘  └────────┘  └────────┘        │  │
│  │                                                       │               │  │
│  │                                                       │ On Failure    │  │
│  │                                                       ▼               │  │
│  │                                              ┌────────────────┐       │  │
│  │                                              │    Rollback    │       │  │
│  │                                              │  + Notify Team │       │  │
│  │                                              └────────────────┘       │  │
│  │                                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Definitions

### 1. PR Validation Workflow

**File**: `.github/workflows/dive-pr-checks.yml`

```yaml
name: DIVE PR Checks

on:
  pull_request:
    branches: [main, develop]
    paths:
      - 'scripts/**'
      - 'docker-compose*.yml'
      - 'terraform/**'
      - 'backend/**'
      - 'frontend/**'
      - 'keycloak/**'

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  DIVE_ENV: local

jobs:
  # ═══════════════════════════════════════════════════════════════════════
  # Stage 1: Linting (Parallel)
  # ═══════════════════════════════════════════════════════════════════════
  
  lint-shell:
    name: ShellCheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run ShellCheck
        uses: ludeeus/action-shellcheck@2.0.0
        with:
          scandir: './scripts'
          severity: warning
          format: gcc

  lint-terraform:
    name: Terraform Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0
      
      - name: Terraform Format Check
        run: terraform fmt -check -recursive terraform/
      
      - name: Terraform Validate (Pilot)
        run: |
          cd terraform/pilot
          terraform init -backend=false
          terraform validate
      
      - name: Terraform Validate (Spoke)
        run: |
          cd terraform/spoke
          terraform init -backend=false
          terraform validate

  lint-compose:
    name: Docker Compose Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Validate docker-compose.yml
        run: docker compose -f docker-compose.yml config --quiet
      
      - name: Validate docker-compose.hub.yml
        run: docker compose -f docker-compose.hub.yml config --quiet

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 2: Unit Tests (Parallel)
  # ═══════════════════════════════════════════════════════════════════════
  
  test-backend-unit:
    name: Backend Unit Tests
    runs-on: ubuntu-latest
    needs: [lint-shell, lint-terraform, lint-compose]
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      
      - name: Install Dependencies
        run: cd backend && npm ci
      
      - name: Run Unit Tests
        run: cd backend && npm run test:unit
        env:
          NODE_ENV: test

  test-frontend-unit:
    name: Frontend Unit Tests
    runs-on: ubuntu-latest
    needs: [lint-shell, lint-terraform, lint-compose]
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install Dependencies
        run: cd frontend && npm ci
      
      - name: Run Unit Tests
        run: cd frontend && npm test -- --passWithNoTests

  test-opa:
    name: OPA Policy Tests
    runs-on: ubuntu-latest
    needs: [lint-shell, lint-terraform, lint-compose]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup OPA
        uses: open-policy-agent/setup-opa@v2
        with:
          version: latest
      
      - name: Run OPA Tests
        run: opa test policies/ -v --coverage --format=json > opa-coverage.json
      
      - name: Check OPA Coverage
        run: |
          coverage=$(jq '.coverage' opa-coverage.json)
          echo "OPA Policy Coverage: ${coverage}%"
          if (( $(echo "$coverage < 80" | bc -l) )); then
            echo "Coverage below 80%"
            exit 1
          fi

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 3: Deploy Validation
  # ═══════════════════════════════════════════════════════════════════════
  
  test-deploy-dry-run:
    name: Deploy Dry Run
    runs-on: ubuntu-latest
    needs: [test-backend-unit, test-frontend-unit, test-opa]
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Dry Run
        run: ./dive deploy --dry-run
        env:
          DRY_RUN: true
          POSTGRES_PASSWORD: test-password
          KEYCLOAK_ADMIN_PASSWORD: test-password
          MONGO_PASSWORD: test-password
          AUTH_SECRET: test-secret
          KEYCLOAK_CLIENT_SECRET: test-secret
          REDIS_PASSWORD: test-password

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 4: Docker Phase Tests
  # ═══════════════════════════════════════════════════════════════════════
  
  test-docker-phases:
    name: Docker Phase Tests
    runs-on: ubuntu-latest
    needs: [test-deploy-dry-run]
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Phase 0 Tests
        run: |
          chmod +x tests/docker/phase0-baseline-tests.sh
          ./tests/docker/phase0-baseline-tests.sh --skip-lifecycle
      
      - name: Run Phase 1 Tests
        run: |
          chmod +x tests/docker/phase1-compose-tests.sh
          ./tests/docker/phase1-compose-tests.sh

  # ═══════════════════════════════════════════════════════════════════════
  # Summary
  # ═══════════════════════════════════════════════════════════════════════
  
  pr-summary:
    name: PR Summary
    runs-on: ubuntu-latest
    needs: [test-docker-phases]
    if: always()
    steps:
      - name: Create Summary
        run: |
          echo "## PR Validation Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Check | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Linting | ${{ needs.lint-shell.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Unit Tests | ${{ needs.test-backend-unit.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| OPA Tests | ${{ needs.test-opa.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Deploy Dry Run | ${{ needs.test-deploy-dry-run.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Docker Tests | ${{ needs.test-docker-phases.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
```

---

### 2. Deploy Workflow

**File**: `.github/workflows/dive-deploy.yml`

```yaml
name: DIVE Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - staging
      skip_tests:
        description: 'Skip E2E tests'
        required: false
        default: false
        type: boolean

env:
  GCP_PROJECT: dive25
  GCP_ZONE: us-east4-c
  REGISTRY: us-east4-docker.pkg.dev/dive25/dive-v3-images

permissions:
  contents: read
  id-token: write
  packages: write

jobs:
  # ═══════════════════════════════════════════════════════════════════════
  # Stage 1: Build
  # ═══════════════════════════════════════════════════════════════════════
  
  build:
    name: Build Images
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
      sha: ${{ steps.version.outputs.sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # For version calculation
      
      - name: Calculate Version
        id: version
        run: |
          # Get version from git describe or tags
          if git describe --tags --exact-match 2>/dev/null; then
            VERSION=$(git describe --tags --exact-match)
          else
            VERSION="0.0.0-$(git rev-list --count HEAD)-g$(git rev-parse --short HEAD)"
          fi
          SHA=$(git rev-parse --short HEAD)
          echo "version=${VERSION}" >> $GITHUB_OUTPUT
          echo "sha=${SHA}" >> $GITHUB_OUTPUT
          echo "Version: ${VERSION}, SHA: ${SHA}"
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Artifact Registry
        uses: docker/login-action@v3
        with:
          registry: us-east4-docker.pkg.dev
          username: _json_key
          password: ${{ secrets.GCP_SA_KEY }}
      
      - name: Build and Push Backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.REGISTRY }}/backend:${{ steps.version.outputs.sha }}
            ${{ env.REGISTRY }}/backend:${{ steps.version.outputs.version }}
            ${{ env.REGISTRY }}/backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          labels: |
            org.opencontainers.image.version=${{ steps.version.outputs.version }}
            org.opencontainers.image.revision=${{ github.sha }}
      
      - name: Build and Push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.REGISTRY }}/frontend:${{ steps.version.outputs.sha }}
            ${{ env.REGISTRY }}/frontend:${{ steps.version.outputs.version }}
            ${{ env.REGISTRY }}/frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and Push Keycloak
        uses: docker/build-push-action@v5
        with:
          context: ./keycloak
          push: true
          tags: |
            ${{ env.REGISTRY }}/keycloak:${{ steps.version.outputs.sha }}
            ${{ env.REGISTRY }}/keycloak:${{ steps.version.outputs.version }}
            ${{ env.REGISTRY }}/keycloak:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 2: Deploy
  # ═══════════════════════════════════════════════════════════════════════
  
  deploy:
    name: Deploy to Dev
    runs-on: ubuntu-latest
    needs: build
    environment: 
      name: ${{ github.event.inputs.environment || 'dev' }}
      url: https://usa-app.dive25.com
    steps:
      - uses: actions/checkout@v4
      
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
      
      - name: Create Checkpoint
        run: |
          echo "Creating checkpoint before deployment..."
          ./dive --env gcp pilot checkpoint create || true
      
      - name: Deploy to Pilot VM
        run: |
          # Update deployment manifest with new image tags
          export IMAGE_TAG=${{ needs.build.outputs.sha }}
          
          # Deploy via SSH
          gcloud compute ssh dive-v3-pilot \
            --zone=${{ env.GCP_ZONE }} \
            --project=${{ env.GCP_PROJECT }} \
            --command="cd /opt/dive-v3 && git pull && ./dive deploy"
      
      - name: Wait for Health
        run: |
          echo "Waiting for services to be healthy..."
          max_attempts=30
          attempt=0
          while [ $attempt -lt $max_attempts ]; do
            if curl -sf https://usa-app.dive25.com/api/health; then
              echo "Services healthy!"
              break
            fi
            attempt=$((attempt + 1))
            echo "Attempt $attempt/$max_attempts..."
            sleep 10
          done
          
          if [ $attempt -eq $max_attempts ]; then
            echo "Services did not become healthy"
            exit 1
          fi

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 3: E2E Tests
  # ═══════════════════════════════════════════════════════════════════════
  
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: deploy
    if: ${{ !inputs.skip_tests }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Federation E2E Tests
        run: |
          ./dive test federation
        env:
          DIVE_ENV: gcp
          BASE_URL: https://usa-app.dive25.com
      
      - name: Run Playwright Tests
        run: |
          cd frontend
          npm ci
          npx playwright install --with-deps chromium
          npx playwright test --project=chromium
        env:
          BASE_URL: https://usa-app.dive25.com

  # ═══════════════════════════════════════════════════════════════════════
  # Stage 4: Rollback on Failure
  # ═══════════════════════════════════════════════════════════════════════
  
  rollback:
    name: Rollback
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: failure()
    steps:
      - uses: actions/checkout@v4
      
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
      
      - name: Rollback Deployment
        run: |
          echo "E2E tests failed, rolling back..."
          ./dive --env gcp pilot rollback
      
      - name: Create Issue
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🚨 Deployment Rollback: ${{ github.sha }}',
              body: `## Deployment Failed
              
              **Commit**: ${{ github.sha }}
              **Run**: [#${{ github.run_number }}](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})
              
              E2E tests failed after deployment. Automatic rollback was performed.
              
              ### Next Steps
              1. Review the E2E test logs
              2. Identify the failing tests
              3. Fix the issues and create a new PR
              
              /cc @dive-v3/devops`,
              labels: ['deployment-failure', 'needs-investigation']
            })
      
      - name: Notify Slack
        if: vars.SLACK_WEBHOOK_URL
        run: |
          curl -X POST ${{ vars.SLACK_WEBHOOK_URL }} \
            -H 'Content-type: application/json' \
            --data '{
              "text": "🚨 DIVE V3 Deployment Rollback",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Failed - Rollback Performed*\n\nCommit: `${{ github.sha }}`\nRun: <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|#${{ github.run_number }}>"
                  }
                }
              ]
            }'

  # ═══════════════════════════════════════════════════════════════════════
  # Summary
  # ═══════════════════════════════════════════════════════════════════════
  
  deploy-summary:
    name: Deployment Summary
    runs-on: ubuntu-latest
    needs: [build, deploy, e2e-tests]
    if: always()
    steps:
      - name: Create Summary
        run: |
          echo "## Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Stage | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Build | ${{ needs.build.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Deploy | ${{ needs.deploy.result == 'success' && '✅' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "| E2E Tests | ${{ needs.e2e-tests.result == 'success' && '✅' || needs.e2e-tests.result == 'skipped' && '⏭️' || '❌' }} |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Version Info" >> $GITHUB_STEP_SUMMARY
          echo "- Version: \`${{ needs.build.outputs.version }}\`" >> $GITHUB_STEP_SUMMARY
          echo "- SHA: \`${{ needs.build.outputs.sha }}\`" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Endpoints" >> $GITHUB_STEP_SUMMARY
          echo "- App: https://usa-app.dive25.com" >> $GITHUB_STEP_SUMMARY
          echo "- API: https://usa-api.dive25.com" >> $GITHUB_STEP_SUMMARY
          echo "- IdP: https://usa-idp.dive25.com" >> $GITHUB_STEP_SUMMARY
```

---

## Quality Gates

### PR Gate (Required)

| Check | Timeout | Failure Action |
|-------|---------|----------------|
| ShellCheck | 1 min | Block merge |
| Terraform Validate | 2 min | Block merge |
| Compose Validate | 1 min | Block merge |
| Backend Unit Tests | 3 min | Block merge |
| Frontend Unit Tests | 2 min | Block merge |
| OPA Policy Tests | 1 min | Block merge |
| Deploy Dry Run | 2 min | Block merge |
| Docker Phase Tests | 5 min | Block merge |

**Total PR Gate Time**: < 5 minutes (parallel execution)

### Deploy Gate (Required)

| Check | Timeout | Failure Action |
|-------|---------|----------------|
| Build Images | 5 min | Abort deploy |
| Push to Registry | 2 min | Abort deploy |
| Create Checkpoint | 1 min | Continue (warn) |
| Deploy to VM | 5 min | Rollback |
| Health Check | 5 min | Rollback |
| E2E Tests | 10 min | Rollback |

**Total Deploy Gate Time**: < 15 minutes

---

## Branch Protection Rules

### Main Branch

```yaml
# Branch protection for main
protection:
  required_status_checks:
    strict: true
    contexts:
      - "ShellCheck"
      - "Terraform Validate"
      - "Docker Compose Validate"
      - "Backend Unit Tests"
      - "Frontend Unit Tests"
      - "OPA Policy Tests"
      - "Deploy Dry Run"
      - "Docker Phase Tests"
  required_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
    require_code_owner_reviews: true
  enforce_admins: true
  required_linear_history: true
  allow_force_pushes: false
  allow_deletions: false
```

### Develop Branch

```yaml
# Branch protection for develop
protection:
  required_status_checks:
    strict: false
    contexts:
      - "ShellCheck"
      - "Backend Unit Tests"
      - "OPA Policy Tests"
  required_pull_request_reviews:
    required_approving_review_count: 1
```

---

## Secrets Management

### GitHub Secrets Required

| Secret | Purpose | Rotation |
|--------|---------|----------|
| `GCP_SA_KEY` | GCP Service Account JSON | 90 days |
| `SLACK_WEBHOOK_URL` | Deployment notifications | Never |

### GCP Secret Manager

Secrets loaded at runtime via `gcloud secrets versions access`:

| Secret | Purpose |
|--------|---------|
| `dive-v3-postgres-usa` | PostgreSQL password |
| `dive-v3-keycloak-usa` | Keycloak admin password |
| `dive-v3-mongodb-usa` | MongoDB password |
| `dive-v3-auth-secret-usa` | NextAuth secret |
| `dive-v3-redis-blacklist` | Redis password |
| `dive-v3-keycloak-client-secret` | OIDC client secret |

---

## Rollback Procedure

### Automatic Rollback

Triggered automatically when:
1. E2E tests fail after deploy
2. Health check fails after deploy
3. Deploy step fails

**Actions**:
1. Restore from latest checkpoint
2. Restart services
3. Verify health
4. Create GitHub issue
5. Notify Slack

### Manual Rollback

```bash
# Rollback to latest checkpoint
./dive --env gcp pilot rollback

# Rollback to specific checkpoint
./dive --env gcp pilot rollback --to 20251218_120000

# List available checkpoints
./dive --env gcp pilot checkpoint list
```

---

## Monitoring & Observability

### GitHub Actions Dashboard

- Workflow runs: `https://github.com/org/dive-v3/actions`
- Deployment history: `https://github.com/org/dive-v3/deployments`

### Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| PR check duration | < 5 min | > 10 min |
| Deploy duration | < 15 min | > 20 min |
| Deploy success rate | > 95% | < 90% |
| Rollback frequency | < 5%/week | > 10%/week |
| E2E test pass rate | > 98% | < 95% |

### Workflow Status Badges

Add to README.md:

```markdown
[![DIVE PR Checks](https://github.com/org/dive-v3/actions/workflows/dive-pr-checks.yml/badge.svg)](https://github.com/org/dive-v3/actions/workflows/dive-pr-checks.yml)
[![DIVE Deploy](https://github.com/org/dive-v3/actions/workflows/dive-deploy.yml/badge.svg)](https://github.com/org/dive-v3/actions/workflows/dive-deploy.yml)
```

---

## Scripts Recommendations

### Pre-commit Hook

**File**: `.git/hooks/pre-commit` (or via husky)

```bash
#!/bin/bash
set -e

# ShellCheck
find scripts -name "*.sh" -exec shellcheck {} \;

# Terraform format
terraform fmt -check -recursive terraform/

# TypeScript lint
cd backend && npm run lint && cd ..
cd frontend && npm run lint && cd ..

echo "Pre-commit checks passed!"
```

### Local CI Simulation

**File**: `scripts/ci-local.sh`

```bash
#!/bin/bash
# Simulate CI pipeline locally

set -e

echo "=== DIVE Local CI ==="

echo "Step 1: Linting..."
shellcheck scripts/dive-modules/*.sh
terraform fmt -check -recursive terraform/
docker compose config --quiet

echo "Step 2: Unit Tests..."
(cd backend && npm test)
(cd frontend && npm test)
opa test policies/ -v

echo "Step 3: Deploy Dry Run..."
./dive deploy --dry-run

echo "Step 4: Docker Phase Tests..."
./tests/docker/phase0-baseline-tests.sh --skip-lifecycle

echo "=== All checks passed! ==="
```

---

## Migration from Existing Workflows

### Workflows to Archive

| Workflow | Reason | Replacement |
|----------|--------|-------------|
| `ci-comprehensive.yml` | Split into PR + Deploy | `dive-pr-checks.yml`, `dive-deploy.yml` |
| `ci-fast.yml` | Redundant | `dive-pr-checks.yml` |
| `deploy-dev-server.yml` | Manual | `dive-deploy.yml` |

### Migration Steps

1. Create new workflows in parallel
2. Test new workflows on feature branch
3. Update branch protection to require new workflows
4. Archive old workflows to `.github/workflows/archive/`
5. Update README badges

---

## Appendix: Workflow File Locations

| File | Purpose |
|------|---------|
| `.github/workflows/dive-pr-checks.yml` | PR validation |
| `.github/workflows/dive-deploy.yml` | Deployment pipeline |
| `.github/branch-protection.yml` | Branch rules (IaC) |
| `scripts/ci-local.sh` | Local CI simulation |
| `.husky/pre-commit` | Pre-commit hooks |

