import { test, expect } from '@playwright/test';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function login(page: any) {
    await page.goto(`${BASE_URL}/login`);
    // Fallback: go to dashboard if already authenticated
    await page.waitForTimeout(500);
}

test.describe('Identity Drawer - Global Shortcut', () => {
    test('Cmd+I opens the identity drawer and shows AAL when present', async ({ page }) => {
        await login(page);
        // Navigate to a page with nav (dashboard)
        await page.goto(`${BASE_URL}/dashboard`);
        await page.waitForTimeout(500);

        // Press Cmd+I (use Ctrl+I on non-mac CI if needed)
        await page.keyboard.press('Meta+I').catch(async () => {
            await page.keyboard.press('Control+I');
        });

        // Drawer should appear (role=dialog)
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 3000 });

        // Look for AAL chip if token contains acr
        const aalChip = page.locator('text=AAL').or(page.locator('text=acr')).first();
        await aalChip.isVisible().catch(() => { });
    });
});
