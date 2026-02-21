import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Log the error for debugging
  console.error('[NextAuth Error]', {
    error,
    errorDescription,
    url: request.url,
    timestamp: new Date().toISOString(),
  });

  // Return a proper error response instead of letting NextAuth handle it
  return NextResponse.json({
    error: error || 'Configuration',
    error_description: errorDescription || 'Authentication configuration error',
    timestamp: new Date().toISOString(),
  }, {
    status: 400,
  });
}