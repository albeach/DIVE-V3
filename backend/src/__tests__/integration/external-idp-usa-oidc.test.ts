/**
 * DIVE V3 - External IdP Integration Tests: USA OIDC
 * 
 * Tests federation with USA OIDC IdP (Keycloak)
 * Tests attribute normalization from U.S. DoD attributes to DIVE claims
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import {
    normalizeUSAOIDCAttributes,
    enrichAttributes,
} from '../../services/attribute-normalization.service';

describe('External IdP Integration - USA OIDC', () => {
    describe('USA OIDC Attribute Normalization', () => {
        test('should normalize USA DoD attributes (already DIVE-compliant)', () => {
            const usaAttributes = {
                uniqueID: 'smith.john@mail.mil',
                preferred_username: 'smith.john@mail.mil',
                email: 'smith.john@mail.mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY', 'US-ONLY'],
                organization: 'U.S. Air Force',
                rank: 'Colonel',
                unit: 'Joint Staff J-6',
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.uniqueID).toBe('smith.john@mail.mil');
            expect(normalized.clearance).toBe('TOP_SECRET');
            expect(normalized.countryOfAffiliation).toBe('USA');
            expect(normalized.acpCOI).toEqual(['FVEY', 'US-ONLY']);
            expect(normalized.organization).toBe('U.S. Air Force');
            expect(normalized.rank).toBe('Colonel');
            expect(normalized.unit).toBe('Joint Staff J-6');
        });

        test('should use preferred_username as fallback for uniqueID', () => {
            const usaAttributes = {
                // uniqueID is missing
                preferred_username: 'johnson.emily@mail.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.uniqueID).toBe('johnson.emily@mail.mil');
        });

        test('should use email as last fallback for uniqueID', () => {
            const usaAttributes = {
                // uniqueID and preferred_username are missing
                email: 'williams.robert@mail.mil',
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'USA',
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.uniqueID).toBe('williams.robert@mail.mil');
        });

        test('should normalize country code from US to USA', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'US',  // Should be normalized to USA
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.countryOfAffiliation).toBe('USA');
        });

        test('should default to USA when country is missing', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'SECRET',
                // countryOfAffiliation is missing
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.countryOfAffiliation).toBe('USA');
        });

        test('should validate clearance levels', () => {
            const validClearances = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

            validClearances.forEach((clearance) => {
                const normalized = normalizeUSAOIDCAttributes({
                    uniqueID: 'test@mail.mil',
                    clearance,
                    countryOfAffiliation: 'USA',
                });

                expect(normalized.clearance).toBe(clearance);
            });
        });

        test('should reject invalid clearance levels', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'INVALID_LEVEL',
                countryOfAffiliation: 'USA',
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            // Invalid clearance should not be set
            expect(normalized.clearance).toBeUndefined();
        });

        test('should handle COI as single string', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: 'FVEY',  // Single string, not array
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.acpCOI).toEqual(['FVEY']);
        });

        test('should handle COI as array', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY', 'NATO-COSMIC'],  // Array
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
        });
    });

    describe('USA Test Users', () => {
        const testUsers = [
            {
                name: 'COL John Smith',
                uniqueID: 'smith.john@mail.mil',
                clearance: 'TOP_SECRET',
                acpCOI: ['FVEY', 'US-ONLY'],
                organization: 'U.S. Air Force',
            },
            {
                name: 'LCDR Emily Johnson',
                uniqueID: 'johnson.emily@mail.mil',
                clearance: 'SECRET',
                acpCOI: ['NATO-COSMIC', 'FVEY'],
                organization: 'U.S. Navy',
            },
            {
                name: 'MAJ Robert Williams',
                uniqueID: 'williams.robert@mail.mil',
                clearance: 'CONFIDENTIAL',
                acpCOI: ['NATO-COSMIC'],
                organization: 'U.S. Army',
            },
            {
                name: 'CPT Sarah Davis',
                uniqueID: 'davis.sarah@mail.mil',
                clearance: 'UNCLASSIFIED',
                acpCOI: ['NATO-UNRESTRICTED'],
                organization: 'U.S. Marine Corps',
            },
        ];

        testUsers.forEach((user) => {
            test(`should normalize ${user.name} attributes correctly`, () => {
                const usaAttributes = {
                    uniqueID: user.uniqueID,
                    email: user.uniqueID,
                    clearance: user.clearance,
                    countryOfAffiliation: 'USA',
                    acpCOI: user.acpCOI,
                    organization: user.organization,
                };

                const normalized = normalizeUSAOIDCAttributes(usaAttributes);

                expect(normalized.uniqueID).toBe(user.uniqueID);
                expect(normalized.clearance).toBe(user.clearance);
                expect(normalized.countryOfAffiliation).toBe('USA');
                expect(normalized.acpCOI).toEqual(user.acpCOI);
                expect(normalized.organization).toBe(user.organization);
            });
        });
    });

    describe('USA Attribute Enrichment', () => {
        test('should enrich attributes with USA country default', () => {
            const partial = {
                uniqueID: 'smith.john@mail.mil',
                clearance: 'TOP_SECRET' as const,
                // countryOfAffiliation is missing
            };

            const enriched = enrichAttributes(partial, 'usa-external');

            expect(enriched.countryOfAffiliation).toBe('USA');
        });

        test('should preserve existing country code', () => {
            const partial = {
                uniqueID: 'dual.citizen@example.com',
                clearance: 'SECRET' as const,
                countryOfAffiliation: 'CAN',
            };

            const enriched = enrichAttributes(partial, 'usa-external');

            expect(enriched.countryOfAffiliation).toBe('CAN');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty attribute object', () => {
            const normalized = normalizeUSAOIDCAttributes({});

            expect(normalized.uniqueID).toBeUndefined();
            expect(normalized.clearance).toBeUndefined();
            expect(normalized.countryOfAffiliation).toBe('USA'); // Default
        });

        test('should handle missing COI gracefully', () => {
            const usaAttributes = {
                uniqueID: 'test@mail.mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                // acpCOI is missing
            };

            const normalized = normalizeUSAOIDCAttributes(usaAttributes);

            expect(normalized.acpCOI).toBeUndefined();
        });
    });
});

/**
 * NOTE: Live integration tests require external IdP to be running
 * Run: cd external-idps && docker-compose up -d
 * Then: npm run test:integration:external-idp
 */
