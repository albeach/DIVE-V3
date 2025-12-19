/**
 * Playwright global setup for DIVE V3 E2E.
 *
 * Responsibilities:
 * - Optional bootstrap when E2E_BOOTSTRAP=1 (delegates to user-provided command)
 * - Poll core service health endpoints (Keycloak, backend, OPA, OPAL)
 * - Fail fast when services are unavailable to reduce flaky test runs
 */

import { chromium, request, FullConfig, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';

const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.CI ? 'https://localhost:3000' : 'http://localhost:3000');
const BACKEND_URL = process.env.BACKEND_URL || (process.env.CI ? 'https://localhost:4000' : 'http://localhost:4000');
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || (process.env.CI ? 'https://localhost:8443' : 'http://localhost:8080');
const KEYCLOAK_HEALTH_URL = process.env.KEYCLOAK_HEALTH_URL || (process.env.CI ? 'https://localhost:9000/health/ready' : 'http://localhost:8080/health/ready');
const OPA_URL = process.env.OPA_URL || (process.env.CI ? 'https://localhost:8181' : 'http://localhost:8181');
const OPAL_URL = process.env.OPAL_URL || (process.env.CI ? 'https://localhost:7002' : 'http://localhost:7002');

const BOOTSTRAP_CMD = process.env.E2E_BOOTSTRAP_CMD || './dive hub bootstrap';

async function waitForHealth(api: APIRequestContext, url: string, timeoutMs = 120_000, intervalMs = 5_000): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const resp = await api.get(url, { timeout: intervalMs - 500 });
      if (resp.status() === 200) return;
    } catch (_) {
      // ignore and retry
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Health check failed for ${url} after ${timeoutMs}ms`);
    }
    await new Promise(res => setTimeout(res, intervalMs));
  }
}

async function runBootstrapIfRequested(): Promise<void> {
  if (process.env.E2E_BOOTSTRAP === '1') {
    try {
      execSync(BOOTSTRAP_CMD, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Bootstrap command failed: ${(error as Error).message}`);
    }
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Optional bootstrap (off by default)
  await runBootstrapIfRequested();

  // Health gating for core services
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  await waitForHealth(api, KEYCLOAK_HEALTH_URL);
  await waitForHealth(api, `${BACKEND_URL}/health`);
  await waitForHealth(api, `${OPA_URL}/health?plugins`);
  await waitForHealth(api, `${OPAL_URL}/healthcheck`);

  // Pre-warm certificates for playwright by launching a headless browser once
  const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Optional: set up a virtual WebAuthn authenticator for passkey flows (mocked)
  if (process.env.ENABLE_WEBAUTHN_MOCK === '1') {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
  }

  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await browser.close();
  await api.dispose();
}
