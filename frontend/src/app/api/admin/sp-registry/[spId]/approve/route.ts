/**

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
 * DIVE V3 SP Registry API - Approve SP
 * POST /api/admin/sp-registry/[spId]/approve - Approve/Reject pending SP
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

/**
 * POST /api/admin/sp-registry/[spId]/approve
 * Approve or reject pending SP
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ spId: string }> }
) {
  const { spId } = await context.params;
  try {
    // Verify admin authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check admin role (admin or super_admin)
    const userRoles = (session.user as any).roles || [];
    if (!userRoles.includes('admin') && !userRoles.includes('super_admin')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, reason } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Forward request to backend
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/sp-management/sps/${spId}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          reason,
          approvedBy: (session.user as any).uniqueID || session.user.email
        })
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || `Failed to ${action} SP` },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('SP Approval API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
