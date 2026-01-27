import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        // Dynamic CSP based on environment variables (like middleware.ts)
        const keycloakBaseUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://localhost:8443';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
        const allowExternalAnalytics = process.env.NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS === 'true';
        const externalDomains = process.env.NEXT_PUBLIC_EXTERNAL_DOMAINS || '';

        // Build CSP directives dynamically
        const scriptSrc = [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'", // Required for Next.js dev mode and some dynamic features
        ];

        if (allowExternalAnalytics) {
            scriptSrc.push('https://static.cloudflareinsights.com');
        }

        const connectSrc = ["'self'"];

        // Add Keycloak URL (both HTTP and HTTPS versions for local dev)
        if (keycloakBaseUrl) {
            connectSrc.push(keycloakBaseUrl);
            if (keycloakBaseUrl.startsWith('https://')) {
                connectSrc.push(keycloakBaseUrl.replace('https://', 'http://'));
            } else if (keycloakBaseUrl.startsWith('http://')) {
                connectSrc.push(keycloakBaseUrl.replace('http://', 'https://'));
            }
        }

        // Add API URL (both HTTP and HTTPS versions for local dev)
        if (apiUrl) {
            connectSrc.push(apiUrl);
            if (apiUrl.startsWith('https://')) {
                connectSrc.push(apiUrl.replace('https://', 'http://'));
            } else if (apiUrl.startsWith('http://')) {
                connectSrc.push(apiUrl.replace('http://', 'https://'));
            }
        }

        // Add optional external domains if configured
        if (externalDomains) {
            connectSrc.push(...externalDomains.split(',').map(d => d.trim()).filter(Boolean));
        }

        const csp = [
            "default-src 'self'",
            `script-src ${scriptSrc.join(' ')}`,
            `style-src 'self' 'unsafe-inline'`, // Required for Tailwind and styled components
            "img-src 'self' data: blob: https://authjs.dev", // Allow inline images, data URIs, and AuthJS provider icons
            `font-src 'self' data:`, // Self-hosted fonts only
            `connect-src ${connectSrc.join(' ')}`,
            `frame-src 'self' data: ${keycloakBaseUrl}`, // Allow Keycloak iframe for OIDC and data URIs for PDF viewing
            "object-src 'none'", // Block Flash, Java, etc.
            "base-uri 'self'", // Prevent base tag injection
            `form-action 'self' ${keycloakBaseUrl} https://*.dive25.com https://*.prosecurity.biz`, // Allow form submission to self, Keycloak, and federation IdPs
            "frame-ancestors 'none'", // Prevent clickjacking (use X-Frame-Options for broader support)
        ].join("; ");

        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: csp,
                    },
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "X-XSS-Protection",
                        value: "1; mode=block",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains",
                    },
                ],
            },
        ];
    },
    async rewrites() {
        // Proxy Keycloak endpoints for autodiscovery and OIDC flows
        // This allows external clients to discover IdP metadata
        const keycloakUrl = process.env.KEYCLOAK_URL || 'https://keycloak:8443';

        return [
            {
                // OIDC discovery endpoints
                source: '/realms/:realm/.well-known/:path*',
                destination: `${keycloakUrl}/realms/:realm/.well-known/:path*`,
            },
            {
                // Keycloak auth endpoints
                source: '/realms/:realm/protocol/:protocol/:path*',
                destination: `${keycloakUrl}/realms/:realm/protocol/:protocol/:path*`,
            },
            {
                // Keycloak broker endpoints
                source: '/realms/:realm/broker/:path*',
                destination: `${keycloakUrl}/realms/:realm/broker/:path*`,
            },
            {
                // Keycloak token endpoints
                source: '/realms/:realm/tokens/:path*',
                destination: `${keycloakUrl}/realms/:realm/tokens/:path*`,
            },
            {
                // Keycloak account console (if needed)
                source: '/realms/:realm/account/:path*',
                destination: `${keycloakUrl}/realms/:realm/account/:path*`,
            },
        ];
    },
    experimental: {
        serverActions: {
            bodySizeLimit: "2mb",
        },
    },
    // Externalize native Node deps used by postgres driver to avoid client/edge bundling errors
    serverExternalPackages: ["postgres"],
    // NOTE: Removed webpack config to avoid requiring webpack at runtime with custom server
    // The serverExternalPackages above should handle postgres externalization
    // Linting is handled in CI; skip during image build to unblock deployments
    // Hide the Next.js dev indicator (the "N" circle in bottom-left)
    devIndicators: {
        position: 'bottom-right',
    },
    // Docker deployment: Don't use standalone when using custom HTTPS server
    // Standalone is incompatible with custom server.js (required for mTLS)
    // output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

    // FIX: Next.js 15 AbortError - Reduce aggressive fetch caching
    // This prevents "Fetch is aborted" errors from NextAuth session refetches
    // See: https://github.com/nextauthjs/next-auth/issues/10128
    logging: {
        fetches: {
            fullUrl: false, // Reduce console noise
        },
    },
};

export default nextConfig;
