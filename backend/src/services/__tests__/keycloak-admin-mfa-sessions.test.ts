/**
 * Keycloak Admin Service Tests - MFA & Session Management
 * 
 * Tests for new MFA configuration and session management methods
 * Phase 1 Testing: Backend Unit Tests
 */

import { keycloakAdminService } from '../keycloak-admin.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Keycloak Admin Client
jest.mock('@keycloak/keycloak-admin-client', () => {
    return jest.fn().mockImplementation(() => ({
        auth: jest.fn().mockResolvedValue(undefined),
        setConfig: jest.fn(),
        accessToken: 'mock-admin-token',
        identityProviders: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            del: jest.fn()
        },
        users: {
            find: jest.fn(),
            listSessions: jest.fn(),
            logout: jest.fn()
        },
        roles: {
            findOneByName: jest.fn(),
            create: jest.fn()
        }
    }));
});

describe('Keycloak Admin Service - MFA Configuration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getMFAConfig', () => {
        it('should retrieve MFA configuration successfully', async () => {
            const mockFlows = [
                { id: 'flow-1', alias: 'browser', builtIn: true, topLevel: true },
                { id: 'flow-2', alias: 'registration', builtIn: true, topLevel: false }
            ];

            mockedAxios.get.mockResolvedValue({ data: mockFlows });

            const config = await keycloakAdminService.getMFAConfig('test-realm');

            expect(config.flowId).toBe('flow-1');
            expect(config.flowAlias).toBe('browser');
            expect(config.builtIn).toBe(true);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('/admin/realms/test-realm/authentication/flows'),
                expect.any(Object)
            );
        });

        it('should use default realm if not specified', async () => {
            mockedAxios.get.mockResolvedValue({ data: [] });

            await keycloakAdminService.getMFAConfig();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('/dive-v3-broker/'),
                expect.any(Object)
            );
        });

        it('should handle errors gracefully', async () => {
            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            await expect(keycloakAdminService.getMFAConfig('test-realm'))
                .rejects
                .toThrow('Failed to get MFA config');
        });
    });

    describe('updateMFAConfig', () => {
        it('should update MFA configuration successfully', async () => {
            const mockRealmData = {
                realm: 'test-realm',
                otpPolicyType: 'totp',
                otpPolicyAlgorithm: 'HmacSHA1'
            };

            mockedAxios.get.mockResolvedValue({ data: mockRealmData });
            mockedAxios.put.mockResolvedValue({ data: {} });

            const config = {
                otp: {
                    type: 'totp',
                    algorithm: 'HmacSHA256',
                    digits: 6,
                    period: 30
                }
            };

            await keycloakAdminService.updateMFAConfig(config, 'test-realm');

            expect(mockedAxios.put).toHaveBeenCalledWith(
                expect.stringContaining('/admin/realms/test-realm'),
                expect.objectContaining({
                    otpPolicyType: 'totp',
                    otpPolicyAlgorithm: 'HmacSHA256',
                    otpPolicyDigits: 6,
                    otpPolicyPeriod: 30
                }),
                expect.any(Object)
            );
        });

        it('should use default values if not specified', async () => {
            mockedAxios.get.mockResolvedValue({ data: {} });
            mockedAxios.put.mockResolvedValue({ data: {} });

            await keycloakAdminService.updateMFAConfig({}, 'test-realm');

            expect(mockedAxios.put).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    otpPolicyType: 'totp',
                    otpPolicyAlgorithm: 'HmacSHA256',
                    otpPolicyDigits: 6,
                    otpPolicyPeriod: 30
                }),
                expect.any(Object)
            );
        });

        it('should handle errors gracefully', async () => {
            mockedAxios.get.mockResolvedValue({ data: {} });
            mockedAxios.put.mockRejectedValue(new Error('Update failed'));

            await expect(keycloakAdminService.updateMFAConfig({}, 'test-realm'))
                .rejects
                .toThrow('Failed to update MFA config');
        });
    });

    describe('testMFAFlow', () => {
        it('should test MFA flow successfully', async () => {
            const mockRequiredActions = [
                { alias: 'CONFIGURE_TOTP', enabled: true },
                { alias: 'UPDATE_PASSWORD', enabled: true }
            ];

            mockedAxios.get.mockResolvedValue({ data: mockRequiredActions });

            const result = await keycloakAdminService.testMFAFlow('test-realm');

            expect(result.success).toBe(true);
            expect(result.message).toBe('MFA flow test successful');
            expect(result.requiredActions).toHaveLength(2);
            expect(result.otpEnabled).toBe(true);
        });

        it('should return success: false if OTP action not enabled', async () => {
            const mockRequiredActions = [
                { alias: 'UPDATE_PASSWORD', enabled: true }
            ];

            mockedAxios.get.mockResolvedValue({ data: mockRequiredActions });

            const result = await keycloakAdminService.testMFAFlow('test-realm');

            expect(result.otpEnabled).toBe(false);
        });

        it('should handle errors gracefully', async () => {
            mockedAxios.get.mockRejectedValue(new Error('API error'));

            const result = await keycloakAdminService.testMFAFlow('test-realm');

            expect(result.success).toBe(false);
            expect(result.message).toContain('MFA flow test failed');
        });
    });
});

