#!/bin/sh
# =============================================================================
# DIVE V3 Frontend - Production Docker Entrypoint
# =============================================================================
# 1. Replaces build-time __NEXT_PUBLIC_*__ placeholders with runtime env vars
#    (enables single ECR image to serve any spoke: USA, GBR, FRA, etc.)
# 2. Validates security configuration
#
# CA trust: Handled via NODE_EXTRA_CA_CERTS env var (no root access needed)
#
# Standard cert layout (SSOT):
#   /app/certs/key.pem          - TLS private key
#   /app/certs/certificate.pem  - TLS certificate
#   /app/certs/fullchain.pem    - TLS certificate chain
#   /app/certs/ca/rootCA.pem    - CA certificate (via NODE_EXTRA_CA_CERTS)
# =============================================================================

set -e

echo "[Entrypoint] DIVE V3 Frontend starting..."

# =============================================================================
# Step 1: Replace NEXT_PUBLIC_ Placeholders with Runtime Values
# =============================================================================
# Next.js compiles NEXT_PUBLIC_* vars into client-side JS at build time.
# For multi-tenant ECR images, we build with __NEXT_PUBLIC_FOO__ placeholders
# and sed-replace them at container startup with actual runtime values.
# =============================================================================

REPLACED=0
for var in $(env | grep '^NEXT_PUBLIC_' | cut -d= -f1); do
    placeholder="__${var}__"
    value=$(eval echo "\$$var")
    if [ -n "$value" ] && [ "$value" != "$placeholder" ]; then
        # Replace in all compiled JS and HTML files (standalone output + static chunks)
        find /app/.next -name '*.js' -exec sed -i "s|${placeholder}|${value}|g" {} + 2>/dev/null || true
        find /app/.next -name '*.html' -exec sed -i "s|${placeholder}|${value}|g" {} + 2>/dev/null || true
        REPLACED=$((REPLACED + 1))
    fi
done
echo "[Entrypoint] Replaced ${REPLACED} NEXT_PUBLIC_ variables"

# =============================================================================
# Step 2: Security Validation
# =============================================================================

if [ "${NODE_ENV}" = "production" ] && [ "${NODE_TLS_REJECT_UNAUTHORIZED}" = "0" ]; then
    echo "[Entrypoint] CRITICAL: NODE_TLS_REJECT_UNAUTHORIZED=0 in production! Aborting."
    exit 1
fi

# Verify TLS cert availability
CERT_DIR="${CERT_PATH:-/app/certs}"
if [ ! -f "${CERT_DIR}/key.pem" ]; then
    echo "[Entrypoint] WARNING: TLS key not found at ${CERT_DIR}/key.pem"
    echo "[Entrypoint] HTTPS server will fail to start"
fi

# =============================================================================
# Step 3: Start Application
# =============================================================================

echo "[Entrypoint] Instance: ${NEXT_PUBLIC_INSTANCE:-unknown} | Certs: ${CERT_DIR}"
exec "$@"
