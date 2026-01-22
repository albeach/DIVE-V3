# =============================================================================
# DIVE V3 - OPAL Client with Custom CA Trust
# =============================================================================
# This Dockerfile extends the official OPAL client image to include
# the mkcert CA certificate in the system trust store, enabling
# secure HTTPS connections to the Hub OPAL server.
# =============================================================================

FROM permitio/opal-client:latest

# Install ca-certificates and curl for healthcheck
USER root

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Create OPAL entrypoint script with CA trust setup AND TOKEN VALIDATION
# Write to /tmp which is user-writable
# CRITICAL FIX (2026-01-22): Validate OPAL_CLIENT_TOKEN before starting
# Without this, the client runs with empty token and enters infinite 403 loop
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# =============================================================================\n\
# CRITICAL: Validate OPAL_CLIENT_TOKEN before starting\n\
# =============================================================================\n\
# ROOT CAUSE FIX: Empty token causes infinite 403 retry loop\n\
# Best Practice: Fail fast with clear error instead of running broken\n\
if [ -z "$OPAL_CLIENT_TOKEN" ]; then\n\
    echo ""\n\
    echo "============================================================"\n\
    echo "ERROR: OPAL_CLIENT_TOKEN is empty or not set!"\n\
    echo "============================================================"\n\
    echo ""\n\
    echo "The OPAL client cannot connect without a valid token."\n\
    echo ""\n\
    echo "To fix this:"\n\
    echo "  1. Ensure Hub OPAL server is running"\n\
    echo "  2. Run: ./dive spoke opal-token <INSTANCE>"\n\
    echo "  3. Restart this container"\n\
    echo ""\n\
    echo "Waiting 30s before retry (allows token provisioning)..."\n\
    sleep 30\n\
    # Check again after wait\n\
    if [ -z "$OPAL_CLIENT_TOKEN" ]; then\n\
        echo "Token still empty after wait. Exiting."\n\
        exit 1\n\
    fi\n\
fi\n\
\n\
echo "OPAL_CLIENT_TOKEN is set (length: ${#OPAL_CLIENT_TOKEN} chars)"\n\
\n\
# =============================================================================\n\
# Setup CA certificates for SSL trust\n\
# =============================================================================\n\
if [ -f /var/opal/hub-certs/ca/rootCA.pem ]; then\n\
    # Combine Hub and local CA certificates\n\
    cat /var/opal/hub-certs/ca/rootCA.pem > /tmp/dive-combined-ca.pem\n\
    if [ -f /var/opal/certs/ca/rootCA.pem ]; then\n\
        cat /var/opal/certs/ca/rootCA.pem >> /tmp/dive-combined-ca.pem\n\
    fi\n\
    export SSL_CERT_FILE=/tmp/dive-combined-ca.pem\n\
    export REQUESTS_CA_BUNDLE=/tmp/dive-combined-ca.pem\n\
    export WEBSOCKET_SSL_CERT=/tmp/dive-combined-ca.pem\n\
    echo "Combined CA bundle created with Hub and local certificates"\n\
elif [ -f /var/opal/certs/ca/rootCA.pem ]; then\n\
    export SSL_CERT_FILE=/var/opal/certs/ca/rootCA.pem\n\
    export REQUESTS_CA_BUNDLE=/var/opal/certs/ca/rootCA.pem\n\
    export WEBSOCKET_SSL_CERT=/var/opal/certs/ca/rootCA.pem\n\
    echo "Using local CA certificate"\n\
else\n\
    echo "No CA certificates found, using system defaults"\n\
fi\n\
\n\
# Execute the OPAL client\n\
echo "Starting OPAL client..."\n\
exec opal-client run' > /usr/local/bin/opal-entrypoint.sh && \
    chmod +x /usr/local/bin/opal-entrypoint.sh

# Set default environment variables (will be overridden by setup script)
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Switch back to non-root user
USER opal

# The entrypoint is inherited from the base image
