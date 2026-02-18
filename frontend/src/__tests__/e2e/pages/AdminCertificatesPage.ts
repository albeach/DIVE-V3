import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminCertificatesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly certificateTable: Locator;
  readonly certificateRow: Locator;
  readonly healthStatus: Locator;
  readonly rotateButton: Locator;
  readonly revokeButton: Locator;
  readonly crlDownloadLink: Locator;
  readonly detailModal: Locator;
  readonly expiryWarning: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page
      .getByRole('heading', { name: /certificates/i })
      .or(page.getByRole('heading', { name: /certificate management/i }))
      .or(page.locator('h1:has-text("Certificates")'));

    this.certificateTable = page
      .getByRole('table', { name: /certificates/i })
      .or(page.locator('[data-testid="certificate-table"]'))
      .or(page.locator('table.certificate-table'));

    this.certificateRow = this.certificateTable
      .getByRole('row')
      .or(this.certificateTable.locator('[data-testid="certificate-row"]'));

    this.healthStatus = page
      .locator('[data-testid="health-status"]')
      .or(page.getByRole('status'))
      .or(page.locator('.health-status'));

    this.rotateButton = page
      .getByRole('button', { name: /rotate/i })
      .or(page.locator('[data-testid="rotate-button"]'));

    this.revokeButton = page
      .getByRole('button', { name: /revoke/i })
      .or(page.locator('[data-testid="revoke-button"]'));

    this.crlDownloadLink = page
      .getByRole('link', { name: /download.*crl/i })
      .or(page.getByRole('button', { name: /download.*crl/i }))
      .or(page.locator('[data-testid="crl-download"]'));

    this.detailModal = page
      .getByRole('dialog', { name: /certificate detail/i })
      .or(page.getByRole('dialog'))
      .or(page.locator('[data-testid="certificate-detail-modal"]'));

    this.expiryWarning = page
      .locator('[data-testid="expiry-warning"]')
      .or(page.getByRole('alert'))
      .or(page.locator('.expiry-warning'));

    this.refreshButton = page
      .getByRole('button', { name: /refresh/i })
      .or(page.locator('[data-testid="refresh-button"]'));
  }

  async goto() {
    await this.page.goto('/admin/certificates', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async getCertificateCount(): Promise<number> {
    await expect(this.certificateTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const rows = this.certificateTable
      .getByRole('row')
      .or(this.certificateTable.locator('tr'));

    const count = await rows.count();
    // Subtract 1 for the header row
    return Math.max(0, count - 1);
  }

  async selectCertificate(index: number) {
    const rows = this.certificateTable
      .getByRole('row')
      .or(this.certificateTable.locator('tr'));

    // Skip header row by adding 1 to the index
    await rows.nth(index + 1).click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await expect(this.detailModal).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async rotateCertificate(alias: string) {
    const certRow = this.certificateTable
      .getByRole('row', { name: new RegExp(alias, 'i') })
      .or(this.certificateTable.locator(`tr:has-text("${alias}")`));

    await expect(certRow.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const rowRotateButton = certRow
      .first()
      .getByRole('button', { name: /rotate/i })
      .or(certRow.first().locator('[data-testid="rotate-button"]'));

    await rowRotateButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    // Confirm rotation in the confirmation dialog
    const confirmButton = this.page
      .getByRole('button', { name: /confirm/i })
      .or(this.page.getByRole('button', { name: /yes/i }))
      .or(this.page.locator('[data-testid="confirm-rotate"]'));

    await confirmButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async revokeCertificate(alias: string) {
    const certRow = this.certificateTable
      .getByRole('row', { name: new RegExp(alias, 'i') })
      .or(this.certificateTable.locator(`tr:has-text("${alias}")`));

    await expect(certRow.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const rowRevokeButton = certRow
      .first()
      .getByRole('button', { name: /revoke/i })
      .or(certRow.first().locator('[data-testid="revoke-button"]'));

    await rowRevokeButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    // Confirm revocation in the confirmation dialog
    const confirmButton = this.page
      .getByRole('button', { name: /confirm/i })
      .or(this.page.getByRole('button', { name: /yes/i }))
      .or(this.page.locator('[data-testid="confirm-revoke"]'));

    await confirmButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async downloadCRL() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', {
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      }),
      this.crlDownloadLink.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION }),
    ]);
    return download;
  }

  async verifyHealthStatus(expected: string) {
    await expect(this.healthStatus.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    await expect(this.healthStatus.first()).toContainText(
      new RegExp(expected, 'i'),
      { timeout: TEST_CONFIG.TIMEOUTS.ACTION }
    );
  }

  async verifyExpiryWarning(certAlias: string) {
    const warning = this.page
      .locator(`[data-testid="expiry-warning-${certAlias}"]`)
      .or(this.expiryWarning.filter({ hasText: new RegExp(certAlias, 'i') }))
      .or(
        this.page.locator(
          `.expiry-warning:has-text("${certAlias}")`
        )
      );

    await expect(warning.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }
}
