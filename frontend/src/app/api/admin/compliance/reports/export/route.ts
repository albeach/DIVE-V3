/**
 * Admin Compliance Report Export API Route
 *
 * Proxy for backend compliance data export
 * GET - Export compliance data in JSON or CSV format
 * Supports ?format=json|csv query parameter
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();

        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();

        const response = await fetch(
            `${BACKEND_URL}/api/admin/compliance/reports/export${queryString ? `?${queryString}` : ''}`,
            {
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`,
                },
                cache: 'no-store',
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: 'BackendError', message: error.message || `Backend returned ${response.status}` },
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

    } catch (error) {
        console.error('[AdminComplianceExport] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
