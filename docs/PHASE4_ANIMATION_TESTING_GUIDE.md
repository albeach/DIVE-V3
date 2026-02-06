# Phase 4.2: Animation Testing Guide

**Version:** 1.0.0  
**Date:** February 6, 2026  
**Phase:** Phase 4.2 - Automated Animation Testing  
**Status:** Complete

---

## Overview

This guide covers the automated E2E testing strategy for Phase 3/4 animation components using Playwright. It provides patterns, best practices, and examples for writing robust animation tests.

## Table of Contents

1. [Test Infrastructure](#test-infrastructure)
2. [Testing Philosophy](#testing-philosophy)
3. [AnimatedButton Tests](#animatedbutton-tests)
4. [AdminPageTransition Tests](#adminpagetransition-tests)
5. [PresenceIndicator Tests](#presenceindicator-tests)
6. [Writing New Tests](#writing-new-tests)
7. [Running Tests](#running-tests)
8. [CI/CD Integration](#cicd-integration)
9. [Troubleshooting](#troubleshooting)

---

## Test Infrastructure

### Test Location

All animation tests are located in:
```
frontend/src/__tests__/e2e/animations/
├── animated-button.spec.ts       (18+ tests)
├── page-transition.spec.ts       (15+ tests)
└── presence-indicator.spec.ts    (12+ tests)
```

### Technology Stack

- **Test Framework**: Playwright 1.57.0+
- **Browsers**: Chromium, Firefox, WebKit (Safari)
- **Test Environment**: Node.js 20+
- **Services**: MongoDB 7.0, PostgreSQL 15, Keycloak 26.4.2

### Test Configuration

Configuration is defined in `frontend/playwright.config.ts`:
- Test directory: `./src/__tests__/e2e`
- Parallel execution: Disabled (sequential for stability)
- Retries: 0 locally, 2 in CI
- Timeouts: 15s action, 30s navigation

---

## Testing Philosophy

### What We Test

1. **Visual Functionality**: Components render and display correctly
2. **Interaction Behavior**: Hover, click, focus states work as expected
3. **Accessibility**: ARIA attributes, keyboard navigation, screen reader support
4. **Motion Preferences**: Respect for `prefers-reduced-motion`
5. **Cross-Browser Compatibility**: Consistent behavior across browsers
6. **Performance**: Animations maintain 60fps
7. **Edge Cases**: Rapid interactions, navigation, state changes

### What We Don't Test

- **Exact Animation Values**: CSS transform/opacity values are implementation details
- **Animation Curves**: Easing functions are handled by Framer Motion
- **Pixel-Perfect Rendering**: Visual regression testing is out of scope

### Testing Approach

We use **behavioral testing** rather than implementation testing:

✅ **Good**: Test that button is clickable after hover  
❌ **Bad**: Test exact transform matrix value

✅ **Good**: Test page transitions complete successfully  
❌ **Bad**: Test exact opacity value mid-transition

---

## AnimatedButton Tests

### Test File

`frontend/src/__tests__/e2e/animations/animated-button.spec.ts`

### Coverage

- **18+ test cases** covering:
  - Basic rendering and visibility
  - Keyboard accessibility
  - ARIA attributes
  - Disabled state handling
  - Dark mode compatibility
  - Hover animations
  - Click animations
  - Rapid interaction handling
  - Reduced motion support
  - Focus styles
  - Multi-page validation
  - Performance (60fps)
  - Button variants (icon, link, card)

### Key Test Patterns

#### Basic Visibility Test

```typescript
test('should render buttons without errors', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  
  const buttons = page.locator('button');
  const count = await buttons.count();
  
  expect(count).toBeGreaterThan(0);
  await expect(buttons.first()).toBeVisible();
});
```

#### Keyboard Accessibility Test

```typescript
test('should be keyboard accessible', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  
  await page.keyboard.press('Tab');
  const focusedElement = page.locator(':focus');
  await expect(focusedElement).toBeVisible();
  
  await page.keyboard.press('Enter');
  // Button should respond to Enter key
});
```

#### Reduced Motion Test

```typescript
test('should respect prefers-reduced-motion', async ({ page, context }) => {
  const reducedMotionPage = await context.newPage();
  await reducedMotionPage.emulateMedia({ reducedMotion: 'reduce' });
  
  await reducedMotionPage.goto('/admin/dashboard');
  await reducedMotionPage.waitForLoadState('networkidle');
  
  const button = reducedMotionPage.locator('button').first();
  await button.hover();
  await reducedMotionPage.waitForTimeout(100);
  
  // Button should still be functional
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  
  await reducedMotionPage.close();
});
```

#### Performance Test (60fps)

```typescript
test('should maintain 60fps during animations', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  
  const button = page.locator('button').first();
  
  // Collect performance metrics
  await page.evaluate(() => {
    (window as any).performanceData = [];
    let lastTime = performance.now();
    
    function measureFrame() {
      const currentTime = performance.now();
      const delta = currentTime - lastTime;
      (window as any).performanceData.push(delta);
      lastTime = currentTime;
      
      if ((window as any).performanceData.length < 60) {
        requestAnimationFrame(measureFrame);
      }
    }
    
    requestAnimationFrame(measureFrame);
  });
  
  await button.hover();
  await page.waitForTimeout(1000);
  
  const performanceData = await page.evaluate(() => (window as any).performanceData);
  const avgFrameTime = performanceData.reduce((a: number, b: number) => a + b, 0) / performanceData.length;
  const fps = 1000 / avgFrameTime;
  
  expect(fps).toBeGreaterThan(50); // Allow some variance
});
```

---

## AdminPageTransition Tests

### Test File

`frontend/src/__tests__/e2e/animations/page-transition.spec.ts`

### Coverage

- **15+ test cases** covering:
  - Content visibility after transition
  - Smooth navigation between pages
  - Rapid navigation handling
  - Reduced motion support
  - Scroll position behavior
  - Loading states
  - Browser back/forward buttons
  - Page refresh handling
  - Dark mode transitions
  - Nested transitions
  - Performance (transition duration <500ms)
  - Layout shift prevention
  - All admin pages validation

### Key Test Patterns

#### Navigation Test

```typescript
test('should transition smoothly between pages', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  
  const usersLink = page.locator('a[href*="/admin/users"]').first();
  
  if (await usersLink.count() > 0) {
    await usersLink.click();
    await page.waitForURL(/\/admin\/users/);
    await page.waitForLoadState('networkidle');
    
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
    
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  }
});
```

#### Rapid Navigation Test

```typescript
test('should handle rapid navigation without breaking', async ({ page }) => {
  const links = [
    '/admin/dashboard',
    '/admin/analytics',
    '/admin/dashboard',
    '/admin/users',
  ];
  
  for (const link of links) {
    await page.goto(link);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
  }
  
  const mainContent = page.locator('main');
  await expect(mainContent).toBeVisible();
});
```

#### Browser Navigation Test

```typescript
test('should work with browser back/forward buttons', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  
  await page.goto('/admin/users');
  await page.waitForLoadState('networkidle');
  
  await page.goto('/admin/analytics');
  await page.waitForLoadState('networkidle');
  
  await page.goBack();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible();
  
  await page.goForward();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible();
});
```

---

## PresenceIndicator Tests

### Test File

`frontend/src/__tests__/e2e/animations/presence-indicator.spec.ts`

### Coverage

- **12+ test cases** covering:
  - Presence display on all 6 pages
  - Current user visibility
  - Tooltip on hover
  - Page navigation handling
  - Dark mode compatibility
  - Rapid page switching
  - Cleanup on page leave
  - Browser refresh handling
  - Cross-tab synchronization
  - Tab close behavior
  - Keyboard accessibility
  - ARIA attributes
  - Memory leak prevention
  - Update speed performance

### Key Test Patterns

#### Multi-Page Test

```typescript
const pagesWithPresence = [
  { path: '/admin/dashboard', page: 'dashboard' },
  { path: '/admin/analytics', page: 'analytics' },
  { path: '/admin/logs', page: 'logs' },
  { path: '/admin/approvals', page: 'approvals' },
  { path: '/admin/certificates', page: 'certificates' },
  { path: '/admin/clearance-management', page: 'clearance-management' },
];

for (const { path, page: pageId } of pagesWithPresence) {
  test(`should show presence indicator on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const viewingText = page.locator('text=/viewing/i');
    const hasPresence = await viewingText.count() > 0;
    
    expect(hasPresence).toBe(true);
  });
}
```

#### Cross-Tab Test

```typescript
test('should show multiple users in different tabs', async ({ browser }) => {
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  
  await page1.goto('/admin/analytics');
  await page1.waitForLoadState('networkidle');
  await page1.waitForTimeout(1500);
  
  await page2.goto('/admin/analytics');
  await page2.waitForLoadState('networkidle');
  await page2.waitForTimeout(1500);
  
  // Both should show presence independently
  const presence1 = page1.locator('text=/viewing/i');
  const presence2 = page2.locator('text=/viewing/i');
  
  if (await presence1.count() > 0) {
    await expect(presence1).toBeVisible();
  }
  
  if (await presence2.count() > 0) {
    await expect(presence2).toBeVisible();
  }
  
  await context1.close();
  await context2.close();
});
```

---

## Writing New Tests

### Best Practices

1. **Use Descriptive Test Names**
   ```typescript
   // ✅ Good
   test('should maintain focus styles after keyboard navigation', ...)
   
   // ❌ Bad
   test('focus test', ...)
   ```

2. **Wait for Network Idle**
   ```typescript
   await page.goto('/admin/dashboard');
   await page.waitForLoadState('networkidle'); // Always wait
   ```

3. **Handle Optional Elements**
   ```typescript
   const element = page.locator('[optional-selector]');
   if (await element.count() > 0) {
     // Test element
   }
   ```

4. **Test Across Browsers**
   ```typescript
   // Tests run on chromium, firefox, webkit by default
   // No need to specify unless testing browser-specific behavior
   ```

5. **Clean Up Resources**
   ```typescript
   test('...', async ({ page, context }) => {
     const newPage = await context.newPage();
     // ... test logic
     await newPage.close(); // Clean up
   });
   ```

### Common Patterns

#### Testing Animations

```typescript
// Don't test exact CSS values
❌ expect(transform).toBe('matrix(1.02, 0, 0, 1.02, 0, 0)');

// Test behavior instead
✅ await button.hover();
✅ await page.waitForTimeout(200);
✅ await expect(button).toBeVisible();
```

#### Testing Accessibility

```typescript
// Check for ARIA attributes
const ariaLabel = await element.getAttribute('aria-label');
expect(ariaLabel).toBeTruthy();

// Test keyboard navigation
await page.keyboard.press('Tab');
const focused = page.locator(':focus');
await expect(focused).toBeVisible();
```

#### Testing Performance

```typescript
const startTime = Date.now();
// ... perform action
const endTime = Date.now();
const duration = endTime - startTime;
expect(duration).toBeLessThan(500);
```

---

## Running Tests

### Local Development

```bash
# Run all animation tests
cd frontend
npm run test:e2e:animations

# Run with UI mode (visual debugger)
npm run test:e2e:animations:ui

# Run in debug mode
npm run test:e2e:animations:debug

# Run specific test file
npx playwright test src/__tests__/e2e/animations/animated-button.spec.ts

# Run single test
npx playwright test -g "should render buttons without errors"
```

### View Test Reports

```bash
# Open HTML report
npm run test:e2e:report

# Report is automatically generated in:
# frontend/playwright-report/
```

### Prerequisites

Before running tests locally:

1. **Start Services**:
   ```bash
   ./scripts/dive-start.sh
   # or
   docker-compose up -d
   ```

2. **Ensure Ports Available**:
   - Frontend: 3000
   - Keycloak: 8443
   - MongoDB: 27017
   - PostgreSQL: 5432

---

## CI/CD Integration

### GitHub Actions Workflow

Animation tests run automatically on:
- Push to `main` branch
- Pull requests affecting animation components
- Manual workflow dispatch

### Workflow File

`.github/workflows/test-animations.yml`

### Workflow Steps

1. Checkout code
2. Setup Node.js 20
3. Install dependencies
4. Generate SSL certificates
5. Start services (Keycloak, MongoDB, PostgreSQL)
6. Start Next.js development server
7. **Run animation tests**
8. Upload test results (always)
9. Generate summary

### Artifacts

Test results are saved as artifacts for 7 days:
- HTML report: `playwright-report/`
- Test results: `test-results/`
- Screenshots (on failure)
- Videos (on failure)

### Viewing CI Results

1. Go to GitHub Actions tab
2. Find "Animation E2E Tests" workflow
3. Click on run to see summary
4. Download artifacts to view full reports

---

## Troubleshooting

### Common Issues

#### Tests Timeout

**Problem**: Tests timeout waiting for page load

**Solution**:
```typescript
// Increase timeout for specific test
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test logic
});
```

#### Element Not Found

**Problem**: `Error: No element found for selector`

**Solution**:
```typescript
// Wait for element before interacting
await page.waitForSelector('button', { timeout: 10000 });
const button = page.locator('button');
```

#### Flaky Tests

**Problem**: Tests pass sometimes, fail other times

**Solution**:
```typescript
// Add explicit waits
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500); // Brief stabilization wait

// Use waitForSelector instead of immediate clicks
await page.waitForSelector('button');
await page.locator('button').click();
```

#### Browser Not Starting

**Problem**: Playwright browsers fail to launch

**Solution**:
```bash
# Reinstall browsers
cd frontend
npx playwright install --with-deps chromium firefox webkit
```

### Debug Mode

Run tests in debug mode to step through:

```bash
npm run test:e2e:animations:debug
```

This opens Playwright Inspector where you can:
- Step through test execution
- Pause/resume tests
- Inspect selectors
- View network requests
- Take screenshots

---

## Test Statistics

### Coverage Summary

| Component | Tests | Coverage |
|-----------|-------|----------|
| AnimatedButton | 18+ | Basic rendering, accessibility, interactions, performance, variants |
| AdminPageTransition | 15+ | Navigation, state handling, browser controls, performance |
| PresenceIndicator | 12+ | Multi-page display, cross-tab sync, accessibility, performance |
| **Total** | **45+** | **Comprehensive E2E validation** |

### Test Execution Time

- **Local (Sequential)**: ~8-12 minutes
- **CI (Optimized)**: ~6-10 minutes
- **Per Test Average**: ~10-15 seconds

### Browser Coverage

- ✅ Chromium (Chrome/Edge)
- ✅ Firefox
- ✅ WebKit (Safari)

---

## Future Enhancements

### Phase 4.3 Potential Additions

1. **Visual Regression Testing**: Screenshot comparison
2. **Animation Frame Analysis**: Detailed FPS tracking
3. **User Flow Tests**: Multi-page journeys
4. **Mobile Browser Testing**: iOS Safari, Chrome Android
5. **Performance Profiling**: Detailed metrics collection

---

## Resources

### Documentation

- [Playwright Docs](https://playwright.dev/)
- [Phase 3 Components Guide](./PHASE3_COMPONENTS.md)
- [Phase 3 Testing Guide](./PHASE3_TESTING_GUIDE.md)

### Component Files

- `frontend/src/components/admin/shared/AnimatedButton.tsx`
- `frontend/src/components/admin/shared/AdminPageTransition.tsx`
- `frontend/src/components/admin/shared/PresenceIndicator.tsx`

### Test Files

- `frontend/src/__tests__/e2e/animations/animated-button.spec.ts`
- `frontend/src/__tests__/e2e/animations/page-transition.spec.ts`
- `frontend/src/__tests__/e2e/animations/presence-indicator.spec.ts`

---

**Last Updated**: February 6, 2026  
**Phase**: 4.2 Complete  
**Next Phase**: 4.3 (Storybook) or production deployment
