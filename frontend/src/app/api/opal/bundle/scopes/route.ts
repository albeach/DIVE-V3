/**
 * DIVE V3 - OPAL Bundle Scopes API Route
 *
 * Proxies bundle scopes requests to the backend API.
 * No admin check required - available to all authenticated users.
 *
 * @route GET /api/opal/bundle/scopes
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_URL}/api/opal/bundle/scopes${searchParams ? '?' + searchParams : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[OPAL Bundle API] Scopes error:', {
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
    console.error('[OPAL Bundle API] Scopes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
