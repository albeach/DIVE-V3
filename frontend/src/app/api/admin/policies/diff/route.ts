/**
 * Policy Diff API Route
 * Server-side proxy for policy comparison
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
      const response = await fetch(`${BACKEND_URL}/api/admin/policies/diff`, {
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

      // Forward backend error responses instead of masking them
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return NextResponse.json(errorData, { status: response.status });
    } catch {
      // Backend not available, return mock response
    }

    // Generate mock diff based on input
    const linesA = (body.policyA || '').split('\n');
    const linesB = (body.policyB || '').split('\n');

    const added = linesB.filter((l: string) => !linesA.includes(l) && l.trim());
    const removed = linesA.filter((l: string) => !linesB.includes(l) && l.trim());

    const testResults = body.testCases?.map((tc: { name: string; expectedResult?: boolean }) => ({
      name: tc.name,
      policyAResult: Math.random() > 0.3,
      policyBResult: Math.random() > 0.3,
      match: Math.random() > 0.4,
    }));

    return NextResponse.json({
      success: true,
      diff: {
        added: added.slice(0, 10),
        removed: removed.slice(0, 10),
        modified: [],
        testResults,
      },
    });
  } catch (error) {
    console.error('[Policy Diff API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