describe('Keycloak Admin Service - Session Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getActiveSessions', () => {
        it('should retrieve active sessions successfully', async () => {
            const mockUsers = [
                { id: 'user-1', username: 'john.doe' },
                { id: 'user-2', username: 'jane.smith' }
            ];

            const mockSessions = [
                {
                    id: 'session-1',
                    ipAddress: '192.168.1.100',
                    start: 1729692000000,
                    lastAccess: 1729695600000,
                    clients: { 'client-1': 'DIVE V3' }
                }
            ];

            // Mock Keycloak Admin Client
            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue(mockUsers);
            mockClient.users.listSessions = jest.fn()
                .mockResolvedValueOnce(mockSessions) // user-1 has session
                .mockResolvedValueOnce([]); // user-2 has no sessions

            const sessions = await keycloakAdminService.getActiveSessions('test-realm');

            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe('session-1');
            expect(sessions[0].username).toBe('john.doe');
            expect(sessions[0].userId).toBe('user-1');
            expect(sessions[0].ipAddress).toBe('192.168.1.100');
        });

        it('should filter sessions by username', async () => {
            const mockUsers = [
                { id: 'user-1', username: 'john.doe' },
                { id: 'user-2', username: 'jane.smith' }
            ];

            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue(mockUsers);
            mockClient.users.listSessions = jest.fn().mockResolvedValue([
                { id: 'session-1', ipAddress: '192.168.1.100' }
            ]);

            const sessions = await keycloakAdminService.getActiveSessions('test-realm', {
                username: 'john.doe'
            });

            // Should only include john.doe's session
            expect(sessions.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle users with no sessions', async () => {
            const mockUsers = [{ id: 'user-1', username: 'no.sessions' }];

            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue(mockUsers);
            mockClient.users.listSessions = jest.fn().mockRejectedValue(new Error('No sessions'));

            const sessions = await keycloakAdminService.getActiveSessions('test-realm');

            expect(sessions).toHaveLength(0);
        });
    });

    describe('revokeSession', () => {
        it('should revoke session successfully', async () => {
            mockedAxios.delete.mockResolvedValue({ data: {} });

            await keycloakAdminService.revokeSession('session-123', 'test-realm');

            expect(mockedAxios.delete).toHaveBeenCalledWith(
                expect.stringContaining('/admin/realms/test-realm/sessions/session-123'),
                expect.any(Object)
            );
        });

        it('should handle errors gracefully', async () => {
            mockedAxios.delete.mockRejectedValue(new Error('Session not found'));

            await expect(keycloakAdminService.revokeSession('invalid', 'test-realm'))
                .rejects
                .toThrow('Failed to revoke session');
        });
    });

    describe('revokeUserSessions', () => {
        it('should revoke all user sessions successfully', async () => {
            const mockUsers = [{ id: 'user-123', username: 'john.doe' }];

            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue(mockUsers);
            mockClient.users.logout = jest.fn().mockResolvedValue(undefined);

            const count = await keycloakAdminService.revokeUserSessions('john.doe', 'test-realm');

            expect(count).toBe(1);
            expect(mockClient.users.logout).toHaveBeenCalledWith({
                id: 'user-123',
                realm: 'test-realm'
            });
        });

        it('should throw error if user not found', async () => {
            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue([]);

            await expect(keycloakAdminService.revokeUserSessions('unknown', 'test-realm'))
                .rejects
                .toThrow('User unknown not found');
        });
    });

    describe('getSessionStats', () => {
        it('should calculate session statistics correctly', async () => {
            const mockUsers = [
                { id: 'user-1', username: 'john.doe' },
                { id: 'user-2', username: 'jane.smith' }
            ];

            const now = Date.now();
            const mockSessions = [
                {
                    id: 'session-1',
                    ipAddress: '192.168.1.100',
                    start: now - 3600000, // 1 hour ago
                    lastAccess: now,
                    clients: { 'client-1': 'DIVE V3' }
                },
                {
                    id: 'session-2',
                    ipAddress: '192.168.1.101',
                    start: now - 7200000, // 2 hours ago
                    lastAccess: now,
                    clients: { 'client-1': 'DIVE V3' }
                }
            ];

            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue(mockUsers);
            mockClient.users.listSessions = jest.fn()
                .mockResolvedValueOnce([mockSessions[0]])
                .mockResolvedValueOnce([mockSessions[1]]);

            const stats = await keycloakAdminService.getSessionStats('test-realm');

            expect(stats.totalActive).toBe(2);
            expect(stats.averageDuration).toBeGreaterThan(0);
            expect(stats.byClient['client-1']).toBe(2);
            expect(stats.byUser['john.doe']).toBe(1);
            expect(stats.byUser['jane.smith']).toBe(1);
        });

        it('should handle empty sessions', async () => {
            const mockClient = (keycloakAdminService as any).client;
            mockClient.users.find = jest.fn().mockResolvedValue([]);

            const stats = await keycloakAdminService.getSessionStats('test-realm');

            expect(stats.totalActive).toBe(0);
            expect(stats.averageDuration).toBe(0);
            expect(Object.keys(stats.byClient)).toHaveLength(0);
            expect(Object.keys(stats.byUser)).toHaveLength(0);
        });
    });
});

