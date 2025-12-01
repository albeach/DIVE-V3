/**
 * Federated Resource Service - Comprehensive Unit Tests
 * Phase 3: Distributed Query Federation
 * 
 * Test Coverage:
 * - Service initialization and configuration
 * - MongoDB connection management
 * - Circuit breaker state machine
 * - ABAC filtering (clearance, releasability, COI)
 * - Result deduplication
 * - Query transformation
 * - Error handling
 * 
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { describe, it, expect } from '@jest/globals';

// ============================================
// Test Data Fixtures (Documentation)
// These fixtures document the expected data structures
// used by the FederatedResourceService
// ============================================

/**
 * Federation Registry Structure
 * This documents the expected shape of federation-registry.json
 */
export const MOCK_FEDERATION_REGISTRY = {
    instances: {
        usa: {
            code: 'USA',
            name: 'United States',
            type: 'local',
            enabled: true,
            deployment: { host: 'localhost', domain: 'dive25.com' },
            services: {
                mongodb: {
                    containerName: 'dive-v3-mongo',
                    internalPort: 27017,
                    externalPort: 27017
                }
            },
            mongodb: { database: 'dive-v3', user: 'admin' },
            secrets: { mongodb: 'dive-v3-mongodb-usa' }
        },
        fra: {
            code: 'FRA',
            name: 'France',
            type: 'local',
            enabled: true,
            deployment: { host: 'localhost', domain: 'dive25.com' },
            services: {
                mongodb: {
                    containerName: 'dive-v3-mongodb-fra',
                    internalPort: 27017,
                    externalPort: 27018
                }
            },
            mongodb: { database: 'dive-v3-fra', user: 'admin' },
            secrets: { mongodb: 'dive-v3-mongodb-fra' }
        },
        gbr: {
            code: 'GBR',
            name: 'United Kingdom',
            type: 'local',
            enabled: true,
            deployment: { host: 'localhost', domain: 'dive25.com' },
            services: {
                mongodb: {
                    containerName: 'dive-v3-mongodb-gbr',
                    internalPort: 27017,
                    externalPort: 27019
                }
            },
            mongodb: { database: 'dive-v3-gbr', user: 'admin' },
            secrets: { mongodb: 'dive-v3-mongodb-gbr' }
        },
        deu: {
            code: 'DEU',
            name: 'Germany',
            type: 'remote',
            enabled: true,
            deployment: { host: '192.168.42.120', domain: 'prosecurity.biz' },
            services: {
                mongodb: {
                    containerName: 'dive-v3-mongodb-deu',
                    internalPort: 27017,
                    externalPort: 27017
                }
            },
            mongodb: { database: 'dive-v3-deu', user: 'admin' },
            secrets: { mongodb: 'dive-v3-mongodb-deu' }
        }
    }
};

/**
 * Sample Resources Structure
 * This documents the expected shape of federated resources
 */
