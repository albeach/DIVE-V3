import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const { auth: session, nextUrl } = req;

    const response = NextResponse.next();

    // Content Security Policy
    const keycloakBaseUrl = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8081';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        `connect-src 'self' ${keycloakBaseUrl} ${apiUrl}`,
        `frame-src 'self' ${keycloakBaseUrl}`,
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);

    return response;
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

