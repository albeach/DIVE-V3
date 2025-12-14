/**
 * OPAL Client Force Sync API Proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = await getToken({ req: request });
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId } = await context.params;

    const response = await fetch(
      `${BACKEND_URL}/api/opal/clients/${clientId}/force-sync`,
      {
        method: 'POST',
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
      return NextResponse.json(
        { error: 'Force sync failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL API] Force sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

