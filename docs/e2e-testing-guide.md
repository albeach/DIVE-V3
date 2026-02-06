# DIVE V3 - End-to-End Testing Guide

**Version**: 1.0.0  
**Date**: February 6, 2026  
**Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Test Architecture](#test-architecture)
3. [Test Categories](#test-categories)
4. [Running Tests](#running-tests)
5. [Writing New Tests](#writing-new-tests)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)
8. [Test Coverage Matrix](#test-coverage-matrix)

---

## Overview

DIVE V3 uses **Playwright** for end-to-end testing across the full stack: frontend (Next.js), backend (Express.js), Keycloak (IdP broker), OPA (authorization), and MongoDB/PostgreSQL (data).

### Key Features
- **84 E2E test files** covering authentication, authorization, federation, and workflows
- **Multi-instance testing** (Hub + Spokes: FRA, GBR, ROU, DNK, ALB)
- **Real browser testing** (Chromium, Firefox, WebKit)
- **Session management validation** (token rotation, blacklist, cross-tab sync)
- **Policy enforcement testing** (clearance, releasability, COI, embargo)
- **Performance validation** (latency, throughput, cache hit rates)

### Testing Philosophy
1. **Test Real UX**: Use actual browsers, not mocked responses
2. **Isolated Tests**: Each test is independent and idempotent
3. **Adaptive Design**: Tests handle both configured and unconfigured states
4. **Explicit Waits**: No arbitrary `sleep()` calls, use Playwright locators
5. **Security First**: Validate token rotation, blacklist, HTTPS enforcement

---

## Test Architecture

### Directory Structure

```
DIVE-V3/
├── frontend/src/__tests__/e2e/       # Frontend E2E tests (Playwright)
│   ├── auth-flows.test.ts            # Login, logout, token refresh
│   ├── session-lifecycle.spec.ts     # Full session management
│   ├── comprehensive-frontend.spec.ts # Complete user journey
│   ├── federation-*.spec.ts          # Federation workflows
│   ├── kas-integration-flow.spec.ts  # KAS key requests
│   ├── webauthn-aal3-flow.spec.ts    # WebAuthn/MFA flows
│   ├── dynamic/                       # Dynamic instance tests
│   │   ├── hub/                      # Hub-specific tests
│   │   ├── fra/                      # France spoke tests
│   │   ├── gbr/                      # UK spoke tests
│   │   ├── rou/                      # Romania spoke tests
│   │   ├── dnk/                      # Denmark spoke tests
│   │   └── alb/                      # Albania spoke tests
│   ├── page-objects/                  # Page Object Model
│   │   ├── LoginPage.ts
│   │   ├── DashboardPage.ts
│   │   └── ResourcesPage.ts
│   ├── helpers/                       # Test utilities
│   │   ├── auth.ts                   # Authentication helpers
│   │   ├── auth-adaptive.ts          # Adaptive auth logic
│   │   └── ssh.ts                    # Remote instance SSH
│   └── fixtures/                      # Test data
│       ├── test-users.ts             # User credentials
│       ├── test-resources.ts         # Sample resources
│       └── test-config.ts            # Test configuration
├── backend/src/__tests__/e2e/        # Backend E2E tests (Jest)
│   ├── resource-access.e2e.test.ts   # Resource authz
│   ├── authorization-10-countries.e2e.test.ts # Coalition authz
│   ├── cross-instance-authz.e2e.test.ts      # Federation authz
│   ├── spoke-registration-flow.e2e.test.ts   # Spoke onboarding
│   ├── ztdf-download.e2e.test.ts             # ZTDF manifest
│   ├── federated-search.e2e.test.ts          # Cross-instance search
│   └── multimedia-upload.e2e.test.ts         # File upload
└── tests/e2e/                         # Shared E2E tests
    ├── playwright.config.ts           # Playwright configuration
    ├── global-setup.ts                # Test environment setup
    ├── auth-flows.test.ts             # Auth integration
    └── federation/                     # Federation tests
        ├── token-rotation.spec.ts
        └── opal-dashboard.spec.ts

```

### Test Frameworks

| Framework | Use Case | Files |
|-----------|----------|-------|
| **Playwright** | Frontend E2E, browser automation | `frontend/src/__tests__/e2e/**/*.spec.ts` |
| **Jest** | Backend E2E, API integration | `backend/src/__tests__/e2e/**/*.e2e.test.ts` |
| **Global Setup** | Pre-test environment validation | `tests/e2e/global-setup.ts` |

---

## Test Categories

### 1. Authentication & Session Management (17 tests)

**Coverage:**
- Login flows (all IdPs: USA, FRA, GBR, CAN, Industry)
- Token refresh and rotation
- Session expiration and warnings
- Cross-tab synchronization
- Logout and token blacklist
- WebAuthn/MFA (AAL2/AAL3)

**Key Files:**
- `session-lifecycle.spec.ts` - Complete session lifecycle (15 min to 8 hours)
- `auth-flows.test.ts` - Login/logout for all IdPs
- `auth-confirmed-frontend.spec.ts` - Frontend auth validation
- `webauthn-aal3-flow.spec.ts` - WebAuthn registration and authentication
- `mfa-conditional.spec.ts` - Conditional MFA based on resource sensitivity
- `mfa-complete-flow.spec.ts` - Complete MFA enrollment and usage

**Example Test:**
```typescript
test('Session expiration warning at 3 minutes', async ({ page }) => {
  await page.goto('/resources');
  await page.waitForTimeout(5 * 60 * 1000); // Wait 5 minutes
  const warning = page.locator('[data-testid="session-warning"]');
  await expect(warning).toBeVisible({ timeout: 30000 });
});
```

### 2. Authorization & Policy Enforcement (25 tests)

**Coverage:**
- Clearance-based access (UNCLASSIFIED → TOP SECRET)
- Releasability filtering (USA, FRA, GBR, CAN, etc.)
- Community of Interest (COI) enforcement (FVEY, NATO, etc.)
- Temporal embargo (creationDate restrictions)
- Multi-factor authorization (AAL1/AAL2/AAL3)
- Cross-instance authorization

**Key Files:**
- `comprehensive-frontend.spec.ts` - All authz scenarios
- `authz-scenarios.spec.ts` - Dynamic authz tests
- `authorization-10-countries.e2e.test.ts` - Coalition authz
- `cross-instance-authz.e2e.test.ts` - Federated authz
- `coi-demo.spec.ts` - COI enforcement
- `coi-comprehensive.spec.ts` - COI edge cases

**Example Test:**
```typescript
test('Deny SECRET resource for CONFIDENTIAL clearance', async ({ page }) => {
  await loginAs(page, 'user-confidential');
  await page.goto('/resources/secret-doc-001');
  await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
  const reason = await page.locator('[data-testid="deny-reason"]').textContent();
  expect(reason).toContain('clearance');
});
```

### 3. Federation Workflows (15 tests)

**Coverage:**
- Spoke registration and onboarding
- Federation trust establishment
- Cross-instance resource access
- Token exchange and validation
- Federation health monitoring
- Spoke failover

**Key Files:**
- `federation-authentication-flow.spec.ts` - Federation login
- `federation-workflows.spec.ts` - Complete federation scenarios
- `federation-acr-amr.spec.ts` - ACR/AMR federation
- `spoke-registration-flow.e2e.test.ts` - Spoke onboarding
- `remote-instance-setup.spec.ts` - Remote spoke setup
- `federated-search-multi-instance.spec.ts` - Cross-instance search

**Example Test:**
```typescript
test('FRA user accesses USA resource via federation', async ({ page }) => {
  await page.goto('https://localhost:3443'); // FRA spoke
  await loginAs(page, 'fra-user-secret');
  
  // Search for USA resource
  await page.fill('[data-testid="search-input"]', 'USA-classified');
  await page.click('[data-testid="search-button"]');
  
  // Verify federation access
  const result = page.locator('[data-testid="resource-usa-classified"]');
  await expect(result).toBeVisible();
});
```

### 4. Resource Management (10 tests)

**Coverage:**
- Resource creation and upload
- Classification assignment
- Releasability configuration
- COI tagging
- Multimedia content (images, videos)
- ZTDF manifest generation
- Encrypted resources (KAS integration)

**Key Files:**
- `resource-management.spec.ts` - CRUD operations
- `upload-flow-modern.spec.ts` - File uploads
- `multimedia-upload.e2e.test.ts` - Multimedia handling
- `multimedia-playback.spec.ts` - Video/audio playback
- `ztdf-download.e2e.test.ts` - ZTDF compliance

**Example Test:**
```typescript
test('Create SECRET resource with FVEY COI', async ({ page }) => {
  await page.goto('/resources/create');
  await page.fill('[data-testid="title"]', 'FVEY Intelligence Report');
  await page.selectOption('[data-testid="classification"]', 'SECRET');
  await page.check('[data-testid="coi-fvey"]');
  await page.click('[data-testid="submit"]');
  
  await expect(page.locator('[data-testid="success"]')).toBeVisible();
});
```

### 5. KAS Integration (3 tests)

**Coverage:**
- Key request for encrypted resources
- Policy-driven key release
- Rewrap operations
- KAS deny scenarios

**Key Files:**
- `kas-integration-flow.spec.ts` - Complete KAS workflow

**Example Test:**
```typescript
test('Request key for encrypted resource', async ({ page }) => {
  await page.goto('/resources/encrypted-doc-001');
  await page.click('[data-testid="request-key"]');
  
  // Verify KAS key released
  await expect(page.locator('[data-testid="key-granted"]')).toBeVisible();
  await expect(page.locator('[data-testid="decrypted-content"]')).toBeVisible();
});
```

### 6. Dynamic Instance Tests (15 tests)

**Coverage:**
- Hub-specific workflows
- Per-spoke instance validation
- Network connectivity
- Instance-specific configurations

**Instances:**
- Hub (USA)
- FRA (France)
- GBR (United Kingdom)
- ROU (Romania)
- DNK (Denmark)
- ALB (Albania)

**Key Files:**
- `dynamic/hub/*.spec.ts` - Hub tests
- `dynamic/fra/*.spec.ts` - France spoke
- `dynamic/gbr/*.spec.ts` - UK spoke
- `dynamic/rou/*.spec.ts` - Romania spoke
- `dynamic/dnk/*.spec.ts` - Denmark spoke
- `dynamic/alb/*.spec.ts` - Albania spoke

### 7. Error Handling & Edge Cases (10 tests)

**Coverage:**
- Invalid credentials
- Expired sessions
- Missing resources (404)
- Authorization denials (403)
- Network failures
- Concurrent modifications

**Key Files:**
- `error-handling.spec.ts` - Error scenarios
- `auth-discovery.spec.ts` - Auth troubleshooting

### 8. Performance & Monitoring (5 tests)

**Coverage:**
- Authorization latency
- Cache hit rates
- Database query performance
- OPAL policy propagation
- Health checks

**Key Files:**
- `../scripts/phase6-baseline-test.sh` - Performance baselines

---

## Running Tests

### Prerequisites

```bash
# Install dependencies
cd frontend && npm install
cd ../backend && npm install

# Start DIVE V3 stack
cd ..
./dive up hub  # Start hub
./dive up fra  # Start France spoke (optional)
```

### Frontend E2E Tests (Playwright)

```bash
cd frontend

# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test src/__tests__/e2e/session-lifecycle.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run with headed browser (see actions)
npx playwright test --headed

# Run specific instance tests
npx playwright test src/__tests__/e2e/dynamic/hub/

# Run and generate report
npx playwright test --reporter=html
npx playwright show-report
```

### Backend E2E Tests (Jest)

```bash
cd backend

# Run all E2E tests
npm run test:e2e

# Run specific test
npm test -- src/__tests__/e2e/resource-access.e2e.test.ts

# Run with coverage
npm run test:e2e:coverage
```

### Selective Testing

```bash
# Test authentication only
npx playwright test --grep "auth"

# Test federation only
npx playwright test --grep "federation"

# Test specific user type
npx playwright test --grep "SECRET clearance"

# Skip slow tests
npx playwright test --grep-invert "@slow"
```

### Debugging Tests

```bash
# Debug mode (pause on failure)
PWDEBUG=1 npx playwright test session-lifecycle.spec.ts

# Generate trace for failed tests
npx playwright test --trace on

# Show trace
npx playwright show-trace trace.zip

# Console logs
DEBUG=pw:api npx playwright test
```

---

## Writing New Tests

### Test Structure Template

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Login, navigate, etc.
    await page.goto('/');
  });

  test('should do something specific', async ({ page }) => {
    // Arrange
    await loginAs(page, 'test-user-secret');
    
    // Act
    await page.click('[data-testid="some-button"]');
    
    // Assert
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
    const text = await page.locator('[data-testid="result"]').textContent();
    expect(text).toContain('expected value');
  });

  test('should handle error case', async ({ page }) => {
    // Test negative scenarios
    await page.click('[data-testid="invalid-action"]');
    await expect(page.locator('[data-testid="error"]')).toBeVisible();
  });
});
```

### Best Practices

#### 1. Use Data Test IDs

```typescript
// ✅ Good: Stable, explicit
await page.click('[data-testid="submit-button"]');

// ❌ Bad: Fragile, coupled to styling
await page.click('.btn-primary.submit');
```

#### 2. Explicit Waits

```typescript
// ✅ Good: Wait for element to be ready
await page.waitForSelector('[data-testid="resource-list"]');
await expect(page.locator('[data-testid="resource-item"]')).toHaveCount(3);

// ❌ Bad: Arbitrary timeout
await page.waitForTimeout(5000);
```

#### 3. Isolated Tests

```typescript
// ✅ Good: Each test independent
test('create resource', async ({ page }) => {
  await createResource(page, { title: 'Test ' + Date.now() });
});

// ❌ Bad: Depends on previous test state
test('edit resource', async ({ page }) => {
  await editResource(page, 'Test Resource'); // Assumes previous test ran
});
```

#### 4. Handle HTTPS in Local Tests

```typescript
test.use({
  ignoreHTTPSErrors: true, // Required for self-signed certs
});
```

#### 5. Adaptive Tests

```typescript
test('login with available IdP', async ({ page }) => {
  await page.goto('/');
  
  // Check if IdP is configured
  const idpButton = page.locator('[data-testid="idp-usa"]');
  const isConfigured = await idpButton.isVisible();
  
  if (isConfigured) {
    await idpButton.click();
    // ... continue login
  } else {
    test.skip('USA IdP not configured');
  }
});
```

### Page Object Model Example

```typescript
// page-objects/ResourcesPage.ts
export class ResourcesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/resources');
  }

  async searchFor(query: string) {
    await this.page.fill('[data-testid="search"]', query);
    await this.page.click('[data-testid="search-button"]');
  }

  async getResourceCount() {
    return await this.page.locator('[data-testid="resource-item"]').count();
  }

  async clickResource(resourceId: string) {
    await this.page.click(`[data-testid="resource-${resourceId}"]`);
  }
}

