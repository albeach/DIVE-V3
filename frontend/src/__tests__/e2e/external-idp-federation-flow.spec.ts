/**
 * DIVE V3 - External IdP Federation Flow E2E Tests
 * 
 * Tests complete federation flow:
 * 1. IdP selection
 * 2. External IdP authentication (Spain SAML / USA OIDC)
 * 3. Attribute normalization
 * 4. Resource access
 * 5. OPA authorization decision
 * 6. Logout and session cleanup
 */

import { test, expect, Page } from '@playwright/test';

const DIVE_URL = process.env.DIVE_URL || 'http://localhost:3000';
const SPAIN_SAML_URL = process.env.SPAIN_SAML_URL || 'https://localhost:8443';
const USA_OIDC_URL = process.env.USA_OIDC_URL || 'http://localhost:8082';

// Test users
const SPAIN_USERS = {
    topSecret: {
        username: 'garcia.maria@mde.es',
        password: 'Classified123!',
        expectedClearance: 'TOP_SECRET',
        expectedCountry: 'ESP',
        expectedCOI: ['NATO-COSMIC', 'ESP-ONLY'],
    },
    secret: {
        username: 'rodriguez.juan@mde.es',
        password: 'Defense456!',
        expectedClearance: 'SECRET',
        expectedCountry: 'ESP',
        expectedCOI: ['NATO-COSMIC'],
    },
};

const USA_USERS = {
    topSecret: {
        username: 'smith.john@mail.mil',
        password: 'TopSecret123!',
        expectedClearance: 'TOP_SECRET',
        expectedCountry: 'USA',
        expectedCOI: ['FVEY', 'US-ONLY'],
    },
    secret: {
        username: 'johnson.emily@mail.mil',
        password: 'Secret456!',
        expectedClearance: 'SECRET',
        expectedCountry: 'USA',
        expectedCOI: ['NATO-COSMIC', 'FVEY'],
    },
};

test.describe('External IdP Federation - Spain SAML', () => {
    test.beforeEach(async ({ page }) => {
        // Start from DIVE homepage
        await page.goto(DIVE_URL);
    });

    test('Complete Spain SAML login flow with TOP_SECRET user', async ({ page }) => {
        const user = SPAIN_USERS.topSecret;

        // Step 1: Navigate to login
        await page.click('button:has-text("Login")');

        // Step 2: Select Spain IdP
        await expect(page.locator('text=Spain Ministry of Defense')).toBeVisible({ timeout: 10000 });
        await page.click('text=Spain Ministry of Defense');

        // Step 3: Authenticate with Spain SAML IdP
        await expect(page).toHaveURL(/spain-saml/, { timeout: 10000 });

        // Fill SimpleSAMLphp login form
        await page.fill('input[name="username"]', user.username);
        await page.fill('input[name="password"]', user.password);
        await page.click('button[type="submit"]');

        // Step 4: Verify redirect back to DIVE
        await expect(page).toHaveURL(DIVE_URL, { timeout: 10000 });

        // Step 5: Verify user is logged in
        await expect(page.locator(`text=${user.username}`)).toBeVisible();

        // Step 6: Verify normalized attributes in user profile
        await page.click('text=Profile');
        await expect(page.locator(`text=Clearance: ${user.expectedClearance}`)).toBeVisible();
        await expect(page.locator(`text=Country: ${user.expectedCountry}`)).toBeVisible();
    });

    test('Spain SAML user can access NATO-COSMIC resource', async ({ page }) => {
        const user = SPAIN_USERS.topSecret;

        // Login
        await loginViaSpainSAML(page, user);

        // Navigate to resources
        await page.click('text=Resources');
        await expect(page).toHaveURL(/\/resources/, { timeout: 5000 });

        // Find NATO-COSMIC resource
        const natoResource = page.locator('text=/.*NATO.*COSMIC.*/i').first();
        await expect(natoResource).toBeVisible({ timeout: 5000 });

        // Attempt to access resource
        await natoResource.click();

        // Verify access granted
        await expect(page.locator('text=/Access Granted/i')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=/Authorization successful/i')).toBeVisible();
    });

    test('Spain SAML user denied access to US-ONLY resource', async ({ page }) => {
        const user = SPAIN_USERS.topSecret;

        // Login
        await loginViaSpainSAML(page, user);

        // Navigate to resources
        await page.click('text=Resources');

        // Find US-ONLY resource
        const usOnlyResource = page.locator('text=/.*US.?ONLY.*/i').first();
        if (await usOnlyResource.isVisible()) {
            await usOnlyResource.click();

            // Verify access denied
            await expect(page.locator('text=/Access Denied/i')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('text=/Country ESP not in releasabilityTo/i')).toBeVisible();
        }
    });

    test('Spain SAML logout clears session', async ({ page }) => {
        const user = SPAIN_USERS.topSecret;

        // Login
        await loginViaSpainSAML(page, user);

        // Verify logged in
        await expect(page.locator(`text=${user.username}`)).toBeVisible();

        // Logout
        await page.click('text=Logout');

        // Verify redirect to login page
        await expect(page).toHaveURL(/\/login|\/$/);
        await expect(page.locator('text=Login')).toBeVisible();
        await expect(page.locator(`text=${user.username}`)).not.toBeVisible();
    });
});

test.describe('External IdP Federation - USA OIDC', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(DIVE_URL);
    });

    test('Complete USA OIDC login flow with TOP_SECRET user', async ({ page }) => {
        const user = USA_USERS.topSecret;

        // Step 1: Navigate to login
        await page.click('button:has-text("Login")');

        // Step 2: Select USA IdP
        await expect(page.locator('text=U.S. Department of Defense')).toBeVisible({ timeout: 10000 });
        await page.click('text=U.S. Department of Defense');

        // Step 3: Authenticate with USA OIDC IdP
        await expect(page).toHaveURL(/usa-oidc|us-dod/, { timeout: 10000 });

        // Fill Keycloak login form
        await page.fill('input[name="username"]', user.username);
        await page.fill('input[name="password"]', user.password);
        await page.click('button[type="submit"]');

        // Step 4: Verify redirect back to DIVE
        await expect(page).toHaveURL(DIVE_URL, { timeout: 10000 });

        // Step 5: Verify user is logged in
        await expect(page.locator(`text=${user.username}`)).toBeVisible();

        // Step 6: Verify attributes
        await page.click('text=Profile');
        await expect(page.locator(`text=Clearance: ${user.expectedClearance}`)).toBeVisible();
        await expect(page.locator(`text=Country: ${user.expectedCountry}`)).toBeVisible();
    });

    test('USA OIDC user can access FVEY resource', async ({ page }) => {
        const user = USA_USERS.topSecret;

        // Login
        await loginViaUSAOIDC(page, user);

        // Navigate to resources
        await page.click('text=Resources');

        // Find FVEY resource
        const fveyResource = page.locator('text=/.*FVEY.*/i').first();
        await expect(fveyResource).toBeVisible({ timeout: 5000 });

        // Access resource
        await fveyResource.click();

        // Verify access granted
        await expect(page.locator('text=/Access Granted/i')).toBeVisible({ timeout: 5000 });
    });

    test('USA OIDC user with SECRET clearance denied TOP_SECRET resource', async ({ page }) => {
        const user = USA_USERS.secret;

        // Login
        await loginViaUSAOIDC(page, user);

        // Navigate to resources
        await page.click('text=Resources');

        // Find TOP_SECRET resource
        const topSecretResource = page.locator('text=/.*TOP.?SECRET.*/i').first();
        if (await topSecretResource.isVisible()) {
            await topSecretResource.click();

            // Verify clearance denial
            await expect(page.locator('text=/Access Denied/i')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('text=/Insufficient clearance/i')).toBeVisible();
        }
    });

    test('USA OIDC logout clears session', async ({ page }) => {
        const user = USA_USERS.topSecret;

        // Login
        await loginViaUSAOIDC(page, user);

        // Logout
        await page.click('text=Logout');

        // Verify logged out
        await expect(page).toHaveURL(/\/login|\/$/);
        await expect(page.locator('text=Login')).toBeVisible();
    });
});

