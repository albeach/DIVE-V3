import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // This is called after Keycloak logout completes
    // Redirect to home page
    return NextResponse.redirect(new URL("/", request.url));
}

