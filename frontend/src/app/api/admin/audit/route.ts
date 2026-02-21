/**
 * Admin Audit API Route
 * 
 * POST: Log admin action
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const POST = withAuth(async (request, { tokens, session }) => {
    const body = await request.json();
    
    // Enrich with session context
    const enrichedLog = {
        ...body,
        actor: {
            ...body.actor,
            id: session.user.id || session.user.uniqueID,
            username: session.user.uniqueID || session.user.email,
            roles: session.user.roles || [],
        },
    };

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/audit`, {
        method: 'POST',
        body: JSON.stringify(enrichedLog),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to log audit' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to log audit',
            },
            { status: response.status }
        );
    }

    return NextResponse.json({ success: true });
});
