/**
 * Admin Certificates Rotate API Route
 *
 * Proxies requests to the backend certificate rotation endpoint.
 * POST - Initiate rotation of a certificate by ID with optional configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const POST = withAuth(async (request, { tokens }) => {
    const body = await request.json();
    const { certificateId } = body;

    if (!certificateId) {
        return NextResponse.json(
            { success: false, error: 'ValidationError', message: 'certificateId is required' },
            { status: 400 }
        );
    }

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/certificates/rotate`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to rotate certificate' }));
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
