/**
 * Admin Clearance Validate API Route
 *
 * POST: Validate a clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const POST = withAuth(async (request, { tokens }) => {
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/clearance/validate`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Validation failed' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Validation failed',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});
