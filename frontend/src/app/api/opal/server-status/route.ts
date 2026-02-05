/**
 * OPAL Server Status API Proxy
 * 
 * Proxies requests to the backend OPAL server status endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for admin role
    const isAdmin = session.user.roles?.includes('super_admin') || 
                   session.user.roles?.includes('admin') ||
                   session.user.roles?.includes('dive-admin');
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const response = await fetch(`${BACKEND_URL}/api/opal/server-status`, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
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
