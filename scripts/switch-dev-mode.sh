#!/bin/bash

# DIVE V3 Development Environment Switcher
# Switches between localhost development and Cloudflare tunnel mode

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")/frontend"

echo "🔄 DIVE V3 Development Environment Switcher"
echo "=========================================="

# Function to switch to localhost HTTPS mode
switch_to_localhost() {
    echo "🔒 Switching to LOCALHOST HTTPS mode..."
    echo "   Frontend: https://localhost:3000 (mkcert certificates)"
    echo "   Backend:  https://localhost:4000 (mkcert)"
    echo "   Keycloak: https://localhost:8443 (mkcert)"
    echo "   Playwright: Will have certificate issues ⚠️"

    # Update frontend/.env.local
    cat > "$FRONTEND_DIR/.env.local" << 'EOF'
# Frontend Environment Variables
# Next.js requires NEXT_PUBLIC_* variables to be in frontend/.env.local
# CRITICAL: Restart dev server after changing this file!
#
# DEVELOPMENT MODES:
# 1. Localhost HTTPS: Use https://localhost:3000 (current config - has Playwright issues)
# 2. Localhost HTTP: Use http://localhost:3000 (recommended for Playwright tests)
# 3. Cloudflare Tunnel: Switch NEXTAUTH_URL to https://dev-app.dive25.com
#
# For HTTP mode (recommended for testing): ./scripts/switch-dev-mode.sh localhost-http
# For Cloudflare tunnel development, copy this file to .env.tunnel and update URLs

# Backend API URL (required for admin pages)
# CRITICAL: Use HTTPS everywhere - mkcert certificates provide valid localhost TLS
NEXT_PUBLIC_BACKEND_URL=https://localhost:4000
NEXT_PUBLIC_API_URL=https://localhost:4000
NEXT_PUBLIC_BASE_URL=https://localhost:3000

# Keycloak Configuration - UPDATED FOR MULTI-REALM (Oct 20, 2025)
# Now using dive-v3-broker realm for cross-realm federation
KEYCLOAK_URL=https://localhost:8443
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L

# OLD (Single Realm - Preserved for rollback):
# KEYCLOAK_REALM=dive-v3-broker
# KEYCLOAK_CLIENT_ID=dive-v3-client

# NextAuth Configuration
NEXTAUTH_URL=https://localhost:3000
AUTH_SECRET=fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=

# Database (for NextAuth Drizzle adapter)
# For Docker: use postgres:5432 (internal Docker network)
# For local dev: use localhost:5433 (host machine)
DATABASE_URL=postgresql://postgres:password@postgres:5432/dive_v3_app

# Keycloak (Public - for frontend logout) - UPDATED FOR MULTI-REALM
NEXT_PUBLIC_KEYCLOAK_URL=https://localhost:8443
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker

# Auth0 MCP Integration (Demo Mode)
NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com
NEXT_PUBLIC_AUTH0_MCP_ENABLED=true

# NextAuth Debug Logging
NEXTAUTH_DEBUG=true
AUTH_TRUST_HOST=true
EOF

    echo "✅ Frontend environment updated to localhost HTTPS mode"
    echo "⚠️  NOTE: Playwright tests will fail due to certificate issues"
    echo "   Use: ./scripts/switch-dev-mode.sh localhost-http"
}

# Function to switch to localhost HTTP mode (for Playwright testing)
switch_to_localhost_http() {
    echo "🌐 Switching to LOCALHOST HTTP mode..."
    echo "   Frontend: http://localhost:3000 (no certificates needed)"
    echo "   Backend:  http://localhost:4000 (HTTP proxy)"
    echo "   Keycloak: https://localhost:8443 (mkcert - still HTTPS)"
    echo "   Playwright: Will work perfectly ✅"

    # Update frontend/.env.local
    cat > "$FRONTEND_DIR/.env.local" << 'EOF'
# Frontend Environment Variables
# Next.js requires NEXT_PUBLIC_* variables to be in frontend/.env.local
# CRITICAL: Restart dev server after changing this file!
#
# DEVELOPMENT MODES:
# 1. Localhost HTTPS: Use https://localhost:3000 (has Playwright certificate issues)
# 2. Localhost HTTP: Use http://localhost:3000 (current config - Playwright works!)
# 3. Cloudflare Tunnel: Switch NEXTAUTH_URL to https://dev-app.dive25.com
#
# For HTTPS mode: ./scripts/switch-dev-mode.sh localhost
# For Cloudflare tunnel development, copy this file to .env.tunnel and update URLs

# Backend API URL (required for admin pages)
# HTTP for frontend, backend handles HTTPS internally
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Keycloak Configuration - UPDATED FOR MULTI-REALM (Oct 20, 2025)
# Now using dive-v3-broker realm for cross-realm federation
KEYCLOAK_URL=https://localhost:8443
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L

# OLD (Single Realm - Preserved for rollback):
# KEYCLOAK_REALM=dive-v3-broker
# KEYCLOAK_CLIENT_ID=dive-v3-client

# NextAuth Configuration - HTTP for local development
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=

# Database (for NextAuth Drizzle adapter)
# For Docker: use postgres:5432 (internal Docker network)
# For local dev: use localhost:5433 (host machine)
DATABASE_URL=postgresql://postgres:5432/dive_v3_app

# Keycloak (Public - for frontend logout) - UPDATED FOR MULTI-REALM
NEXT_PUBLIC_KEYCLOAK_URL=https://localhost:8443
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker

# Auth0 MCP Integration (Demo Mode)
NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com
NEXT_PUBLIC_AUTH0_MCP_ENABLED=true

# NextAuth Debug Logging
NEXTAUTH_DEBUG=true
AUTH_TRUST_HOST=true
EOF

    echo "✅ Frontend environment updated to localhost HTTP mode"
    echo "🎉 Playwright tests will now work!"
}

