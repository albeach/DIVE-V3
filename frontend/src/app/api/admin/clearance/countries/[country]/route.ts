/**
 * Admin Clearance Country by Code API Route
 *
 * PUT: Update a country clearance configuration
 * DELETE: Remove a country clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

interface RouteContext {
    params: Promise<{ country: string }>;
}

export const PUT = withSuperAdmin(async (request, context) => {
    const { tokens, params } = context;
    const { country } = await params!;
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/clearance/countries/${country}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update country configuration' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to update country configuration',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
});

export const DELETE = withSuperAdmin(async (request, context) => {
    const { tokens, params } = context;
    const { country } = await params!;

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/clearance/countries/${country}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete country configuration' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to delete country configuration',
            },
            { status: response.status }
        );
    }

    return NextResponse.json({ success: true, message: 'Country configuration deleted' });
});
