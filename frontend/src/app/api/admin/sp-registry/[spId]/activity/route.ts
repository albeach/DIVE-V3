/**
 * DIVE V3 SP Registry API - Activity Logs
 * GET /api/admin/sp-registry/[spId]/activity - Get SP activity logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';

export const dynamic = 'force-dynamic';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
  params: Promise<{ spId: string }>;
}

/**
 * GET /api/admin/sp-registry/[spId]/activity
 * Get activity logs for an SP
 */
export const GET = withAuth(async (request, { tokens }, context: RouteContext) => {
  const { spId } = await context.params;
  
  // Extract query parameters
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}/activity?limit=${limit}&offset=${offset}`);

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to fetch activity logs' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to fetch activity logs' },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});
