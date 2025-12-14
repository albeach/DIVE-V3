/**
 * OPAL Server Status API Proxy
 * 
 * Proxies requests to the backend OPAL server status endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${BACKEND_URL}/api/opal/server-status`, {
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      // Allow self-signed certs in development
      ...(process.env.NODE_ENV !== 'production' && {
        // @ts-ignore - Node.js specific option
        agent: new (require('https').Agent)({ rejectUnauthorized: false }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OPAL API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch OPAL status', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

