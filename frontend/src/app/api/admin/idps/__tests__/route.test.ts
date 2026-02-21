/**
 * Tests for admin IdP POST proxy route
 * - Ensures server-side token usage and proper pass-through of backend responses
 */

// Mock session validation utilities (hoisted)
jest.mock('@/lib/session-validation', () => ({
    validateSession: jest.fn(),
    getSessionTokens: jest.fn(),
}));

// Mock NextResponse to avoid edge runtime dependencies
jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: any, init?: { status?: number }) => ({
            status: init?.status ?? 200,
            json: async () => body,
        }),
    },
}));

// Delay importing route handler until after mocks
let POST: typeof import('../route').POST;
const { validateSession, getSessionTokens } = jest.requireMock('@/lib/session-validation');

describe('POST /api/admin/idps (proxy)', () => {
    const backendUrl = 'https://backend.local';

    beforeEach(() => {
        process.env.NEXT_PUBLIC_BACKEND_URL = backendUrl;
        process.env.BACKEND_URL = backendUrl;
        (validateSession as jest.Mock).mockResolvedValue({ isValid: true });
        (getSessionTokens as jest.Mock).mockResolvedValue({
            accessToken: 'server-access-token',
            idToken: 'server-id-token',
            expiresAt: Math.floor(Date.now() / 1000) + 600,
        });
        global.fetch = jest.fn();

        // Import handler after mocks/env are set and modules reset
        delete require.cache[require.resolve('../route')];
        ({ POST } = require('../route'));
    });

    afterEach(() => {
        jest.resetAllMocks();
        delete process.env.NEXT_PUBLIC_BACKEND_URL;
    });

    it('proxies the request with server-side access token and returns backend JSON', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ success: true, data: { alias: 'test-idp' } }),
        });

        const body = { alias: 'test-idp', protocol: 'oidc' };
        const request = {
            json: async () => body,
            headers: { get: () => 'application/json' },
        } as any;

        const response = await POST(request);
        const json = await response.json();

        // Debug to surface internal errors in CI runs
        // eslint-disable-next-line no-console
        console.error('Proxy test debug response:', response.status, json);

        expect(global.fetch).toHaveBeenCalledWith(`${backendUrl}/api/admin/idps`, expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
                Authorization: 'Bearer server-access-token',
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(body),
        }));
        expect(response.status).toBe(200);
        expect(json).toEqual({ success: true, data: { alias: 'test-idp' } });
    });

    it('returns 401 when session is invalid', async () => {
        (validateSession as jest.Mock).mockResolvedValue({ isValid: false, error: 'NO_SESSION' });

        const request = {
            json: async () => ({}),
            headers: { get: () => null },
        } as any;
        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(401);
        expect(json.error).toBe('Unauthorized');
    });

    it('propagates backend errors with message and status code', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            json: jest.fn().mockResolvedValue({ message: 'Backend failure' }),
        });

        const request = {
            json: async () => ({ alias: 'bad' }),
            headers: { get: () => 'application/json' },
        } as any;

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(500);
        expect(json.error).toBe('BackendError');
        expect(json.message).toContain('Backend failure');
    });
});
