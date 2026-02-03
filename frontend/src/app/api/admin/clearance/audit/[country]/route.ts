/**
 * Admin Clearance Audit by Country API Route
 *
 * GET: Retrieve audit trail for a specific country's clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
    params: Promise<{ country: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.roles?.includes('super_admin') ||
                       session.user.roles?.includes('admin') ||
                       session.user.roles?.includes('dive-admin');

        if (!isAdmin) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { country } = await context.params;
        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();
        const url = queryString
            ? `${BACKEND_URL}/api/admin/clearance/audit/${country}?${queryString}`
            : `${BACKEND_URL}/api/admin/clearance/audit/${country}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Failed to fetch audit trail' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Clearance API] GET audit error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch clearance audit trail' },
            { status: 500 }
        );
    }
}