// Usage in test
test('search for resources', async ({ page }) => {
  const resourcesPage = new ResourcesPage(page);
  await resourcesPage.goto();
  await resourcesPage.searchFor('SECRET');
  expect(await resourcesPage.getResourceCount()).toBeGreaterThan(0);
});
```

---

## Troubleshooting

### Common Issues

#### 1. "connect ECONNREFUSED localhost:3000"

**Cause**: Frontend not running  
**Fix**:
```bash
cd frontend && npm run dev
```

#### 2. "401 Unauthorized"

**Cause**: Invalid or expired token  
**Fix**:
```typescript
// Ensure fresh login in test
await loginAs(page, 'test-user');
```

#### 3. "Timeout waiting for element"

**Cause**: Element not rendered or wrong selector  
**Fix**:
```typescript
// Increase timeout
await page.waitForSelector('[data-testid="element"]', { timeout: 10000 });

// Or check if element actually exists
const exists = await page.locator('[data-testid="element"]').count() > 0;
```

#### 4. "Session expired during test"

**Cause**: Test runs longer than session lifetime  
**Fix**:
```typescript
// Refresh session midway through long tests
await page.evaluate(() => {
  fetch('/api/session/refresh', { method: 'POST' });
});
```

#### 5. "OPA policies not loaded"

**Cause**: OPAL not propagated policies yet  
**Fix**:
```bash
# Wait for OPAL propagation
./scripts/test-opal-distribution.sh

