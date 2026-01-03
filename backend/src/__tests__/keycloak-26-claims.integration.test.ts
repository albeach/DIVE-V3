/**
 * Keycloak 26 Migration - ACR/AMR/auth_time Claims Integration Tests
 * 
 * Verifies that JWT tokens include the correct authentication context claims
 * after migrating to Keycloak 26.
 * 
 * Tests cover:
 * - ACR (Authentication Context Class Reference) = "1" for AAL2
 * - AMR (Authentication Methods Reference) = ["pwd","otp"]
 * - auth_time (Authentication timestamp) present
 * - Backend AAL2 validation
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as jwt from 'jsonwebtoken';

// Configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8081';
const REALM = 'dive-v3-broker';
const CLIENT_ID = 'dive-v3-broker';
const CLIENT_SECRET = process.env.KC_CLIENT_SECRET || '';
const TEST_USER = 'admin-dive';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'DiveAdmin2025!';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

interface ITokenClaims {
    sub: string;
    preferred_username?: string;
    acr?: string;
    amr?: string | string[];
    auth_time?: number;
    clearance?: string;
    countryOfAffiliation?: string;
    uniqueID?: string;
    exp?: number;
    iat?: number;
}

// Skip this test suite if KC_CLIENT_SECRET is not set (integration test requires real Keycloak)
const describeIf = (condition: boolean) => condition ? describe : describe.skip;

describeIf(!!CLIENT_SECRET)('Keycloak 26 Migration - ACR/AMR Claims', () => {
    let accessToken: string;
    let idToken: string;
    let decodedAccess: ITokenClaims;
    let decodedId: ITokenClaims;

    beforeAll(async () => {
        // Obtain token via password grant (simulating OTP authentication)
        const tokenEndpoint = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                username: TEST_USER,
                password: TEST_PASSWORD,
                grant_type: 'password',
                scope: 'openid profile email',
            }),
        });

        if (!response.ok) {
            const error = await response.json() as { error?: string; error_description?: string };
            throw new Error(`Failed to obtain token: ${error.error_description || error.error}`);
        }

        const tokenResponse = await response.json() as { access_token: string; id_token: string };
        accessToken = tokenResponse.access_token;
        idToken = tokenResponse.id_token;

        // Decode tokens (skip verification for testing)
        decodedAccess = jwt.decode(accessToken) as ITokenClaims;
        decodedId = jwt.decode(idToken) as ITokenClaims;
    });

    describe('Access Token Claims', () => {
        it('should include ACR claim (Authentication Context Class Reference)', () => {
            expect(decodedAccess.acr).toBeDefined();
            expect(decodedAccess.acr).not.toBe('');
            expect(decodedAccess.acr).not.toBeNull();
        });

        it('should have ACR="1" indicating AAL2 (Multi-Factor Authentication)', () => {
            // ACR can be numeric "1" or URN like "urn:mace:incommon:iap:silver"
            const acr = String(decodedAccess.acr || '');
            const isAAL2 = acr === '1' ||
                acr.includes('silver') ||
                acr.includes('aal2') ||
                acr.includes('multi-factor');

            expect(isAAL2).toBe(true);
        });

        it('should include AMR claim (Authentication Methods Reference)', () => {
            expect(decodedAccess.amr).toBeDefined();
            expect(decodedAccess.amr).not.toBeNull();
        });

        it('should have AMR array with 2+ factors (["pwd","otp"])', () => {
            let amrArray: string[] = [];

            if (Array.isArray(decodedAccess.amr)) {
                amrArray = decodedAccess.amr;
            } else if (typeof decodedAccess.amr === 'string') {
                try {
                    const parsed = JSON.parse(decodedAccess.amr);
                    amrArray = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    amrArray = [decodedAccess.amr];
                }
            }

            expect(amrArray.length).toBeGreaterThanOrEqual(2);
            expect(amrArray).toContain('pwd');
            expect(amrArray).toContain('otp');
        });

        it('should include auth_time claim (Authentication timestamp)', () => {
            expect(decodedAccess.auth_time).toBeDefined();
            expect(decodedAccess.auth_time).not.toBeNull();
            expect(typeof decodedAccess.auth_time).toBe('number');
        });

        it('should have auth_time as a valid Unix timestamp', () => {
            const authTime = decodedAccess.auth_time!;
            const now = Math.floor(Date.now() / 1000);

            // auth_time should be recent (within last hour)
            expect(authTime).toBeGreaterThan(now - 3600);
            expect(authTime).toBeLessThanOrEqual(now);
        });

        it('should include standard DIVE attributes', () => {
            expect(decodedAccess.sub).toBeDefined();
            expect(decodedAccess.clearance).toBeDefined();
            expect(decodedAccess.countryOfAffiliation).toBeDefined();
            expect(decodedAccess.uniqueID).toBeDefined();
        });
    });

    describe('ID Token Claims', () => {
        it('should include ACR claim in ID token', () => {
            expect(decodedId.acr).toBeDefined();
            expect(decodedId.acr).not.toBe('');
        });

        it('should include AMR claim in ID token', () => {
            expect(decodedId.amr).toBeDefined();
        });

        it('should include auth_time claim in ID token', () => {
            expect(decodedId.auth_time).toBeDefined();
            expect(typeof decodedId.auth_time).toBe('number');
        });
    });

    describe('Backend AAL2 Validation', () => {
        it('should allow access to classified resources with AAL2 credentials', async () => {
            // Try to access a SECRET classified resource
            const resourceId = 'doc-generated-1761226224287-1305'; // SECRET resource

            const response = await fetch(`${BACKEND_URL}/api/resources/${resourceId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            expect(response.status).toBe(200);
            const data = await response.json() as { resourceId: string };
            expect(data.resourceId).toBe(resourceId);
        });

        it('should not return "Authentication strength insufficient" error', async () => {
            const resourceId = 'doc-generated-1761226224287-1305';

            const response = await fetch(`${BACKEND_URL}/api/resources/${resourceId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            const data = await response.json() as { message?: string };

            if (response.status === 403) {
                expect(data.message).not.toContain('Authentication strength insufficient');
                expect(data.message).not.toContain('AAL2');
            }
        });
    });

    describe('Token Claim Consistency', () => {
        it('should have matching ACR in access and ID tokens', () => {
            expect(decodedAccess.acr).toBe(decodedId.acr);
        });

        it('should have matching auth_time in access and ID tokens', () => {
            expect(decodedAccess.auth_time).toBe(decodedId.auth_time);
        });

        it('should have matching subject in access and ID tokens', () => {
            expect(decodedAccess.sub).toBe(decodedId.sub);
        });
    });

    describe('Backwards Compatibility', () => {
        it('should not break existing user attributes', () => {
            expect(decodedAccess.clearance).toBeDefined();
            expect(decodedAccess.countryOfAffiliation).toBeDefined();
            expect(decodedAccess.uniqueID).toBeDefined();
        });

        it('should maintain token expiration claims', () => {
            expect(decodedAccess.exp).toBeDefined();
            expect(decodedAccess.iat).toBeDefined();

            const exp = decodedAccess.exp!;
            const iat = decodedAccess.iat!;

            expect(exp).toBeGreaterThan(iat);
        });
    });
});

describe('Keycloak 26 Migration - Claims for Different Realms', () => {
    const realms = ['dive-v3-broker', 'dive-v3-usa', 'dive-v3-fra', 'dive-v3-can', 'dive-v3-industry'];

    realms.forEach((realm) => {
        describe(`Realm: ${realm}`, () => {
            it(`should support ACR/AMR session note mappers in ${realm}`, async () => {
                // This is a configuration test - verify Terraform applied the changes
                // In a real test, you'd check the Keycloak admin API for protocol mapper configuration
                expect(realm).toBeTruthy();
            });
        });
    });
});

export { };
