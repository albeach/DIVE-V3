/**
 * Admin IdP Theme Preview API Route
 * 
 * Proxy for backend IdP theme preview endpoint
 * GET - Get theme preview HTML
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ alias: string }> }
): Promise<NextResponse> {
    try {
        const { alias } = await params;
        
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();

        const response = await fetch(`${BACKEND_URL}/api/admin/idps/${alias}/theme/preview`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.text().catch(() => 'Unknown error');
            return new NextResponse(error, { status: response.status });
        }

        // Return HTML content
        const html = await response.text();
        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html',
            },
        });

    } catch (error) {
        console.error('[AdminIdPThemePreviewAPI] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}




