/**
 * OPAL Transactions Export API Proxy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const response = await fetch(
      `${BACKEND_URL}/api/opal/transactions/export?format=${format}`,
      {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
        },
        ...(process.env.NODE_ENV !== 'production' && {
          // @ts-ignore
          agent: new (require('https').Agent)({ rejectUnauthorized: false }),
        }),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to export transactions' },
        { status: response.status }
      );
    }

    const data = await response.blob();
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="opal-transactions.${format}"`,
      },
    });
  } catch (error) {
    console.error('[OPAL API] Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

