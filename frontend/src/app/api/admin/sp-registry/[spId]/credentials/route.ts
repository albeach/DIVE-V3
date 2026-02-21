/**
 * DIVE V3 SP Registry API - Regenerate Client Credentials
 * POST /api/admin/sp-registry/[spId]/credentials - Regenerate client secret
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
 * POST /api/admin/sp-registry/[spId]/credentials
 * Regenerate client secret for confidential clients
 */
export const POST = withSuperAdmin(async (request, context) => {
  const { tokens, session, params } = context;
  const { spId } = await params!;

  const backendFetch = createAdminBackendFetch(tokens, BACKEND_API_URL);
  const backendResponse = await backendFetch(`/api/sp-management/sps/${spId}/regenerate-secret`, {
    method: 'POST',
    body: JSON.stringify({
      regeneratedBy: (session.user as any).uniqueID || session.user.email
    })
  });

  if (!backendResponse.ok) {
    const errorData = await backendResponse.json().catch(() => ({ message: 'Failed to regenerate credentials' }));
    return NextResponse.json(
      { error: 'Backend error', message: errorData.message || 'Failed to regenerate credentials' },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: 200 });
});
