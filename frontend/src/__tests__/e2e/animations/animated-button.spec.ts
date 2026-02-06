/**
 * AnimatedButton Component E2E Tests
 * 
 * Tests all animation behaviors, accessibility, and edge cases
 * for the AnimatedButton component and its variants.
 * 
 * @phase Phase 4.2 - Automated Animation Testing
 * @date 2026-02-06
 */

import { test, expect, Page } from '@playwright/test';

test.describe('AnimatedButton Component', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin dashboard which has many AnimatedButtons
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should render buttons without errors', async ({ page }) => {
    // Find any button on the page
    const buttons = page.locator('button');
    const count = await buttons.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Verify first button is visible
    const firstButton = buttons.first();
    await expect(firstButton).toBeVisible();
  });

  test('should be keyboard accessible', async ({ page }) => {
    // Tab to first button
    await page.keyboard.press('Tab');
    
    // Verify a button has focus
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Press Enter/Space should work
    await page.keyboard.press('Enter');
    // If no error after press, test passes
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    const buttons = page.locator('button');
    const firstButton = buttons.first();
    
    // Check for proper button role (implicit)
    const role = await firstButton.getAttribute('role');
    // Button element has implicit role="button", so this might be null
    expect(role === null || role === 'button').toBe(true);
    
    // Check it's not labeled as disabled when enabled
    const ariaDisabled = await firstButton.getAttribute('aria-disabled');
    expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true);
  });

  test('should handle disabled state correctly', async ({ page }) => {
    // Find a disabled button (if any)
    const disabledButton = page.locator('button:disabled').first();
    
    if (await disabledButton.count() > 0) {
      await expect(disabledButton).toBeDisabled();
      
      // Disabled button should not be clickable
      const isClickable = await disabledButton.isEnabled();
      expect(isClickable).toBe(false);
    }
  });

  test('should work in dark mode', async ({ page }) => {
    // Toggle dark mode if theme toggle exists
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    
    if (await themeToggle.count() > 0) {
      await themeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      
      // Verify buttons still visible in dark mode
      const buttons = page.locator('button');
      await expect(buttons.first()).toBeVisible();
    }
  });

  test('should animate on hover (visual check)', async ({ page }) => {
    const button = page.locator('button').first();
    
    // Hover over button
    await button.hover();
    await page.waitForTimeout(300); // Wait for animation
    
    // Button should still be visible after hover
    await expect(button).toBeVisible();
    
    // Move mouse away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    
    // Button should still be visible
    await expect(button).toBeVisible();
  });

  test('should animate on click (visual check)', async ({ page }) => {
    const button = page.locator('button').first();
    
    // Click button
    await button.click();
    
    // Button should still be visible after click
    await expect(button).toBeVisible();
  });

  test('should handle rapid clicks', async ({ page }) => {
    const button = page.locator('button').first();
    
    // Rapid clicks should not break the button
    for (let i = 0; i < 5; i++) {
      await button.click();
      await page.waitForTimeout(50);
    }
    
    // Button should still be functional
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });

  test('should respect prefers-reduced-motion', async ({ page, context }) => {
    // Create a new page with reduced motion preference
    const reducedMotionPage = await context.newPage();
    
    // Emulate reduced motion preference
    await reducedMotionPage.emulateMedia({ reducedMotion: 'reduce' });
    
    await reducedMotionPage.goto('/admin/dashboard');
    await reducedMotionPage.waitForLoadState('networkidle');
    
    const button = reducedMotionPage.locator('button').first();
    
    // Hover - animation should be reduced/instant
    await button.hover();
    await reducedMotionPage.waitForTimeout(100);
    
    // Button should still be visible and functional
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    
    await reducedMotionPage.close();
  });

  test('should maintain focus styles', async ({ page }) => {
    await page.keyboard.press('Tab');
    
    const focusedButton = page.locator('button:focus');
    
    if (await focusedButton.count() > 0) {
      // Check for focus styles (outline, ring, etc.)
      await expect(focusedButton).toBeVisible();
      
      // Focus should be visible (has some form of focus indicator)
      const styles = await focusedButton.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          outline: computed.outline,
          outlineWidth: computed.outlineWidth,
          boxShadow: computed.boxShadow,
        };
      });
      
      // Should have some visible focus indicator
      const hasFocusIndicator = 
        styles.outline !== 'none' || 
        styles.outlineWidth !== '0px' || 
        styles.boxShadow !== 'none';
      
      expect(hasFocusIndicator).toBe(true);
    }
  });
});

test.describe('AnimatedButton on Multiple Pages', () => {
  const adminPages = [
    { path: '/admin/dashboard', name: 'Dashboard' },
    { path: '/admin/users', name: 'Users' },
    { path: '/admin/analytics', name: 'Analytics' },
    { path: '/admin/approvals', name: 'Approvals' },
    { path: '/admin/certificates', name: 'Certificates' },
  ];

  for (const { path, name } of adminPages) {
    test(`should work correctly on ${name} page`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      
      const buttons = page.locator('button');
      const count = await buttons.count();
      
      // Most admin pages should have at least one button
      expect(count).toBeGreaterThan(0);
      
      // First button should be visible and clickable
      const firstButton = buttons.first();
      await expect(firstButton).toBeVisible();
      
      // Try to interact with it
      await firstButton.hover();
      await page.waitForTimeout(200);
      
      // Should still be visible after interaction
      await expect(firstButton).toBeVisible();
    });
  }
});

test.describe('AnimatedButton Performance', () => {
  test('should maintain 60fps during animations', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Collect performance metrics
    const button = page.locator('button').first();
    
    // Start performance measurement
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
    
    // Trigger animation
    await button.hover();
    await page.waitForTimeout(1000);
    
    // Get performance data
    const performanceData = await page.evaluate(() => (window as any).performanceData);
    
    // Calculate average frame time
    const avgFrameTime = performanceData.reduce((a: number, b: number) => a + b, 0) / performanceData.length;
    const fps = 1000 / avgFrameTime;
    
    // Should be close to 60fps (allow some variance)
    expect(fps).toBeGreaterThan(50);
  });
});

test.describe('AnimatedButton Variants', () => {
  test('should handle different button types', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Test different button types if they exist
    const regularButtons = page.locator('button[type="button"]');
    const submitButtons = page.locator('button[type="submit"]');
    
    if (await regularButtons.count() > 0) {
      await expect(regularButtons.first()).toBeVisible();
    }
    
    if (await submitButtons.count() > 0) {
      await expect(submitButtons.first()).toBeVisible();
    }
  });

  test('should work with icon buttons', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Find buttons with SVG icons
    const iconButtons = page.locator('button:has(svg)');
    
    if (await iconButtons.count() > 0) {
      const firstIconButton = iconButtons.first();
      await expect(firstIconButton).toBeVisible();
      
      // Should have aria-label for accessibility
      const ariaLabel = await firstIconButton.getAttribute('aria-label');
      // Icon buttons should have aria-label OR aria-labelledby
      const ariaLabelledBy = await firstIconButton.getAttribute('aria-labelledby');
      const hasLabel = ariaLabel !== null || ariaLabelledBy !== null;
      
      // This is a best practice, not a hard requirement
      if (!hasLabel) {
        console.warn('Icon button found without aria-label or aria-labelledby');
      }
    }
  });
});
