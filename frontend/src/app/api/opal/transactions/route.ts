/**
 * OPAL Transactions API Proxy
 * 
 * Proxies requests to the backend OPAL transactions endpoint.
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

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';

    const response = await fetch(
      `${BACKEND_URL}/api/opal/transactions?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        ...(process.env.NODE_ENV !== 'production' && {
          // @ts-ignore
          agent: new (require('https').Agent)({ rejectUnauthorized: false }),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OPAL API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch transactions', transactions: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', transactions: [] },
      { status: 500 }
    );
  }
}

