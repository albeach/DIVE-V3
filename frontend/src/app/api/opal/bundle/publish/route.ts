/**
 * DIVE V3 - OPAL Bundle Publish API Route
 *
 * Proxies bundle publish requests to the backend API.
 *
 * @route POST /api/opal/bundle/publish
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function POST(request: NextRequest) {
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

    const response = await fetch(
      `${BACKEND_URL}/api/opal/bundle/publish`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[OPAL Bundle API] Publish error:', {
        status: response.status,
        error: errorData,
      });
      return NextResponse.json(
        { error: errorData.message || 'Backend request failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[OPAL Bundle API] Publish error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
