/**
 * Admin Compliance Report Export API Route
 *
 * GET - Export compliance data in JSON or CSV format
 */

import { NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const GET = withAuth(async (request, { tokens }) => {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/compliance/reports/export${queryString ? `?${queryString}` : ''}`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Export failed' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Export failed',
            },
            { status: response.status }
        );
    }

    const format = searchParams.get('format') || 'json';
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const extension = format === 'csv' ? 'csv' : 'json';

    const data = await response.text();
    return new NextResponse(data, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="compliance-report-${Date.now()}.${extension}"`,
        },
    });
});
