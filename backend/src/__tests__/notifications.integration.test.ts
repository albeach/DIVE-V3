/**
 * Notification Integration Tests
 * Tests end-to-end notification creation workflow from audit events
 */

import { MongoClient, Db } from 'mongodb';
import { auditService } from '../services/audit.service';
import { notificationService } from '../services/notification.service';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';

// Mock MongoDB connection
jest.mock('../utils/mongodb-config', () => ({
    getMongoDBUrl: jest.fn(() => 'mongodb://localhost:27017'),
    getMongoDBName: jest.fn(() => 'dive-test-integration')
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
    }
}));

describe('Notification Integration Tests', () => {
    let mongoClient: MongoClient;
    let db: Db;

    beforeAll(async () => {
        // Connect to test database
        mongoClient = new MongoClient(getMongoDBUrl());
        await mongoClient.connect();
        db = mongoClient.db(getMongoDBName());
    });

    afterAll(async () => {
        await mongoClient.close();
    });

    beforeEach(async () => {
        // Clear collections before each test
        await db.collection('notifications').deleteMany({});
        await db.collection('audit_logs').deleteMany({});
    });

    describe('Audit Service Integration', () => {
        it('should create notification when access is granted', async () => {
            const subject = {
                uniqueID: 'test-user-123',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const resource = {
                resourceId: 'doc-456',
                title: 'Secret Document',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR']
            };

            const decision = {
                allow: true,
                reason: 'All conditions satisfied'
            };

            const context = {
                correlationId: 'test-correlation-123',
                requestId: 'test-request-123'
            };

            // Log access grant
            auditService.logAccessGrant({
                subject,
                resource,
                decision,
                context,
                latencyMs: 45
            });

            // Wait a bit for async notification creation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that notification was created
            const notifications = await notificationService.list(subject.uniqueID, 10);
            expect(notifications.notifications).toHaveLength(1);

            const notification = notifications.notifications[0];
            expect(notification.type).toBe('access_granted');
            expect(notification.title).toBe('Access Granted');
            expect(notification.message).toContain('Secret Document');
            expect(notification.message).toContain('SECRET');
            expect(notification.resourceId).toBe(resource.resourceId);
            expect(notification.severity).toBe('success');
            expect(notification.read).toBe(false);
        });

        it('should create notification when access is denied', async () => {
            const subject = {
                uniqueID: 'test-user-456',
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'FRA'
            };

            const resource = {
                resourceId: 'doc-789',
                title: 'Top Secret Document',
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA']
            };

            const decision = {
                allow: false,
                reason: 'Insufficient clearance level'
            };

            const context = {
                correlationId: 'test-correlation-456',
                requestId: 'test-request-456'
            };

            // Log access deny
            auditService.logAccessDeny({
                subject,
                resource,
                decision,
                context,
                latencyMs: 30
            });

            // Wait a bit for async notification creation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check that notification was created
            const notifications = await notificationService.list(subject.uniqueID, 10);
            expect(notifications.notifications).toHaveLength(1);

            const notification = notifications.notifications[0];
            expect(notification.type).toBe('access_denied');
            expect(notification.title).toBe('Access Denied');
            expect(notification.message).toContain('Top Secret Document');
            expect(notification.message).toContain('TOP_SECRET');
            expect(notification.message).toContain('Insufficient clearance level');
            expect(notification.resourceId).toBe(resource.resourceId);
            expect(notification.severity).toBe('error');
            expect(notification.read).toBe(false);
        });

        it('should handle notification creation errors gracefully', async () => {
            // Mock notification service to throw error
            const originalCreate = notificationService.create;
            notificationService.create = jest.fn().mockRejectedValue(new Error('Database error'));

            const subject = {
                uniqueID: 'test-user-789',
                clearance: 'UNCLASSIFIED',
                countryOfAffiliation: 'CAN'
            };

            const resource = {
                resourceId: 'doc-999',
                title: 'Test Document',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA', 'CAN']
            };

            const decision = {
                allow: true,
                reason: 'Access granted'
            };

            const context = {
                correlationId: 'test-correlation-789',
                requestId: 'test-request-789'
            };

            // This should not throw despite notification creation failing
            expect(() => {
                auditService.logAccessGrant({
                    subject,
                    resource,
                    decision,
                    context,
                    latencyMs: 25
                });
            }).not.toThrow();

            // Restore original method
            notificationService.create = originalCreate;
        });

        it('should create notifications for multiple events', async () => {
            const subject1 = {
                uniqueID: 'user-1',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA'
            };

            const subject2 = {
                uniqueID: 'user-2',
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'GBR'
            };

            const resource = {
                resourceId: 'shared-doc',
                title: 'Shared Document',
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA', 'GBR']
            };

            // Log access for user 1
            auditService.logAccessGrant({
                subject: subject1,
                resource,
                decision: { allow: true, reason: 'Access granted' },
                context: { correlationId: 'corr-1', requestId: 'req-1' }
            });

            // Log access for user 2
            auditService.logAccessGrant({
                subject: subject2,
                resource,
                decision: { allow: true, reason: 'Access granted' },
                context: { correlationId: 'corr-2', requestId: 'req-2' }
            });

            // Wait for notifications
            await new Promise(resolve => setTimeout(resolve, 200));

            // Check notifications for both users
            const notifications1 = await notificationService.list(subject1.uniqueID, 10);
            const notifications2 = await notificationService.list(subject2.uniqueID, 10);

            expect(notifications1.notifications).toHaveLength(1);
            expect(notifications2.notifications).toHaveLength(1);

            expect(notifications1.notifications[0].resourceId).toBe(resource.resourceId);
            expect(notifications2.notifications[0].resourceId).toBe(resource.resourceId);
        });
    });

    describe('Notification CRUD Operations', () => {
        let notificationId: string;

        beforeEach(async () => {
            // Create a test notification
            const notification = {
                userId: 'integration-test-user',
                type: 'access_granted' as const,
                title: 'Integration Test Notification',
                message: 'Test message for integration testing',
                timestamp: new Date().toISOString(),
                read: false,
                severity: 'info' as const
            };

            notificationId = await notificationService.create(notification);
        });

        it('should list notifications with correct pagination', async () => {
            // Create additional notifications
            for (let i = 0; i < 5; i++) {
                await notificationService.create({
                    userId: 'integration-test-user',
                    type: 'access_granted' as const,
                    title: `Notification ${i}`,
                    message: `Message ${i}`,
                    timestamp: new Date().toISOString(),
                    read: false
                });
            }

            // Test pagination
            const page1 = await notificationService.list('integration-test-user', 3);
            expect(page1.notifications).toHaveLength(3);
            expect(page1.nextCursor).toBeDefined();

            const page2 = await notificationService.list('integration-test-user', 3, page1.nextCursor || undefined);
            expect(page2.notifications).toHaveLength(3);
        });

        it('should mark notification as read', async () => {
            const success = await notificationService.markRead('integration-test-user', notificationId);
            expect(success).toBe(true);

            const notifications = await notificationService.list('integration-test-user', 10);
            const notification = notifications.notifications.find(n => n.id === notificationId);
            expect(notification?.read).toBe(true);
        });

        it('should mark all notifications as read', async () => {
            const modified = await notificationService.markAllRead('integration-test-user');
            expect(modified).toBeGreaterThan(0);

            const notifications = await notificationService.list('integration-test-user', 10);
            expect(notifications.unreadCount).toBe(0);
        });

        it('should delete notification', async () => {
            const success = await notificationService.delete('integration-test-user', notificationId);
            expect(success).toBe(true);

            const notifications = await notificationService.list('integration-test-user', 10);
            const notification = notifications.notifications.find(n => n.id === notificationId);
            expect(notification).toBeUndefined();
        });

        it('should manage user preferences', async () => {
            // Get default preferences
            let prefs = await notificationService.getPreferences('integration-test-user');
            expect(prefs.emailOptIn).toBe(false);

            // Update preferences
            await notificationService.upsertPreferences('integration-test-user', { emailOptIn: true });

            // Verify update
            prefs = await notificationService.getPreferences('integration-test-user');
            expect(prefs.emailOptIn).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            // Close the connection temporarily
            await mongoClient.close();

            try {
                await expect(notificationService.list('test-user', 10)).rejects.toThrow();
            } finally {
                // Reconnect for cleanup
                mongoClient = new MongoClient(getMongoDBUrl());
                await mongoClient.connect();
                db = mongoClient.db(getMongoDBName());
            }
        });

        it('should validate notification data before creation', async () => {
            const invalidNotification = {
                userId: '', // Invalid: empty string
                type: 'invalid_type' as any,
                title: 'Test',
                message: 'Test message',
                timestamp: new Date().toISOString(),
                read: false
            };

            await expect(notificationService.create(invalidNotification)).rejects.toThrow('Invalid userId');
        });
    });
});
