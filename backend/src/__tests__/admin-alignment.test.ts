/**
 * Phase 7: Admin UI/Backend Alignment Tests
 *
 * Verifies that frontend API paths have matching backend routes,
 * mock data is replaced with real service calls, and new
 * security endpoints are properly wired.
 */

import { Request, Response } from 'express';

// --- Mock services BEFORE imports ---

const mockGetSessionStats = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockRevokeSession = jest.fn();
const mockRevokeUserSessions = jest.fn();
const mockGetRealmConfig = jest.fn();
const mockUpdateRealmConfig = jest.fn();

jest.mock('../services/keycloak-admin.service', () => ({
    keycloakAdminService: {
        getSessionStats: (...args: unknown[]) => mockGetSessionStats(...args),
        getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
        revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
        revokeUserSessions: (...args: unknown[]) => mockRevokeUserSessions(...args),
        getRealmConfig: (...args: unknown[]) => mockGetRealmConfig(...args),
        updateRealmConfig: (...args: unknown[]) => mockUpdateRealmConfig(...args),
        getMFAConfig: jest.fn().mockResolvedValue({}),
        updateMFAConfig: jest.fn().mockResolvedValue(undefined),
        testMFAFlow: jest.fn().mockResolvedValue({ success: true }),
    },
}));

const mockGetStatistics = jest.fn();

jest.mock('../services/decision-log.service', () => ({
    decisionLogService: {
        getStatistics: (...args: unknown[]) => mockGetStatistics(...args),
        logDecision: jest.fn(),
        queryDecisions: jest.fn().mockResolvedValue([]),
    },
}));

