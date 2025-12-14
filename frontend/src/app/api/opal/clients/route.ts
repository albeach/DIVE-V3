/**
 * OPAL Clients API Proxy
 * 
 * Proxies requests to the backend OPAL clients endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', clients: [] }, { status: 401 });
    }

    const isAdmin = session.user.roles?.includes('super_admin') || 
                   session.user.roles?.includes('admin') ||
                   session.user.roles?.includes('dive-admin');
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden', clients: [] }, { status: 403 });
    }

    const response = await fetch(`${BACKEND_URL}/api/opal/clients`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OPAL API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch OPAL clients', clients: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', clients: [] },
      { status: 500 }
    );
  }
}
