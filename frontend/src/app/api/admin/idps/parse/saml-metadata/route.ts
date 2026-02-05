/**
 * Admin IdP SAML Metadata Parse API Route
 *
 * Proxy for backend SAML metadata parsing endpoint
 * POST - Parse SAML metadata XML
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const validation = await validateSession();
        if (!validation.isValid) {
            return NextResponse.json(
                { error: 'Unauthorized', message: validation.error || 'Session invalid' },
                { status: 401 }
            );
        }

        const tokens = await getSessionTokens();
        const body = await request.json();

        const response = await fetch(`${BACKEND_URL}/api/admin/idps/parse/saml-metadata`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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
        console.error('[AdminIdPSAMLMetadataParseAPI] Error:', error);
        return NextResponse.json(
            { error: 'InternalError', message: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

