#!/bin/bash
# =============================================================================
# OPAL Server Entrypoint
# =============================================================================
# Loads JWT signing keys and starts OPAL server.
# Private key: PEM format (-----BEGIN PRIVATE KEY-----)
# Public key:  SSH format (ssh-rsa AAAA...) — required by OPAL's cast_public_key()
#
# Files are mounted from certs/opal/ via docker-compose volume.
# =============================================================================

set -e

# Clear any stale content-based key env vars (legacy / .env.hub leftovers
# with mangled multiline PEM that cause MalformedFraming errors).
unset OPAL_AUTH_PRIVATE_KEY 2>/dev/null || true
unset OPAL_AUTH_PUBLIC_KEY 2>/dev/null || true

# File paths (mounted via docker-compose volume: ./certs/opal:/opal-keys:ro)
KEY_PATH="/opal-keys/jwt-signing-key.pem"
PUB_SSH_PATH="/opal-keys/jwt-signing-key.pub.ssh"
PUB_PEM_PATH="/opal-keys/jwt-signing-key.pub.pem"

# Load private key (PEM format)
if [ -f "$KEY_PATH" ]; then
    echo "OPAL: JWT private key found at $KEY_PATH"
    export OPAL_AUTH_PRIVATE_KEY
    OPAL_AUTH_PRIVATE_KEY=$(cat "$KEY_PATH")
else
    echo "OPAL: ERROR - JWT private key not found at $KEY_PATH"
    echo "OPAL: Run: ./dive hub deploy (generates keys in SERVICES phase)"
fi

# Load public key (SSH format — required by OPAL's cast_public_key)
if [ -f "$PUB_SSH_PATH" ]; then
    echo "OPAL: JWT public key (SSH format) found at $PUB_SSH_PATH"
    export OPAL_AUTH_PUBLIC_KEY
    OPAL_AUTH_PUBLIC_KEY=$(cat "$PUB_SSH_PATH")
elif [ -f "$PUB_PEM_PATH" ]; then
    # Fallback: convert PEM to SSH inline (upgrade path)
    echo "OPAL: WARNING - SSH public key not found, converting PEM to SSH inline"
    export OPAL_AUTH_PUBLIC_KEY
    OPAL_AUTH_PUBLIC_KEY=$(ssh-keygen -i -m PKCS8 -f "$PUB_PEM_PATH" 2>/dev/null || true)
    if [ -z "$OPAL_AUTH_PUBLIC_KEY" ]; then
        echo "OPAL: ERROR - Failed to convert PEM to SSH format"
    fi
else
    echo "OPAL: ERROR - No public key found at $PUB_SSH_PATH or $PUB_PEM_PATH"
fi

echo "OPAL: Starting server..."
echo "OPAL: BROADCAST_URI=${OPAL_BROADCAST_URI:-not set}"

# Start OPAL server
exec uvicorn opal_server.main:app \
    --host 0.0.0.0 \
    --port 7002 \
    --ssl-certfile /certs/certificate.pem \
    --ssl-keyfile /certs/key.pem
