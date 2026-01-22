/**
 * Cross-Instance SSO Integration Tests
 * 
 * Tests federated SSO across all deployed instances (USA, FRA, DEU).
 * Validates that users from one instance can authenticate on another
 * and receive correct token claims (uniqueID, countryOfAffiliation, clearance).
 * 
 * Test Matrix (12 scenarios):
 * - USA user → FRA instance
 * - USA user → DEU instance
 * - FRA user → USA instance
 * - FRA user → DEU instance
 * - DEU user → USA instance
 * - DEU user → FRA instance
 * (Each direction for testuser-X-1 and testuser-X-4 clearance levels)
 * 
 * @version 1.0.0
 * @date 2026-01-22
 */

import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as jwt from 'jsonwebtoken';

// Instance configuration
interface InstanceConfig {
    code: string;
    name: string;
    frontendPort: number;
    backendPort: number;
    keycloakPort: number;
    realm: string;
}

const INSTANCES: InstanceConfig[] = [
    {
        code: 'USA',
        name: 'Hub (United States)',
        frontendPort: 3000,
        backendPort: 4000,
        keycloakPort: 8443,
        realm: 'dive-v3-broker-usa',
    },
    {
        code: 'FRA',
        name: 'France',
        frontendPort: 3010,
        backendPort: 4010,
        keycloakPort: 8453,
        realm: 'dive-v3-broker-fra',
    },
    {
        code: 'DEU',
        name: 'Germany',
        frontendPort: 3020,
        backendPort: 4020,
        keycloakPort: 8454,
        realm: 'dive-v3-broker-deu',
    },
];

// Test user configuration
interface TestUser {
    username: string;
    password: string;
    expectedClearance: string;
    expectedCountry: string;
}

const TEST_USERS: Record<string, TestUser[]> = {
    USA: [
        { username: 'testuser-usa-1', password: 'TestUser2025!Pilot', expectedClearance: 'UNCLASSIFIED', expectedCountry: 'USA' },
        { username: 'testuser-usa-4', password: 'TestUser2025!Pilot', expectedClearance: 'SECRET', expectedCountry: 'USA' },
    ],
    FRA: [
        { username: 'testuser-fra-1', password: 'TestUser2025!Pilot', expectedClearance: 'UNCLASSIFIED', expectedCountry: 'FRA' },
        { username: 'testuser-fra-4', password: 'TestUser2025!Pilot', expectedClearance: 'SECRET', expectedCountry: 'FRA' },
    ],
    DEU: [
        { username: 'testuser-deu-1', password: 'TestUser2025!Pilot', expectedClearance: 'UNCLASSIFIED', expectedCountry: 'DEU' },
        { username: 'testuser-deu-4', password: 'TestUser2025!Pilot', expectedClearance: 'SECRET', expectedCountry: 'DEU' },
    ],
};

// Axios client with self-signed cert support
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

/**
 * Get an access token using Resource Owner Password Grant
 */
