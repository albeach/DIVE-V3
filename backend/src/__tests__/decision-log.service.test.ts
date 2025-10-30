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

import { decisionLogService, IDecisionLog } from '../services/decision-log.service';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017';
const TEST_DB = 'dive-v3-test';

describe('Decision Log Service', () => {
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
});

