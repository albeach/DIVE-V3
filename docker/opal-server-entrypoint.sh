#!/bin/bash
# =============================================================================
# OPAL Server Entrypoint
# =============================================================================
# Loads authentication keys and starts the OPAL server
# =============================================================================

set -e

# Load OPAL authentication keys from mounted files (if available)
if [ -f /opal-keys/opal_private_key.pem ]; then
    export OPAL_AUTH_PRIVATE_KEY="$(cat /opal-keys/opal_private_key.pem)"
    export OPAL_AUTH_PUBLIC_KEY="$(cat /opal-keys/opal_private_key.pem.pub)"
    echo "OPAL: Loaded authentication keys"
else
    echo "OPAL: Running without authentication (no keys found)"
fi

echo "OPAL: Starting server..."
echo "OPAL: BROADCAST_URI=${OPAL_BROADCAST_URI:-not set}"

# Start OPAL server
exec uvicorn opal_server.main:app \
    --host 0.0.0.0 \
    --port 7002 \
    --ssl-certfile /certs/certificate.pem \
    --ssl-keyfile /certs/key.pem
