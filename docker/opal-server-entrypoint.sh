#!/bin/bash
# =============================================================================
# OPAL Server Entrypoint
# =============================================================================
# Loads JWT authentication keys and starts the OPAL server with HTTPS
# =============================================================================

set -e

# Load OPAL JWT authentication keys from mounted files
# NOTE: OPAL expects PUBLIC key in SSH format (ssh-rsa ...), PRIVATE key in PEM format
if [ -f /opal-keys/opal_private_key.pem ]; then
    export OPAL_AUTH_PRIVATE_KEY="$(cat /opal-keys/opal_private_key.pem)"
    # Use SSH format for public key (OPAL calls load_ssh_public_key)
    if [ -f /opal-keys/opal_private_key.pem.pub ]; then
    export OPAL_AUTH_PUBLIC_KEY="$(cat /opal-keys/opal_private_key.pem.pub)"
        echo "OPAL: Loaded JWT authentication keys (RS256, SSH public key format)"
    else
        echo "OPAL: WARNING - Public key not found"
    fi
else
    echo "OPAL: WARNING - No JWT keys found, using master token only"
fi

echo "OPAL: Starting server..."
echo "OPAL: BROADCAST_URI=${OPAL_BROADCAST_URI:-not set}"

# Start OPAL server
exec uvicorn opal_server.main:app \
    --host 0.0.0.0 \
    --port 7002 \
    --ssl-certfile /certs/certificate.pem \
    --ssl-keyfile /certs/key.pem
