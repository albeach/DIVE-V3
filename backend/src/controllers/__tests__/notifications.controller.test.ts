/**
 * Notification Controller Tests
 * Tests HTTP endpoints for notification management
 */

import { Request, Response } from 'express';
import { notificationService } from '../../services/notification.service';
import {
    listNotificationsHandler,
    markNotificationReadHandler,
    markAllNotificationsReadHandler,
    deleteNotificationHandler,
    getPreferencesHandler,
    updatePreferencesHandler,
    seedNotificationsHandler
} from '../notifications.controller';

// Mock the notification service
jest.mock('../../services/notification.service', () => ({
    notificationService: {
        list: jest.fn(),
        markRead: jest.fn(),
        markAllRead: jest.fn(),
        delete: jest.fn(),
        getPreferences: jest.fn(),
        upsertPreferences: jest.fn(),
        create: jest.fn()
    }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
    }
}));

describe('Notification Controller', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
        jsonMock = jest.fn();
        statusMock = jest.fn().mockReturnValue({ json: jsonMock });

        mockRequest = {
            headers: { 'x-request-id': 'test-request-id' },
            query: {},
            params: {},
            body: {}
        };

        mockResponse = {
            status: statusMock,
            json: jsonMock
        };

        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('listNotificationsHandler', () => {
        it('should return notifications for authenticated user', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            const mockNotifications = {
                notifications: [
                    {
                        id: '1',
                        userId: 'test-user-123',
                        type: 'access_granted',
                        title: 'Access Granted',
                        message: 'Test message',
                        timestamp: new Date().toISOString(),
                        read: false
                    }
                ],
                unreadCount: 1,
                nextCursor: null
            };

            (mockRequest as any).user = mockUser;
            (notificationService.list as jest.Mock).mockResolvedValue(mockNotifications);

            await listNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.list).toHaveBeenCalledWith('test-user-123', 50, undefined);
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                ...mockNotifications,
                requestId: 'test-request-id'
            });
        });

        it('should handle limit parameter', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;
            mockRequest.query = { limit: '25' };

            const mockNotifications = { notifications: [], unreadCount: 0, nextCursor: null };
            (notificationService.list as jest.Mock).mockResolvedValue(mockNotifications);

            await listNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.list).toHaveBeenCalledWith('test-user-123', 25, undefined);
        });

        it('should handle cursor parameter', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;
            mockRequest.query = { cursor: 'cursor123', limit: '10' };

            const mockNotifications = { notifications: [], unreadCount: 0, nextCursor: null };
            (notificationService.list as jest.Mock).mockResolvedValue(mockNotifications);

            await listNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.list).toHaveBeenCalledWith('test-user-123', 10, 'cursor123');
        });

        it('should return 401 for unauthenticated user', async () => {
            (mockRequest as any).user = undefined;

            await listNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(statusMock).toHaveBeenCalledWith(401);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Unauthorized',
                requestId: 'test-request-id'
            });
        });

        it('should handle service errors', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;

            (notificationService.list as jest.Mock).mockRejectedValue(new Error('Database error'));

            await listNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Failed to load notifications',
                requestId: 'test-request-id'
            });
        });
    });

    describe('markNotificationReadHandler', () => {
        it('should mark notification as read', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;
            mockRequest.params = { id: 'notification-123' };

            (notificationService.markRead as jest.Mock).mockResolvedValue(true);

            await markNotificationReadHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.markRead).toHaveBeenCalledWith('test-user-123', 'notification-123');
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                requestId: 'test-request-id'
            });
        });

        it('should return 404 when notification not found', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;
            mockRequest.params = { id: 'notification-123' };

            (notificationService.markRead as jest.Mock).mockResolvedValue(false);

            await markNotificationReadHandler(mockRequest as Request, mockResponse as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Not found',
                requestId: 'test-request-id'
            });
        });
    });

    describe('markAllNotificationsReadHandler', () => {
        it('should mark all notifications as read', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;

            (notificationService.markAllRead as jest.Mock).mockResolvedValue(5);

            await markAllNotificationsReadHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.markAllRead).toHaveBeenCalledWith('test-user-123');
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                modified: 5,
                requestId: 'test-request-id'
            });
        });
    });

    describe('deleteNotificationHandler', () => {
        it('should delete notification', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;
            mockRequest.params = { id: 'notification-123' };

            (notificationService.delete as jest.Mock).mockResolvedValue(true);

            await deleteNotificationHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.delete).toHaveBeenCalledWith('test-user-123', 'notification-123');
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                requestId: 'test-request-id'
            });
        });
    });

    describe('getPreferencesHandler', () => {
        it('should return user preferences', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            const mockPrefs = { userId: 'test-user-123', emailOptIn: true };
            (mockRequest as any).user = mockUser;

            (notificationService.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);

            await getPreferencesHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.getPreferences).toHaveBeenCalledWith('test-user-123');
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                data: mockPrefs,
                requestId: 'test-request-id'
            });
        });
    });

    describe('updatePreferencesHandler', () => {
        it('should update user preferences', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            const mockPrefs = { userId: 'test-user-123', emailOptIn: true };
            (mockRequest as any).user = mockUser;
            mockRequest.body = { emailOptIn: true };

            (notificationService.upsertPreferences as jest.Mock).mockResolvedValue(mockPrefs);

            await updatePreferencesHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.upsertPreferences).toHaveBeenCalledWith('test-user-123', { emailOptIn: true });
            expect(statusMock).toHaveBeenCalledWith(200);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                data: mockPrefs,
                requestId: 'test-request-id'
            });
        });
    });

    describe('seedNotificationsHandler', () => {
        it('should create seed notifications in development', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;

            // Mock process.env
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            (notificationService.create as jest.Mock).mockResolvedValue('notification-id');

            await seedNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(notificationService.create).toHaveBeenCalledTimes(4);
            expect(statusMock).toHaveBeenCalledWith(201);
            expect(jsonMock).toHaveBeenCalledWith({
                success: true,
                created: 4,
                requestId: 'test-request-id'
            });

            // Restore env
            process.env.NODE_ENV = originalEnv;
        });

        it('should reject seeding in production', async () => {
            const mockUser = { uniqueID: 'test-user-123' };
            (mockRequest as any).user = mockUser;

            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            await seedNotificationsHandler(mockRequest as Request, mockResponse as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(jsonMock).toHaveBeenCalledWith({
                error: 'Forbidden',
                message: 'Seeding disabled in production',
                requestId: 'test-request-id'
            });

            process.env.NODE_ENV = originalEnv;
        });
    });

    // Test authentication checks for all handlers
    describe('authentication checks', () => {
        const handlers = [
            { name: 'listNotificationsHandler', handler: listNotificationsHandler },
            { name: 'markNotificationReadHandler', handler: markNotificationReadHandler },
            { name: 'markAllNotificationsReadHandler', handler: markAllNotificationsReadHandler },
            { name: 'deleteNotificationHandler', handler: deleteNotificationHandler },
            { name: 'getPreferencesHandler', handler: getPreferencesHandler },
            { name: 'updatePreferencesHandler', handler: updatePreferencesHandler },
            { name: 'seedNotificationsHandler', handler: seedNotificationsHandler }
        ];

        handlers.forEach(({ name, handler }) => {
            it(`${name} should return 401 for unauthenticated user`, async () => {
                (mockRequest as any).user = undefined;

                await handler(mockRequest as Request, mockResponse as Response);

                expect(statusMock).toHaveBeenCalledWith(401);
                expect(jsonMock).toHaveBeenCalledWith({
                    error: 'Unauthorized',
                    requestId: 'test-request-id'
                });
            });
        });
    });
});




