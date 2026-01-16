#!/bin/sh
# =============================================================================
# DIVE V3 Frontend - Docker Entrypoint
# =============================================================================
# Handles runtime CA trust store configuration for mkcert certificates
# This is the 2026 best practice for proper TLS verification in development
# =============================================================================

set -e

echo "[Entrypoint] DIVE V3 Frontend starting..."

# =============================================================================
# Install mkcert CA into System Trust Store (Runtime)
# =============================================================================
# Why runtime instead of build-time:
#   - Certificates are mounted as volumes (not in build context)
#   - Allows different CAs for different environments
#   - Production can use different CA without rebuild
#
# How it works:
#   1. mkcert CA mounted to /app/certs/ca/rootCA.pem
#   2. Copy to system CA directory (must be .crt extension)
#   3. Run update-ca-certificates to add to system bundle
#   4. Node.js fetch() (with --use-openssl-ca) now trusts mkcert certs
#

if [ -f "/app/certs/ca/rootCA.pem" ]; then
    echo "[Entrypoint] Installing mkcert CA into system trust store..."
    
    # Copy CA to system directory (must be .crt extension for Alpine)
    cp /app/certs/ca/rootCA.pem /usr/local/share/ca-certificates/mkcert-dev-ca.crt
    
    # Update system CA bundle
    update-ca-certificates
    
    echo "[Entrypoint] ✓ mkcert CA installed successfully"
    echo "[Entrypoint] Node.js fetch() will now trust self-signed certificates"
else
    echo "[Entrypoint] ⚠️  mkcert CA not found at /app/certs/ca/rootCA.pem"
    echo "[Entrypoint] TLS verification may fail for self-signed certificates"
fi

# =============================================================================
# Validate TLS Configuration
# =============================================================================
echo "[Entrypoint] TLS Configuration:"
echo "  NODE_ENV: ${NODE_ENV:-not set}"
echo "  NODE_OPTIONS: ${NODE_OPTIONS:-not set}"
echo "  System CA bundle: /etc/ssl/certs/ca-certificates.crt"

# Check if --use-openssl-ca is set
if echo "${NODE_OPTIONS:-}" | grep -q "use-openssl-ca"; then
    echo "  ✓ Node.js will use system CA trust store (CORRECT)"
else
    echo "  ⚠️  --use-openssl-ca not set, fetch() may not trust mkcert"
    echo "  Recommended: ENV NODE_OPTIONS=\"--use-openssl-ca\""
fi

# CRITICAL: Prevent TLS bypass in production
if [ "${NODE_ENV}" = "production" ] && [ "${NODE_TLS_REJECT_UNAUTHORIZED}" = "0" ]; then
    echo ""
    echo "🔴🔴🔴 CRITICAL SECURITY ERROR 🔴🔴🔴"
    echo ""
    echo "NODE_TLS_REJECT_UNAUTHORIZED=0 in production!"
    echo "This disables ALL certificate verification."
    echo ""
    echo "Fix: Remove NODE_TLS_REJECT_UNAUTHORIZED from production environment"
    echo ""
    exit 1
fi

# =============================================================================
# Start Application
# =============================================================================
echo "[Entrypoint] Starting Next.js development server..."
echo ""

# Execute the CMD from Dockerfile (npm run dev)
exec "$@"
