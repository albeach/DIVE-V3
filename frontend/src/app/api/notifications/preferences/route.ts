import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * GET /api/notifications/preferences/me - Get user preferences
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get account to retrieve access token
    const { db } = await import('@/lib/db');
    const { accounts } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const accountResults = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    const account = accountResults[0];
    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No access token available' },
        { status: 401 }
      );
    }

    // Forward request to backend
    const backendUrl = `${BACKEND_URL}/api/notifications/preferences/me`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[API] Notifications preferences GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications/preferences/me - Update user preferences
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get account to retrieve access token
    const { db } = await import('@/lib/db');
    const { accounts } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const accountResults = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    const account = accountResults[0];
    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No access token available' },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();

    // Forward request to backend
    const backendUrl = `${BACKEND_URL}/api/notifications/preferences/me`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[API] Notifications preferences POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