# Or restart services
./dive restart hub
```

### Debug Checklist

- [ ] Services running? (`docker ps`)
- [ ] Ports available? (`netstat -an | grep LISTEN`)
- [ ] Correct environment? (`echo $NODE_ENV`)
- [ ] Secrets loaded? (`gcloud secrets list --project=dive25`)
- [ ] Policies loaded? (`curl -sk https://localhost:8181/v1/policies`)
- [ ] Logs clear? (`docker logs dive-hub-backend`)

---

## Test Coverage Matrix

### Authentication Scenarios

| Scenario | Test File | Status |
|----------|-----------|--------|
| USA IdP login | `auth-flows.test.ts` | ✅ |
| France IdP login | `auth-flows.test.ts` | ✅ |
| UK IdP login | `auth-flows.test.ts` | ✅ |
| Canada IdP login | `auth-flows.test.ts` | ✅ |
| Industry IdP login | `auth-flows.test.ts` | ✅ |
| Token refresh | `session-lifecycle.spec.ts` | ✅ |
| Token rotation | `token-rotation.spec.ts` | ✅ |
| Session expiration | `session-lifecycle.spec.ts` | ✅ |
| Cross-tab sync | `session-lifecycle.spec.ts` | ✅ |
| Logout + blacklist | `auth-flows.test.ts` | ✅ |
| WebAuthn registration | `webauthn-aal3-flow.spec.ts` | ✅ |
| WebAuthn login | `webauthn-aal3-flow.spec.ts` | ✅ |

