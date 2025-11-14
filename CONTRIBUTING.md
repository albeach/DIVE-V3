# Contributing to DIVE V3

Thank you for contributing to DIVE V3! This guide will help you understand our development workflow, CI/CD processes, and coding standards.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [CI/CD Workflows](#cicd-workflows)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Deployment Process](#deployment-process)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **Docker** & Docker Compose v24.0+
- **Git** 2.30+
- **8GB RAM** minimum

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/albeach/DIVE-V3.git
cd DIVE-V3

# 2. Start infrastructure services
./scripts/dev-start.sh

# 3. Install dependencies
cd backend && npm install
cd ../frontend && npm install --legacy-peer-deps

# 4. Seed database
cd backend && npm run seed-database

# 5. Start development servers
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Verify Installation

```bash
# Check services
./scripts/health-check.sh

# Access application
open http://localhost:3000
```

---

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

**Branch Naming Conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `test/` - Test improvements
- `docs/` - Documentation updates
- `chore/` - Maintenance tasks

### 2. Make Changes

Follow our [Coding Standards](#coding-standards) and ensure:
- ✅ TypeScript types are explicit
- ✅ No ESLint errors
- ✅ Tests are added/updated
- ✅ Documentation is updated

### 3. Commit Changes

We use **Conventional Commits** format:

```bash
git commit -m "feat(component): add new feature"
git commit -m "fix(api): resolve authorization bug"
git commit -m "test(e2e): add classification tests"
git commit -m "docs(readme): update deployment guide"
```

**Commit Types:**
- `feat` - New feature
- `fix` - Bug fix
- `test` - Test changes
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `chore` - Maintenance

### 4. Push and Create PR

```bash
git push -u origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## CI/CD Workflows

### Overview

DIVE V3 uses **6 streamlined workflows** for fast, reliable CI/CD:

| Workflow | Trigger | Purpose | Runtime |
|----------|---------|---------|---------|
| ci-fast.yml | PR | Quick validation | <5 min |
| ci-comprehensive.yml | Main branch, nightly | Full test suite | 10-15 min |
| test-e2e.yml | PR, main | End-to-end tests | 20-25 min |
| test-specialty.yml | Main (smart triggers) | Feature tests | Variable |
| security.yml | PR, main, daily | Security scans | Variable |
| terraform-ci.yml | PR (terraform changes) | IaC validation | 3-5 min |

---

### Pull Request Workflow

When you create a PR to `main` or `develop`:

#### 1. ci-fast.yml Runs Automatically (<5 min)

**What it checks:**
- ✅ Backend builds without errors
- ✅ Backend TypeScript type check passes
- ✅ Backend ESLint passes
- ✅ Frontend builds without errors
- ✅ Frontend TypeScript type check passes
- ✅ Frontend ESLint passes
- ✅ OPA policies compile correctly
- ✅ Terraform configuration is valid

**Path Filters:**
Only runs when these files change:
- `backend/src/**`
- `frontend/src/**`
- `policies/**`
- `terraform/**`

**Skips when only these change:**
- `**/*.md` (documentation)
- `docs/**`
- `scripts/**`

**What to do if it fails:**
```bash
# Backend issues
cd backend
npm run typecheck    # Check types
npm run lint         # Check linting
npm run build        # Check build

# Frontend issues
cd frontend
npm run typecheck    # Check types
npm run lint         # Check linting
npm run build        # Check build

# OPA issues
cd policies
opa check fuel_inventory_abac_policy.rego
```

#### 2. Other Workflows (Depending on Changes)

- **test-e2e.yml**: Runs if frontend/backend changed
- **security.yml**: Always runs
- **test-specialty.yml**: Runs if commit mentions specific features
- **terraform-ci.yml**: Runs if terraform files changed

#### 3. Fix Issues Before Merge

- All checks must pass ✅
- Get at least 1 approving review
- Resolve all conversations
- Ensure branch is up-to-date with main

---

### Main Branch Workflow

After PR is merged to `main`:

#### 1. ci-comprehensive.yml Runs Automatically (10-15 min)

**What it does:**
- ✅ Backend unit tests (with 95% coverage)
- ✅ Backend integration tests
- ✅ Backend audit log tests
- ✅ COI logic lint
- ✅ Frontend unit tests
- ✅ Frontend component tests
- ✅ OPA comprehensive tests
- ✅ OPA performance benchmark
- ✅ Performance tests (authorization latency, throughput)
- ✅ Docker image builds (backend, frontend, kas)
- ✅ Security audit (npm audit, secret scanning)
- ✅ Coverage reports

**Runs automatically:**
- On every push to `main`
- Daily at 2 AM UTC (scheduled)
- Can be triggered manually

**What to do if it fails:**
1. Check GitHub Actions logs
2. Run tests locally: `npm test`
3. Fix the issue
4. Create a fix PR

---

### Deployment Workflow

**Manual deployment to dev-app.dive25.com:**

#### Option 1: Via GitHub Actions UI

1. Go to https://github.com/albeach/DIVE-V3/actions
2. Click "Deploy to Dev Server"
3. Click "Run workflow"
4. Select branch (usually `main`)
5. Click "Run workflow" button
6. Monitor deployment (6-8 minutes)

#### Option 2: Via GitHub CLI

```bash
gh workflow run deploy-dev-server.yml
gh run watch
```

#### Deployment Steps

The workflow automatically:
1. ✅ Checks disk space (requires >10GB)
2. ✅ Deploys .env files (from GitHub Secrets)
3. ✅ Pulls latest code
4. ✅ Fixes permissions (chown 1001:1001)
5. ✅ Stops services gracefully
6. ✅ Starts services (docker-compose up -d)
7. ✅ Waits for health checks (Postgres, MongoDB, Redis, OPA, Keycloak, Backend, Frontend, KAS)
8. ✅ Initializes PostgreSQL (NextAuth tables)
9. ✅ Applies Terraform (11 realms, 44 test users)
10. ✅ Initializes COI keys
11. ✅ Seeds MongoDB (1,000 resources)
12. ✅ Restarts services to pick up configuration
13. ✅ Runs health checks
14. ✅ Verifies public endpoints

**Automatic Rollback:**
If deployment fails at any step, automatic rollback restores previous state.

#### Verify Deployment

```bash
# Check frontend
curl -I https://dev-app.dive25.com

# Check backend API
curl -I https://dev-api.dive25.com/health

# Check Keycloak
curl -I https://dev-auth.dive25.com/realms/dive-v3-broker
```

---

## Coding Standards

### TypeScript

**Required:**
- ✅ Explicit types for all function parameters and return values
- ✅ No `any` types (use `unknown` if truly unknown)
- ✅ Interfaces for all API responses and OPA inputs/outputs
- ✅ Functional components with TypeScript for React

**Example:**
```typescript
// ✅ Good
interface IResourceMetadata {
  resourceId: string;
  classification: string;
  releasabilityTo: string[];
}

function getResource(id: string): Promise<IResourceMetadata> {
  // ...
}

// ❌ Bad
function getResource(id) {
  // ...
}
```

### File Naming

- **Files**: kebab-case (`authz.middleware.ts`, `resource.service.ts`)
- **Components**: PascalCase (`AuthButton.tsx`, `ResourceList.tsx`)
- **Functions/Variables**: camelCase (`getResourceMetadata`, `opaInput`)
- **Constants**: UPPER_SNAKE_CASE (`OPA_URL`, `CLEARANCE_LEVELS`)
- **Interfaces**: PascalCase with `I` prefix (`IOPAInput`, `IResourceMetadata`)

### Security Requirements

#### Authentication
- ✅ All API routes protected by JWT validation
- ✅ Verify JWT signature using Keycloak JWKS
- ✅ Check `exp` and `iat` claims
- ✅ Short token lifetime (15 min access, 8h refresh)

#### Authorization
- ✅ Default deny in OPA policies (`default allow := false`)
- ✅ Fail-secure pattern (use `is_not_a_*` violation checks)
- ✅ All decisions logged with timestamp, subject, resource, decision, reason
- ✅ PEP calls OPA on every request

#### Data Protection
- ✅ PII minimization (log only `uniqueID`, not full name/email)
- ✅ Environment variables for secrets (never hardcode)
- ✅ Input validation (Joi/Zod)
- ✅ Output sanitization based on clearance

---

## Testing Guidelines

### Backend Tests

**Run tests:**
```bash
cd backend

# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Audit log tests
npm run test:audit-logs

# With coverage
npm run test:coverage
```

**Coverage Requirements:**
- Global: 95% (branches, functions, lines, statements)
- Critical services: 100% (risk-scoring.service.ts, authz-cache.service.ts)

**Writing Tests:**
```typescript
describe('Resource Service', () => {
  it('should retrieve resource metadata', async () => {
    const resource = await resourceService.getResource('doc-123');
    expect(resource.classification).toBe('SECRET');
  });

  it('should deny access if clearance insufficient', async () => {
    await expect(
      resourceService.getResource('doc-456', { clearance: 'CONFIDENTIAL' })
    ).rejects.toThrow('Insufficient clearance');
  });
});
```

### Frontend Tests

**Run tests:**
```bash
cd frontend

# All tests
npm test

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

**Component Testing:**
```typescript
import { render, screen } from '@testing-library/react';
import { ResourceCard } from '@/components/ResourceCard';

test('displays resource classification', () => {
  render(<ResourceCard resource={{ classification: 'SECRET' }} />);
  expect(screen.getByText('SECRET')).toBeInTheDocument();
});
```

### OPA Policy Tests

**Run tests:**
```bash
cd policies
opa test . -v
```

**Writing Policy Tests:**
```rego
test_allow_with_sufficient_clearance {
  allow with input as {
    "subject": {"clearance": "SECRET"},
    "resource": {"classification": "CONFIDENTIAL"}
  }
}

test_deny_with_insufficient_clearance {
  not allow with input as {
    "subject": {"clearance": "CONFIDENTIAL"},
    "resource": {"classification": "SECRET"}
  }
}
```

---

## Best Practices (Week 4 ✅)

### Dependency Injection for Testability

**When to use:** Module-level services need mocking

**Pattern:**
```typescript
// Define interface
interface IJwtService {
    verify: (...args: any[]) => any;
    decode: (...args: any[]) => any;
}

// Default to real service
let jwtService: IJwtService = jwt;

// Export initializer
export const initializeJwtService = (service?: IJwtService) => {
    jwtService = service || jwt;
};

// Use in code
const decoded = jwtService.decode(token, { complete: true });
```

**In tests:**
```typescript
const mockJwtService = {
    verify: jest.fn(),
    decode: jwt.decode  // Keep real implementation if needed
};

beforeEach(() => {
    initializeJwtService(mockJwtService);
    mockJwtService.verify.mockImplementation(defaultImpl);
});
```

**Benefits:**
- Testable without module mocking hacks
- Production code unchanged
- SOLID principles (Dependency Inversion)
- Consistent pattern across codebase

**Used in:** `authz.middleware.ts`, `oauth.controller.ts`

---

### Component Accessibility

**All interactive components must be accessible (WCAG 2.1 AA)**

**Pattern 1: Label Association**
```tsx
<label htmlFor="policy-selector">Select Policy *</label>
<select id="policy-selector">
  {/* options */}
</select>
```

**Pattern 2: Unique aria-labels for duplicates**
```tsx
<input aria-label="Subject COI: FVEY" />
<input aria-label="Resource COI: FVEY" />
<input aria-label="Releasability: USA" />
```

**Pattern 3: data-testid for complex elements**
```tsx
<motion.div data-testid={`idp-card-${idp.alias}`}>
  {/* content */}
</motion.div>
```

**Benefits:**
- Screen reader accessible
- Testable with `getByLabelText()`
- Better UX for all users
- Production benefit (not just tests!)

---

### Async Test Patterns

**Always use proper async patterns for React tests**

**Pattern 1: Wait for element to appear**
```typescript
const element = await screen.findByText('Expected Text');
```

**Pattern 2: Wait for async data**
```typescript
await waitFor(() => {
  expect(screen.getByText('Data Loaded')).toBeInTheDocument();
});
```

**Pattern 3: Wait before interaction**
```typescript
const button = await screen.findByText('Submit');
await waitFor(() => expect(button).not.toBeDisabled());
fireEvent.click(button);
```

**Pattern 4: Handle duplicates**
```typescript
const elements = screen.getAllByText(/Click/i);
expect(elements.length).toBeGreaterThan(0);
```

**Benefits:**
- No race conditions
- Respects React lifecycle
- Reliable tests
- No test flakiness

---

### Mock Configuration

**Always reset mocks in `beforeEach` for test isolation**

```typescript
// Default implementation
const defaultImpl = (token: string) => ({
  sub: 'user-123',
  clearance: 'SECRET'
});

// Create mock with default
const mockService = {
    method: jest.fn(defaultImpl)
};

// Reset in beforeEach
beforeEach(() => {
    jest.clearAllMocks();
    mockService.method.mockImplementation(defaultImpl);
    (global.fetch as jest.Mock).mockResolvedValue(defaultResponse);
});

// Override per test
it('handles error', () => {
    mockService.method.mockImplementation(() => {
        throw new Error('Test error');
    });
    // test code
});
```

**Benefits:**
- Tests don't affect each other
- Predictable behavior
- Easy to debug
- Maintainable

---

### What NOT to Do ❌

**Don't use querySelector() in tests:**
```typescript
// ❌ Bad (workaround):
const input = container.querySelector('input[type="file"]');

// ✅ Good (fix component):
<label htmlFor="file-input">File</label>
<input id="file-input" />
const input = screen.getByLabelText(/File/i);
```

**Don't skip tests to make them pass:**
```typescript
// ❌ Bad:
it.skip('broken test', () => { /* ... */ });

// ✅ Good:
it('fixed test', () => { /* proper fix */ });
```

**Don't use `any` type:**
```typescript
// ❌ Bad:
function process(data: any) { }

// ✅ Good:
function process(data: User | Resource) { }
```

---

## Deployment Process

### Development Environment

**Local Development:**
```bash
# Start all services
./scripts/dev-start.sh

# Backend (Terminal 1)
cd backend && npm run dev

# Frontend (Terminal 2)
cd frontend && npm run dev
```

**Access Points:**
- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- Keycloak: http://localhost:8081
- OPA: http://localhost:8181

### Dev Server (dev-app.dive25.com)

**Automated Deployment:**
- Trigger: Manual via GitHub Actions
- Runtime: 6-8 minutes
- Automatic rollback on failure

**Access Points:**
- Frontend: https://dev-app.dive25.com
- Backend: https://dev-api.dive25.com
- Keycloak: https://dev-auth.dive25.com

---

## Troubleshooting

### CI/CD Issues

#### ci-fast.yml didn't run on my PR

**Cause:** Path filters - only runs when code changes  
**Solution:** This is expected for documentation-only changes

**Check what changed:**
```bash
git diff main --name-only
```

If only `.md` files changed, ci-fast.yml won't run (by design).

#### Tests failing in CI but passing locally

**Common Causes:**
1. Environment variables missing
2. Service timing issues
3. Flaky tests

**Solutions:**
```bash
# Run tests with CI environment
NODE_ENV=test npm test

# Check service dependencies
docker-compose ps

# Add retries for flaky tests
jest.retryTimes(2)
```

#### Deployment failed

**Check logs:**
```bash
gh run view <run-id> --log
```

**Common Issues:**
1. Disk space <10GB
2. Services unhealthy
3. Terraform apply failed

**Automatic rollback:** Previous state restored automatically

**Manual rollback:**
```bash
ssh user@dev-app.dive25.com
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
./scripts/rollback.sh
```

### Development Issues

#### Docker containers won't start

```bash
# Check disk space
df -h

# Clean up
docker system prune -af

# Restart services
docker-compose down
docker-compose up -d
```

#### Permission errors

```bash
# Fix permissions
sudo chown -R 1001:1001 frontend/
sudo chown -R 1001:1001 backend/logs backend/uploads
```

#### MongoDB connection refused

```bash
# Check MongoDB running
docker-compose ps mongo

# Restart MongoDB
docker-compose restart mongo

# Check logs
docker-compose logs mongo
```

---

## Getting Help

### Resources

- **Documentation:** `/docs` directory
- **CI/CD Guide:** `CI-CD-USER-GUIDE.md` (see below)
- **Migration Plan:** `MIGRATION-PLAN.md`
- **Week 2 Summary:** `WEEK2-COMPLETION-SUMMARY.md`
- **Week 3 Analysis:** `WEEK3-PERFORMANCE-ANALYSIS.md`

### Contact

- **Primary:** [Your Name/Email]
- **Backup:** [Backup Contact]
- **Issues:** https://github.com/albeach/DIVE-V3/issues

---

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                    # Start dev server
npm test                       # Run tests
npm run lint                   # Run linter
npm run typecheck              # Check types
npm run build                  # Build for production

# Docker
docker-compose up -d           # Start services
docker-compose down            # Stop services
docker-compose logs -f [service]  # View logs
docker-compose ps              # List services

# Git
git checkout -b feature/name   # Create feature branch
git commit -m "feat: message"  # Conventional commit
git push -u origin branch      # Push branch

# GitHub CLI
gh pr create                   # Create PR
gh pr checks                   # Check PR status
gh run list                    # List workflow runs
gh workflow run deploy-dev-server.yml  # Trigger deployment
```

### Environment Variables

**Backend (.env):**
```bash
NODE_ENV=development
PORT=4000
MONGODB_URL=mongodb://localhost:27017/dive-v3
OPA_URL=http://localhost:8181
KEYCLOAK_URL=http://localhost:8081
JWT_SECRET=your-secret-key
```

**Frontend (.env.local):**
```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
DATABASE_URL=postgresql://postgres:password@localhost:5432/dive_v3_app
```

---

**Thank you for contributing to DIVE V3!** 🚀

*Last Updated: November 14, 2025*  
*CI/CD Migration: Week 3*

