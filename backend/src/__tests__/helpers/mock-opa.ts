/**
 * Mock OPA Response Utilities for Testing
 * Provides helper functions to create mock OPA authorization decisions
 */

/**
 * OPA Input structure
 */
export interface IOPAInput {
    input: {
        subject: {
            authenticated: boolean;
            uniqueID: string;
            clearance?: string;
            countryOfAffiliation?: string;
            acpCOI?: string[];
        };
        action: {
            operation: string;
        };
        resource: {
            resourceId: string;
            classification?: string;
            releasabilityTo?: string[];
            COI?: string[];
            creationDate?: string;
            encrypted?: boolean;
        };
        context: {
            currentTime: string;
            sourceIP: string;
            deviceCompliant: boolean;
            requestId: string;
        };
    };
}

/**
 * OPA Decision structure
 */
export interface IOPADecision {
    result: {
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
    };
}

/**
 * Create a mock OPA ALLOW decision
 */
export function mockOPAAllow(
    reason: string = 'All conditions satisfied',
    obligations: Array<{ type: string; resourceId?: string }> = []
): IOPADecision {
    return {
        result: {
            allow: true,
            reason,
            obligations: obligations.length > 0 ? obligations : undefined,
            evaluation_details: {
                clearance_check: 'PASS',
                releasability_check: 'PASS',
                coi_check: 'PASS',
                embargo_check: 'PASS'
            }
        }
    };
}

/**
 * Create a mock OPA DENY decision
 */
export function mockOPADeny(
    reason: string,
    evaluation_details: Record<string, unknown> = {}
): IOPADecision {
    return {
        result: {
            allow: false,
            reason,
            evaluation_details: {
                clearance_check: 'FAIL',
                releasability_check: 'PASS',
                coi_check: 'PASS',
                embargo_check: 'PASS',
                ...evaluation_details
            }
        }
    };
}

/**
 * Create an OPA DENY due to insufficient clearance
 */
export function mockOPADenyInsufficientClearance(
    userClearance: string,
    requiredClearance: string
): IOPADecision {
    return mockOPADeny(
        `Insufficient clearance: user has ${userClearance}, resource requires ${requiredClearance}`,
        {
            clearance_check: 'FAIL',
            user_clearance: userClearance,
            required_clearance: requiredClearance
        }
    );
}

/**
 * Create an OPA DENY due to releasability restriction
 */
export function mockOPADenyReleasability(
    userCountry: string,
    allowedCountries: string[]
): IOPADecision {
    return mockOPADeny(
        `Country ${userCountry} not in releasabilityTo: [${allowedCountries.join(', ')}]`,
        {
            clearance_check: 'PASS',
            releasability_check: 'FAIL',
            user_country: userCountry,
            allowed_countries: allowedCountries
        }
    );
}

/**
 * Create an OPA DENY due to COI restriction
 */
export function mockOPADenyCOI(
    userCOI: string[],
    requiredCOI: string[]
): IOPADecision {
    return mockOPADeny(
        `User COI [${userCOI.join(', ')}] does not intersect with resource COI [${requiredCOI.join(', ')}]`,
        {
            clearance_check: 'PASS',
            releasability_check: 'PASS',
            coi_check: 'FAIL',
            user_coi: userCOI,
            required_coi: requiredCOI
        }
    );
}

/**
 * Create an OPA DENY due to embargo (creation date too recent)
 */
export function mockOPADenyEmbargo(
    creationDate: string,
    currentTime: string
): IOPADecision {
    return mockOPADeny(
        'Resource embargo period not yet passed (requires 24h)',
        {
            clearance_check: 'PASS',
            releasability_check: 'PASS',
            coi_check: 'PASS',
            embargo_check: 'FAIL',
            creation_date: creationDate,
            current_time: currentTime
        }
    );
}

/**
 * Create an OPA ALLOW with KAS obligation
 */
export function mockOPAAllowWithKASObligation(resourceId: string): IOPADecision {
    return mockOPAAllow(
        'Access granted with KAS key retrieval required',
        [
            {
                type: 'fetch-key',
                resourceId
            }
        ]
    );
}

/**
 * Create a mock OPA error response (service unavailable)
 */
export function mockOPAError(): Error {
    const error = new Error('Authorization service unavailable');
    (error as any).code = 'ECONNREFUSED';
    return error;
}

/**
 * Create a mock OPA timeout error
 */
export function mockOPATimeout(): Error {
    const error = new Error('OPA request timeout');
    (error as any).code = 'ETIMEDOUT';
    return error;
}

/**
 * Helper to create OPA input for testing
 */
export function createOPAInput(params: {
    uniqueID: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    resourceId: string;
    classification?: string;
    releasabilityTo?: string[];
    COI?: string[];
    creationDate?: string;
}): IOPAInput {
    return {
        input: {
            subject: {
                authenticated: true,
                uniqueID: params.uniqueID,
                clearance: params.clearance || 'SECRET',
                countryOfAffiliation: params.countryOfAffiliation || 'USA',
                acpCOI: params.acpCOI || ['FVEY']
            },
            action: {
                operation: 'view'
            },
            resource: {
                resourceId: params.resourceId,
                classification: params.classification || 'SECRET',
                releasabilityTo: params.releasabilityTo || ['USA', 'GBR', 'CAN'],
                COI: params.COI || ['FVEY'],
                creationDate: params.creationDate,
                encrypted: true
            },
            context: {
                currentTime: new Date().toISOString(),
                sourceIP: '127.0.0.1',
                deviceCompliant: true,
                requestId: `test-req-${Date.now()}`
            }
        }
    };
}



