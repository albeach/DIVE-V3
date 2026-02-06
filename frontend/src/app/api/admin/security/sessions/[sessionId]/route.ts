/**
 * Admin Security Session by ID API Route
 * 
 * DELETE: Terminate a specific session
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

interface RouteContext {
    params: Promise<{ sessionId: string }>;
}

export const DELETE = withSuperAdmin(async (request, { tokens }, context: RouteContext) => {
    const { sessionId } = await context.params;

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/security/sessions/${sessionId}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to terminate session' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to terminate session',
            },
            { status: response.status }
        );
    }

    return NextResponse.json({ success: true, message: 'Session terminated' });
});
