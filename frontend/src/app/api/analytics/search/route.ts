/**
 * Search Analytics API Route
 *
 * Phase 2: Search & Discovery Enhancement
 * Proxy for search analytics events
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

/**
 * POST /api/analytics/search
 * Track a search analytics event
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get session for authorization (NextAuth v5)
    const session = await auth();

    if (!session?.user) {
      // Don't fail - just log warning and skip tracking
      console.warn('Analytics tracking attempted without session');
      return NextResponse.json({ success: true, warning: 'No session' });
    }

    const body = await request.json();

    // Add session ID for tracking (anonymized)
    const enrichedBody = {
      ...body,
      sessionId: session.user?.email ? hashString(session.user.email) : undefined,
      timestamp: body.timestamp || new Date().toISOString(),
    };

    // Get access token from session (NextAuth v5 stores it differently)
    const accessToken = (session as any).accessToken;

    // Forward to backend (fire and forget - don't block the response)
    fetch(`${BACKEND_URL}/api/analytics/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        'X-Request-ID': request.headers.get('x-request-id') || generateRequestId(),
      },
      body: JSON.stringify(enrichedBody),
    }).catch(err => {
      console.warn('Analytics backend request failed:', err.message);
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    // Don't fail the request - analytics should be non-blocking
    console.warn('Analytics tracking failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: true, warning: 'Tracking failed' });
  }
}

/**
 * GET /api/analytics/search
 * Get search metrics (proxied from backend)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = (session as any).accessToken;
    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '7';

    const response = await fetch(`${BACKEND_URL}/api/analytics/search/metrics?days=${days}`, {
      headers: {
        ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        'X-Request-ID': request.headers.get('x-request-id') || generateRequestId(),
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

// ============================================
// Utility Functions
// ============================================

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