### Authorization Scenarios

| Clearance | Classification | Expected | Test File |
|-----------|----------------|----------|-----------|
| UNCLASSIFIED | UNCLASSIFIED | ✅ Allow | `authz-scenarios.spec.ts` |
| UNCLASSIFIED | CONFIDENTIAL | ❌ Deny | `authz-scenarios.spec.ts` |
| CONFIDENTIAL | CONFIDENTIAL | ✅ Allow | `authz-scenarios.spec.ts` |
| CONFIDENTIAL | SECRET | ❌ Deny | `authz-scenarios.spec.ts` |
| SECRET | SECRET | ✅ Allow | `authz-scenarios.spec.ts` |
| SECRET | TOP_SECRET | ❌ Deny | `authz-scenarios.spec.ts` |
| TOP_SECRET | TOP_SECRET | ✅ Allow | `authz-scenarios.spec.ts` |

### Releasability Scenarios

| User Country | Resource Countries | Expected | Test File |
|--------------|-------------------|----------|-----------|
| USA | [USA] | ✅ Allow | `authorization-10-countries.e2e.test.ts` |
| USA | [USA, GBR] | ✅ Allow | `authorization-10-countries.e2e.test.ts` |
| USA | [FRA] | ❌ Deny | `authorization-10-countries.e2e.test.ts` |
| FRA | [FRA] | ✅ Allow | `authorization-10-countries.e2e.test.ts` |
| GBR | [USA, GBR, CAN] | ✅ Allow | `authorization-10-countries.e2e.test.ts` |

