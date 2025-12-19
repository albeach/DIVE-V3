/**
 * Mock Keycloak JWKS Endpoint for E2E Testing
 * 
 * Mocks the Keycloak JWKS (JSON Web Key Set) endpoint to return
 * test RSA public key for JWT verification.
 * 
 * Use with mock-jwt-rs256.ts to create RS256 JWT tokens.
 */

import nock from 'nock';
import fs from 'fs';
import path from 'path';
import { importSPKI, exportJWK } from 'jose';
import { TEST_KEY_ID } from './mock-jwt-rs256';

/**
 * Load test RSA public key
 */
const PUBLIC_KEY_PATH = path.join(__dirname, '../keys/test-public-key.pem');

let publicKeyPem: string;
try {
    publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
} catch (error) {
    throw new Error(
        `Failed to load test RSA public key from ${PUBLIC_KEY_PATH}. ` +
        `Run: npm run generate-test-keys`
    );
}

/**
 * Get Keycloak JWKS URL from environment
 */
function getJWKSUrl(): { baseUrl: string; path: string } {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    const jwksPath = `/realms/${realm}/protocol/openid-connect/certs`;

    return {
        baseUrl: keycloakUrl,
        path: jwksPath
    };
}

/**
 * Convert PEM public key to JWK format
 * 
 * @returns JWK representation of test public key
 */
async function convertPemToJWK(): Promise<any> {
    try {
        // Import PEM public key
        const publicKey = await importSPKI(publicKeyPem, 'RS256');
        
        // Export as JWK
        const jwk = await exportJWK(publicKey);
        
        return {
            ...jwk,
            kid: TEST_KEY_ID,      // Key ID (must match JWT header)
            use: 'sig',            // Key usage: signature
            alg: 'RS256',          // Algorithm
            kty: 'RSA'             // Key type
        };
    } catch (error) {
        throw new Error(`Failed to convert PEM to JWK: ${error}`);
    }
}

/**
 * Mock Keycloak JWKS endpoint with test public key
 * 
 * Call this in beforeAll() of E2E tests to mock the JWKS endpoint.
 * The mock will persist for all tests in the suite.
 * 
 * @example
 * ```typescript
 * describe('E2E Tests', () => {
 *   beforeAll(async () => {
 *     await mockKeycloakJWKS();
 *   });
 * 
 *   afterAll(() => {
 *     cleanupJWKSMock();
 *   });
 * });
 * ```
 */
export async function mockKeycloakJWKS(): Promise<void> {
    const { baseUrl, path: jwksPath } = getJWKSUrl();
    const jwk = await convertPemToJWK();

    // Mock the JWKS endpoint (persist across all requests)
    nock(baseUrl)
        .persist()  // Don't remove after first use
        .get(jwksPath)
        .reply(200, {
            keys: [jwk]
        });

    console.log(`✅ Mocked Keycloak JWKS endpoint: ${baseUrl}${jwksPath}`);
}

/**
 * Clean up JWKS mock (call in afterAll)
 */
export function cleanupJWKSMock(): void {
    nock.cleanAll();
    console.log('✅ Cleaned up JWKS mock');
}

/**
 * Check if nock has active mocks (for debugging)
 */
export function hasActiveMocks(): boolean {
    return nock.activeMocks().length > 0;
}

/**
 * Get list of active mocks (for debugging)
 */
export function getActiveMocks(): string[] {
    return nock.activeMocks();
}

/**
 * Mock JWKS endpoint with custom JWK (advanced usage)
 * 
 * @param customJWK Custom JWK to return
 */
export async function mockKeycloakJWKSWithCustomKey(customJWK: any): Promise<void> {
    const { baseUrl, path: jwksPath } = getJWKSUrl();

    nock(baseUrl)
        .persist()
        .get(jwksPath)
        .reply(200, {
            keys: [customJWK]
        });

    console.log(`✅ Mocked Keycloak JWKS endpoint with custom key: ${baseUrl}${jwksPath}`);
}

/**
 * Get the test JWK (for inspection/debugging)
 */
export async function getTestJWK(): Promise<any> {
    return await convertPemToJWK();
}
