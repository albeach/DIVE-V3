# Comprehensive CI/CD Deployment Setup for DIVE V3 Home Server

## CONTEXT

You are Claude Sonnet 4.5 running on a home server that hosts the DIVE V3 coalition ICAM application at `dev-app.dive25.com` via Cloudflare Zero Trust tunnel. This server is the deployment target for code changes made on a local development machine.

### Current Infrastructure

**Home Server:**
- Hosts: `dev-app.dive25.com` (frontend), `dev-api.dive25.com` (backend), `dev-auth.dive25.com` (Keycloak)
- Stack: Docker Compose with 8+ services (Keycloak, PostgreSQL, MongoDB, Redis, OPA, AuthzForce, Backend, Frontend, KAS)
- Cloudflare Zero Trust tunnel provides external access
- Environment: DEVELOPMENT mode with external access (not production)

**Local Development Machine:**
- Primary development environment
- Git repository: `https://github.com/albeach/DIVE-V3.git`
- Pushes to GitHub trigger deployment to home server

### Technology Stack

- **Frontend:** Next.js 15+, React 19, NextAuth.js v5, TypeScript, Tailwind CSS
- **Backend:** Node.js 20+, Express.js 4.18, TypeScript, HTTPS
- **Auth:** Keycloak 26+ (multi-realm broker), JWT RS256
- **Authorization:** OPA (Open Policy Agent) v0.68.0+ with Rego policies
- **Databases:** PostgreSQL 15 (Keycloak/NextAuth), MongoDB 7 (resources), Redis 7 (sessions)
- **Testing:** Jest (backend unit/integration), Playwright (frontend E2E), OPA test framework
- **Infrastructure:** Docker Compose, Terraform (Keycloak IaC)

### Project Structure

```
DIVE-V3/
├── .github/workflows/           # 18 existing GitHub Actions workflows
│   ├── ci.yml                  # Main CI pipeline (517 lines)
│   ├── deploy.yml              # Deployment placeholder
│   ├── backend-ci.yml          # Backend-specific CI
│   ├── backend-tests.yml
│   ├── frontend-ci.yml         # Frontend-specific CI
│   ├── frontend-tests.yml
│   ├── opa-tests.yml           # OPA policy tests
│   ├── e2e-tests.yml
│   ├── e2e-classification.yml
│   ├── federation-tests.yml
│   ├── keycloak-test.yml
│   ├── nato-expansion-ci.yml
│   ├── phase2-ci.yml
│   ├── policies-lab-ci.yml
│   ├── security-scan.yml
│   ├── spain-saml-integration.yml
│   ├── terraform-ci.yml
│   └── test.yml
├── backend/                     # Express.js API with PEP
│   ├── src/__tests__/          # Jest tests (215 test files)
│   ├── package.json            # Test scripts: test, test:unit, test:integration, test:ci, test:coverage
│   └── jest.config.js          # Coverage thresholds: 95% global, 100% critical services
├── frontend/                    # Next.js application
│   ├── tests/                  # Playwright E2E tests
│   ├── package.json            # Test scripts: test (Jest), test:e2e (Playwright)
│   └── jest.config.js          # Component tests
├── policies/                    # OPA Rego policies
│   ├── *.rego                  # 7 policy files
│   └── tests/                  # OPA test suite
├── kas/                         # Key Access Service (stretch)
├── scripts/                     # 192+ utility scripts
│   ├── deploy-stack.sh
│   ├── health-check.sh
│   ├── qa-validation.sh
│   ├── performance-benchmark.sh
│   └── test-*.sh               # Various test scripts
├── docker-compose.yml           # Production stack (307 lines)
└── docker-compose.dev.yml       # Development stack (109 lines)
```

### Existing Test Suite Analysis

**Backend Tests (package.json):**
- `npm test` - All tests with MongoDB Memory Server
- `npm run test:unit` - Unit tests only (excludes integration)
- `npm run test:integration` - Integration tests with real MongoDB/OPA
- `npm run test:audit-logs` - Audit log compliance tests
- `npm run test:coverage` - Coverage report (95% threshold)
- `npm run test:ci` - CI-optimized test run
- **Coverage Thresholds:** 95% global, 100% for critical services (risk-scoring, authz-cache, authz-middleware)