describe('External IdP Integration - USA OIDC Live Tests', () => {
    const USA_OIDC_URL = process.env.USA_OIDC_URL || 'http://localhost:8082';
    const USA_REALM = 'us-dod';

    beforeAll(() => {
        if (!process.env.RUN_LIVE_TESTS) {
            console.log('⏭️  Skipping live tests (set RUN_LIVE_TESTS=true to enable)');
        }
    });

    test.skip('should fetch USA OIDC discovery endpoint', async () => {
        if (!process.env.RUN_LIVE_TESTS) {
            return;
        }

        const response = await fetch(
            `${USA_OIDC_URL}/realms/${USA_REALM}/.well-known/openid-configuration`
        );

        expect(response.ok).toBe(true);
        const config = await response.json() as {
            issuer: string;
            authorization_endpoint: string;
            token_endpoint: string;
            userinfo_endpoint: string;
            [key: string]: unknown;
        };
        expect(config.issuer).toBe(`${USA_OIDC_URL}/realms/${USA_REALM}`);
        expect(config.authorization_endpoint).toBeDefined();
        expect(config.token_endpoint).toBeDefined();
        expect(config.userinfo_endpoint).toBeDefined();
    }, 10000);

    test.skip('should authenticate with USA DoD test user and verify attributes', async () => {
        if (!process.env.RUN_LIVE_TESTS) {
            return;
        }

        const CLIENT_ID = 'dive-v3-client';
        const CLIENT_SECRET = 'usa-dod-secret-change-in-production';
        const USERNAME = 'smith.john@mail.mil';
        const PASSWORD = 'TopSecret123!';

        // Get token endpoint from discovery
        const discoveryResponse = await fetch(
            `${USA_OIDC_URL}/realms/${USA_REALM}/.well-known/openid-configuration`
        );
        const discovery = await discoveryResponse.json() as {
            token_endpoint: string;
            userinfo_endpoint: string;
            [key: string]: unknown;
        };
        const tokenEndpoint = discovery.token_endpoint;

        // Request token using Resource Owner Password Credentials
        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'password',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                username: USERNAME,
                password: PASSWORD,
                scope: 'openid profile email',
            }),
        });

        expect(tokenResponse.ok).toBe(true);
        const tokenData = await tokenResponse.json() as {
            access_token: string;
            [key: string]: unknown;
        };
        expect(tokenData.access_token).toBeDefined();

        // Decode access token to verify DIVE attributes
        const accessToken = tokenData.access_token;
        const payload = JSON.parse(
            Buffer.from(accessToken.split('.')[1], 'base64').toString()
        );

        // Verify DIVE attributes present in token
        // Note: Attributes might be in UserInfo endpoint instead
        console.log('Token payload:', payload);

        // Get UserInfo to verify attributes
        const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        expect(userinfoResponse.ok).toBe(true);
        const userinfo = await userinfoResponse.json() as {
            email?: string;
            preferred_username?: string;
            [key: string]: unknown;
        };

        console.log('UserInfo:', userinfo);

        // Verify DIVE attributes (may need protocol mappers configured)
        expect(userinfo.email || userinfo.preferred_username).toBe(USERNAME);
    }, 30000);
});
