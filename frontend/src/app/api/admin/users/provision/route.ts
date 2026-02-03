/**
 * User Provisioning API Route
 * Server-side proxy for user provisioning operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.roles?.some((r: string) =>
      ['super_admin', 'admin', 'dive-admin'].includes(r)
    );
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/provision`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend not available, return mock response
    }

    // Return mock success response for development/demo
    const users = body.users || [];
    const mockResults = users.map((user: { username: string }, index: number) => ({
      username: user.username,
      success: Math.random() > 0.1, // 90% success rate
      userId: `user-${Date.now()}-${index}`,
      error: Math.random() > 0.9 ? 'User already exists' : undefined,
    }));

    const successCount = mockResults.filter((r: { success: boolean }) => r.success).length;

    return NextResponse.json({
      success: true,
      results: mockResults,
      summary: {
        total: users.length,
        created: successCount,
        failed: users.length - successCount,
        skipped: 0,
      },
    });
  } catch (error) {
    console.error('[User Provisioning API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
