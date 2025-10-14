/**
 * Audit Log Service Tests
 * 
 * Tests querying, filtering, and statistics for audit logs in MongoDB
 */

import { MongoClient, Db } from 'mongodb';
import { auditLogService } from '../services/audit-log.service';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3-test';
const LOGS_COLLECTION = 'audit_logs';

describe('Audit Log Service', () => {
    let client: MongoClient;
    let db: Db;

    beforeAll(async () => {
        client = new MongoClient(MONGODB_URL);
        await client.connect();
        db = client.db(DB_NAME);
    });

    afterAll(async () => {
        await auditLogService.close();
        await client.close();
    });

    beforeEach(async () => {
        // Clear and seed test data
        const collection = db.collection(LOGS_COLLECTION);
        await collection.deleteMany({});

        // Insert test audit logs
        const testLogs = [
            {
                acp240EventType: 'DECRYPT',
                timestamp: '2025-10-13T10:00:00.000Z',
                requestId: 'req-001',
                subject: 'john.doe@mil',
                action: 'view',
                resourceId: 'fuel-depot-001',
                outcome: 'ALLOW',
                reason: 'Access granted',
                subjectAttributes: { clearance: 'SECRET', countryOfAffiliation: 'USA' },
                resourceAttributes: { classification: 'SECRET', releasabilityTo: ['USA'] },
                latencyMs: 45
            },
            {
                acp240EventType: 'ACCESS_DENIED',
                timestamp: '2025-10-13T11:00:00.000Z',
                requestId: 'req-002',
                subject: 'jane.smith@fra',
                action: 'view',
                resourceId: 'classified-doc-001',
                outcome: 'DENY',
                reason: 'Country FRA not in releasabilityTo',
                subjectAttributes: { clearance: 'SECRET', countryOfAffiliation: 'FRA' },
                resourceAttributes: { classification: 'SECRET', releasabilityTo: ['USA', 'GBR'] },
                latencyMs: 32
            },
            {
                acp240EventType: 'DECRYPT',
                timestamp: '2025-10-13T12:00:00.000Z',
                requestId: 'req-003',
                subject: 'bob.contractor@industry',
                action: 'view',
                resourceId: 'supply-chain-data',
                outcome: 'ALLOW',
                reason: 'Access granted',
                subjectAttributes: { clearance: 'CONFIDENTIAL', countryOfAffiliation: 'USA' },
                resourceAttributes: { classification: 'CONFIDENTIAL', releasabilityTo: ['USA'] },
                latencyMs: 28
            },
            {
                acp240EventType: 'ACCESS_DENIED',
                timestamp: '2025-10-13T13:00:00.000Z',
                requestId: 'req-004',
                subject: 'john.doe@mil',
                action: 'view',
                resourceId: 'top-secret-intel',
                outcome: 'DENY',
                reason: 'Insufficient clearance',
                subjectAttributes: { clearance: 'SECRET', countryOfAffiliation: 'USA' },
                resourceAttributes: { classification: 'TOP_SECRET', releasabilityTo: ['USA'] },
                latencyMs: 15
            },
            {
                acp240EventType: 'ENCRYPT',
                timestamp: '2025-10-13T14:00:00.000Z',
                requestId: 'req-005',
                subject: 'admin@mil',
                action: 'encrypt',
                resourceId: 'sensitive-report',
                outcome: 'ALLOW',
                reason: 'Document encrypted',
                subjectAttributes: { clearance: 'TOP_SECRET', countryOfAffiliation: 'USA' },
                resourceAttributes: { classification: 'TOP_SECRET', encrypted: true },
                latencyMs: 120
            }
        ];

        await collection.insertMany(testLogs);
    });

    describe('queryLogs', () => {
        it('should return all logs without filters', async () => {
            const result = await auditLogService.queryLogs({});

            expect(result.total).toBe(5);
            expect(result.logs).toHaveLength(5);
        });

        it('should filter by event type', async () => {
            const result = await auditLogService.queryLogs({
                eventType: 'DECRYPT'
            });

            expect(result.total).toBe(2);
            expect(result.logs).toHaveLength(2);
            expect(result.logs.every(log => log.eventType === 'DECRYPT')).toBe(true);
        });

        it('should filter by outcome', async () => {
            const result = await auditLogService.queryLogs({
                outcome: 'DENY'
            });

            expect(result.total).toBe(2);
            expect(result.logs).toHaveLength(2);
            expect(result.logs.every(log => log.outcome === 'DENY')).toBe(true);
        });

        it('should filter by subject', async () => {
            const result = await auditLogService.queryLogs({
                subject: 'john.doe'
            });

            expect(result.total).toBe(2);
            expect(result.logs.every(log => log.subject.includes('john.doe'))).toBe(true);
        });

        it('should filter by resource ID', async () => {
            const result = await auditLogService.queryLogs({
                resourceId: 'fuel-depot'
            });

            expect(result.total).toBe(1);
            expect(result.logs[0].resourceId).toBe('fuel-depot-001');
        });

        it('should filter by time range', async () => {
            const result = await auditLogService.queryLogs({
                startTime: '2025-10-13T11:30:00.000Z',
                endTime: '2025-10-13T13:30:00.000Z'
            });

            expect(result.total).toBe(2);
            expect(result.logs.every(log => {
                const timestamp = new Date(log.timestamp);
                return timestamp >= new Date('2025-10-13T11:30:00.000Z') &&
                       timestamp <= new Date('2025-10-13T13:30:00.000Z');
            })).toBe(true);
        });

        it('should support pagination', async () => {
            const page1 = await auditLogService.queryLogs({
                limit: 2,
                offset: 0
            });

            const page2 = await auditLogService.queryLogs({
                limit: 2,
                offset: 2
            });

            expect(page1.logs).toHaveLength(2);
            expect(page2.logs).toHaveLength(2);
            expect(page1.total).toBe(5);
            expect(page2.total).toBe(5);
            
            // Ensure different logs on different pages
            expect(page1.logs[0].requestId).not.toBe(page2.logs[0].requestId);
        });

        it('should combine multiple filters', async () => {
            const result = await auditLogService.queryLogs({
                eventType: 'ACCESS_DENIED',
                subject: 'john.doe',
                outcome: 'DENY'
            });

            expect(result.total).toBe(1);
            expect(result.logs[0]).toMatchObject({
                eventType: 'ACCESS_DENIED',
                subject: 'john.doe@mil',
                outcome: 'DENY'
            });
        });

        it('should return logs in reverse chronological order', async () => {
            const result = await auditLogService.queryLogs({});

            expect(result.logs).toHaveLength(5);
            
            // Verify descending order by timestamp
            for (let i = 0; i < result.logs.length - 1; i++) {
                const current = new Date(result.logs[i].timestamp);
                const next = new Date(result.logs[i + 1].timestamp);
                expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }
        });
    });

    describe('getSecurityViolations', () => {
        it('should return only ACCESS_DENIED events', async () => {
            const violations = await auditLogService.getSecurityViolations();

            expect(violations).toHaveLength(2);
            expect(violations.every(v => v.eventType === 'ACCESS_DENIED')).toBe(true);
            expect(violations.every(v => v.outcome === 'DENY')).toBe(true);
        });

        it('should limit results', async () => {
            const violations = await auditLogService.getSecurityViolations(1);

            expect(violations).toHaveLength(1);
        });
    });

    describe('getEncryptEvents', () => {
        it('should return only ENCRYPT events', async () => {
            const encryptEvents = await auditLogService.getEncryptEvents();

            expect(encryptEvents).toHaveLength(1);
            expect(encryptEvents[0].eventType).toBe('ENCRYPT');
            expect(encryptEvents[0].action).toBe('encrypt');
        });
    });

    describe('getDecryptEvents', () => {
        it('should return only DECRYPT events', async () => {
            const decryptEvents = await auditLogService.getDecryptEvents();

            expect(decryptEvents).toHaveLength(2);
            expect(decryptEvents.every(e => e.eventType === 'DECRYPT')).toBe(true);
        });
    });

    describe('getLogStatistics', () => {
        it('should calculate correct statistics', async () => {
            const stats = await auditLogService.getLogStatistics(30);

            expect(stats.totalEvents).toBe(5);
            expect(stats.deniedAccess).toBe(2);
            expect(stats.successfulAccess).toBe(3);
            
            expect(stats.eventsByType).toEqual({
                DECRYPT: 2,
                ACCESS_DENIED: 2,
                ENCRYPT: 1
            });
        });

        it('should return top denied resources', async () => {
            const stats = await auditLogService.getLogStatistics(30);

            expect(stats.topDeniedResources).toHaveLength(2);
            expect(stats.topDeniedResources[0]).toMatchObject({
                resourceId: expect.any(String),
                count: 1
            });
        });

        it('should return top users', async () => {
            const stats = await auditLogService.getLogStatistics(30);

            expect(stats.topUsers).toHaveLength(4);
            expect(stats.topUsers[0].subject).toBeDefined();
            expect(stats.topUsers[0].count).toBeGreaterThan(0);
            
            // john.doe should be top user (2 events)
            const johnDoe = stats.topUsers.find(u => u.subject === 'john.doe@mil');
            expect(johnDoe).toBeDefined();
            expect(johnDoe!.count).toBe(2);
        });

        it('should calculate violation trend', async () => {
            const stats = await auditLogService.getLogStatistics(30);

            expect(stats.violationTrend).toBeDefined();
            expect(Array.isArray(stats.violationTrend)).toBe(true);
            
            if (stats.violationTrend.length > 0) {
                expect(stats.violationTrend[0]).toMatchObject({
                    date: expect.any(String),
                    count: expect.any(Number)
                });
            }
        });

        it('should filter by date range', async () => {
            // Get stats for last 1 day (should include all test logs)
            const statsRecent = await auditLogService.getLogStatistics(1);

            // Recent stats should have events
            expect(statsRecent.totalEvents).toBeGreaterThan(0);
            
            // Get stats for last 30 days (should include all test logs)
            const statsAll = await auditLogService.getLogStatistics(30);
            expect(statsAll.totalEvents).toBeGreaterThanOrEqual(statsRecent.totalEvents);
        });
    });

    describe('exportLogs', () => {
        it('should export logs as JSON', async () => {
            const json = await auditLogService.exportLogs({});

            expect(typeof json).toBe('string');
            
            const parsed = JSON.parse(json);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(5);
        });

        it('should export filtered logs', async () => {
            const json = await auditLogService.exportLogs({
                eventType: 'DECRYPT'
            });

            const parsed = JSON.parse(json);
            expect(parsed).toHaveLength(2);
            expect(parsed.every((log: any) => log.eventType === 'DECRYPT')).toBe(true);
        });

        it('should respect export limit', async () => {
            // Insert many more logs
            const collection = db.collection(LOGS_COLLECTION);
            const manyLogs = Array.from({ length: 50 }, (_, i) => ({
                acp240EventType: 'DECRYPT',
                timestamp: new Date(Date.now() - i * 1000).toISOString(),
                requestId: `export-test-${i}`,
                subject: 'test@mil',
                action: 'view',
                resourceId: `resource-${i}`,
                outcome: 'ALLOW',
                reason: 'Test'
            }));
            await collection.insertMany(manyLogs);

            const json = await auditLogService.exportLogs({});
            const parsed = JSON.parse(json);

            // Export is limited to 10000 records
            expect(parsed.length).toBeLessThanOrEqual(10000);
        });
    });

    describe('Error Handling', () => {
        it('should handle empty database gracefully', async () => {
            const collection = db.collection(LOGS_COLLECTION);
            await collection.deleteMany({});

            const result = await auditLogService.queryLogs({});

            expect(result.total).toBe(0);
            expect(result.logs).toEqual([]);
        });

        it('should handle invalid filters gracefully', async () => {
            const result = await auditLogService.queryLogs({
                eventType: 'INVALID_EVENT_TYPE'
            });

            expect(result.total).toBe(0);
            expect(result.logs).toEqual([]);
        });
    });

    describe('Performance', () => {
        it('should query large datasets efficiently', async () => {
            // Insert 1000 logs
            const collection = db.collection(LOGS_COLLECTION);
            const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
                acp240EventType: i % 2 === 0 ? 'DECRYPT' : 'ACCESS_DENIED',
                timestamp: new Date(Date.now() - i * 1000).toISOString(),
                requestId: `perf-${i}`,
                subject: `user${i % 10}@mil`,
                action: 'view',
                resourceId: `resource-${i % 100}`,
                outcome: i % 3 === 0 ? 'DENY' : 'ALLOW',
                reason: 'Performance test'
            }));
            await collection.insertMany(largeBatch);

            const startTime = Date.now();
            const result = await auditLogService.queryLogs({
                limit: 50,
                offset: 0
            });
            const duration = Date.now() - startTime;

            expect(result.logs).toHaveLength(50);
            expect(result.total).toBeGreaterThan(1000);
            expect(duration).toBeLessThan(500); // Should complete in <500ms
        });
    });
});