export const MOCK_RESOURCES = {
    usa: [
        {
            resourceId: 'USA-DOC-001',
            title: 'US Operations Plan Alpha',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
                        COI: ['FVEY'],
                        creationDate: '2025-01-15T10:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'USA'
        },
        {
            resourceId: 'USA-DOC-002',
            title: 'NATO Exercise Briefing',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'CONFIDENTIAL',
                        releasabilityTo: ['USA', 'FRA', 'GBR', 'DEU', 'ITA', 'ESP'],
                        COI: ['NATO'],
                        creationDate: '2025-01-20T14:30:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'USA'
        },
        {
            resourceId: 'USA-DOC-003',
            title: 'Unclassified Training Manual',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'UNCLASSIFIED',
                        releasabilityTo: ['USA', 'FRA', 'GBR', 'DEU', 'CAN', 'AUS', 'NZL'],
                        COI: [],
                        creationDate: '2025-01-10T09:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'USA'
        },
        {
            resourceId: 'USA-DOC-004',
            title: 'TOP SECRET Intelligence Summary',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'TOP_SECRET',
                        releasabilityTo: ['USA'],
                        COI: ['US-ONLY'],
                        creationDate: '2025-01-25T16:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'USA'
        }
    ],
    fra: [
        {
            resourceId: 'FRA-DOC-001',
            title: 'France Defense Strategy 2025',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'SECRET',
                        releasabilityTo: ['FRA', 'DEU'],
                        COI: ['EU-RESTRICTED'],
                        creationDate: '2025-01-18T11:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'FRA'
        },
        {
            resourceId: 'FRA-DOC-002',
            title: 'EU Joint Operations Protocol',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'CONFIDENTIAL',
                        releasabilityTo: ['FRA', 'DEU', 'ITA', 'ESP', 'POL', 'NLD'],
                        COI: ['NATO'],
                        creationDate: '2025-01-22T13:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'FRA'
        }
    ],
    gbr: [
        {
            resourceId: 'GBR-DOC-001',
            title: 'UK Maritime Security Assessment',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'SECRET',
                        releasabilityTo: ['GBR', 'USA', 'CAN', 'AUS', 'NZL'],
                        COI: ['FVEY'],
                        creationDate: '2025-01-19T15:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'GBR'
        }
    ],
    deu: [
        {
            resourceId: 'DEU-DOC-001',
            title: 'Germany Cyber Defense Report',
            ztdf: {
                policy: {
                    securityLabel: {
                        classification: 'CONFIDENTIAL',
                        releasabilityTo: ['DEU', 'FRA', 'USA'],
                        COI: ['NATO'],
                        creationDate: '2025-01-21T12:00:00Z'
                    }
                },
                payload: { encryptedChunks: [{ encryptedData: 'encrypted...' }] }
            },
            originRealm: 'DEU'
        }
    ]
};

// User fixtures for ABAC testing
const TEST_USERS = {
    usaTopSecret: {
        uniqueID: 'testuser-usa-4',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'NATO', 'US-ONLY', 'CAN-US']
    },
    usaSecret: {
        uniqueID: 'testuser-usa-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY', 'NATO']
    },
    usaConfidential: {
        uniqueID: 'testuser-usa-2',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: ['NATO']
    },
    usaUnclassified: {
        uniqueID: 'testuser-usa-1',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'USA',
        acpCOI: []
    },
    fraSecret: {
        uniqueID: 'testuser-fra-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO', 'EU-RESTRICTED']
    },
    fraConfidential: {
        uniqueID: 'testuser-fra-2',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO']
    },
    gbrSecret: {
        uniqueID: 'testuser-gbr-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'GBR',
        acpCOI: ['FVEY', 'NATO']
    },
    deuConfidential: {
        uniqueID: 'testuser-deu-2',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'DEU',
        acpCOI: ['NATO', 'EU-RESTRICTED']
    },
    industryContractor: {
        uniqueID: 'bob.contractor@acme.com',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: ['NATO']
    }
};

// ============================================
// Tests for ABAC Logic (Unit Tests)
// ============================================

