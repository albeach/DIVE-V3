/**
 * Quick inspector for Keycloak TOTP screen.
 * - Logs visible inputs/buttons on the TOTP step after username/password login.
 * - Uses deterministic secret to generate the code (but does NOT submit).
 */

import { chromium } from 'playwright';
import { authenticator } from 'otplib';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:3000';
const USERNAME = process.env.DEBUG_TOTP_USERNAME || 'testuser-usa-3';
const PASSWORD = process.env.DEBUG_TOTP_PASSWORD || 'TestUser2025!Pilot';
const TOTP_SECRET = process.env.TESTUSER_USA_TOTP_SECRET || 'JBSWY3DPEHPK3PXP';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  await page.goto(`${FRONTEND_URL}/resources`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('[data-testid="sign-in-button"]').click({ timeout: 10000 });

  await page.waitForURL(/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');

  // Wait for possible wizard steps
  for (let i = 0; i < 5; i++) {
    const nextBtn = page.getByRole('button', { name: /next|continue/i }).first();
    if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await nextBtn.click({ timeout: 10000 });
      await page.waitForTimeout(500);
    } else {
      break;
    }
  }

  // Wait for TOTP screen
  await page.waitForTimeout(2000);

  // Log inputs
  const inputs = await page.locator('input').evaluateAll((nodes) =>
    nodes.map((n) => ({
      name: (n as HTMLInputElement).name,
      type: (n as HTMLInputElement).type,
      autocomplete: (n as HTMLInputElement).autocomplete,
      ariaLabel: n.getAttribute('aria-label'),
      placeholder: (n as HTMLInputElement).placeholder,
      id: n.id,
    })),
  );

  const buttons = await page.locator('button').evaluateAll((nodes) =>
    nodes.map((n) => ({
      text: (n as HTMLButtonElement).innerText.trim(),
      type: (n as HTMLButtonElement).type,
      id: n.id,
    })),
  );

  const code = authenticator.generate(TOTP_SECRET);

  console.log('=== TOTP DEBUG ===');
  console.log('URL:', page.url());
  console.log('Inputs:', inputs);
  console.log('Buttons:', buttons);
  console.log('Generated code (deterministic):', code);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



