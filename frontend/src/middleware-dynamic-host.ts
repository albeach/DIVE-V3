import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to inject current hostname into environment for SSR
 * This enables dynamic configuration based on the accessing domain
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Get the hostname from the request
  const hostname = request.headers.get('host') || 'localhost:3000';

  // Make it available to the application
  // Note: Next.js doesn't allow setting env vars in middleware,
  // so we'll pass it via a custom header that can be read in getServerSideProps
  response.headers.set('x-forwarded-host', hostname);

  return response;
}

// Configure which routes this middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
