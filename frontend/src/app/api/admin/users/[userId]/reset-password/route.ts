/**
 * Admin User Reset Password API Route
 * 
 * POST: Reset user password
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

interface RouteContext {
    params: Promise<{ userId: string }>;
}

export const POST = withSuperAdmin(async (request, context) => {
    const { tokens, params } = context;
    const { userId } = await params!;
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
            password: body.password,
            temporary: body.temporary ?? false,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to reset password' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to reset password',
            },
            { status: response.status }
        );
    }

    return NextResponse.json({ success: true, message: 'Password reset successfully' });
});
