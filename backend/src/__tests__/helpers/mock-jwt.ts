/**
 * Mock JWT Utilities for Testing
 * Provides helper functions to create valid JWT tokens for test scenarios
 */

import jwt from 'jsonwebtoken';

/**
 * JWT payload interface (matches Keycloak token structure)
 */
export interface IJWTPayload {
    sub?: string;
    uniqueID?: string;
    email?: string;
    preferred_username?: string;
    clearance?: string;
    clearanceOriginal?: string;        // ACP-240 Section 4.3: Original national clearance
    clearanceCountry?: string;         // ACP-240 Section 4.3: Country that issued clearance
    countryOfAffiliation?: string;
    acpCOI?: string[];
    dutyOrg?: string;                  // Gap #4: User's duty organization
    orgUnit?: string;                  // Gap #4: User's organizational unit
    iss?: string;
    exp?: number;
    iat?: number;
    // AAL2/FAL2 claims
    aud?: string | string[];
    // Phase 1: Support both numeric (new) and URN (legacy) ACR formats during migration
    acr?: string | number;             // Numeric (0,1,2) or URN (urn:mace:incommon:iap:silver)
    // Phase 1: Support both array (new) and JSON string (legacy) AMR formats during migration
    amr?: string[] | string;           // Array ["pwd","otp"] or JSON string "[\"pwd\",\"otp\"]"
    auth_time?: number;
}

/**
 * Default test secret (matches setup.ts configuration)
 */
const TEST_SECRET = 'test-secret';

/**
 * Default issuer (Keycloak realm)
 */
const DEFAULT_ISSUER = 'http://localhost:8081/realms/dive-v3-broker';

/**
 * Create a mock JWT token with custom claims
 * @param claims Custom claims to include in the token
 * @param secret Signing secret (defaults to test secret)
 * @returns Signed JWT token string
 */
export function createMockJWT(claims: Partial<IJWTPayload> = {}, secret: string = TEST_SECRET): string {
    const now = Math.floor(Date.now() / 1000);

    const defaultClaims: IJWTPayload = {
        sub: 'testuser-us',
        uniqueID: 'testuser-us',
        email: 'testuser@example.mil',
        preferred_username: 'testuser-us',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        iss: DEFAULT_ISSUER,
        aud: 'dive-v3-client',  // AAL2/FAL2: Default audience
        exp: now + 3600, // Expires in 1 hour
        iat: now,
        // AAL2/FAL2 defaults
        acr: 'urn:mace:incommon:iap:silver',  // Default to AAL2
        amr: ['pwd', 'otp'],  // Default to MFA
        auth_time: now
    };

    return jwt.sign({ ...defaultClaims, ...claims }, secret, { algorithm: 'HS256' });
}

/**
 * Create a JWT for a U.S. user with SECRET clearance (or override)
 */
export function createUSUserJWT(overrides: Partial<IJWTPayload> = {}): string {
    return createMockJWT({
        sub: 'testuser-us',
        uniqueID: 'testuser-us',
        email: 'testuser@example.mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        aud: 'dive-v3-client',  // Ensure audience is always included
        acr: 'urn:mace:incommon:iap:silver',
        amr: ['pwd', 'otp'],
        ...overrides
    });
}

/**
 * Create a JWT for a French user with CONFIDENTIAL clearance
 */
export function createFrenchUserJWT(overrides: Partial<IJWTPayload> = {}): string {
    return createMockJWT({
        sub: 'testuser-fra',
        uniqueID: 'testuser-fra',
        email: 'testuser@gouv.fr',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO-COSMIC'],
        ...overrides
    });
}

/**
 * Create a JWT for a Canadian user with TOP_SECRET clearance
 */
export function createCanadianUserJWT(overrides: Partial<IJWTPayload> = {}): string {
    return createMockJWT({
        sub: 'testuser-can',
        uniqueID: 'testuser-can',
        email: 'testuser@gc.ca',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'CAN',
        acpCOI: ['FVEY'],
        ...overrides
    });
}

/**
 * Create a JWT for an industry contractor with UNCLASSIFIED clearance
 */
export function createContractorJWT(overrides: Partial<IJWTPayload> = {}): string {
    return createMockJWT({
        sub: 'bob.contractor',
        uniqueID: 'bob.contractor',
        email: 'bob@contractor.com',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'USA',
        acpCOI: [],
        ...overrides
    });
}

/**
 * Create an expired JWT token
 */
export function createExpiredJWT(claims: Partial<IJWTPayload> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    return createMockJWT({
        ...claims,
        exp: now - 3600, // Expired 1 hour ago
        iat: now - 7200
    });
}

/**
 * Create a JWT with missing required claims
 */
export function createInvalidJWT(missingClaims: string[] = ['clearance']): string {
    const claims: any = {
        sub: 'testuser',
        uniqueID: 'testuser',
        email: 'testuser@example.mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY']
    };

    // Remove specified claims
    missingClaims.forEach(claim => {
        delete claims[claim];
    });

    return createMockJWT(claims);
}

/**
 * Create a JWT with invalid issuer
 */
export function createJWTWithInvalidIssuer(): string {
    return createMockJWT({
        iss: 'http://evil-keycloak.com/realms/fake'
    });
}

/**
 * Decode JWT without verification (for testing)
 */
export function decodeJWT(token: string): IJWTPayload {
    return jwt.decode(token) as IJWTPayload;
}

/**
 * Verify JWT with test secret
 */
export function verifyTestJWT(token: string): IJWTPayload {
    return jwt.verify(token, TEST_SECRET) as IJWTPayload;
}

/**
 * Alias for createMockJWT (backward compatibility with E2E tests)
 * @param claims Custom claims to include in the token
 * @param secret Signing secret (defaults to test secret)
 * @returns Signed JWT token string
 */
export function generateTestJWT(claims: Partial<IJWTPayload> = {}, secret: string = TEST_SECRET): Promise<string> {
    return Promise.resolve(createMockJWT(claims, secret));
}


