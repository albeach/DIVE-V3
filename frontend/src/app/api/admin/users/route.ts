/**
 * Admin Users API Route
 *
 * Modern 2026 implementation using standardized middleware:
 * - Consistent authentication via withAdminAuth
 * - Automatic token refresh
 * - Standardized error responses
 * - Audit logging
 * - No mock data fallbacks
 *
 * GET: List users
 * POST: Create user (requires super_admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users
 * List users with pagination and search
 */
export const GET = withAuth(async (request, { tokens }) => {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users?${queryString}`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Backend error' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || `Backend returned ${response.status}`,
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});

/**
 * POST /api/admin/users
 * Create new user (requires super_admin role)
 */
export const POST = withSuperAdmin(async (request, { tokens }) => {
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create user' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to create user',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});
