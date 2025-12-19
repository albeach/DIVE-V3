/**

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
 * DIVE V3 SP Registry API Routes
 * GET /api/admin/sp-registry - List all SPs
 * POST /api/admin/sp-registry - Create new SP
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

/**
 * GET /api/admin/sp-registry
 * List all external SPs with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication via server-side session + DB tokens
    const validation = await validateSession();
    if (!validation.isValid || !validation.session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const userRoles = (validation.session.user as any).roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('super_admin')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Fetch fresh access token from database (never trust client session)
    const tokens = await getSessionTokens();

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const country = searchParams.get('country');
    const organizationType = searchParams.get('organizationType');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Build query string for backend
    const queryParams = new URLSearchParams();
    if (status) queryParams.append('status', status);
    if (country) queryParams.append('country', country);
    if (organizationType) queryParams.append('organizationType', organizationType);
    if (search) queryParams.append('search', search);
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());

    // Forward request to backend with a valid bearer token
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/sp-management/sps?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to fetch SPs' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('SP Registry API Error (GET):', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sp-registry
 * Create new external SP registration
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication via server-side session + DB tokens
    const validation = await validateSession();
    if (!validation.isValid || !validation.session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const userRoles = (validation.session.user as any).roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('super_admin')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Fetch fresh access token from database (never trust client session)
    const tokens = await getSessionTokens();

    // Parse request body
    const body = await request.json();

    // Forward request to backend
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/sp-management/register`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to register SP' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 201 });

  } catch (error) {
    console.error('SP Registry API Error (POST):', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
