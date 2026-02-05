/**
 * Admin Audit API Route
 * 
 * POST: Log admin action
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        
        // Enrich with additional context
        const enrichedLog = {
            ...body,
            actor: {
                ...body.actor,
                id: session.user.id || session.user.uniqueID,
                username: session.user.uniqueID || session.user.email,
                roles: session.user.roles || [],
            },
        };

        // Try to forward to backend
        try {
            const response = await fetch(`${BACKEND_URL}/api/admin/audit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(session as any).accessToken}`,
                },
                body: JSON.stringify(enrichedLog),
            });

            if (response.ok) {
                return NextResponse.json({ success: true });
            }
        } catch (backendError) {
            console.warn('[Audit API] Backend unavailable, logging locally');
        }

        // Log locally if backend unavailable
        console.log('[AdminAudit]', JSON.stringify(enrichedLog, null, 2));
        
        return NextResponse.json({ success: true, stored: 'local' });
        
    } catch (error) {
        console.error('[Audit API] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to log audit' }, { status: 500 });
    }
}