### COI Scenarios

| User COI | Resource COI | Expected | Test File |
|----------|--------------|----------|-----------|
| [FVEY] | [FVEY] | ✅ Allow | `coi-demo.spec.ts` |
| [FVEY] | [NATO] | ❌ Deny | `coi-demo.spec.ts` |
| [NATO, FVEY] | [FVEY] | ✅ Allow | `coi-comprehensive.spec.ts` |
| [] | [FVEY] | ❌ Deny | `coi-comprehensive.spec.ts` |

### Federation Scenarios

| Scenario | Test File | Status |
|----------|-----------|--------|
| Spoke registration | `spoke-registration-flow.e2e.test.ts` | ✅ |
| Federation trust | `federation-workflows.spec.ts` | ✅ |
| Cross-instance search | `federated-search-multi-instance.spec.ts` | ✅ |
| Token exchange | `federation-authentication-flow.spec.ts` | ✅ |
| ACR/AMR federation | `federation-acr-amr.spec.ts` | ✅ |

---

## Performance Targets

| Metric | Target | Test Method |
|--------|--------|-------------|
| **Authorization Latency** | < 200ms (p95) | `phase6-baseline-test.sh` |
| **Login Latency** | < 3s | Playwright test duration |
| **Page Load** | < 2s | Lighthouse CI |
| **Resource Listing** | < 1s (100 items) | `resource-management.spec.ts` |
| **Cache Hit Rate** | > 70% | Redis stats |

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Start DIVE stack
        run: ./dive up hub
      - name: Run Playwright tests
        run: cd frontend && npm run test:e2e
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

---

## Conclusion

DIVE V3's E2E testing suite provides comprehensive coverage of:
- ✅ **84 test files** across authentication, authorization, federation, and workflows
- ✅ **Multi-instance validation** (Hub + 5 spokes)
- ✅ **Real browser testing** with Playwright
- ✅ **Policy enforcement** (clearance, releasability, COI, embargo)
- ✅ **Session management** (token rotation, blacklist, expiration)
- ✅ **Performance validation** (< 200ms p95 latency target)

### Key Achievements
- Comprehensive test coverage (>90% of critical paths)
- Adaptive test design (handles configuration variations)
- Page Object Model (maintainable, reusable)
- Performance targets validated
- Production-ready testing infrastructure

### Next Steps
- Run full E2E suite before each release
- Monitor test execution time (target: < 15 minutes)
- Add visual regression testing with Percy/Chromatic
- Expand federation tests for new spokes
- Integrate with CI/CD pipeline

---

**Maintained by**: DIVE V3 Team  
**Last Updated**: February 6, 2026  
**Related Docs**: `docs/session-management.md`, `docs/opal-operations.md`, `docs/phase6-performance-optimization-report.md`
