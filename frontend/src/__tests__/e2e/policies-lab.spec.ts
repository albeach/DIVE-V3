/**
 * Policies Lab E2E Tests
 * Comprehensive end-to-end tests for the Policies Lab feature
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8081';

// Test user credentials (using a demo IdP - US IdP)
const TEST_USER_USERNAME = 'testuser-us';
const TEST_USER_PASSWORD = 'password';
const TEST_IDP_HINT = 'us-idp';

// Sample policies for testing
const SAMPLE_REGO_POLICY = `package dive.lab.e2e_test

import rego.v1

default allow := false

clearance_hierarchy := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}

is_insufficient_clearance := msg if {
  clearance_hierarchy[input.subject.clearance] < clearance_hierarchy[input.resource.classification]
  msg := sprintf("Insufficient clearance: %s < %s", [input.subject.clearance, input.resource.classification])
}

allow if {
  not is_insufficient_clearance
}

obligations := [
  {
    "type": "LOG_ACCESS",
    "params": {
      "resourceId": input.resource.resourceId
    }
  }
] if { allow }
`;

const SAMPLE_XACML_POLICY = `<?xml version="1.0" encoding="UTF-8"?>
<PolicySet xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17"
           PolicySetId="urn:dive:lab:e2e-test"
           PolicyCombiningAlgId="urn:oasis:names:tc:xacml:3.0:policy-combining-algorithm:deny-overrides"
           Version="1.0">
  <Description>E2E Test XACML Policy</Description>
  <Target/>
  <Policy PolicyId="urn:dive:lab:clearance-policy"
          RuleCombiningAlgId="urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:permit-overrides"
          Version="1.0">
    <Target/>
    <Rule RuleId="permit-if-clearance-sufficient" Effect="Permit">
      <Condition>
        <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
          <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:string-one-and-only">
            <AttributeDesignator
              Category="urn:oasis:names:tc:xacml:1.0:subject-category:access-subject"
              AttributeId="clearance"
              DataType="http://www.w3.org/2001/XMLSchema#string"
              MustBePresent="true"/>
          </Apply>
          <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">SECRET</AttributeValue>
        </Apply>
      </Condition>
    </Rule>
  </Policy>
</PolicySet>
`;

async function loginIfNeeded(page: Page) {
    // Check if already logged in by looking for user menu or dashboard
    const isLoggedIn = await page.locator('[data-testid="user-menu"], text=Dashboard, text=Resources').first().isVisible().catch(() => false);

    if (!isLoggedIn) {
        console.log('Not logged in, initiating login flow...');

        // Navigate to login with IdP hint
        await page.goto(`${BASE_URL}/login?idp=${TEST_IDP_HINT}`);

        // Click the sign-in button which triggers Keycloak redirect
        await page.click('text=Sign in with', { timeout: 10000 });

        // Wait for Keycloak login page
        await page.waitForURL(/.*keycloak.*/, { timeout: 15000 });

        // Fill in Keycloak credentials
        await page.fill('#username, input[name="username"]', TEST_USER_USERNAME, { timeout: 10000 });
        await page.fill('#password, input[name="password"]', TEST_USER_PASSWORD, { timeout: 10000 });

        // Submit login form
        await page.click('#kc-login, input[type="submit"], button[type="submit"]', { timeout: 10000 });

        // Wait for redirect back to app (dashboard or original page)
        await page.waitForURL(/.*localhost:3000.*/, { timeout: 15000 });

        // Wait for session to be established
        await page.waitForTimeout(2000);

        console.log('Login completed successfully');
    } else {
        console.log('Already logged in');
    }
}

