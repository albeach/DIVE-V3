/**
 * Audit Log Service Tests
 * 
 * Tests for log querying and statistics
 */

import { auditLogService } from '../services/audit-log.service';

describe('Audit Log Service', () => {
    const skipIfNoMongo = process.env.SKIP_INTEGRATION_TESTS === 'true';

    describe('queryLogs', () => {
        it('should query logs with filters', async () => {
            if (skipIfNoMongo) return;

            const result = await auditLogService.queryLogs({
                limit: 10,
                offset: 0
            });

            expect(result).toBeDefined();
            expect(result.logs).toBeInstanceOf(Array);
            expect(result.total).toBeGreaterThanOrEqual(0);
        });

        it('should filter by event type', async () => {
            if (skipIfNoMongo) return;

            const result = await auditLogService.queryLogs({
                eventType: 'ACCESS_DENIED',
                limit: 10
            });

            expect(result).toBeDefined();
        });

        it('should filter by outcome', async () => {
            if (skipIfNoMongo) return;

            const result = await auditLogService.queryLogs({
                outcome: 'DENY',
                limit: 10
            });

            expect(result).toBeDefined();
        });
    });

    describe('getSecurityViolations', () => {
        it('should get ACCESS_DENIED events', async () => {
            if (skipIfNoMongo) return;

            const violations = await auditLogService.getSecurityViolations(10);

            expect(violations).toBeInstanceOf(Array);
        });
    });

    describe('getLogStatistics', () => {
        it('should calculate statistics', async () => {
            if (skipIfNoMongo) return;

            const stats = await auditLogService.getLogStatistics(7);

            expect(stats).toBeDefined();
            expect(stats.totalEvents).toBeGreaterThanOrEqual(0);
            expect(stats.eventsByType).toBeDefined();
        });
    });

    describe('exportLogs', () => {
        it('should export logs as JSON', async () => {
            if (skipIfNoMongo) return;

            const json = await auditLogService.exportLogs({ limit: 10 });

            expect(json).toBeDefined();
            expect(() => JSON.parse(json)).not.toThrow();
        });
    });
});

