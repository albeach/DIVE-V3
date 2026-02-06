/**
 * DIVE V3 SP Registry API - Suspend SP
 * POST /api/admin/sp-registry/[spId]/suspend - Suspend/Reactivate SP
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';

export const dynamic = 'force-dynamic';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

interface RouteContext {
  params: Promise<{ spId: string }>;
}

/**
 * POST /api/admin/sp-registry/[spId]/suspend
 * Suspend or reactivate SP
 */
export const POST = withSuperAdmin(async (request, context) => {
  const { tokens, session, params } = context;
  const { spId } = await params!;
  const body = await request.json();
  const { reason } = body;

  if (!reason || reason.length < 10) {
    return NextResponse.json(
      { error: 'Invalid request', message: 'Suspension reason is required (minimum 10 characters)' },
      { status: 400 }
    );
  }

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}/suspend`, {
    method: 'POST',
    body: JSON.stringify({
      reason,
      suspendedBy: (session.user as any).uniqueID || session.user.email
    })
  });

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to suspend SP' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to suspend SP' },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});
