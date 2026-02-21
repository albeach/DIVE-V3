/**
 * Admin Logs Export API Route
 *
 * POST - Export audit/security/access logs in specified format (csv/json/pdf)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const POST = withAuth(async (request, { tokens }) => {
    const body = await request.json();
    const { format, dateRange, filters } = body;

    if (!format || !['csv', 'json', 'pdf'].includes(format)) {
        return NextResponse.json(
            { success: false, error: 'ValidationError', message: 'Invalid format. Must be one of: csv, json, pdf' },
            { status: 400 }
        );
    }

    if (!dateRange?.start || !dateRange?.end) {
        return NextResponse.json(
            { success: false, error: 'ValidationError', message: 'dateRange with start and end is required' },
            { status: 400 }
        );
    }

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/logs/export`, {
        method: 'POST',
        body: JSON.stringify({ format, dateRange, filters }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to export logs' }));
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
