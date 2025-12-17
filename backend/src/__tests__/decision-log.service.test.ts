/**
 * Decision Log Service Test Suite - Phase 3
 * 
 * Tests the decision logging service for:
 * - Logging decisions to MongoDB
 * - Query functionality
 * - Statistics aggregation
 * - TTL index creation
 * - PII minimization
 * 
 * Last Updated: October 29, 2025 (Phase 3)
 */

import { decisionLogService, IDecisionLog, IKeyReleaseLog } from '../services/decision-log.service';
import { MongoClient } from 'mongodb';
import { getTestMongoDatabase, getTestMongoUri } from './helpers/test-mongo-uri';

const MONGODB_URI = getTestMongoUri();
const TEST_DB = getTestMongoDatabase();

// Temporarily skip this test - creates own MongoDB connection causing CI conflicts
describe.skip('Decision Log Service', () => {
    let mongoClient: MongoClient;

    beforeAll(async () => {
        // Connect to test database
        mongoClient = await MongoClient.connect(MONGODB_URI);
        const db = mongoClient.db(TEST_DB);

        // Clear existing test data
        await db.collection('decisions').deleteMany({});
    }, 30000);

    afterAll(async () => {
        // Clean up
        await mongoClient.close();
        await decisionLogService.close();
    });

    describe('logDecision', () => {
        it('should log ALLOW decision to MongoDB', async () => {
            const decision: IDecisionLog = {
                timestamp: new Date().toISOString(),
                requestId: 'test-req-001',
                subject: {
                    uniqueID: 'alice.general@af.mil',
                    clearance: 'SECRET',
                    clearanceOriginal: 'SECRET',
                    clearanceCountry: 'USA',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['NATO-COSMIC']
                },
                resource: {
                    resourceId: 'doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['NATO-COSMIC']
                },
                action: {
                    operation: 'view'
                },
                decision: 'ALLOW',
                reason: 'All conditions satisfied',
                latency_ms: 45,
                context: {
                    sourceIP: '192.168.1.1',
                    acr: 'AAL2',
                    amr: ['pwd', 'otp']
                }
            };

            await decisionLogService.logDecision(decision);

            // Verify it was stored
            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('decisions').findOne({
                requestId: 'test-req-001'
            });

            expect(stored).toBeDefined();
            expect(stored?.decision).toBe('ALLOW');
            expect(stored?.subject.uniqueID).toBe('alice.general@af.mil');
        });

        it('should log DENY decision with reason', async () => {
            const decision: IDecisionLog = {
                timestamp: new Date().toISOString(),
                requestId: 'test-req-002',
                subject: {
                    uniqueID: 'bob.contractor@mil',
                    clearance: 'UNCLASSIFIED',
                    clearanceOriginal: 'UNCLASSIFIED',
                    clearanceCountry: 'USA',
                    countryOfAffiliation: 'USA',
                    acpCOI: []
                },
                resource: {
                    resourceId: 'doc-secret-001',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: []
                },
                action: {
                    operation: 'view'
                },
                decision: 'DENY',
                reason: 'Insufficient clearance: UNCLASSIFIED < SECRET',
                latency_ms: 38,
                context: {
                    sourceIP: '192.168.1.2',
                    acr: 'AAL1',
                    amr: ['pwd']
                }
            };

            await decisionLogService.logDecision(decision);

            // Verify it was stored
            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('decisions').findOne({
                requestId: 'test-req-002'
            });

            expect(stored).toBeDefined();
            expect(stored?.decision).toBe('DENY');
            expect(stored?.reason).toContain('Insufficient clearance');
        });

        it('should handle clearanceOriginal attribute (Phase 3)', async () => {
            const decision: IDecisionLog = {
                timestamp: new Date().toISOString(),
                requestId: 'test-req-003',
                subject: {
                    uniqueID: 'carlos.garcia@mil.es',
                    clearance: 'SECRET',
                    clearanceOriginal: 'SECRETO',  // Spanish original clearance
                    clearanceCountry: 'ESP',
                    countryOfAffiliation: 'ESP',
                    acpCOI: ['NATO-COSMIC']
                },
                resource: {
                    resourceId: 'doc-esp-001',
                    classification: 'SECRET',
                    originalClassification: 'SECRETO',
                    originalCountry: 'ESP',
                    releasabilityTo: ['ESP'],
                    COI: ['NATO-COSMIC']
                },
                action: {
                    operation: 'view'
                },
                decision: 'ALLOW',
                reason: 'All conditions satisfied',
                latency_ms: 42,
                context: {
                    sourceIP: '192.168.1.3',
                    acr: 'AAL2',
                    amr: ['pwd', 'otp']
                }
            };

            await decisionLogService.logDecision(decision);

            // Verify clearanceOriginal was stored
            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('decisions').findOne({
                requestId: 'test-req-003'
            });

            expect(stored).toBeDefined();
            expect(stored?.subject.clearanceOriginal).toBe('SECRETO');
            expect(stored?.subject.clearanceCountry).toBe('ESP');
            expect(stored?.resource.originalClassification).toBe('SECRETO');
            expect(stored?.resource.originalCountry).toBe('ESP');
        });
    });

    describe('queryDecisions', () => {
        beforeAll(async () => {
            // Insert test decisions
            const decisions: IDecisionLog[] = [
                {
                    timestamp: new Date('2025-10-29T10:00:00Z').toISOString(),
                    requestId: 'query-test-001',
                    subject: { uniqueID: 'alice.general@af.mil', clearance: 'SECRET', countryOfAffiliation: 'USA' },
                    resource: { resourceId: 'doc-001', classification: 'SECRET' },
                    action: { operation: 'view' },
                    decision: 'ALLOW',
                    reason: 'All conditions satisfied',
                    latency_ms: 45,
                    context: { sourceIP: '192.168.1.1' }
                },
                {
                    timestamp: new Date('2025-10-29T11:00:00Z').toISOString(),
                    requestId: 'query-test-002',
                    subject: { uniqueID: 'bob.contractor@mil', clearance: 'UNCLASSIFIED', countryOfAffiliation: 'USA' },
                    resource: { resourceId: 'doc-001', classification: 'SECRET' },
                    action: { operation: 'view' },
                    decision: 'DENY',
                    reason: 'Insufficient clearance',
                    latency_ms: 38,
                    context: { sourceIP: '192.168.1.2' }
                },
                {
                    timestamp: new Date('2025-10-29T12:00:00Z').toISOString(),
                    requestId: 'query-test-003',
                    subject: { uniqueID: 'alice.general@af.mil', clearance: 'SECRET', countryOfAffiliation: 'USA' },
                    resource: { resourceId: 'doc-002', classification: 'CONFIDENTIAL' },
                    action: { operation: 'view' },
                    decision: 'ALLOW',
                    reason: 'All conditions satisfied',
                    latency_ms: 40,
                    context: { sourceIP: '192.168.1.1' }
                }
            ];

            for (const decision of decisions) {
                await decisionLogService.logDecision(decision);
            }
        });

        it('should query decisions by subject', async () => {
            const results = await decisionLogService.queryDecisions({
                subject: 'alice.general@af.mil',
                limit: 10
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.subject.uniqueID === 'alice.general@af.mil')).toBe(true);
        });

        it('should query decisions by resource', async () => {
            const results = await decisionLogService.queryDecisions({
                resourceId: 'doc-001',
                limit: 10
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.resource.resourceId === 'doc-001')).toBe(true);
        });

        it('should query decisions by decision type (ALLOW)', async () => {
            const results = await decisionLogService.queryDecisions({
                decision: 'ALLOW',
                limit: 10
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.decision === 'ALLOW')).toBe(true);
        });

        it('should query decisions by decision type (DENY)', async () => {
            const results = await decisionLogService.queryDecisions({
                decision: 'DENY',
                limit: 10
            });

            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.every(r => r.decision === 'DENY')).toBe(true);
        });

        it('should query decisions by time range', async () => {
            const results = await decisionLogService.queryDecisions({
                startTime: new Date('2025-10-29T10:30:00Z'),
                endTime: new Date('2025-10-29T12:30:00Z'),
                limit: 10
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('should support pagination with limit and skip', async () => {
            const page1 = await decisionLogService.queryDecisions({
                limit: 1,
                skip: 0
            });

            const page2 = await decisionLogService.queryDecisions({
                limit: 1,
                skip: 1
            });

            expect(page1.length).toBe(1);
            expect(page2.length).toBe(1);
            expect(page1[0].requestId).not.toBe(page2[0].requestId);
        });
    });

    describe('getStatistics', () => {
        it('should calculate decision statistics', async () => {
            const stats = await decisionLogService.getStatistics();

            expect(stats.totalDecisions).toBeGreaterThan(0);
            expect(stats.allowCount).toBeGreaterThan(0);
            expect(stats.denyCount).toBeGreaterThan(0);
            expect(stats.averageLatency).toBeGreaterThan(0);
            expect(stats.topDenyReasons).toBeDefined();
            expect(Array.isArray(stats.topDenyReasons)).toBe(true);
            expect(stats.decisionsByCountry).toBeDefined();
        });

        it('should calculate statistics for date range', async () => {
            const stats = await decisionLogService.getStatistics(
                new Date('2025-10-29T10:00:00Z'),
                new Date('2025-10-29T13:00:00Z')
            );

            expect(stats.totalDecisions).toBeGreaterThan(0);
            expect(stats.allowCount + stats.denyCount).toBe(stats.totalDecisions);
        });

        it('should include top deny reasons', async () => {
            const stats = await decisionLogService.getStatistics();

            expect(stats.topDenyReasons.length).toBeGreaterThan(0);
            expect(stats.topDenyReasons[0]).toHaveProperty('reason');
            expect(stats.topDenyReasons[0]).toHaveProperty('count');
        });

        it('should include decisions by country', async () => {
            const stats = await decisionLogService.getStatistics();

            expect(stats.decisionsByCountry).toBeDefined();
            expect(stats.decisionsByCountry['USA']).toBeGreaterThan(0);
        });
    });

    describe('PII Minimization', () => {
        it('should only store uniqueID, not full names or emails', async () => {
            const decision: IDecisionLog = {
                timestamp: new Date().toISOString(),
                requestId: 'pii-test-001',
                subject: {
                    uniqueID: 'test.user@af.mil',  // Only this should be stored
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA'
                    // NO full name, email, or other PII
                },
                resource: {
                    resourceId: 'doc-pii-test',
                    classification: 'SECRET'
                },
                action: {
                    operation: 'view'
                },
                decision: 'ALLOW',
                reason: 'Test',
                latency_ms: 40,
                context: {
                    sourceIP: '192.168.1.1'
                }
            };

            await decisionLogService.logDecision(decision);

            // Verify only uniqueID is stored
            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('decisions').findOne({
                requestId: 'pii-test-001'
            });

            expect(stored?.subject.uniqueID).toBe('test.user@af.mil');
            expect(stored?.subject).not.toHaveProperty('fullName');
            expect(stored?.subject).not.toHaveProperty('email');
        });
    });

    describe('90-Day Retention', () => {
        it('should create TTL index on timestamp field', async () => {
            const db = mongoClient.db(TEST_DB);
            const indexes = await db.collection('decisions').indexes();

            const ttlIndex = indexes.find(idx => idx.name === 'decision_log_ttl_90_days');

            expect(ttlIndex).toBeDefined();
            expect(ttlIndex?.expireAfterSeconds).toBe(90 * 24 * 60 * 60);  // 90 days
        });
    });

    // ============================================
    // Phase 4: KAS Key Release Logging Tests
    // ============================================
    describe('logKeyRelease', () => {
        it('should log successful key release to MongoDB', async () => {
            const keyReleaseLog: IKeyReleaseLog = {
                timestamp: new Date().toISOString(),
                requestId: 'kas-req-001',
                eventType: 'KEY_RELEASED',
                resourceId: 'doc-secret-001',
                subjectUniqueID: 'alice.general@af.mil',
                policyEvaluated: 'fuel_inventory_abac_policy',
                decision: 'GRANT',
                reason: 'Subject has required clearance and releasability',
                kekId: 'kek-usa-001',
                dekHash: 'abc123hash',
                kasLatencyMs: 45,
                opaDecision: {
                    allow: true,
                    reason: 'All checks passed'
                }
            };

            await decisionLogService.logKeyRelease(keyReleaseLog);

            // Verify stored
            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('key_releases').findOne({
                requestId: 'kas-req-001'
            });

            expect(stored).toBeDefined();
            expect(stored?.decision).toBe('GRANT');
            expect(stored?.resourceId).toBe('doc-secret-001');
            expect(stored?.subjectUniqueID).toBe('alice.general@af.mil');
            expect(stored?.kekId).toBe('kek-usa-001');
        });

        it('should log key denial to MongoDB', async () => {
            const keyDenialLog: IKeyReleaseLog = {
                timestamp: new Date().toISOString(),
                requestId: 'kas-req-002',
                eventType: 'KEY_DENIED',
                resourceId: 'doc-secret-002',
                subjectUniqueID: 'bob.contractor@industry.com',
                policyEvaluated: 'fuel_inventory_abac_policy',
                decision: 'DENY',
                reason: 'Insufficient clearance',
                kasLatencyMs: 30,
                opaDecision: {
                    allow: false,
                    reason: 'Clearance mismatch: CONFIDENTIAL < SECRET'
                }
            };

            await decisionLogService.logKeyRelease(keyDenialLog);

            const db = mongoClient.db(TEST_DB);
            const stored = await db.collection('key_releases').findOne({
                requestId: 'kas-req-002'
            });

            expect(stored).toBeDefined();
            expect(stored?.decision).toBe('DENY');
            expect(stored?.eventType).toBe('KEY_DENIED');
        });

        it('should create TTL index for key releases', async () => {
            const keyReleaseLog: IKeyReleaseLog = {
                timestamp: new Date().toISOString(),
                requestId: 'kas-req-003',
                eventType: 'KEY_RELEASED',
                resourceId: 'doc-test-001',
                subjectUniqueID: 'test@test.mil',
                policyEvaluated: 'test_policy',
                decision: 'GRANT',
                reason: 'Test',
                kasLatencyMs: 10
            };

            await decisionLogService.logKeyRelease(keyReleaseLog);

            const db = mongoClient.db(TEST_DB);
            const indexes = await db.collection('key_releases').indexes();

            const ttlIndex = indexes.find(idx => 
                idx.key && idx.key.timestamp && idx.expireAfterSeconds
            );

            expect(ttlIndex).toBeDefined();
            expect(ttlIndex?.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
        });

        it('should handle logging errors gracefully (non-blocking)', async () => {
            const invalidLog: any = {
                // Missing required fields
                requestId: 'invalid-req',
                decision: 'GRANT'
            };

            // Should not throw error
            await expect(
                decisionLogService.logKeyRelease(invalidLog)
            ).resolves.not.toThrow();
        });
    });

    describe('queryKeyReleases', () => {
        beforeEach(async () => {
            // Clear and seed test data
            const db = mongoClient.db(TEST_DB);
            await db.collection('key_releases').deleteMany({});

            const testLogs: IKeyReleaseLog[] = [
                {
                    timestamp: new Date('2025-11-28T10:00:00Z').toISOString(),
                    requestId: 'query-001',
                    eventType: 'KEY_RELEASED',
                    resourceId: 'doc-a',
                    subjectUniqueID: 'alice@mil',
                    policyEvaluated: 'test_policy',
                    decision: 'GRANT',
                    reason: 'Allowed',
                    kasLatencyMs: 40
                },
                {
                    timestamp: new Date('2025-11-28T11:00:00Z').toISOString(),
                    requestId: 'query-002',
                    eventType: 'KEY_DENIED',
                    resourceId: 'doc-b',
                    subjectUniqueID: 'bob@industry.com',
                    policyEvaluated: 'test_policy',
                    decision: 'DENY',
                    reason: 'Denied',
                    kasLatencyMs: 30
                },
                {
                    timestamp: new Date('2025-11-28T12:00:00Z').toISOString(),
                    requestId: 'query-003',
                    eventType: 'KEY_RELEASED',
                    resourceId: 'doc-a',
                    subjectUniqueID: 'alice@mil',
                    policyEvaluated: 'test_policy',
                    decision: 'GRANT',
                    reason: 'Allowed',
                    kasLatencyMs: 35
                }
            ];

            for (const log of testLogs) {
                await decisionLogService.logKeyRelease(log);
            }
        });

        it('should query key releases by subjectUniqueID', async () => {
            const results = await decisionLogService.queryKeyReleases({
                subjectUniqueID: 'alice@mil'
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.subjectUniqueID === 'alice@mil')).toBe(true);
        });

        it('should query key releases by resourceId', async () => {
            const results = await decisionLogService.queryKeyReleases({
                resourceId: 'doc-a'
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.resourceId === 'doc-a')).toBe(true);
        });

        it('should query key releases by decision', async () => {
            const grantResults = await decisionLogService.queryKeyReleases({
                decision: 'GRANT'
            });

            expect(grantResults.length).toBeGreaterThanOrEqual(2);
            expect(grantResults.every(r => r.decision === 'GRANT')).toBe(true);

            const denyResults = await decisionLogService.queryKeyReleases({
                decision: 'DENY'
            });

            expect(denyResults.length).toBeGreaterThanOrEqual(1);
            expect(denyResults.every(r => r.decision === 'DENY')).toBe(true);
        });

        it('should query key releases by time range', async () => {
            const results = await decisionLogService.queryKeyReleases({
                startTime: '2025-11-28T10:30:00Z',
                endTime: '2025-11-28T12:30:00Z'
            });

            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results.every(r => r.timestamp >= '2025-11-28T10:30:00Z')).toBe(true);
            expect(results.every(r => r.timestamp <= '2025-11-28T12:30:00Z')).toBe(true);
        });

        it('should query with only startTime', async () => {
            const results = await decisionLogService.queryKeyReleases({
                startTime: '2025-11-28T11:30:00Z'
            });

            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it('should query with only endTime', async () => {
            const results = await decisionLogService.queryKeyReleases({
                endTime: '2025-11-28T10:30:00Z'
            });

            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        it('should support limit parameter', async () => {
            const results = await decisionLogService.queryKeyReleases({
                limit: 2
            });

            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should support skip parameter for pagination', async () => {
            const firstPage = await decisionLogService.queryKeyReleases({
                limit: 1,
                skip: 0
            });

            const secondPage = await decisionLogService.queryKeyReleases({
                limit: 1,
                skip: 1
            });

            expect(firstPage[0].requestId).not.toBe(secondPage[0].requestId);
        });

        it('should use default limit of 100', async () => {
            const results = await decisionLogService.queryKeyReleases({});

            expect(results.length).toBeLessThanOrEqual(100);
        });

        it('should use default skip of 0', async () => {
            const results = await decisionLogService.queryKeyReleases({});

            expect(Array.isArray(results)).toBe(true);
        });

        it('should sort results by timestamp descending (newest first)', async () => {
            const results = await decisionLogService.queryKeyReleases({});

            if (results.length > 1) {
                const timestamps = results.map(r => new Date(r.timestamp).getTime());
                const sorted = [...timestamps].sort((a, b) => b - a);
                expect(timestamps).toEqual(sorted);
            }
        });

        it('should handle combined query parameters', async () => {
            const results = await decisionLogService.queryKeyReleases({
                subjectUniqueID: 'alice@mil',
                decision: 'GRANT',
                resourceId: 'doc-a'
            });

            expect(results.every(r => 
                r.subjectUniqueID === 'alice@mil' &&
                r.decision === 'GRANT' &&
                r.resourceId === 'doc-a'
            )).toBe(true);
        });

        it('should return empty array when no matches found', async () => {
            const results = await decisionLogService.queryKeyReleases({
                subjectUniqueID: 'nonexistent@test.com'
            });

            expect(results).toEqual([]);
        });

        it('should handle empty query object', async () => {
            const results = await decisionLogService.queryKeyReleases({});

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('getKeyReleaseStatistics', () => {
        beforeEach(async () => {
            // Clear and seed diverse test data
            const db = mongoClient.db(TEST_DB);
            await db.collection('key_releases').deleteMany({});

            const testLogs: IKeyReleaseLog[] = [
                {
                    timestamp: new Date('2025-11-28T10:00:00Z').toISOString(),
                    requestId: 'stats-001',
                    eventType: 'KEY_RELEASED',
                    resourceId: 'doc-a',
                    subjectUniqueID: 'alice@mil',
                    policyEvaluated: 'test_policy',
                    decision: 'GRANT',
                    reason: 'Allowed',
                    kasLatencyMs: 40
                },
                {
                    timestamp: new Date('2025-11-28T11:00:00Z').toISOString(),
                    requestId: 'stats-002',
                    eventType: 'KEY_DENIED',
                    resourceId: 'doc-b',
                    subjectUniqueID: 'bob@industry.com',
                    policyEvaluated: 'test_policy',
                    decision: 'DENY',
                    reason: 'Insufficient clearance',
                    kasLatencyMs: 30
                },
                {
                    timestamp: new Date('2025-11-28T12:00:00Z').toISOString(),
                    requestId: 'stats-003',
                    eventType: 'KEY_DENIED',
                    resourceId: 'doc-c',
                    subjectUniqueID: 'charlie@test.com',
                    policyEvaluated: 'test_policy',
                    decision: 'DENY',
                    reason: 'Country not releasable',
                    kasLatencyMs: 25
                },
                {
                    timestamp: new Date('2025-11-28T13:00:00Z').toISOString(),
                    requestId: 'stats-004',
                    eventType: 'KEY_RELEASED',
                    resourceId: 'doc-d',
                    subjectUniqueID: 'david@mil',
                    policyEvaluated: 'test_policy',
                    decision: 'GRANT',
                    reason: 'Allowed',
                    kasLatencyMs: 50
                }
            ];

            for (const log of testLogs) {
                await decisionLogService.logKeyRelease(log);
            }
        });

        it('should return overall statistics', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats.totalReleases).toBeGreaterThanOrEqual(4);
            expect(stats.grantCount).toBeGreaterThanOrEqual(2);
            expect(stats.denyCount).toBeGreaterThanOrEqual(2);
            expect(stats.averageLatency).toBeGreaterThan(0);
            expect(Array.isArray(stats.topDenyReasons)).toBe(true);
            expect(typeof stats.releasesByCountry).toBe('object');
        });

        it('should calculate grant and deny counts correctly', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats.grantCount + stats.denyCount).toBeLessThanOrEqual(stats.totalReleases);
        });

        it('should calculate average latency', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            // Average of 40, 30, 25, 50 = 36.25, rounded
            expect(stats.averageLatency).toBeGreaterThan(0);
            expect(Number.isInteger(stats.averageLatency)).toBe(true);
        });

        it('should return top deny reasons', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats.topDenyReasons.length).toBeGreaterThan(0);
            if (stats.topDenyReasons.length > 0) {
                expect(stats.topDenyReasons[0]).toHaveProperty('reason');
                expect(stats.topDenyReasons[0]).toHaveProperty('count');
            }
        });

        it('should limit top deny reasons to 10', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats.topDenyReasons.length).toBeLessThanOrEqual(10);
        });

        it('should support time range filtering', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics({
                startTime: '2025-11-28T11:00:00Z',
                endTime: '2025-11-28T13:00:00Z'
            });

            // Should only include records in that time range (3 records)
            expect(stats.totalReleases).toBeLessThanOrEqual(3);
        });

        it('should support only startTime filter', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics({
                startTime: '2025-11-28T12:00:00Z'
            });

            // Should include records from 12:00 onwards (at least 1 record)
            expect(stats.totalReleases).toBeGreaterThanOrEqual(1);
        });

        it('should support only endTime filter', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics({
                endTime: '2025-11-28T11:00:00Z'
            });

            // Should include records up to 11:00 (2 records)
            expect(stats.totalReleases).toBeGreaterThanOrEqual(2);
        });

        it('should handle empty results gracefully', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics({
                startTime: '2099-01-01T00:00:00Z'
            });

            expect(stats.totalReleases).toBe(0);
            expect(stats.grantCount).toBe(0);
            expect(stats.denyCount).toBe(0);
            expect(stats.averageLatency).toBe(0);
            expect(stats.topDenyReasons).toEqual([]);
        });

        it('should group releases by country when available', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            // releasesByCountry might be empty if subjectAttributes not set
            expect(typeof stats.releasesByCountry).toBe('object');
        });

        it('should handle missing timeRange parameter', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats.totalReleases).toBeGreaterThan(0);
        });

        it('should handle undefined timeRange', async () => {
            const stats = await decisionLogService.getKeyReleaseStatistics(undefined);

            expect(stats.totalReleases).toBeGreaterThan(0);
        });

        it('should return statistics structure even with no data', async () => {
            // Clear all data
            const db = mongoClient.db(TEST_DB);
            await db.collection('key_releases').deleteMany({});

            const stats = await decisionLogService.getKeyReleaseStatistics();

            expect(stats).toHaveProperty('totalReleases');
            expect(stats).toHaveProperty('grantCount');
            expect(stats).toHaveProperty('denyCount');
            expect(stats).toHaveProperty('averageLatency');
            expect(stats).toHaveProperty('topDenyReasons');
            expect(stats).toHaveProperty('releasesByCountry');
        });
    });
});

