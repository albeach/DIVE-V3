/**
 * DIVE V3 - Access Token API Endpoint
 *
 * Returns the current user's access token for use in API calls.
 * This is used by the API documentation page to auto-authorize Swagger UI.
 *
 * @security This endpoint only returns the token to authenticated users
 *           and should only be called from the same origin.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // The access token is stored in the session by NextAuth
    const accessToken = session.accessToken as string | undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token available' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { accessToken },
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
