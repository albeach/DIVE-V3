/**
 * DIVE V3 SP Registry API Routes - Individual SP Operations
 * GET /api/admin/sp-registry/[spId] - Get SP details
 * PUT /api/admin/sp-registry/[spId] - Update SP
 * DELETE /api/admin/sp-registry/[spId] - Delete SP
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';

export const dynamic = 'force-dynamic';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
  params: Promise<{ spId: string }>;
}

/**
 * GET /api/admin/sp-registry/[spId]
 * Get SP details
 */
export const GET = withAuth(async (request, context) => {
  const { tokens, params } = context;
  const { spId } = await params!;

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}`);

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to fetch SP' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to fetch SP' },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});

/**
 * PUT /api/admin/sp-registry/[spId]
 * Update SP configuration
 */
export const PUT = withSuperAdmin(async (request, context) => {
  const { tokens, params } = context;
  const { spId } = await params!;
  const body = await request.json();

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to update SP' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to update SP' },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});

/**
 * DELETE /api/admin/sp-registry/[spId]
 * Delete SP
 */
export const DELETE = withSuperAdmin(async (request, context) => {
  const { tokens, params } = context;
  const { spId } = await params!;

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}`, {
    method: 'DELETE'
  });

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to delete SP' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to delete SP' },
      { status: backendResponse.status }
    );
  }

  return NextResponse.json({ message: 'SP deleted successfully' }, { status: 200 });
});
