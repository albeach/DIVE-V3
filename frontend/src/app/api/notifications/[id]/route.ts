import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * POST /api/notifications/[id]/read - Mark notification as read
 */
export async function POST(request: NextRequest, context: any) {
  const { params } = context;
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
    const backendUrl = `${BACKEND_URL}/api/notifications/${params.id}/read`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[API] Notification read POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/[id] - Delete notification
 */
export async function DELETE(request: NextRequest, context: any) {
  const { params } = context;
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
    const backendUrl = `${BACKEND_URL}/api/notifications/${params.id}`;

    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[API] Notification delete error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}