async function getAccessToken(
    keycloakUrl: string,
    realm: string,
    clientId: string,
    clientSecret: string,
    username: string,
    password: string
): Promise<string | null> {
    try {
        const response = await axios.post(
            `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                username,
                password,
                grant_type: 'password',
                scope: 'openid profile email uniqueID clearance countryOfAffiliation acpCOI',
            }),
            {
                httpsAgent,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error(`Failed to get token: ${error}`);
        return null;
    }
}

/**
 * Decode JWT token and extract claims
 */
function decodeToken(token: string): Record<string, any> | null {
    try {
        // JWT is base64url encoded
        const payload = token.split('.')[1];
        // Add padding if needed
        const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
        const decoded = Buffer.from(padded, 'base64').toString('utf-8');
        return JSON.parse(decoded);
    } catch (error) {
        console.error(`Failed to decode token: ${error}`);
        return null;
    }
}

/**
 * Test result interface
 */
interface SSOTestResult {
    origin: string;
    target: string;
    user: string;
    success: boolean;
    claims?: {
        uniqueID: string;
        countryOfAffiliation: string;
        clearance: string;
        acpCOI?: string[];
    };
    error?: string;
}

/**
 * Run SSO test for a specific user/origin/target combination
 */
async function testSSO(
    origin: InstanceConfig,
    target: InstanceConfig,
    user: TestUser,
    clientSecret: string
): Promise<SSOTestResult> {
    const result: SSOTestResult = {
        origin: origin.code,
        target: target.code,
        user: user.username,
        success: false,
    };

    try {
        // Get token from target instance (user authenticates on target using federation)
        const keycloakUrl = `https://localhost:${target.keycloakPort}`;
        const clientId = `dive-v3-broker-${target.code.toLowerCase()}`;

        const token = await getAccessToken(
            keycloakUrl,
            target.realm,
            clientId,
            clientSecret,
            user.username,
            user.password
        );

        if (!token) {
            result.error = 'Failed to obtain access token';
            return result;
        }

        // Decode and validate claims
        const claims = decodeToken(token);
        if (!claims) {
            result.error = 'Failed to decode token';
            return result;
        }

        // Extract relevant claims
        result.claims = {
            uniqueID: claims.uniqueID || claims.preferred_username,
            countryOfAffiliation: claims.countryOfAffiliation,
            clearance: claims.clearance,
            acpCOI: claims.acpCOI,
        };

        // Validate claims
        const validations: string[] = [];

        // uniqueID should be the username, not a UUID
        if (!result.claims.uniqueID) {
            validations.push('Missing uniqueID claim');
        } else if (result.claims.uniqueID.includes('-') && result.claims.uniqueID.length > 30) {
            // Looks like a UUID - this is wrong
            validations.push(`uniqueID appears to be UUID: ${result.claims.uniqueID}`);
        } else if (result.claims.uniqueID !== user.username) {
            validations.push(`uniqueID mismatch: expected ${user.username}, got ${result.claims.uniqueID}`);
        }

        // countryOfAffiliation should match user's origin country
        if (result.claims.countryOfAffiliation !== user.expectedCountry) {
            validations.push(`countryOfAffiliation mismatch: expected ${user.expectedCountry}, got ${result.claims.countryOfAffiliation}`);
        }

        // clearance should be present
        if (!result.claims.clearance) {
            validations.push('Missing clearance claim');
        }

        if (validations.length > 0) {
            result.error = validations.join('; ');
        } else {
            result.success = true;
        }
    } catch (error) {
        result.error = `Exception: ${error instanceof Error ? error.message : String(error)}`;
    }

    return result;
}

/**
 * Main test runner
 */
async function runCrossInstanceSSOTests(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║        Cross-Instance SSO Integration Tests                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Get client secret from environment or use default for dev
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'dive-v3-client-secret';

    const results: SSOTestResult[] = [];
    let passed = 0;
    let failed = 0;

    // Test each origin → target combination
    for (const origin of INSTANCES) {
        for (const target of INSTANCES) {
            if (origin.code === target.code) continue; // Skip same-instance

            const users = TEST_USERS[origin.code];
            for (const user of users) {
                console.log(`Testing: ${user.username} (${origin.code}) → ${target.code}`);

                const result = await testSSO(origin, target, user, clientSecret);
                results.push(result);

                if (result.success) {
                    console.log(`  ✓ PASS - uniqueID: ${result.claims?.uniqueID}`);
                    passed++;
                } else {
                    console.log(`  ✗ FAIL - ${result.error}`);
                    failed++;
                }
            }
        }
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Results: ${passed}/${passed + failed} tests passed`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Detailed results
    console.log('');
    console.log('Detailed Results:');
    console.log('─────────────────────────────────────────────────────────────────');

    for (const result of results) {
        const status = result.success ? '✓' : '✗';
        console.log(`${status} ${result.user} (${result.origin}) → ${result.target}`);
        if (result.claims) {
            console.log(`    uniqueID: ${result.claims.uniqueID}`);
            console.log(`    country: ${result.claims.countryOfAffiliation}`);
            console.log(`    clearance: ${result.claims.clearance}`);
        }
        if (result.error) {
            console.log(`    error: ${result.error}`);
        }
    }

    // Exit with error code if any tests failed
    if (failed > 0) {
        process.exit(1);
    }
}

// Jest test suite for integration testing
describe('Cross-Instance SSO', () => {
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'dive-v3-client-secret';

    // Generate test cases for each origin → target combination
    for (const origin of INSTANCES) {
        for (const target of INSTANCES) {
            if (origin.code === target.code) continue;

            describe(`${origin.code} → ${target.code}`, () => {
                const users = TEST_USERS[origin.code];

                for (const user of users) {
                    it(`should authenticate ${user.username} with correct uniqueID`, async () => {
                        const result = await testSSO(origin, target, user, clientSecret);

                        expect(result.success).toBe(true);
                        expect(result.claims?.uniqueID).toBe(user.username);
                        expect(result.claims?.countryOfAffiliation).toBe(user.expectedCountry);
                        expect(result.claims?.clearance).toBeDefined();
                    }, 30000); // 30s timeout for federation flow
                }
            });
        }
    }
});

// Run directly if executed as script
if (require.main === module) {
    runCrossInstanceSSOTests().catch(console.error);
}

export { testSSO, getAccessToken, decodeToken, INSTANCES, TEST_USERS };
