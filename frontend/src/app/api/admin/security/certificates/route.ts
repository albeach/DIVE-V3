/**
 * Admin Security Certificates API Route
 * 
 * GET: Check SSL certificate health for all endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request, { tokens }) => {
    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/security/certificates`);

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
