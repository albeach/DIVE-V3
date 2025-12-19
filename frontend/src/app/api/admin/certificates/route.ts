import { NextResponse } from 'next/server';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

/**
 * Admin Certificates API Route
 * Server-side proxy for certificate management operations
 * 
 * Security: Keeps access tokens server-side only
 */

/**
 * GET - List all certificates
 */
export async function GET() {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Session validation failed' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No access token available' },
                { status: 401 }
            );
        }

        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/admin/certificates`, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`
            },
            cache: 'no-store'
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);

    } catch (error) {
        console.error('Certificates GET error:', error);
        return NextResponse.json(
            { 
                error: 'Internal Server Error', 
                message: error instanceof Error ? error.message : 'Unknown error' 
            },
            { status: 500 }
        );
    }
}

/**
 * POST - Create/Upload new certificate
 */
export async function POST(request: Request) {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/admin/certificates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });

    } catch (error) {
        console.error('Certificates POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * DELETE - Remove a certificate
 */
export async function DELETE(request: Request) {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tokens = await getSessionTokens();
        if (!tokens.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const certId = searchParams.get('id');

        if (!certId) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Certificate ID required' },
                { status: 400 }
            );
        }

        const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/admin/certificates?id=${certId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`
            }
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });

    } catch (error) {
        console.error('Certificates DELETE error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
