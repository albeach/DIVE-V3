/**
 * DIVE V3 - Federation Spokes API Route
 * 
 * Proxies spoke registry requests from frontend to backend API.
 * Handles listing, filtering, and pagination of registered spokes.
 * 
 * @route GET /api/federation/spokes
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens } from '@/lib/session-validation';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';

/**
 * GET /api/federation/spokes
 * List all registered spokes with optional filtering
 * 
 * Query params:
 * - status: Filter by spoke status (pending, approved, active, suspended, revoked)
 * - search: Search by spoke name or instance code
 * - page: Page number for pagination
 * - limit: Items per page
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const validation = await validateSession();
    if (!validation.isValid || !validation.session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const userRoles = (validation.session.user as any).roles || [];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Fetch fresh access token from database
    const tokens = await getSessionTokens();

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '20';

    // Build query string for backend
    const queryParams = new URLSearchParams();
    if (status && status !== 'all') queryParams.append('status', status);
    if (search) queryParams.append('search', search);
    queryParams.append('page', page);
    queryParams.append('limit', limit);

    const backendUrl = `${BACKEND_API_URL}/api/federation/spokes${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    console.log('[Federation Spokes API] Fetching from:', backendUrl);

    // Forward request to backend
    const backendResponse = await fetch(backendUrl, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('[Federation Spokes API] Backend error:', {
        status: backendResponse.status,
        error: errorData
      });
      
      return NextResponse.json(
        { 
          error: 'Backend error', 
          message: errorData.message || `Backend returned ${backendResponse.status}`,
          spokes: [],
          total: 0,
          pendingCount: 0
        },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    
    // Transform backend response to match frontend expectations
    const response = {
      spokes: data.spokes || [],
      total: data.spokes?.length || 0,
      pendingCount: data.spokes?.filter((s: any) => s.status === 'pending').length || 0,
      statistics: data.statistics || {}
    };

    console.log('[Federation Spokes API] Returning:', {
      spokesCount: response.spokes.length,
      total: response.total,
      pendingCount: response.pendingCount
    });

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('[Federation Spokes API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        spokes: [],
        total: 0,
        pendingCount: 0
      },
      { status: 500 }
    );
  }
}