**Frontend Tests (package.json):**
- `npm test` - Jest unit/component tests
- `npm run test:e2e` - Playwright end-to-end tests
- `npm run test:e2e:ui` - Playwright interactive mode
- `npm run test:e2e:debug` - Playwright debug mode

**OPA Policy Tests:**
- `opa test policies/ -v` - All policy tests with verbose output
- Comprehensive ABAC test matrix (clearance × classification × releasability × COI × embargo)

**Script-Based Tests:**
- `scripts/smoke-test.sh` - Health checks for all services
- `scripts/qa-validation.sh` - Quality assurance validation
- `scripts/performance-benchmark.sh` - Performance benchmarks
- `scripts/test-ci-locally.sh` - Local CI simulation
- `scripts/phase3-regression-check.sh` - Regression testing

### Existing GitHub Actions Workflows

**Current State:** 18 workflows with significant overlap and redundancy

1. **ci.yml (517 lines)** - Comprehensive main CI pipeline
   - Backend build + unit tests + integration tests
   - Frontend build + type checking
   - OPA policy tests
   - Security audit
   - Performance tests
   - Code quality (ESLint)
   - Docker build
   - Coverage report
   - **Issues:** Monolithic, runs all checks on every push, long runtime

2. **backend-ci.yml (102 lines)** - Backend-specific CI
   - **OVERLAP:** Duplicates backend tests from ci.yml
   - Triggers on backend/** path changes
   - Runs unit tests + IdP management tests

3. **backend-tests.yml**
   - **OVERLAP:** Likely duplicates backend-ci.yml

4. **frontend-ci.yml (91 lines)** - Frontend-specific CI
   - **OVERLAP:** Duplicates frontend build from ci.yml
   - Triggers on frontend/** path changes
   - Runs E2E tests with Playwright

5. **frontend-tests.yml**
   - **OVERLAP:** Likely duplicates frontend-ci.yml

6. **opa-tests.yml (99 lines)** - OPA policy tests
   - **OVERLAP:** Duplicates policy tests from ci.yml
   - Triggers on policies/** path changes
   - Uses open-policy-agent/setup-opa action

7. **deploy.yml (80 lines)** - Deployment placeholder
   - **INCOMPLETE:** Currently just a simulation, no actual deployment
   - Needs implementation for home server deployment

8. **e2e-tests.yml** - End-to-end tests
   - **OVERLAP:** May duplicate frontend-ci.yml E2E tests

9. **e2e-classification.yml** - Classification-specific E2E tests
   - **OVERLAP:** Should be consolidated with e2e-tests.yml

10. **federation-tests.yml** - Federation-specific tests
    - **SPECIALTY:** Multi-IdP federation scenarios

11. **keycloak-test.yml** - Keycloak configuration tests
    - **SPECIALTY:** Keycloak-specific validation

12. **nato-expansion-ci.yml** - NATO expansion features
    - **LEGACY:** May be deprecated/outdated

13. **phase2-ci.yml** - Phase 2 specific CI
    - **LEGACY:** Phase-specific, may be outdated

14. **policies-lab-ci.yml** - Policies Lab CI
    - **SPECIALTY:** Policy upload/validation feature

15. **security-scan.yml** - Security scanning
    - **OVERLAP:** Duplicates security-audit from ci.yml

16. **spain-saml-integration.yml** - Spain SAML IdP tests
    - **SPECIALTY:** Spain-specific federation

17. **terraform-ci.yml** - Terraform validation
    - **SPECIALTY:** IaC validation for Keycloak

18. **test.yml** - Generic test workflow
    - **OVERLAP:** Likely duplicates ci.yml

## YOUR MISSION

Implement a modern, streamlined CI/CD pipeline using **GitHub Actions with Self-Hosted Runner** (Option A) that:

1. **Eliminates redundancy** in existing 18 workflows
2. **Fills gaps** between GitHub Actions and local test suite
3. **Enables one-click deployment** from local dev → GitHub → home server
4. **Includes best practices:** Watchtower, health checks, rollback, zero-downtime deployment
5. **Maintains security:** Secrets management, TLS, JWT validation
6. **Preserves all test coverage** while improving efficiency

## DELIVERABLES

You must produce a **phased implementation plan** with:

### Phase 1: Audit & Gap Analysis (YOUR FIRST TASK)

**Step 1.1: Comprehensive Workflow Audit**
- Read all 18 existing GitHub Actions workflow files
- Document what each workflow does, when it triggers, what it tests
- Identify overlap (tests run multiple times)
- Identify redundancy (workflows that serve same purpose)
- Identify gaps (tests run locally but not in CI, or vice versa)
- Tag workflows as: KEEP (unique value), CONSOLIDATE (merge into another), DEPRECATED (remove)

**Step 1.2: Test Coverage Gap Analysis**
Create a matrix comparing:
- Backend tests: What runs locally vs. GitHub Actions
- Frontend tests: What runs locally vs. GitHub Actions
- OPA tests: What runs locally vs. GitHub Actions
- Integration tests: What runs locally vs. GitHub Actions
- E2E tests: What runs locally vs. GitHub Actions
- Performance tests: What runs locally vs. GitHub Actions
- Security scans: What runs locally vs. GitHub Actions

**Step 1.3: Dependency Mapping**
- Map test dependencies (MongoDB, PostgreSQL, Redis, OPA, Keycloak)
- Identify which tests need full stack vs. isolated services
- Determine optimal test parallelization strategy

**Step 1.4: Audit Report**
Generate a comprehensive report:
```markdown
# DIVE V3 CI/CD Audit Report

## Executive Summary
- Total workflows: 18
- Overlap detected: X workflows
- Deprecated workflows: Y workflows
- Test coverage gaps: Z tests
- Recommended consolidation: A → B workflows

## Detailed Findings

### Workflow Analysis
[For each workflow: purpose, triggers, tests, overlap, recommendation]

### Test Coverage Matrix
[Local vs CI comparison table]

### Dependency Analysis
[Service requirements per test type]

### Recommendations
[Specific action items]
```

### Phase 2: Streamlined Workflow Design

**Design a new workflow structure:**
```
.github/workflows/
├── ci-main.yml              # Main CI: build + fast tests (< 5 min)
├── ci-comprehensive.yml     # Full test suite (runs nightly + on main)
├── deploy-dev-server.yml    # Deploy to dev-app.dive25.com (self-hosted runner)
├── test-federation.yml      # Multi-IdP integration tests (specialty)
├── test-e2e.yml            # All E2E tests consolidated
├── security.yml            # Security scans consolidated
└── terraform.yml           # IaC validation
```

**Design Principles:**
- Fast feedback: PRs get < 5 min CI (build + critical tests)
- Comprehensive validation: main branch gets full suite
- Path-based triggers: Only run relevant tests for changed files
- Parallel execution: Independent tests run concurrently
- Caching: Node modules, Docker layers, build artifacts
- Self-hosted runner: Deployment happens on home server

### Phase 3: Self-Hosted Runner Setup

**Step 3.1: Install GitHub Actions Runner on Home Server**
```bash
# Download and configure GitHub Actions runner
mkdir -p ~/actions-runner && cd ~/actions-runner
# [GitHub-provided setup commands]
```

**Step 3.2: Configure Runner as System Service**
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

**Step 3.3: Label Runner**
- Label: `self-hosted`, `dive-v3-dev-server`, `linux`, `x64`

### Phase 4: Deployment Automation

**Step 4.1: Create `deploy-dev-server.yml`**
- Trigger: Push to `main` branch OR manual `workflow_dispatch`
- Runs on: `self-hosted` runner
- Steps:
  1. Checkout code
  2. Load secrets (.env files)
  3. Run pre-deployment tests (smoke tests)
  4. Pull/build Docker images
  5. Zero-downtime rolling deployment
  6. Health checks
  7. Rollback on failure
  8. Cleanup old images

**Step 4.2: Create Deployment Scripts**
- `scripts/deploy-dev.sh` - Main deployment orchestration
- `scripts/health-check.sh` - Service health validation (already exists, enhance)
- `scripts/rollback.sh` - Automatic rollback on failure

**Step 4.3: GitHub Secrets Configuration**
- Add secrets for home server:
  - `ENV_BACKEND` - Backend .env file
  - `ENV_FRONTEND` - Frontend .env.local file
  - `ENV_KAS` - KAS .env file
  - `CLOUDFLARE_TUNNEL_TOKEN` - Cloudflare tunnel token (if needed)

### Phase 5: Watchtower Integration (Optional Enhancement)

**Step 5.1: Add Watchtower to docker-compose.yml**
```yaml
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  command: --interval 300 --cleanup --label-enable
  restart: unless-stopped
```

**Step 5.2: Label Services for Auto-Update**
```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
```

### Phase 6: Migration & Validation

**Step 6.1: Create Migration Script**
- Backup existing workflows to `.github/workflows/archive/`
- Deploy new streamlined workflows
- Update README.md with new workflow documentation

**Step 6.2: Parallel Testing**
- Run old and new workflows side-by-side for 1 week
- Compare results, timing, reliability
- Fine-tune new workflows

**Step 6.3: Cutover**
- Delete deprecated workflows
- Update documentation
- Communicate changes to team

**Step 6.4: Validation Testing**
- Test full deployment cycle: local → GitHub → home server
- Verify health checks
- Test rollback mechanism
- Performance benchmark (deployment time)

### Phase 7: Monitoring & Observability

**Step 7.1: Deployment Dashboard**
- Create GitHub Actions status badge in README
- Create deployment history log
- Monitor runner health

**Step 7.2: Alerting**
- Notify on deployment failures
- Alert on health check failures
- Track deployment metrics

## IMPLEMENTATION INSTRUCTIONS

### Your First Steps (DO THESE IMMEDIATELY):

1. **READ all 18 GitHub Actions workflows:**
   ```bash
   ls -la .github/workflows/
   # Read each file and document purpose
   ```

2. **ANALYZE test commands in package.json:**
   - backend/package.json (lines 6-42: test scripts)
   - frontend/package.json (lines 6-19: test scripts)

3. **MAP test execution:**
   - Which tests run in ci.yml vs. backend-ci.yml vs. backend-tests.yml?
   - What's duplicated?
   - What's missing from CI but exists in package.json?

4. **IDENTIFY test dependencies:**
   - Which tests need MongoDB? (backend unit/integration)
   - Which tests need OPA? (backend integration, policy tests)
   - Which tests need Keycloak? (E2E, federation)
   - Which tests need full stack? (E2E)

5. **CREATE the Audit Report (Phase 1.4):**
   - Save as `CI-CD-AUDIT-REPORT.md`
   - Include all findings, overlap analysis, recommendations

6. **DESIGN the new workflow structure (Phase 2):**
   - Save as `CI-CD-REDESIGN-PROPOSAL.md`
   - Include workflow diagrams, triggers, steps

7. **IMPLEMENT self-hosted runner setup (Phase 3):**
   - Generate installation commands
   - Create systemd service configuration

8. **CREATE deployment workflows (Phase 4):**
   - Write `deploy-dev-server.yml`
   - Write `scripts/deploy-dev.sh`
   - Write `scripts/rollback.sh`
   - Update `scripts/health-check.sh`

9. **ADD Watchtower (Phase 5):**
   - Update `docker-compose.yml`
   - Add Watchtower service
   - Label services for auto-update

10. **GENERATE migration plan (Phase 6):**
    - Create `MIGRATION-PLAN.md`
    - Include timeline, rollback strategy, validation steps

## CONSTRAINTS & REQUIREMENTS

### Must Preserve:
- All existing test coverage (no reduction in tests)
- Security validations (audit, secret scanning)
- Terraform validation
- OPA policy testing
- E2E test coverage
- Performance benchmarks

### Must Improve:
- CI/CD speed (target: < 5 min for PR feedback)
- Workflow clarity (no overlap/redundancy)
- Deployment automation (one-click deploy)
- Rollback capability
- Health monitoring

### Must Include:
- Self-hosted GitHub Actions runner on home server
- Zero-downtime deployment
- Automated health checks
- Rollback on failure
- Watchtower for container auto-updates
- Secrets management via GitHub Secrets
- Deployment history/logs

### Technical Specifications:
- Docker Compose orchestration
- HTTPS with self-signed certs (NODE_TLS_REJECT_UNAUTHORIZED=0 in dev)
- Cloudflare Zero Trust tunnel (dev-*.dive25.com domains)
- Multi-realm Keycloak (dive-v3-broker)
- MongoDB + PostgreSQL + Redis dependencies
- OPA policy engine
- NextAuth.js v5 session management

## SUCCESS CRITERIA

Your implementation is successful when:

1. ✅ Audit report identifies all overlap and gaps
2. ✅ New workflow structure reduces redundancy by > 50%
3. ✅ PR CI feedback time < 5 minutes
4. ✅ Full test suite (main branch) completes in < 15 minutes
5. ✅ Self-hosted runner successfully deployed on home server
6. ✅ One-click deployment works: local → git push → auto-deploy
7. ✅ Health checks validate all 8 services after deployment
8. ✅ Rollback mechanism tested and functional
9. ✅ Watchtower auto-updates containers on image changes
10. ✅ Zero-downtime deployment verified (no service interruption)
11. ✅ All existing tests still run (no coverage loss)
12. ✅ Documentation updated with new workflows

## REFERENCE MATERIALS

### Key Files to Read:
- `.github/workflows/ci.yml` - Main CI pipeline (517 lines)
- `backend/package.json` - Backend test scripts
- `frontend/package.json` - Frontend test scripts
- `backend/jest.config.js` - Coverage thresholds
- `docker-compose.yml` - Production stack
- `docker-compose.dev.yml` - Development stack
- `scripts/health-check.sh` - Existing health checks
- `scripts/deploy-stack.sh` - Existing deployment script

### DIVE V3 Project Conventions (CRITICAL):
- Follow repo_specific_rule conventions (see system rules)
- Maintain security requirements (JWT validation, TLS, secrets)
- Preserve NATO ACP-240 compliance
- Use ISO 3166-1 alpha-3 country codes
- Default deny policy pattern
- Structured JSON logging
- 95% test coverage minimum

### Architecture:
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Local Dev  │─────▶│ Git Push to  │─────▶│  GitHub     │
│  Machine    │      │  GitHub      │      │  Actions    │
└─────────────┘      └──────────────┘      └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ CI Pipeline │
                                            │ (Fast Tests)│
                                            └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ If main:    │
                                            │ Self-Hosted │
                                            │ Runner      │
                                            └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ Deploy to   │
                                            │ Home Server │
                                            │ (dev-app    │
                                            │ .dive25.com)│
                                            └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ Health      │
                                            │ Checks      │
                                            │ (8 services)│
                                            └─────────────┘
```

## BEGIN YOUR WORK

**Your immediate tasks:**

1. Read all 18 workflow files in `.github/workflows/`
2. Analyze test coverage in backend/frontend package.json
3. Create comprehensive audit report
4. Design streamlined workflow structure
5. Generate self-hosted runner setup instructions
6. Create deployment automation scripts
7. Implement Watchtower integration
8. Write migration plan

**Start with Phase 1: Audit & Gap Analysis**

Generate the audit report first. This will inform all subsequent phases. Be thorough, analytical, and detail-oriented. Every workflow, every test, every dependency must be accounted for.

**Remember:** You are optimizing for speed, clarity, and reliability while maintaining 100% test coverage and security compliance.

**Output Format:**
- Create markdown files for each deliverable
- Use code blocks for scripts
- Include diagrams where helpful
- Be specific with commands, not placeholders
- Validate all YAML syntax
- Test scripts for errors

**Begin now. Start with reading and analyzing the 18 workflows.**


