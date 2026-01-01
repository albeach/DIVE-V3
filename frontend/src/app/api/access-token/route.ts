/**
 * DIVE V3 - Access Token API Endpoint
 *
 * Returns the current user's access token for use in API calls.
 * This is used by the API documentation page to auto-authorize Swagger UI.
 *
 * @security This endpoint only returns the token to authenticated users
 *           and should only be called from the same origin.
 *           The token is fetched server-side from the database, not from the client session.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Fetch the access token directly from the database
    // This is the same approach used in the session callback
    const accountResults = await db
      .select({
        access_token: accounts.access_token,
        expires_at: accounts.expires_at,
      })
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    const account = accountResults[0];

    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'No access token available' },
        { status: 404 }
      );
    }

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (account.expires_at && account.expires_at < currentTime) {
      return NextResponse.json(
        { error: 'Access token expired' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { accessToken: account.access_token },
      {
        headers: {
          // Don't cache this sensitive data
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching access token:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
