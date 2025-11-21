import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    // Optimize production builds
    productionBrowserSourceMaps: false, // Disable source maps in production to prevent console errors
    // Docker deployment: Development mode for hot reload and runtime env vars
    // output: 'standalone',  // Use for production builds only
};

export default nextConfig;

