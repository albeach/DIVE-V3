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
    countryOfAffiliation?: string;
    acpCOI?: string[];
    iss?: string;
    exp?: number;
    iat?: number;
}

/**
 * Default test secret (matches setup.ts configuration)
 */
const TEST_SECRET = 'test-secret';

/**
 * Default issuer (Keycloak realm)
 */
const DEFAULT_ISSUER = 'http://localhost:8081/realms/dive-v3-pilot';

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
        exp: now + 3600, // Expires in 1 hour
        iat: now
    };

    return jwt.sign({ ...defaultClaims, ...claims }, secret, { algorithm: 'HS256' });
}

/**
 * Create a JWT for a U.S. user with SECRET clearance
 */
export function createUSUserJWT(overrides: Partial<IJWTPayload> = {}): string {
    return createMockJWT({
        sub: 'testuser-us',
        uniqueID: 'testuser-us',
        email: 'testuser@example.mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
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