# Function to switch to Cloudflare tunnel mode
switch_to_tunnel() {
    echo "🌐 Switching to CLOUDFLARE TUNNEL mode..."
    echo "   Frontend: https://dev-app.dive25.com"
    echo "   Backend:  https://dev-api.dive25.com"
    echo "   Keycloak: https://dev-auth.dive25.com"

    # Update frontend/.env.local
    cat > "$FRONTEND_DIR/.env.local" << 'EOF'
# Frontend Environment Variables
# Next.js requires NEXT_PUBLIC_* variables to be in frontend/.env.local
# CRITICAL: Restart dev server after changing this file!
#
# DEVELOPMENT MODES:
# 1. Localhost Direct Access: Use https://localhost:3000
# 2. Cloudflare Tunnel: Switch NEXTAUTH_URL to https://dev-app.dive25.com (current config)
#
# For localhost development, run: ./scripts/switch-dev-mode.sh localhost

# Backend API URL (required for admin pages)
NEXT_PUBLIC_BACKEND_URL=https://dev-api.dive25.com
NEXT_PUBLIC_API_URL=https://dev-api.dive25.com
NEXT_PUBLIC_BASE_URL=https://dev-app.dive25.com

# Keycloak Configuration - UPDATED FOR MULTI-REALM (Oct 20, 2025)
# Now using dive-v3-broker realm for cross-realm federation
KEYCLOAK_URL=https://keycloak:8443
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L

# OLD (Single Realm - Preserved for rollback):
# KEYCLOAK_REALM=dive-v3-broker
# KEYCLOAK_CLIENT_ID=dive-v3-client

# NextAuth Configuration
NEXTAUTH_URL=https://dev-app.dive25.com
AUTH_SECRET=fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=

# Database (for NextAuth Drizzle adapter)
# For Docker: use postgres:5432 (internal Docker network)
# For local dev: use localhost:5433 (host machine)
DATABASE_URL=postgresql://postgres:password@postgres:5432/dive_v3_app

# Keycloak (Public - for frontend logout) - UPDATED FOR MULTI-REALM
NEXT_PUBLIC_KEYCLOAK_URL=https://dev-auth.dive25.com
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker

# Auth0 MCP Integration (Demo Mode)
NEXT_PUBLIC_AUTH0_DOMAIN=demo.auth0.com
NEXT_PUBLIC_AUTH0_MCP_ENABLED=true

# NextAuth Debug Logging
NEXTAUTH_DEBUG=true
AUTH_TRUST_HOST=true
EOF

    echo "✅ Frontend environment updated to tunnel mode"
}

# Check arguments
case "${1:-}" in
    "localhost"|"local")
        switch_to_localhost
        ;;
    "localhost-http"|"local-http"|"http")
        switch_to_localhost_http
        ;;
    "tunnel"|"cloudflare"|"cf")
        switch_to_tunnel
        ;;
    "status"|"current")
        echo "📊 Current Configuration:"
        if grep -q "NEXTAUTH_URL=https://dev-app.dive25.com" "$FRONTEND_DIR/.env.local" 2>/dev/null; then
            echo "   Mode: CLOUDFLARE TUNNEL"
            echo "   Frontend: https://dev-app.dive25.com"
        elif grep -q "NEXTAUTH_URL=http://localhost:3000" "$FRONTEND_DIR/.env.local" 2>/dev/null; then
            echo "   Mode: LOCALHOST HTTP (Playwright-friendly)"
            echo "   Frontend: http://localhost:3000"
        elif grep -q "NEXTAUTH_URL=https://localhost:3000" "$FRONTEND_DIR/.env.local" 2>/dev/null; then
            echo "   Mode: LOCALHOST HTTPS (Playwright issues)"
            echo "   Frontend: https://localhost:3000"
        else
            echo "   Mode: UNKNOWN (check frontend/.env.local)"
            echo "   NEXTAUTH_URL line:"
            grep "NEXTAUTH_URL" "$FRONTEND_DIR/.env.local" 2>/dev/null || echo "   Not found"
        fi
        ;;
    *)
        echo "Usage: $0 {localhost|localhost-http|tunnel|status}"
        echo ""
        echo "Commands:"
        echo "  localhost      - Switch to localhost HTTPS mode (Playwright issues)"
        echo "  localhost-http - Switch to localhost HTTP mode (Playwright works!)"
        echo "  tunnel         - Switch to Cloudflare tunnel mode"
        echo "  status         - Show current configuration"
        echo ""
        echo "Examples:"
        echo "  $0 localhost       # HTTPS localhost (has Playwright cert issues)"
        echo "  $0 localhost-http  # HTTP localhost (recommended for Playwright)"
        echo "  $0 tunnel          # Cloudflare tunnel"
        echo "  $0 status          # Check current mode"
        echo ""
        echo "⚠️  Remember to restart your development server after switching!"
        exit 1
        ;;
esac

echo ""
echo "⚠️  IMPORTANT: Restart your development server for changes to take effect!"
echo "   Run: cd frontend && npm run dev"
echo ""
echo "🔧 To start all services in Docker:"
echo "   docker-compose up -d"
echo ""
