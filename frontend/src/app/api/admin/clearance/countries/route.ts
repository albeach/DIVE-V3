/**
 * Admin Clearance Countries API Route
 *
 * GET: List all countries with clearance configurations
 * POST: Create a new country clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const GET = withAuth(async (request, { tokens }) => {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/clearance/countries${queryString ? `?${queryString}` : ''}`);

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

export const POST = withSuperAdmin(async (request, { tokens }) => {
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/clearance/countries`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create country configuration' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to create country configuration',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
});
