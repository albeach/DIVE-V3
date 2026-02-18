#!/bin/bash
# =============================================================================
# OPAL Server Entrypoint
# =============================================================================
# Validates JWT signing keys are mounted and starts OPAL server.
# Keys are loaded by OPAL natively via OPAL_AUTH_PRIVATE_KEY_PATH /
# OPAL_AUTH_PUBLIC_KEY_PATH env vars set in docker-compose.hub.yml.
# =============================================================================

set -e

# Clear any stale content-based key env vars (legacy / .env.hub leftovers)
# — OPAL_AUTH_PRIVATE_KEY_PATH takes precedence, but leftover content vars
#   with mangled multiline PEM cause MalformedFraming errors.
unset OPAL_AUTH_PRIVATE_KEY 2>/dev/null || true
unset OPAL_AUTH_PUBLIC_KEY 2>/dev/null || true

# Validate that key files are mounted
KEY_PATH="${OPAL_AUTH_PRIVATE_KEY_PATH:-/opal-keys/jwt-signing-key.pem}"
PUB_PATH="${OPAL_AUTH_PUBLIC_KEY_PATH:-/opal-keys/jwt-signing-key.pub.pem}"

if [ -f "$KEY_PATH" ]; then
    echo "OPAL: JWT signing key found at $KEY_PATH"
    [ -f "$PUB_PATH" ] && echo "OPAL: JWT public key found at $PUB_PATH"
else
    echo "OPAL: ERROR — JWT signing key not found at $KEY_PATH"
    echo "OPAL: Ensure certs/opal/ is mounted to /opal-keys/ and keys are generated."
    echo "OPAL: Run: ./dive hub deploy (generates keys in SERVICES phase)"
    # Don't exit — let OPAL start and report its own error for clearer diagnostics
fi

echo "OPAL: Starting server..."
echo "OPAL: BROADCAST_URI=${OPAL_BROADCAST_URI:-not set}"

# Start OPAL server
exec uvicorn opal_server.main:app \
    --host 0.0.0.0 \
    --port 7002 \
    --ssl-certfile /certs/certificate.pem \
    --ssl-keyfile /certs/key.pem
