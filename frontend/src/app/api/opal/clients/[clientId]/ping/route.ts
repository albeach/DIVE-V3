/**
 * OPAL Client Ping API Proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.roles?.includes('super_admin') || 
                   session.user.roles?.includes('admin') ||
                   session.user.roles?.includes('dive-admin');
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { clientId } = await context.params;

    const response = await fetch(
      `${BACKEND_URL}/api/opal/clients/${clientId}/ping`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Ping failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL API] Ping error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
