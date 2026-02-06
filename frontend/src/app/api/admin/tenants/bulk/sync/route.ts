/**
 * Admin Tenants Bulk Sync API Route
 *
 * POST: Trigger sync for multiple tenants by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const POST = withAuth(async (request, { tokens }) => {
    const body = await request.json();
    const { tenantIds } = body;

    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
        return NextResponse.json(
            { success: false, error: 'ValidationError', message: 'tenantIds must be a non-empty array of strings' },
            { status: 400 }
        );
    }

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/tenants/bulk/sync`, {
        method: 'POST',
        body: JSON.stringify({ tenantIds }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to sync tenants' }));
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
