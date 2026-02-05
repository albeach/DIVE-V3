/**
 * Admin Clearance Validate API Route
 *
 * POST: Validate a clearance configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export async function POST(request: NextRequest) {
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

        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/admin/clearance/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            return NextResponse.json(
                { success: false, error: error.message || 'Validation failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Clearance API] POST validate error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to validate clearance configuration' },
            { status: 500 }
        );
    }
}
