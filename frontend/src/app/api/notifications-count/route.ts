import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * GET /api/notifications-count - Get unread notification count
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Try to use access token from session first (may be present even if DB account is missing)
    const sessionAccessToken = (session as any).accessToken as string | undefined;

    // Get account to retrieve access token (fallback)
    const { db } = await import('@/lib/db');
    const { accounts } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const accountResults = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    const account = accountResults[0];
    const accessToken = account?.access_token || sessionAccessToken;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No access token available' },
        { status: 401 }
      );
    }

    // Forward request to backend
    const backendUrl = `${BACKEND_URL}/api/notifications-count`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Request-ID': request.headers.get('x-request-id') || `req-${Date.now()}`,
      },
      cache: 'no-store',
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[API] Notifications count GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch notification count' },
      { status: 500 }
    );
  }
}