test.describe('Cross-IdP Federation Tests', () => {
    test('Spanish and USA users can both access NATO-COSMIC resource', async ({ browser }) => {
        // Test parallel access from different IdPs
        const spanishContext = await browser.newContext();
        const usaContext = await browser.newContext();

        const spanishPage = await spanishContext.newPage();
        const usaPage = await usaContext.newPage();

        try {
            // Spanish user login and access
            await spanishPage.goto(DIVE_URL);
            await loginViaSpainSAML(spanishPage, SPAIN_USERS.topSecret);
            await spanishPage.click('text=Resources');
            const spanishResource = spanishPage.locator('text=/.*NATO.*COSMIC.*/i').first();
            await spanishResource.click();
            await expect(spanishPage.locator('text=/Access Granted/i')).toBeVisible();

            // USA user login and access
            await usaPage.goto(DIVE_URL);
            await loginViaUSAOIDC(usaPage, USA_USERS.secret); // SECRET user
            await usaPage.click('text=Resources');
            const usaResource = usaPage.locator('text=/.*NATO.*COSMIC.*/i').first();
            await usaResource.click();
            await expect(usaPage.locator('text=/Access Granted/i')).toBeVisible();
        } finally {
            await spanishContext.close();
            await usaContext.close();
        }
    });

    test('Verify attribute normalization differences', async ({ page }) => {
        // Login with Spanish user
        await page.goto(DIVE_URL);
        await loginViaSpainSAML(page, SPAIN_USERS.topSecret);

        // Check Spanish attributes
        await page.click('text=Profile');
        await expect(page.locator('text=Country: ESP')).toBeVisible();
        await expect(page.locator('text=COI.*NATO-COSMIC')).toBeVisible();

        // Logout
        await page.click('text=Logout');

        // Login with USA user
        await page.click('button:has-text("Login")');
        await page.click('text=U.S. Department of Defense');
        await page.fill('input[name="username"]', USA_USERS.topSecret.username);
        await page.fill('input[name="password"]', USA_USERS.topSecret.password);
        await page.click('button[type="submit"]');

        // Check USA attributes
        await page.click('text=Profile');
        await expect(page.locator('text=Country: USA')).toBeVisible();
        await expect(page.locator('text=COI.*FVEY')).toBeVisible();
    });
});

// Helper functions
async function loginViaSpainSAML(page: Page, user: typeof SPAIN_USERS.topSecret) {
    await page.goto(DIVE_URL);
    await page.click('button:has-text("Login")');
    await page.click('text=Spain Ministry of Defense');
    await page.fill('input[name="username"]', user.username);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(DIVE_URL, { timeout: 10000 });
}

async function loginViaUSAOIDC(page: Page, user: typeof USA_USERS.topSecret) {
    await page.goto(DIVE_URL);
    await page.click('button:has-text("Login")');
    await page.click('text=U.S. Department of Defense');
    await page.fill('input[name="username"]', user.username);
    await page.fill('input[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(DIVE_URL, { timeout: 10000 });
}