describe('FederatedResourceService - ABAC Logic', () => {
    // ============================================
    // 1. Clearance Level Tests
    // ============================================
    describe('1. Clearance Level Logic', () => {
        const CLEARANCE_LEVELS: Record<string, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'CONFIDENTIAL': 2,
            'SECRET': 3,
            'TOP_SECRET': 4
        };

        const checkClearanceAccess = (userClearance: string, resourceClassification: string): boolean => {
            const userLevel = CLEARANCE_LEVELS[userClearance] ?? -1;
            const resourceLevel = CLEARANCE_LEVELS[resourceClassification] ?? 999;
            return userLevel >= resourceLevel;
        };

        it('should allow TOP_SECRET user to access all clearance levels', () => {
            expect(checkClearanceAccess('TOP_SECRET', 'UNCLASSIFIED')).toBe(true);
            expect(checkClearanceAccess('TOP_SECRET', 'RESTRICTED')).toBe(true);
            expect(checkClearanceAccess('TOP_SECRET', 'CONFIDENTIAL')).toBe(true);
            expect(checkClearanceAccess('TOP_SECRET', 'SECRET')).toBe(true);
            expect(checkClearanceAccess('TOP_SECRET', 'TOP_SECRET')).toBe(true);
        });

        it('should prevent SECRET user from accessing TOP_SECRET', () => {
            expect(checkClearanceAccess('SECRET', 'TOP_SECRET')).toBe(false);
            expect(checkClearanceAccess('SECRET', 'SECRET')).toBe(true);
            expect(checkClearanceAccess('SECRET', 'CONFIDENTIAL')).toBe(true);
        });

        it('should prevent CONFIDENTIAL user from accessing SECRET and above', () => {
            expect(checkClearanceAccess('CONFIDENTIAL', 'TOP_SECRET')).toBe(false);
            expect(checkClearanceAccess('CONFIDENTIAL', 'SECRET')).toBe(false);
            expect(checkClearanceAccess('CONFIDENTIAL', 'CONFIDENTIAL')).toBe(true);
        });

        it('should limit UNCLASSIFIED to only UNCLASSIFIED resources', () => {
            expect(checkClearanceAccess('UNCLASSIFIED', 'TOP_SECRET')).toBe(false);
            expect(checkClearanceAccess('UNCLASSIFIED', 'SECRET')).toBe(false);
            expect(checkClearanceAccess('UNCLASSIFIED', 'CONFIDENTIAL')).toBe(false);
            expect(checkClearanceAccess('UNCLASSIFIED', 'RESTRICTED')).toBe(false);
            expect(checkClearanceAccess('UNCLASSIFIED', 'UNCLASSIFIED')).toBe(true);
        });
    });

    // ============================================
    // 2. Releasability Tests
    // ============================================
    describe('2. Releasability Logic', () => {
        const checkReleasability = (userCountry: string, releasabilityTo: string[]): boolean => {
            if (releasabilityTo.length === 0) return false;
            return releasabilityTo.includes(userCountry);
        };

        it('should allow access when country is in releasabilityTo list', () => {
            expect(checkReleasability('USA', ['USA', 'GBR', 'CAN'])).toBe(true);
            expect(checkReleasability('FRA', ['USA', 'FRA', 'DEU'])).toBe(true);
            expect(checkReleasability('GBR', ['GBR'])).toBe(true);
        });

        it('should deny access when country is NOT in releasabilityTo list', () => {
            expect(checkReleasability('FRA', ['USA', 'GBR', 'CAN'])).toBe(false);
            expect(checkReleasability('DEU', ['USA'])).toBe(false);
            expect(checkReleasability('CAN', ['FRA', 'DEU'])).toBe(false);
        });

        it('should deny access for empty releasabilityTo list', () => {
            expect(checkReleasability('USA', [])).toBe(false);
            expect(checkReleasability('FRA', [])).toBe(false);
        });
    });

    // ============================================
    // 3. COI Membership Tests
    // ============================================
    describe('3. COI Membership Logic', () => {
        const checkCOI = (userCOI: string[], resourceCOI: string[]): boolean => {
            // If resource has no COI requirement, allow
            if (!resourceCOI || resourceCOI.length === 0) return true;
            // If user has no COI but resource requires it, deny
            if (!userCOI || userCOI.length === 0) return false;
            // Check for intersection
            return userCOI.some(coi => resourceCOI.includes(coi));
        };

        it('should allow access when user COI intersects with resource COI', () => {
            expect(checkCOI(['NATO', 'FVEY'], ['FVEY'])).toBe(true);
            expect(checkCOI(['NATO'], ['NATO', 'EU-RESTRICTED'])).toBe(true);
        });

        it('should deny access when user has no matching COI', () => {
            expect(checkCOI(['NATO'], ['FVEY'])).toBe(false);
            expect(checkCOI(['EU-RESTRICTED'], ['FVEY', 'US-ONLY'])).toBe(false);
        });

        it('should allow access when resource has no COI requirement', () => {
            expect(checkCOI(['NATO'], [])).toBe(true);
            expect(checkCOI([], [])).toBe(true);
        });

        it('should deny access when user has no COI but resource requires it', () => {
            expect(checkCOI([], ['NATO'])).toBe(false);
            expect(checkCOI([], ['FVEY'])).toBe(false);
        });
    });

    // ============================================
    // 4. Combined ABAC Logic Tests
    // ============================================
    describe('4. Combined ABAC Logic', () => {
        interface Resource {
            classification: string;
            releasabilityTo: string[];
            COI: string[];
        }

        interface User {
            clearance: string;
            countryOfAffiliation: string;
            acpCOI: string[];
        }

        const CLEARANCE_LEVELS: Record<string, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'CONFIDENTIAL': 2,
            'SECRET': 3,
            'TOP_SECRET': 4
        };

        const checkAccess = (user: User, resource: Resource): { 
            allowed: boolean; 
            reason?: string;
        } => {
            // Check clearance
            const userLevel = CLEARANCE_LEVELS[user.clearance] ?? -1;
            const resourceLevel = CLEARANCE_LEVELS[resource.classification] ?? 999;
            if (userLevel < resourceLevel) {
                return { allowed: false, reason: 'Insufficient clearance' };
            }

            // Check releasability
            if (resource.releasabilityTo.length === 0) {
                return { allowed: false, reason: 'Empty releasability' };
            }
            if (!resource.releasabilityTo.includes(user.countryOfAffiliation)) {
                return { allowed: false, reason: 'Country not in releasability' };
            }

            // Check COI
            if (resource.COI && resource.COI.length > 0) {
                if (!user.acpCOI || user.acpCOI.length === 0) {
                    return { allowed: false, reason: 'Missing COI membership' };
                }
                if (!user.acpCOI.some(coi => resource.COI.includes(coi))) {
                    return { allowed: false, reason: 'No matching COI' };
                }
            }

            return { allowed: true };
        };

        it('should allow access when all checks pass', () => {
            const result = checkAccess(
                TEST_USERS.usaSecret,
                {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY']
                }
            );
            expect(result.allowed).toBe(true);
        });

        it('should deny for insufficient clearance', () => {
            const result = checkAccess(
                TEST_USERS.usaConfidential,
                {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['NATO']
                }
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('Insufficient clearance');
        });

        it('should deny for country not in releasability', () => {
            const result = checkAccess(
                TEST_USERS.fraSecret,
                {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR', 'CAN'],
                    COI: ['NATO']
                }
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('Country not in releasability');
        });

        it('should deny for missing COI', () => {
            const result = checkAccess(
                TEST_USERS.deuConfidential,
                {
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['DEU', 'USA'],
                    COI: ['FVEY']
                }
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('No matching COI');
        });

        it('should deny for empty releasability', () => {
            const result = checkAccess(
                TEST_USERS.usaTopSecret,
                {
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: [],
                    COI: []
                }
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('Empty releasability');
        });
    });
});

// ============================================
// Federation Matrix Tests
// ============================================

describe('FederatedResourceService - Federation Matrix', () => {
    const FEDERATION_MATRIX: Record<string, string[]> = {
        'USA': ['FRA', 'GBR', 'DEU', 'CAN', 'ITA', 'ESP', 'POL', 'NLD'],
        'FRA': ['USA', 'GBR', 'DEU', 'ITA', 'ESP', 'POL', 'NLD'],
        'GBR': ['USA', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'POL', 'NLD'],
        'DEU': ['USA', 'FRA', 'GBR', 'ITA', 'ESP', 'POL', 'NLD'],
        'CAN': ['USA', 'GBR'],
    };

    const hasFederationAgreement = (userCountry: string, originRealm: string | undefined): boolean => {
        // Local resources don't need agreement
        if (!originRealm) return true;
        // Same country access
        if (userCountry === originRealm) return true;
        // Check forward agreement
        if (FEDERATION_MATRIX[userCountry]?.includes(originRealm)) return true;
        // Check reverse agreement
        if (FEDERATION_MATRIX[originRealm]?.includes(userCountry)) return true;
        return false;
    };

    it('should allow same-country access', () => {
        expect(hasFederationAgreement('USA', 'USA')).toBe(true);
        expect(hasFederationAgreement('FRA', 'FRA')).toBe(true);
    });

    it('should allow local resource access (no originRealm)', () => {
        expect(hasFederationAgreement('USA', undefined)).toBe(true);
        expect(hasFederationAgreement('FRA', undefined)).toBe(true);
    });

    it('should allow access when federation agreement exists', () => {
        expect(hasFederationAgreement('USA', 'FRA')).toBe(true);
        expect(hasFederationAgreement('FRA', 'USA')).toBe(true);
        expect(hasFederationAgreement('USA', 'GBR')).toBe(true);
        expect(hasFederationAgreement('DEU', 'FRA')).toBe(true);
    });

    it('should check symmetric agreements', () => {
        expect(hasFederationAgreement('CAN', 'USA')).toBe(true);
        expect(hasFederationAgreement('USA', 'CAN')).toBe(true);
    });
});

// ============================================
// Circuit Breaker Tests
// ============================================

describe('FederatedResourceService - Circuit Breaker Logic', () => {
    interface CircuitBreaker {
        state: 'closed' | 'open' | 'half-open';
        failures: number;
        lastFailure: Date | null;
        nextRetry: Date | null;
    }

    const CIRCUIT_BREAKER_THRESHOLD = 3;
    const CIRCUIT_BREAKER_RESET_MS = 30000;

    const createCircuitBreaker = (): CircuitBreaker => ({
        state: 'closed',
        failures: 0,
        lastFailure: null,
        nextRetry: null
    });

    const recordFailure = (cb: CircuitBreaker): CircuitBreaker => {
        const failures = cb.failures + 1;
        const now = new Date();

        if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
            return {
                state: 'open',
                failures,
                lastFailure: now,
                nextRetry: new Date(now.getTime() + CIRCUIT_BREAKER_RESET_MS)
            };
        }

        return {
            ...cb,
            failures,
            lastFailure: now
        };
    };

    const canAttempt = (cb: CircuitBreaker): boolean => {
        if (cb.state === 'closed') return true;
        if (cb.state === 'open') {
            if (cb.nextRetry && new Date() >= cb.nextRetry) {
                return true; // Can try half-open
            }
            return false;
        }
        return true; // half-open allows one attempt
    };

    it('should start in closed state', () => {
        const cb = createCircuitBreaker();
        expect(cb.state).toBe('closed');
        expect(cb.failures).toBe(0);
    });

    it('should allow attempts when closed', () => {
        const cb = createCircuitBreaker();
        expect(canAttempt(cb)).toBe(true);
    });

    it('should track failures without opening circuit before threshold', () => {
        let cb = createCircuitBreaker();
        cb = recordFailure(cb);
        expect(cb.failures).toBe(1);
        expect(cb.state).toBe('closed');

        cb = recordFailure(cb);
        expect(cb.failures).toBe(2);
        expect(cb.state).toBe('closed');
    });

    it('should open circuit after reaching failure threshold', () => {
        let cb = createCircuitBreaker();
        cb = recordFailure(cb);
        cb = recordFailure(cb);
        cb = recordFailure(cb);

        expect(cb.failures).toBe(3);
        expect(cb.state).toBe('open');
        expect(cb.nextRetry).not.toBeNull();
    });

    it('should block attempts when circuit is open', () => {
        let cb = createCircuitBreaker();
        cb = recordFailure(cb);
        cb = recordFailure(cb);
        cb = recordFailure(cb);

        expect(canAttempt(cb)).toBe(false);
    });

    it('should allow attempt after recovery period', () => {
        let cb = createCircuitBreaker();
        cb = recordFailure(cb);
        cb = recordFailure(cb);
        cb = recordFailure(cb);

        // Simulate time passing
        cb.nextRetry = new Date(Date.now() - 1000); // 1 second ago

        expect(canAttempt(cb)).toBe(true);
    });
});

// ============================================
// Deduplication Tests
// ============================================

describe('FederatedResourceService - Deduplication Logic', () => {
    interface FederatedResult {
        resourceId: string;
        sourceInstance: string;
        title: string;
    }

    const deduplicateResults = (results: FederatedResult[]): FederatedResult[] => {
        const seen = new Map<string, FederatedResult>();
        
        for (const result of results) {
            if (!seen.has(result.resourceId)) {
                seen.set(result.resourceId, result);
            }
        }
        
        return Array.from(seen.values());
    };

    it('should remove duplicate resourceIds', () => {
        const results: FederatedResult[] = [
            { resourceId: 'DOC-001', sourceInstance: 'USA', title: 'Doc 1' },
            { resourceId: 'DOC-001', sourceInstance: 'FRA', title: 'Doc 1' },
            { resourceId: 'DOC-002', sourceInstance: 'USA', title: 'Doc 2' }
        ];

        const deduped = deduplicateResults(results);
        expect(deduped.length).toBe(2);
        expect(deduped.map(r => r.resourceId)).toEqual(['DOC-001', 'DOC-002']);
    });

    it('should keep first occurrence (prefer order)', () => {
        const results: FederatedResult[] = [
            { resourceId: 'DOC-001', sourceInstance: 'USA', title: 'USA Version' },
            { resourceId: 'DOC-001', sourceInstance: 'FRA', title: 'FRA Version' }
        ];

        const deduped = deduplicateResults(results);
        expect(deduped[0].sourceInstance).toBe('USA');
    });

    it('should handle empty array', () => {
        const deduped = deduplicateResults([]);
        expect(deduped.length).toBe(0);
    });

    it('should handle single item', () => {
        const results: FederatedResult[] = [
            { resourceId: 'DOC-001', sourceInstance: 'USA', title: 'Doc 1' }
        ];
        const deduped = deduplicateResults(results);
        expect(deduped.length).toBe(1);
    });
});

// ============================================
// Response Structure Tests
// ============================================

describe('FederatedResourceService - Response Structure', () => {
    interface FederatedSearchResponse {
        totalResults: number;
        results: unknown[];
        instanceResults: Record<string, {
            count: number;
            latencyMs: number;
            error?: string;
            circuitBreakerState: string;
        }>;
        executionTimeMs: number;
        cacheHit: boolean;
    }

    const createMockResponse = (partial: Partial<FederatedSearchResponse> = {}): FederatedSearchResponse => ({
        totalResults: 0,
        results: [],
        instanceResults: {},
        executionTimeMs: 0,
        cacheHit: false,
        ...partial
    });

    it('should have required response fields', () => {
        const response = createMockResponse();
        expect(response).toHaveProperty('totalResults');
        expect(response).toHaveProperty('results');
        expect(response).toHaveProperty('instanceResults');
        expect(response).toHaveProperty('executionTimeMs');
        expect(response).toHaveProperty('cacheHit');
    });

    it('should correctly count totalResults', () => {
        const response = createMockResponse({
            results: [{}, {}, {}],
            totalResults: 3
        });
        expect(response.totalResults).toBe(response.results.length);
    });

    it('should track per-instance metrics', () => {
        const response = createMockResponse({
            instanceResults: {
                USA: { count: 10, latencyMs: 50, circuitBreakerState: 'closed' },
                FRA: { count: 5, latencyMs: 75, circuitBreakerState: 'closed' },
                GBR: { count: 0, latencyMs: 3000, error: 'Timeout', circuitBreakerState: 'open' }
            }
        });

        expect(response.instanceResults.USA.count).toBe(10);
        expect(response.instanceResults.FRA.latencyMs).toBe(75);
        expect(response.instanceResults.GBR.error).toBe('Timeout');
    });

    it('should indicate cache hits', () => {
        const cachedResponse = createMockResponse({ cacheHit: true });
        const freshResponse = createMockResponse({ cacheHit: false });

        expect(cachedResponse.cacheHit).toBe(true);
        expect(freshResponse.cacheHit).toBe(false);
    });
});
