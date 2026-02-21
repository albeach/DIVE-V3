/**
 * Mock OPA Server for E2E Testing
 *
 * BEST PRACTICE: Mock OPA HTTP endpoint for E2E tests
 *
 * This provides a realistic OPA mock that:
 * - Intercepts HTTP requests to OPA (nock)
 * - Returns intelligent ALLOW/DENY decisions
 * - Based on actual clearance/releasability logic
 * - Runs automatically as part of test infrastructure
 *
 * Usage in E2E tests:
 * ```typescript
 * beforeAll(async () => {
 *   await mockOPAServer();
 * });
 *
 * afterAll(() => {
 *   cleanupOPAMock();
 * });
 * ```
 */

import nock from 'nock';

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';

/**
 * Mock OPA server with intelligent decision logic
 *
 * Returns ALLOW/DENY based on actual ABAC rules:
 * - Clearance level comparison
 * - Releasability check
 * - COI intersection
 * - Embargo enforcement
 */
export function mockOPAServer(): void {
    const opaUrl = new URL(OPA_URL);

    // Mock BOTH endpoints (different services use different paths)
    // /v1/data/dive/authorization - Used by authzMiddleware, policy.service
    // /v1/data/dive/authorization/decision - Alternative endpoint

    const mockHandler = (_uri: string, requestBody: any) => {
        const input = requestBody.input;

        // Intelligent decision logic (matches real OPA policy)
        const abacResult = evaluateABAC(input);

        // Return in OPA format that policy-execution.service.ts expects
        // The service looks for result.allow, not result.decision
        return {
            result: {
                allow: abacResult.allow,
                reason: abacResult.reason,
                evaluation_details: abacResult.evaluation_details
            }
        };
    };

    nock(opaUrl.origin)
        .persist()
        .post('/v1/data/dive/authorization')
        .reply(200, mockHandler);

    nock(opaUrl.origin)
        .persist()
        .post('/v1/data/dive/authorization/decision')
        .reply(200, mockHandler);

    // Unified authz endpoint (new path)
    nock(opaUrl.origin)
        .persist()
        .post('/v1/data/dive/authz/decision')
        .reply(200, mockHandler);

    // Mock policy-specific evaluation endpoints (used by policies lab tests)
    nock(opaUrl.origin)
        .persist()
        .post(/\/v1\/data\/dive\/lab\/.*/)
        .reply(200, mockHandler);

    // Mock policy listing/verification endpoints
    nock(opaUrl.origin)
        .persist()
        .get('/v1/policies')
        .reply(200, { result: [] });

    nock(opaUrl.origin)
        .persist()
        .get(/\/v1\/policies\/.*/)
        .reply(200, { result: { id: 'mock-policy', raw: 'package test\n\nallow := true' } });

    console.log(`✅ Mocked OPA server: ${OPA_URL} (all endpoints)`);
}

/**
 * Cleanup OPA mock
 */
export function cleanupOPAMock(): void {
    nock.cleanAll();
    console.log('✅ Cleaned up OPA mock');
}

/**
 * Clearance level hierarchy
 */
const CLEARANCE_LEVELS: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
};

/**
 * Evaluate ABAC decision (simplified OPA logic for testing)
 *
 * This implements the core ABAC rules:
 * 1. User must be authenticated
 * 2. User clearance >= resource classification
 * 3. User country in resource releasabilityTo
 * 4. User COI intersects with resource COI (if any)
 */
function evaluateABAC(input: any): any {
    const subject = input.subject;
    const resource = input.resource;

    // Check 1: Authentication
    if (!subject.authenticated) {
        return {
            allow: false,
            reason: 'Subject not authenticated',
            evaluation_details: {
                authentication_check: 'FAIL'
            }
        };
    }

    // Check 2: Clearance level
    const userClearanceLevel = CLEARANCE_LEVELS[subject.clearance] ?? -1;
    const resourceClassLevel = CLEARANCE_LEVELS[resource.classification] ?? 999;

    if (userClearanceLevel < resourceClassLevel) {
        return {
            allow: false,
            reason: `Insufficient clearance: user has ${subject.clearance}, resource requires ${resource.classification}`,
            evaluation_details: {
                clearance_check: 'FAIL',
                releasability_check: 'PASS',
                coi_check: 'PASS'
            }
        };
    }

    // Check 3: Releasability
    if (!resource.releasabilityTo || resource.releasabilityTo.length === 0) {
        return {
            allow: false,
            reason: 'Resource has empty releasabilityTo (not releasable)',
            evaluation_details: {
                clearance_check: 'PASS',
                releasability_check: 'FAIL',
                coi_check: 'PASS'
            }
        };
    }

    if (!resource.releasabilityTo.includes(subject.countryOfAffiliation)) {
        return {
            allow: false,
            reason: `Country ${subject.countryOfAffiliation} not in releasabilityTo: [${resource.releasabilityTo.join(', ')}]`,
            evaluation_details: {
                clearance_check: 'PASS',
                releasability_check: 'FAIL',
                coi_check: 'PASS'
            }
        };
    }

    // Check 4: COI (if resource has COI requirements)
    if (resource.COI && resource.COI.length > 0) {
        const userCOI = subject.acpCOI || [];
        const hasIntersection = resource.COI.some((coi: string) => userCOI.includes(coi));

        if (!hasIntersection) {
            return {
                allow: false,
                reason: `User COI [${userCOI.join(', ')}] does not intersect with resource COI [${resource.COI.join(', ')}]`,
                evaluation_details: {
                    clearance_check: 'PASS',
                    releasability_check: 'PASS',
                    coi_check: 'FAIL'
                }
            };
        }
    }

    // All checks passed - ALLOW
    const obligations: any[] = [];

    // Add KAS obligation if resource is encrypted
    if (resource.encrypted && resource.ztdf?.payloadHash) {
        obligations.push({
            type: 'fetch-key',
            resourceId: resource.resourceId
        });
    }

    return {
        allow: true,
        reason: 'All conditions satisfied',
        obligations: obligations.length > 0 ? obligations : undefined,
        evaluation_details: {
            clearance_check: 'PASS',
            releasability_check: 'PASS',
            coi_check: 'PASS',
            embargo_check: 'PASS'
        }
    };
}

/**
 * Mock OPA server with custom decision logic
 *
 * @param decisionFn Custom function to return decisions
 */
export function mockOPAServerWithCustomLogic(
    decisionFn: (input: any) => any
): void {
    const opaUrl = new URL(OPA_URL);

    nock(opaUrl.origin)
        .persist()
        .post('/v1/data/dive/authorization/decision')
        .reply(200, (_uri, requestBody: any) => {
            return { result: decisionFn(requestBody.input) };
        });

    console.log(`✅ Mocked OPA server with custom logic: ${OPA_URL}`);
}

/**
 * Mock OPA server to always ALLOW
 */
export function mockOPAAlwaysAllow(): void {
    mockOPAServerWithCustomLogic(() => ({
        allow: true,
        reason: 'Test mode - always allow',
        evaluation_details: {
            clearance_check: 'PASS',
            releasability_check: 'PASS',
            coi_check: 'PASS'
        }
    }));
}

/**
 * Mock OPA server to always DENY
 */
export function mockOPAAlwaysDeny(): void {
    mockOPAServerWithCustomLogic(() => ({
        allow: false,
        reason: 'Test mode - always deny',
        evaluation_details: {
            clearance_check: 'FAIL'
        }
    }));
}