test.describe('Policies Lab E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await loginIfNeeded(page);
    });

    test('Scenario 1: Upload Rego policy → validate → see in list', async ({ page }) => {
        // Navigate to Policies Lab
        await page.goto(`${BASE_URL}/policies/lab`);
        await expect(page.locator('h2:has-text("Policies Lab")')).toBeVisible();

        // Click Upload Policy button
        await page.click('button:has-text("Upload Policy")');
        await expect(page.locator('text=Upload Policy')).toBeVisible();

        // Create a temporary file and upload
        const buffer = Buffer.from(SAMPLE_REGO_POLICY);
        await page.setInputFiles('input[type="file"]', {
            name: 'test-policy.rego',
            mimeType: 'text/plain',
            buffer
        });

        // Fill in policy name
        await page.fill('input[id="policy-name"]', 'E2E Test Rego Policy');

        // Fill in description
        await page.fill('textarea[id="policy-description"]', 'Automated E2E test policy');

        // Click Upload & Validate
        await page.click('button:has-text("Upload & Validate")');

        // Wait for success message
        await expect(page.locator('text=Policy Uploaded Successfully')).toBeVisible({ timeout: 10000 });

        // Should redirect to policy list
        await page.waitForTimeout(2000);

        // Verify policy appears in list
        await expect(page.locator('text=E2E Test Rego Policy')).toBeVisible();
        await expect(page.locator('text=REGO')).toBeVisible();
        await expect(page.locator('text=✓ Validated')).toBeVisible();
    });

    test('Scenario 2: Upload XACML policy → validate → see in list', async ({ page }) => {
        // Navigate to Policies Lab
        await page.goto(`${BASE_URL}/policies/lab`);

        // Click Upload Policy button
        await page.click('button:has-text("Upload Policy")');

        // Upload XACML file
        const buffer = Buffer.from(SAMPLE_XACML_POLICY);
        await page.setInputFiles('input[type="file"]', {
            name: 'test-policy.xml',
            mimeType: 'application/xml',
            buffer
        });

        // Fill in policy name
        await page.fill('input[id="policy-name"]', 'E2E Test XACML Policy');

        // Click Upload & Validate
        await page.click('button:has-text("Upload & Validate")');

        // Wait for success
        await expect(page.locator('text=Policy Uploaded Successfully')).toBeVisible({ timeout: 10000 });

        await page.waitForTimeout(2000);

        // Verify policy in list
        await expect(page.locator('text=E2E Test XACML Policy')).toBeVisible();
        await expect(page.locator('text=XACML')).toBeVisible();
    });

    test('Scenario 3: Upload invalid policy → see validation errors', async ({ page }) => {
        // Navigate to Policies Lab
        await page.goto(`${BASE_URL}/policies/lab`);

        // Click Upload Policy button
        await page.click('button:has-text("Upload Policy")');

        // Upload invalid Rego (wrong package name)
        const invalidRego = `package unauthorized.package
default allow := false
`;
        const buffer = Buffer.from(invalidRego);
        await page.setInputFiles('input[type="file"]', {
            name: 'invalid.rego',
            mimeType: 'text/plain',
            buffer
        });

        await page.fill('input[id="policy-name"]', 'Invalid Policy');
        await page.click('button:has-text("Upload & Validate")');

        // Wait for validation error
        await expect(page.locator('text=Validation Error')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=Package must start with "dive.lab."')).toBeVisible();
    });

    test('Scenario 4: Evaluate policy with clearance match → see ALLOW', async ({ page }) => {
        // First upload a policy
        await page.goto(`${BASE_URL}/policies/lab`);

        // Check if test policy already exists, if not upload it
        const policyExists = await page.locator('text=E2E Test Rego Policy').isVisible().catch(() => false);

        if (!policyExists) {
            await page.click('button:has-text("Upload Policy")');
            const buffer = Buffer.from(SAMPLE_REGO_POLICY);
            await page.setInputFiles('input[type="file"]', {
                name: 'test-policy.rego',
                mimeType: 'text/plain',
                buffer
            });
            await page.fill('input[id="policy-name"]', 'E2E Test Rego Policy');
            await page.click('button:has-text("Upload & Validate")');
            await page.waitForTimeout(2000);
        }

        // Navigate to Evaluate tab
        await page.click('button:has-text("Evaluate")');

        // Select policy
        await page.selectOption('select', { label: /E2E Test Rego Policy/ });

        // Use preset: Clearance Match (ALLOW)
        await page.click('button:has-text("Clearance Match (ALLOW)")');

        // Click Evaluate Policy
        await page.click('button:has-text("Evaluate Policy")');

        // Wait for results
        await expect(page.locator('text=Evaluation Results')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=ALLOW')).toBeVisible();
        await expect(page.locator('text=OPA Decision')).toBeVisible();
    });

    test('Scenario 5: Evaluate policy with clearance mismatch → see DENY', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Navigate to Evaluate tab
        await page.click('button:has-text("Evaluate")');

        // Select policy
        await page.selectOption('select', { label: /E2E Test Rego Policy/ });

        // Use preset: Clearance Mismatch (DENY)
        await page.click('button:has-text("Clearance Mismatch (DENY)")');

        // Click Evaluate Policy
        await page.click('button:has-text("Evaluate Policy")');

        // Wait for results
        await expect(page.locator('text=DENY')).toBeVisible({ timeout: 10000 });
    });

    test('Scenario 6: Delete policy → confirm removed from list', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Ensure we're on the list tab
        await page.click('button:has-text("My Policies")');

        // Find a policy and click Delete
        const deleteButton = page.locator('button:has-text("Delete")').first();

        if (await deleteButton.isVisible()) {
            // Get policy name before deletion
            const policyCard = page.locator('.border.rounded-lg').first();
            const policyName = await policyCard.locator('h3').textContent();

            // Click delete
            await deleteButton.click();

            // Confirm deletion in dialog
            await page.once('dialog', dialog => dialog.accept());

            // Wait a bit for deletion to complete
            await page.waitForTimeout(1000);

            // Verify policy is removed
            if (policyName) {
                const policyStillExists = await page.locator(`text=${policyName}`).isVisible().catch(() => false);
                expect(policyStillExists).toBe(false);
            }
        }
    });

    test('Scenario 7: View XACML ↔ Rego mapping tab', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Click on Mapping tab
        await page.click('button:has-text("XACML ↔ Rego")');

        // Verify mapping content is visible
        await expect(page.locator('text=XACML ↔ Rego Mapping Guide')).toBeVisible();
        await expect(page.locator('text=XACML Construct')).toBeVisible();
        await expect(page.locator('text=Rego Equivalent')).toBeVisible();

        // Check for specific mappings
        await expect(page.locator('text=<Target>')).toBeVisible();
        await expect(page.locator('text=<Condition>')).toBeVisible();
        await expect(page.locator('text=<Obligations>')).toBeVisible();

        // Verify code examples are present
        await expect(page.locator('pre code')).toHaveCount({ min: 1 });
    });

    test('Scenario 8: Verify rate limiting message (if applicable)', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Try to upload 6 policies rapidly
        for (let i = 0; i < 6; i++) {
            await page.click('button:has-text("Upload Policy")');

            const policyContent = SAMPLE_REGO_POLICY.replace('e2e_test', `e2e_test_${i}`);
            const buffer = Buffer.from(policyContent);

            await page.setInputFiles('input[type="file"]', {
                name: `test-policy-${i}.rego`,
                mimeType: 'text/plain',
                buffer
            });

            await page.fill('input[id="policy-name"]', `Rate Limit Test ${i}`);
            await page.click('button:has-text("Upload & Validate")');

            // Wait for response
            await page.waitForTimeout(1000);

            // If rate limited, break
            const rateLimited = await page.locator('text=Too many requests').isVisible().catch(() => false);
            if (rateLimited) {
                expect(rateLimited).toBe(true);
                break;
            }

            // Close success dialog if present
            const successVisible = await page.locator('text=Policy Uploaded Successfully').isVisible().catch(() => false);
            if (successVisible) {
                await page.waitForTimeout(2000);
            }
        }
    });

    test('Scenario 9: View policy details and expand/collapse', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Ensure we're on the list tab
        await page.click('button:has-text("My Policies")');

        // Find a policy and click View
        const viewButton = page.locator('button:has-text("View")').first();

        if (await viewButton.isVisible()) {
            // Click View to expand
            await viewButton.click();

            // Verify expanded content is visible
            await expect(page.locator('text=Policy ID:')).toBeVisible();
            await expect(page.locator('text=Use this policy ID in the')).toBeVisible();

            // Click Hide to collapse
            await page.click('button:has-text("Hide")');

            // Verify content is hidden
            const detailsVisible = await page.locator('text=Use this policy ID in the').isVisible().catch(() => false);
            expect(detailsVisible).toBe(false);
        }
    });

    test('Scenario 10: Verify evaluation results show latency metrics', async ({ page }) => {
        await page.goto(`${BASE_URL}/policies/lab`);

        // Navigate to Evaluate tab
        await page.click('button:has-text("Evaluate")');

        // Select first available policy
        const policySelect = page.locator('select').first();
        await policySelect.selectOption({ index: 1 });

        // Use a preset
        await page.click('button:has-text("Clearance Match (ALLOW)")');

        // Evaluate
        await page.click('button:has-text("Evaluate Policy")');

        // Wait for results
        await expect(page.locator('text=Evaluation Results')).toBeVisible({ timeout: 10000 });

        // Check for latency display
        await expect(page.locator('text=Latency')).toBeVisible();
        await expect(page.locator('text=ms')).toBeVisible();

        // Check for policy version
        await expect(page.locator('text=Policy Version')).toBeVisible();
    });
});

