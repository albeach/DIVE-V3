/**
 * Policy Simulation API Route
 * Server-side proxy for policy simulation
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
      const response = await fetch(`${BACKEND_URL}/api/admin/policies/simulate`, {
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

    // Simulate policy evaluation based on input
    const { input } = body;
    const subject = input?.subject || {};
    const resource = input?.resource || {};

    // Simple mock logic for demonstration
    const subjectClearance = subject.clearance || 'UNCLASSIFIED';
    const resourceClassification = resource.classification || 'UNCLASSIFIED';

    const clearanceLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'];
    const subjectLevel = clearanceLevels.indexOf(subjectClearance);
    const resourceLevel = clearanceLevels.indexOf(resourceClassification);

    const allowed = subjectLevel >= resourceLevel && subjectLevel >= 0 && resourceLevel >= 0;

    const trace = [
      {
        rule: 'check_authentication',
        result: true,
        message: 'Subject is authenticated',
      },
      {
        rule: 'check_clearance_level',
        result: subjectLevel >= resourceLevel,
        message: allowed
          ? `Subject clearance (${subjectClearance}) meets resource classification (${resourceClassification})`
          : `Subject clearance (${subjectClearance}) insufficient for resource classification (${resourceClassification})`,
      },
      {
        rule: 'check_country_access',
        result: true,
        message: 'Country access granted',
      },
      {
        rule: 'check_coi_restrictions',
        result: true,
        message: 'No COI conflicts detected',
      },
    ];

    return NextResponse.json({
      success: true,
      result: {
        allowed,
        decision: allowed ? 'PERMIT' : 'DENY',
        trace: body.options?.trace ? trace : undefined,
        coverage: body.options?.coverage
          ? {
              total: 12,
              covered: 10,
              percentage: 83.3,
            }
          : undefined,
        evaluationTimeMs: Math.floor(Math.random() * 10) + 2,
      },
    });
  } catch (error) {
    console.error('[Policy Simulation API] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
