import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';

test.describe('Responsive Layouts', () => {
  test.use({ storageState: AUTH_STATE.AAL1 });

  test.describe('Mobile (390x844 - iPhone 14)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Dashboard renders in single column', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      // Dashboard content area should be single column at mobile width
      const dashboardGrid = page.locator(
        '[data-testid="dashboard-grid"], ' +
        '.dashboard-grid, ' +
        '[data-testid="dashboard-content"], ' +
        '.dashboard-content, ' +
        'main'
      ).first();

      await expect(dashboardGrid).toBeVisible();

      // Verify computed grid/flex layout results in single column
      const columns = await dashboardGrid.evaluate(el => {
        const style = window.getComputedStyle(el);
        // Check grid columns
        const gridCols = style.gridTemplateColumns;
        // Check if flex wraps to single column
        const flexDirection = style.flexDirection;
        const children = Array.from(el.children).filter(
          child => window.getComputedStyle(child).display !== 'none'
        );

        if (children.length < 2) return 1;

        // Compare positions of first two visible children
        const first = children[0].getBoundingClientRect();
        const second = children[1].getBoundingClientRect();

        // If second child is below first, it is single column
        if (second.top >= first.bottom - 5) return 1;
        // If they overlap horizontally, it is multi-column
        return Math.round(el.clientWidth / first.width);
      });

      expect(columns).toBe(1);
    });

    test('Mobile navigation drawer is present (hamburger menu)', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      // Look for hamburger/menu button
      const hamburger = page.locator(
        'button[aria-label*="menu" i], ' +
        'button[aria-label*="navigation" i], ' +
        '[data-testid="mobile-menu"], ' +
        '[data-testid="hamburger-menu"], ' +
        '.hamburger-menu, ' +
        'button:has(svg[data-testid="MenuIcon"]), ' +
        'button:has([class*="hamburger"])'
      );

      await expect(hamburger.first()).toBeVisible({ timeout: 5000 });

      // Click hamburger and verify drawer appears
      await hamburger.first().click();

      const drawer = page.locator(
        '[role="navigation"], ' +
        'nav[aria-label*="main" i], ' +
        '.nav-drawer, ' +
        '[data-testid="nav-drawer"], ' +
        '[role="dialog"] nav'
      );

      await expect(drawer.first()).toBeVisible({ timeout: 3000 });
    });

    test('Mobile bottom navigation bar is visible', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      // Look for bottom navigation
      const bottomNav = page.locator(
        'nav[aria-label*="bottom" i], ' +
        '[data-testid="bottom-nav"], ' +
        '.bottom-nav, ' +
        '.bottom-navigation, ' +
        '[role="navigation"]:below(main)'
      );

      const hasBottomNav = await bottomNav.first().isVisible().catch(() => false);

      if (hasBottomNav) {
        // Verify it is positioned at the bottom of the viewport
        const position = await bottomNav.first().evaluate(el => {
          const rect = el.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            viewportHeight: window.innerHeight,
          };
        });

        // Bottom nav should be near the bottom of the viewport
        expect(position.bottom).toBeGreaterThan(position.viewportHeight - 100);
      } else {
        // Some apps use a fixed mobile toolbar instead
        const mobileToolbar = page.locator(
          '[data-testid="mobile-toolbar"], ' +
          '.mobile-toolbar, ' +
          'footer nav'
        );
        const hasToolbar = await mobileToolbar.first().isVisible().catch(() => false);
        // At minimum, either bottom nav or mobile navigation exists
        const hamburger = page.locator(
          'button[aria-label*="menu" i], ' +
          '[data-testid="mobile-menu"]'
        );
        const hasHamburger = await hamburger.first().isVisible().catch(() => false);
        expect(hasToolbar || hasHamburger).toBeTruthy();
      }
    });

    test('Resources page stacks cards vertically', async ({ page }) => {
      await page.goto(`${TEST_CONFIG.baseUrl}/resources`);
      await page.waitForLoadState('networkidle');

      // Find resource cards
      const cards = page.locator(
        '[data-testid="resource-card"], ' +
        '.resource-card, ' +
        '[data-testid*="resource"] [class*="card"], ' +
        '[role="article"]'
      );

      const cardCount = await cards.count();
      if (cardCount < 2) {
        // Not enough cards to verify stacking
        test.skip();
        return;
      }

      // Verify cards are stacked vertically (each card below the previous)
      const positions = await cards.evaluateAll(elements =>
        elements.map(el => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width };
        })
      );

      for (let i = 1; i < positions.length; i++) {
        // Each card should be below the previous one
        expect(positions[i].top).toBeGreaterThanOrEqual(positions[i - 1].top);
      }

      // Cards should be roughly full-width (single column)
      const viewportWidth = 390;
      for (const pos of positions) {
        expect(pos.width).toBeGreaterThan(viewportWidth * 0.8);
      }
    });
  });

  test.describe('Tablet (768x1024 - iPad)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('Dashboard uses 2-column layout', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      const dashboardGrid = page.locator(
        '[data-testid="dashboard-grid"], ' +
        '.dashboard-grid, ' +
        '[data-testid="dashboard-content"], ' +
        '.dashboard-content, ' +
        'main'
      ).first();

      await expect(dashboardGrid).toBeVisible();

      const layout = await dashboardGrid.evaluate(el => {
        const children = Array.from(el.children).filter(
          child => window.getComputedStyle(child).display !== 'none'
        );

        if (children.length < 2) return { columns: 1 };

        // Count how many children share the same vertical row
        const rows = new Map<number, number>();
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          // Group by approximate Y position (within 10px)
          const rowKey = Math.round(rect.top / 10) * 10;
          rows.set(rowKey, (rows.get(rowKey) || 0) + 1);
        }

        const maxPerRow = Math.max(...rows.values());
        return { columns: maxPerRow };
      });

      // At tablet size, expect 2-column layout
      expect(layout.columns).toBeGreaterThanOrEqual(2);
    });

    test('Navigation sidebar collapses', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      // Sidebar should be collapsed (icons only) or hidden at tablet size
      const sidebar = page.locator(
        'aside, ' +
        'nav[aria-label*="main" i], ' +
        '[data-testid="sidebar"], ' +
        '.sidebar'
      ).first();

      const sidebarVisible = await sidebar.isVisible().catch(() => false);

      if (sidebarVisible) {
        // If visible, it should be collapsed (narrow width)
        const sidebarWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);
        // Collapsed sidebar is typically under 80px (icon-only) or under 200px
        expect(sidebarWidth).toBeLessThan(200);
      } else {
        // Sidebar hidden — hamburger menu should be available instead
        const hamburger = page.locator(
          'button[aria-label*="menu" i], ' +
          '[data-testid="mobile-menu"], ' +
          '[data-testid="hamburger-menu"]'
        );
        await expect(hamburger.first()).toBeVisible();
      }
    });

    test('Resource cards display in grid (2 columns)', async ({ page }) => {
      await page.goto(`${TEST_CONFIG.baseUrl}/resources`);
      await page.waitForLoadState('networkidle');

      const cards = page.locator(
        '[data-testid="resource-card"], ' +
        '.resource-card, ' +
        '[data-testid*="resource"] [class*="card"], ' +
        '[role="article"]'
      );

      const cardCount = await cards.count();
      if (cardCount < 2) {
        test.skip();
        return;
      }

      const positions = await cards.evaluateAll(elements =>
        elements.map(el => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width };
        })
      );

      // At tablet width, cards should form roughly 2 columns
      // Check if the first two cards are side by side
      if (positions.length >= 2) {
        const firstRow = positions.filter(p => Math.abs(p.top - positions[0].top) < 20);
        expect(firstRow.length).toBeGreaterThanOrEqual(2);
      }

      // Cards should not be full width
      const viewportWidth = 768;
      for (const pos of positions) {
        expect(pos.width).toBeLessThan(viewportWidth * 0.8);
      }
    });

    test('Upload form is usable', async ({ page }) => {
      await page.goto(`${TEST_CONFIG.baseUrl}/upload`);
      await page.waitForLoadState('networkidle');

      // Upload form should be visible and functional
      const uploadForm = page.locator(
        'form, ' +
        '[data-testid="upload-form"], ' +
        '.upload-form, ' +
        '[data-testid="upload-page"]'
      ).first();

      await expect(uploadForm).toBeVisible();

      // File input or drop zone should be present
      const fileInput = page.locator(
        'input[type="file"], ' +
        '[data-testid="drop-zone"], ' +
        '.drop-zone, ' +
        '[data-testid="file-upload"]'
      );
      const hasFileInput = await fileInput.first().count();
      expect(hasFileInput).toBeGreaterThan(0);

      // Submit/upload button should be visible
      const submitBtn = page.locator(
        'button[type="submit"], ' +
        'button:has-text("Upload"), ' +
        'button:has-text("Submit")'
      );
      const hasSubmit = await submitBtn.first().isVisible().catch(() => false);

      // Form fields should not overflow viewport
      const formWidth = await uploadForm.evaluate(el => el.getBoundingClientRect().width);
      expect(formWidth).toBeLessThanOrEqual(768);
    });
  });

  test.describe('Desktop (1440x900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('Full sidebar navigation visible', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      // Full sidebar should be visible at desktop size
      const sidebar = page.locator(
        'aside, ' +
        'nav[aria-label*="main" i], ' +
        '[data-testid="sidebar"], ' +
        '.sidebar'
      ).first();

      await expect(sidebar).toBeVisible();

      // Sidebar should be expanded (showing text labels, not just icons)
      const sidebarWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);
      // Full sidebar is typically 200px+ wide
      expect(sidebarWidth).toBeGreaterThanOrEqual(180);

      // Should contain navigation links with text labels
      const navLinks = sidebar.locator('a, [role="menuitem"], [role="link"]');
      const linkCount = await navLinks.count();
      expect(linkCount).toBeGreaterThan(0);

      // At least one link should have visible text (not icon-only)
      const hasTextLabels = await navLinks.evaluateAll(links =>
        links.some(link => {
          const text = link.textContent?.trim();
          return text !== undefined && text.length > 0;
        })
      );
      expect(hasTextLabels).toBeTruthy();
    });

    test('Dashboard uses multi-column layout', async ({ page }) => {
      await page.goto(TEST_CONFIG.baseUrl);
      await page.waitForLoadState('networkidle');

      const dashboardGrid = page.locator(
        '[data-testid="dashboard-grid"], ' +
        '.dashboard-grid, ' +
        '[data-testid="dashboard-content"], ' +
        '.dashboard-content, ' +
        'main'
      ).first();

      await expect(dashboardGrid).toBeVisible();

      const layout = await dashboardGrid.evaluate(el => {
        const children = Array.from(el.children).filter(
          child => window.getComputedStyle(child).display !== 'none'
        );

        if (children.length < 2) return { maxPerRow: 1 };

        // Count elements per approximate row
        const rows = new Map<number, number>();
        for (const child of children) {
          const rect = child.getBoundingClientRect();
          const rowKey = Math.round(rect.top / 20) * 20;
          rows.set(rowKey, (rows.get(rowKey) || 0) + 1);
        }

        return { maxPerRow: Math.max(...rows.values()) };
      });

      // Desktop should use multi-column (2+ columns)
      expect(layout.maxPerRow).toBeGreaterThanOrEqual(2);
    });

    test('Resource cards display in grid (3+ columns)', async ({ page }) => {
      await page.goto(`${TEST_CONFIG.baseUrl}/resources`);
      await page.waitForLoadState('networkidle');

      const cards = page.locator(
        '[data-testid="resource-card"], ' +
        '.resource-card, ' +
        '[data-testid*="resource"] [class*="card"], ' +
        '[role="article"]'
      );

      const cardCount = await cards.count();
      if (cardCount < 3) {
        test.skip();
        return;
      }

      const positions = await cards.evaluateAll(elements =>
        elements.map(el => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width };
        })
      );

      // Count cards in the first row
      const firstRow = positions.filter(p => Math.abs(p.top - positions[0].top) < 20);
      expect(firstRow.length).toBeGreaterThanOrEqual(3);

      // Cards should be relatively narrow at desktop width
      const viewportWidth = 1440;
      for (const pos of positions) {
        expect(pos.width).toBeLessThan(viewportWidth * 0.5);
      }
    });

    test('Admin panel has full sidebar + content area', async ({ page }) => {
      await page.goto(`${TEST_CONFIG.baseUrl}/admin`);
      await page.waitForLoadState('networkidle');

      // Full sidebar should be present
      const sidebar = page.locator(
        'aside, ' +
        'nav[aria-label*="admin" i], ' +
        'nav[aria-label*="main" i], ' +
        '[data-testid="sidebar"], ' +
        '[data-testid="admin-sidebar"], ' +
        '.sidebar'
      ).first();

      await expect(sidebar).toBeVisible();

      const sidebarRect = await sidebar.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });

      // Sidebar should have meaningful width
      expect(sidebarRect.width).toBeGreaterThanOrEqual(150);

      // Content area should exist beside the sidebar
      const content = page.locator(
        'main, ' +
        '[data-testid="admin-content"], ' +
        '.admin-content, ' +
        '[role="main"]'
      ).first();

      await expect(content).toBeVisible();

      const contentRect = await content.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });

      // Content should be to the right of sidebar
      expect(contentRect.left).toBeGreaterThanOrEqual(sidebarRect.right - 10);

      // Content should use the remaining space
      expect(contentRect.width).toBeGreaterThan(sidebarRect.width);
    });
  });
});
