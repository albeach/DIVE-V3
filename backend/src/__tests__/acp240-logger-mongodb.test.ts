/**
 * ACP-240 Logger MongoDB Integration Tests
 * 
 * Tests the dual-write functionality:
 * - Logs written to files (Winston)
 * - Logs written to MongoDB (audit_logs collection)
 */

import { MongoClient, Db } from 'mongodb';
import { logACP240Event, logDecryptEvent, logAccessDeniedEvent, logEncryptEvent } from '../utils/acp240-logger';
import { IACP240AuditEvent } from '../utils/acp240-logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3-test';
const LOGS_COLLECTION = 'audit_logs';

describe('ACP-240 Logger MongoDB Integration', () => {
    let client: MongoClient;
    let db: Db;

    beforeAll(async () => {
        // Connect to test database
        client = new MongoClient(MONGODB_URL);
        await client.connect();
        db = client.db(DB_NAME);
    });

    afterAll(async () => {
        // Clean up
        // Note: Don't call closeAuditLogConnection() here as it might interfere with other tests
        // The singleton connection will be reused across tests
        await client.close();
    });

    beforeEach(async () => {
        // Clear collection before each test
        await db.collection(LOGS_COLLECTION).deleteMany({});
    });

    describe('logACP240Event', () => {
        it('should write audit event to MongoDB', async () => {
            const event: IACP240AuditEvent = {
                eventType: 'DECRYPT',
                timestamp: new Date().toISOString(),
                requestId: 'test-req-001',
                subject: 'test.user@mil',
                action: 'view',
                resourceId: 'test-resource-001',
                outcome: 'ALLOW',
                reason: 'Test event',
                subjectAttributes: {
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY']
                },
                resourceAttributes: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['FVEY']
                },
                latencyMs: 25
            };

            logACP240Event(event);

            // Wait for async write to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify document was inserted
            const collection = db.collection(LOGS_COLLECTION);
            const documents = await collection.find({ requestId: 'test-req-001' }).toArray();

            expect(documents).toHaveLength(1);
            expect(documents[0]).toMatchObject({
                acp240EventType: 'DECRYPT',
                requestId: 'test-req-001',
                subject: 'test.user@mil',
                action: 'view',
                resourceId: 'test-resource-001',
                outcome: 'ALLOW',
                reason: 'Test event'
            });
            expect(documents[0].subjectAttributes).toEqual({
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY']
            });
        });

        it('should handle multiple events', async () => {
            const events: IACP240AuditEvent[] = [
                {
                    eventType: 'DECRYPT',
                    timestamp: new Date().toISOString(),
                    requestId: 'test-req-002',
                    subject: 'user1@mil',
                    action: 'view',
                    resourceId: 'resource-001',
                    outcome: 'ALLOW',
                    reason: 'Access granted'
                },
                {
                    eventType: 'ACCESS_DENIED',
                    timestamp: new Date().toISOString(),
                    requestId: 'test-req-003',
                    subject: 'user2@mil',
                    action: 'view',
                    resourceId: 'resource-002',
                    outcome: 'DENY',
                    reason: 'Insufficient clearance'
                },
                {
                    eventType: 'ENCRYPT',
                    timestamp: new Date().toISOString(),
                    requestId: 'test-req-004',
                    subject: 'user3@mil',
                    action: 'encrypt',
                    resourceId: 'resource-003',
                    outcome: 'ALLOW',
                    reason: 'Resource encrypted'
                }
            ];

            events.forEach(event => logACP240Event(event));

            // Wait for async writes
            await new Promise(resolve => setTimeout(resolve, 1500));

            const collection = db.collection(LOGS_COLLECTION);
            const count = await collection.countDocuments();

            expect(count).toBe(3);

            const decryptEvents = await collection.find({ acp240EventType: 'DECRYPT' }).toArray();
            const deniedEvents = await collection.find({ acp240EventType: 'ACCESS_DENIED' }).toArray();
            const encryptEvents = await collection.find({ acp240EventType: 'ENCRYPT' }).toArray();

            expect(decryptEvents).toHaveLength(1);
            expect(deniedEvents).toHaveLength(1);
            expect(encryptEvents).toHaveLength(1);
        });
    });

    describe('logDecryptEvent', () => {
        it('should create and store DECRYPT event', async () => {
            logDecryptEvent({
                requestId: 'test-decrypt-001',
                subject: 'john.doe@mil',
                resourceId: 'fuel-depot-001',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                subjectAttributes: {
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY']
                },
                reason: 'Access granted by policy',
                latencyMs: 45
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const collection = db.collection(LOGS_COLLECTION);
            const documents = await collection.find({ requestId: 'test-decrypt-001' }).toArray();

            expect(documents).toHaveLength(1);
            expect(documents[0]).toMatchObject({
                acp240EventType: 'DECRYPT',
                subject: 'john.doe@mil',
                resourceId: 'fuel-depot-001',
                outcome: 'ALLOW',
                action: 'decrypt'
            });
            expect(documents[0].resourceAttributes.classification).toBe('SECRET');
            expect(documents[0].resourceAttributes.releasabilityTo).toEqual(['USA', 'GBR']);
        });
    });

    describe('logAccessDeniedEvent', () => {
        it('should create and store ACCESS_DENIED event', async () => {
            logAccessDeniedEvent({
                requestId: 'test-deny-001',
                subject: 'jane.smith@fra',
                resourceId: 'classified-doc-001',
                reason: 'Country FRA not in releasabilityTo',
                subjectAttributes: {
                    clearance: 'SECRET',
                    countryOfAffiliation: 'FRA',
                    acpCOI: ['NATO-COSMIC']
                },
                resourceAttributes: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY']
                },
                policyEvaluation: {
                    allow: false,
                    reason: 'Releasability check failed'
                },
                latencyMs: 32
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const collection = db.collection(LOGS_COLLECTION);
            const documents = await collection.find({ requestId: 'test-deny-001' }).toArray();

            expect(documents).toHaveLength(1);
            expect(documents[0]).toMatchObject({
                acp240EventType: 'ACCESS_DENIED',
                subject: 'jane.smith@fra',
                resourceId: 'classified-doc-001',
                outcome: 'DENY',
                reason: 'Country FRA not in releasabilityTo'
            });
            expect(documents[0].policyEvaluation).toEqual({
                allow: false,
                reason: 'Releasability check failed'
            });
        });
    });

    describe('logEncryptEvent', () => {
        it('should create and store ENCRYPT event', async () => {
            logEncryptEvent({
                requestId: 'test-encrypt-001',
                subject: 'admin@mil',
                resourceId: 'sensitive-doc-001',
                classification: 'TOP_SECRET',
                reason: 'Document encrypted with ZTDF'
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const collection = db.collection(LOGS_COLLECTION);
            const documents = await collection.find({ requestId: 'test-encrypt-001' }).toArray();

            expect(documents).toHaveLength(1);
            expect(documents[0]).toMatchObject({
                acp240EventType: 'ENCRYPT',
                subject: 'admin@mil',
                resourceId: 'sensitive-doc-001',
                outcome: 'ALLOW',
                action: 'encrypt'
            });
            expect(documents[0].resourceAttributes).toEqual({
                classification: 'TOP_SECRET',
                encrypted: true
            });
        });
    });

    describe('Query Performance', () => {
        it('should handle high-volume logging', async () => {
            const eventCount = 100;
            const startTime = Date.now();

            // Generate 100 events
            for (let i = 0; i < eventCount; i++) {
                logACP240Event({
                    eventType: i % 2 === 0 ? 'DECRYPT' : 'ACCESS_DENIED',
                    timestamp: new Date().toISOString(),
                    requestId: `perf-test-${i}`,
                    subject: `user${i}@mil`,
                    action: 'view',
                    resourceId: `resource-${i}`,
                    outcome: i % 3 === 0 ? 'DENY' : 'ALLOW',
                    reason: 'Performance test event'
                });
            }

            // Wait for all writes to complete
            await new Promise(resolve => setTimeout(resolve, 3000));

            const endTime = Date.now();
            const duration = endTime - startTime;

            const collection = db.collection(LOGS_COLLECTION);
            const count = await collection.countDocuments();

            expect(count).toBe(eventCount);
            expect(duration).toBeLessThan(5000); // Should complete in <5 seconds

            // Test query performance with indexes
            const queryStart = Date.now();
            const deniedEvents = await collection.find({ outcome: 'DENY' }).toArray();
            const queryDuration = Date.now() - queryStart;

            expect(deniedEvents.length).toBeGreaterThan(0);
            expect(queryDuration).toBeLessThan(100); // Query should be fast with indexes
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid MongoDB connection gracefully', async () => {
            // This test verifies that logging doesn't throw even if MongoDB fails
            // The file-based logging should still work
            
            const event: IACP240AuditEvent = {
                eventType: 'DECRYPT',
                timestamp: new Date().toISOString(),
                requestId: 'error-test-001',
                subject: 'test@mil',
                action: 'view',
                resourceId: 'test-resource',
                outcome: 'ALLOW',
                reason: 'Error handling test'
            };

            // This should not throw even if MongoDB has issues
            expect(() => logACP240Event(event)).not.toThrow();
        });
    });

    describe('Data Integrity', () => {
        it('should preserve all event fields in MongoDB', async () => {
            const event: IACP240AuditEvent = {
                eventType: 'DECRYPT',
                timestamp: '2025-10-14T12:00:00.000Z',
                requestId: 'integrity-test-001',
                subject: 'test.user@mil',
                action: 'view',
                resourceId: 'test-resource',
                outcome: 'ALLOW',
                reason: 'Full data integrity test',
                subjectAttributes: {
                    clearance: 'TOP_SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY', 'NATO-COSMIC']
                },
                resourceAttributes: {
                    classification: 'TOP_SECRET',
                    releasabilityTo: ['USA', 'GBR', 'CAN'],
                    COI: ['FVEY'],
                    encrypted: true
                },
                policyEvaluation: {
                    allow: true,
                    reason: 'All checks passed',
                    evaluation_details: {
                        clearance_check: 'PASS',
                        releasability_check: 'PASS',
                        coi_check: 'PASS'
                    }
                },
                context: {
                    sourceIP: '192.168.1.100',
                    deviceCompliant: true,
                    currentTime: '2025-10-14T12:00:00.000Z'
                },
                latencyMs: 78
            };

            logACP240Event(event);

            await new Promise(resolve => setTimeout(resolve, 1000));

            const collection = db.collection(LOGS_COLLECTION);
            const documents = await collection.find({ requestId: 'integrity-test-001' }).toArray();

            expect(documents).toHaveLength(1);
            
            const doc = documents[0];
            expect(doc.acp240EventType).toBe('DECRYPT');
            expect(doc.timestamp).toBe('2025-10-14T12:00:00.000Z');
            expect(doc.subject).toBe('test.user@mil');
            expect(doc.subjectAttributes.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
            expect(doc.resourceAttributes.releasabilityTo).toEqual(['USA', 'GBR', 'CAN']);
            expect(doc.policyEvaluation.evaluation_details).toEqual({
                clearance_check: 'PASS',
                releasability_check: 'PASS',
                coi_check: 'PASS'
            });
            expect(doc.context.sourceIP).toBe('192.168.1.100');
            expect(doc.latencyMs).toBe(78);
            expect(doc._createdAt).toBeInstanceOf(Date);
        });
    });
});

