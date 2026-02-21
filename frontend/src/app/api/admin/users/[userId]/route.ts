/**
 * Admin User by ID API Route
 * 
 * GET: Get user details
 * PUT: Update user
 * DELETE: Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

interface RouteContext {
    params: Promise<{ userId: string }>;
}

export const GET = withAuth(async (request, context) => {
    const { tokens, params } = context;
    const { userId } = await params!;

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users/${userId}`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'User not found' }));
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
    return NextResponse.json({ success: true, data });
});

export const PUT = withSuperAdmin(async (request, context) => {
    const { tokens, params } = context;
    const { userId } = await params!;
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update user' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to update user',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
});

export const DELETE = withSuperAdmin(async (request, context) => {
    const { tokens, params } = context;
    const { userId } = await params!;

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete user' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to delete user',
            },
            { status: response.status }
        );
    }

    return NextResponse.json({ success: true, message: 'User deleted' });
});
