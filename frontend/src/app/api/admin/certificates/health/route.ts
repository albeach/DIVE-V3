/**
 * Admin Certificates Health API Route
 *
 * Proxies requests to the backend certificate health dashboard endpoint.
 * GET - Retrieve overall certificate health status, counts, alerts, and recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const GET = withAuth(async (request, { tokens }) => {
    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/certificates/health`);

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
