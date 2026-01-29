/**

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
 * DIVE V3 SP Registry API - Regenerate Client Credentials
 * POST /api/admin/sp-registry/[spId]/credentials - Regenerate client secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAdminRole } from '@/lib/admin-role-utils';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

/**
 * POST /api/admin/sp-registry/[spId]/credentials
 * Regenerate client secret for confidential clients
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
    if (!hasAdminRole({ roles: userRoles, name: session.user.name, email: session.user.email })) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Forward request to backend
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/sp-management/sps/${spId}/regenerate-secret`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          regeneratedBy: (session.user as any).uniqueID || session.user.email
        })
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to regenerate credentials' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('Credential Regeneration API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
