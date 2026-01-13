import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    turbopack: {},
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
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
    webpack: (config) => {
        // Avoid bundling postgres for client/edge; rely on Node resolution at runtime
        config.externals = config.externals || [];
        config.externals.push({ postgres: "commonjs postgres" });
        return config;
    },
    // Linting is handled in CI; skip during image build to unblock deployments
    // Hide the Next.js dev indicator (the "N" circle in bottom-left)
    devIndicators: {
        position: 'bottom-right',
    },
    // Docker deployment: Use standalone output for production builds
    // This creates a minimal server that can run without node_modules
    output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

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
