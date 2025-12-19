/**
 * Admin IdP Session Delete API Route
 * 
 * Proxy for backend IdP session revocation endpoint
 * DELETE - Revoke a specific session
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ alias: string; sessionId: string }> }
): Promise<NextResponse> {
    try {
        const { alias, sessionId } = await params;
        
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();

        const response = await fetch(`${BACKEND_URL}/api/admin/idps/${alias}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: 'BackendError', message: error.message || `Backend returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[AdminIdPSessionDeleteAPI] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