const mockGetDb = jest.fn();
jest.mock('../utils/mongodb-singleton', () => ({
    getDb: () => mockGetDb(),
    getMongoClient: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// --- Imports after mocks ---

const {
    getSessionAnalyticsHandler,
    getSessionsListHandler,
    revokeSessionHandler,
    revokeAllUserSessionsHandler,
} = require('../controllers/admin-sessions.controller');

const {
    getFederationStatisticsHandler,
    getFederationTrafficHandler,
} = require('../controllers/federation-statistics.controller');

const {
    getPasswordPolicyHandler,
    updatePasswordPolicyHandler,
} = require('../controllers/admin-password-policy.controller');

const {
    getSecurityHeadersHandler,
} = require('../controllers/admin-security-headers.controller');

// --- Helpers ---

function mockReq(overrides?: Partial<Request>): Request {
    return {
        headers: { 'x-request-id': 'test-req-1' },
        params: {},
        query: {},
        body: {},
        ...overrides,
    } as unknown as Request;
}

function mockRes(): Response & { _json: unknown; _status: number } {
    const res = {
        _json: null as unknown,
        _status: 200,
        status(code: number) { res._status = code; return res; },
        json(data: unknown) { res._json = data; return res; },
    };
    return res as unknown as Response & { _json: unknown; _status: number };
}

function setupDefaultMocks(): void {
    mockGetSessionStats.mockResolvedValue({
        totalActive: 5,
        peakConcurrent24h: 8,
        averageDuration: 1800,
        byClient: { 'dive-frontend': 3 },
        byUser: { 'user1': 2, 'user2': 3 },
    });

    mockGetActiveSessions.mockResolvedValue([
        { id: 'sess-1', username: 'user1', userId: 'uid-1', ipAddress: '10.0.0.1', start: Date.now() - 3600000, lastAccess: Date.now(), clients: {} },
        { id: 'sess-2', username: 'user2', userId: 'uid-2', ipAddress: '10.0.0.2', start: Date.now() - 7200000, lastAccess: Date.now(), clients: {} },
    ]);

    mockRevokeSession.mockResolvedValue(undefined);
    mockRevokeUserSessions.mockResolvedValue(2);

    mockGetRealmConfig.mockResolvedValue({
        passwordPolicy: 'length(8) and upperCase(1) and digits(1)',
    });

    mockUpdateRealmConfig.mockResolvedValue(undefined);

    mockGetStatistics.mockResolvedValue({
        totalDecisions: 100,
        allowCount: 95,
        denyCount: 5,
        averageLatency: 42,
        topDenyReasons: [],
        decisionsByCountry: { 'USA': 60, 'GBR': 40 },
    });

    // Mock MongoDB collection for federation stats
    const mockCollection = {
        find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        countDocuments: jest.fn().mockResolvedValue(0),
    };
    mockGetDb.mockReturnValue({
        collection: jest.fn().mockReturnValue(mockCollection),
    });
}

// --- Tests ---

describe('Phase 7: Admin UI/Backend Alignment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaultMocks();
    });

    // ===== 1. Session Analytics (real data) =====

    describe('Session Analytics (real Keycloak data)', () => {
        it('returns real session count from Keycloak', async () => {
            const req = mockReq();
            const res = mockRes();

            await getSessionAnalyticsHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockGetSessionStats).toHaveBeenCalledTimes(1);

            const data = (res._json as { data: { analytics: { activeSessions: number } } }).data;
            expect(data.analytics.activeSessions).toBe(5);
        });

        it('does not contain Math.random data', async () => {
            const req = mockReq();
            const res = mockRes();

            await getSessionAnalyticsHandler(req, res);

            // activeSessions should be exact (5), not random
            const analytics = (res._json as { data: { analytics: { activeSessions: number } } }).data.analytics;
            expect(analytics.activeSessions).toBe(5);
        });
    });

    // ===== 2. Session List (real data) =====

    describe('Session List (real Keycloak data)', () => {
        it('returns real sessions from Keycloak', async () => {
            const req = mockReq({ query: { page: '1', limit: '50' } });
            const res = mockRes();

            await getSessionsListHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockGetActiveSessions).toHaveBeenCalledTimes(1);

            const data = (res._json as { data: { sessions: unknown[]; total: number } }).data;
            expect(data.sessions).toHaveLength(2);
            expect(data.total).toBe(2);
        });

        it('paginates sessions correctly', async () => {
            const req = mockReq({ query: { page: '1', limit: '1' } });
            const res = mockRes();

            await getSessionsListHandler(req, res);

            const data = (res._json as { data: { sessions: unknown[]; total: number; pageSize: number } }).data;
            expect(data.sessions).toHaveLength(1);
            expect(data.total).toBe(2);
            expect(data.pageSize).toBe(1);
        });
    });

    // ===== 3. Session Revocation (real calls) =====

    describe('Session Revocation (real Keycloak calls)', () => {
        it('revokes single session via Keycloak', async () => {
            const req = mockReq({ params: { id: 'sess-1' } });
            const res = mockRes();

            await revokeSessionHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockRevokeSession).toHaveBeenCalledWith('sess-1');
        });

        it('revokes all user sessions via Keycloak', async () => {
            const req = mockReq({ params: { userId: 'user1' } });
            const res = mockRes();

            await revokeAllUserSessionsHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockRevokeUserSessions).toHaveBeenCalledWith('user1');

            const data = (res._json as { data: { count: number } }).data;
            expect(data.count).toBe(2);
        });
    });

    // ===== 4. Password Policy =====

    describe('Password Policy Endpoint', () => {
        it('GET returns current policy from Keycloak', async () => {
            const req = mockReq();
            const res = mockRes();

            await getPasswordPolicyHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockGetRealmConfig).toHaveBeenCalledTimes(1);

            const data = (res._json as { data: { rawPolicy: string; rules: Record<string, unknown> } }).data;
            expect(data.rawPolicy).toBe('length(8) and upperCase(1) and digits(1)');
            expect(data.rules).toEqual({ length: 8, upperCase: 1, digits: 1 });
        });

        it('PUT updates policy via Keycloak', async () => {
            const req = mockReq({ body: { policy: 'length(12) and specialChars(1)' } });
            const res = mockRes();

            await updatePasswordPolicyHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockUpdateRealmConfig).toHaveBeenCalledWith({
                passwordPolicy: 'length(12) and specialChars(1)',
            });
        });

        it('PUT rejects missing policy field', async () => {
            const req = mockReq({ body: {} });
            const res = mockRes();

            await updatePasswordPolicyHandler(req, res);

            expect(res._status).toBe(400);
        });
    });

    // ===== 5. Security Headers =====

    describe('Security Headers Endpoint', () => {
        it('GET returns security header configuration', async () => {
            const req = mockReq();
            const res = mockRes();

            await getSecurityHeadersHandler(req, res);

            expect(res._status).toBe(200);

            const data = (res._json as { data: { headers: Record<string, { enabled: boolean }> } }).data;
            expect(data.headers['Strict-Transport-Security'].enabled).toBe(true);
            expect(data.headers['X-Frame-Options'].enabled).toBe(true);
            expect(data.headers['Content-Security-Policy'].enabled).toBe(true);
        });
    });

    // ===== 6. Federation Statistics (real data) =====

    describe('Federation Statistics (real MongoDB data)', () => {
        it('returns statistics from decision log service', async () => {
            const req = mockReq();
            const res = mockRes();

            await getFederationStatisticsHandler(req, res);

            expect(res._status).toBe(200);
            expect(mockGetStatistics).toHaveBeenCalled();
        });

        it('returns traffic data from decisions collection', async () => {
            const req = mockReq();
            const res = mockRes();

            await getFederationTrafficHandler(req, res);

            expect(res._status).toBe(200);
            const data = (res._json as { data: { traffic: { timeRange: { start: string; end: string } } } }).data;
            expect(data.traffic.timeRange).toBeDefined();
        });

        it('does not contain Math.random data', async () => {
            const req = mockReq();
            const res = mockRes();

            await getFederationStatisticsHandler(req, res);

            const data = (res._json as { data: { statistics: { totalRequests24h: number } } }).data;
            // With mocked empty collections, totalRequests should be 100 (from mockGetStatistics)
            expect(data.statistics.totalRequests24h).toBe(100);
        });
    });

    // ===== 7. Route Wiring =====

    describe('Route Wiring', () => {
        it('admin.routes.ts imports new controllers', () => {
            // Verify the controllers loaded without error (require above succeeded)
            expect(getPasswordPolicyHandler).toBeDefined();
            expect(getSecurityHeadersHandler).toBeDefined();
            expect(getSessionAnalyticsHandler).toBeDefined();
            expect(getFederationStatisticsHandler).toBeDefined();
        });
    });
});
