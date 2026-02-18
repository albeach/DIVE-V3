#!/bin/bash
# =============================================================================
# OPAL Server Entrypoint
# =============================================================================
# Loads authentication keys and starts the OPAL server
# =============================================================================

set -e

# Load OPAL authentication keys from mounted files (if available)
# Canonical name from generate-opal-certs.sh: jwt-signing-key.pem
# Legacy name: opal_private_key.pem (backward compat)
PRIV_KEY=""
PUB_KEY=""
if [ -f /opal-keys/jwt-signing-key.pem ]; then
    PRIV_KEY="/opal-keys/jwt-signing-key.pem"
    PUB_KEY="/opal-keys/jwt-signing-key.pub.pem"
elif [ -f /opal-keys/opal_private_key.pem ]; then
    PRIV_KEY="/opal-keys/opal_private_key.pem"
    PUB_KEY="/opal-keys/opal_private_key.pem.pub"
fi

if [ -n "$PRIV_KEY" ] && [ -f "$PRIV_KEY" ]; then
    export OPAL_AUTH_PRIVATE_KEY="$(cat "$PRIV_KEY")"
    [ -f "$PUB_KEY" ] && export OPAL_AUTH_PUBLIC_KEY="$(cat "$PUB_KEY")"
    echo "OPAL: Loaded authentication keys from $PRIV_KEY"
else
    # Clear any broken env-var-based keys (e.g. literal \n from .env.hub)
    unset OPAL_AUTH_PRIVATE_KEY 2>/dev/null || true
    unset OPAL_AUTH_PUBLIC_KEY 2>/dev/null || true
    echo "OPAL: WARNING — no authentication keys found at /opal-keys/"
    echo "OPAL: Run: ./scripts/generate-opal-certs.sh"
fi

echo "OPAL: Starting server..."
echo "OPAL: BROADCAST_URI=${OPAL_BROADCAST_URI:-not set}"

# Start OPAL server
exec uvicorn opal_server.main:app \
    --host 0.0.0.0 \
    --port 7002 \
    --ssl-certfile /certs/certificate.pem \
    --ssl-keyfile /certs/key.pem
