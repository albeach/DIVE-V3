/**

// Mark this route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic';
 * DIVE V3 SP Registry API Routes - Individual SP Operations
 * GET /api/admin/sp-registry/[spId] - Get SP details
 * PUT /api/admin/sp-registry/[spId] - Update SP
 * DELETE /api/admin/sp-registry/[spId] - Delete SP
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAdminRole } from '@/lib/admin-role-utils';

// Use HTTPS with mkcert for local development
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

/**
 * GET /api/admin/sp-registry/[spId]
 * Get SP details
 */
export async function GET(
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
      `${BACKEND_API_URL}/api/sp-management/sps/${spId}`,
      {
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to fetch SP' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('SP Registry API Error (GET spId):', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/sp-registry/[spId]
 * Update SP configuration
 */
export async function PUT(
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

    const body = await request.json();

    // Forward request to backend
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/sp-management/sps/${spId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to update SP' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('SP Registry API Error (PUT spId):', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/sp-registry/[spId]
 * Delete SP
 */
export async function DELETE(
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
      `${BACKEND_API_URL}/api/sp-management/sps/${spId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Backend error', message: errorData.message || 'Failed to delete SP' },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json({ message: 'SP deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error('SP Registry API Error (DELETE spId):', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
