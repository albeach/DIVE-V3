/**
 * DIVE V3 SP Registry API - Approve SP
 * POST /api/admin/sp-registry/[spId]/approve - Approve/Reject pending SP
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
 * POST /api/admin/sp-registry/[spId]/approve
 * Approve or reject pending SP
 */
export const POST = withSuperAdmin(async (request, { tokens, session }, context: RouteContext) => {
  const { spId } = await context.params;
  const body = await request.json();
  const { action, reason } = body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid request', message: 'Action must be "approve" or "reject"' },
      { status: 400 }
    );
  }

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      reason,
      approvedBy: (session.user as any).uniqueID || session.user.email
    })
  });

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: `Failed to ${action} SP` }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || `Failed to ${action} SP` },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});
