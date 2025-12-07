/**
 * OTP Status API Route
 * 
 * Proxy for OTP status endpoint
 * Checks if user has OTP configured
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // Validate session server-side
        const validation = await validateSession();

        if (!validation.isValid) {
            return NextResponse.json(
                {
                    error: 'Unauthorized',
                    message: validation.error || 'Session invalid',
                },
                { status: 401 }
            );
        }

        // Get tokens server-side
        const tokens = await getSessionTokens();

        // Get request body
        const body = await request.json().catch(() => ({}));
        const { idpAlias, username } = body;

        if (!idpAlias || !username) {
            return NextResponse.json(
                {
                    error: 'BadRequest',
                    message: 'idpAlias and username are required',
                },
                { status: 400 }
            );
        }

        // Proxy request to backend with access token
        const response = await fetch(`${BACKEND_URL}/api/auth/otp/status`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
                'X-Request-ID': request.headers.get('x-request-id') || `req-${Date.now()}`,
            },
            body: JSON.stringify({ idpAlias, username }),
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[OTPStatusAPI] Backend error:', {
                status: response.status,
                error,
            });

            return NextResponse.json(
                {
                    error: 'BackendError',
                    message: error.message || `Backend returned ${response.status}`,
                    details: error,
                },
                { status: response.status }
            );
        }

        // Forward backend response to client
        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[OTPStatusAPI] Error:', error);

        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}






