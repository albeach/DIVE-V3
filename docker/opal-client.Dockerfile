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

# Create OPAL entrypoint script with CA trust setup
# Write to /tmp which is user-writable
RUN echo '#!/bin/bash\n\
# Setup CA certificates for SSL trust - write to /tmp (user-writable)\n\
if [ -f /var/opal/hub-certs/ca/rootCA.pem ]; then\n\
    # Combine Hub and local CA certificates\n\
    cat /var/opal/hub-certs/ca/rootCA.pem > /tmp/dive-combined-ca.pem\n\
    if [ -f /var/opal/certs/ca/rootCA.pem ]; then\n\
        cat /var/opal/certs/ca/rootCA.pem >> /tmp/dive-combined-ca.pem\n\
    fi\n\
    export SSL_CERT_FILE=/tmp/dive-combined-ca.pem\n\
    export REQUESTS_CA_BUNDLE=/tmp/dive-combined-ca.pem\n\
    export WEBSOCKET_SSL_CERT=/tmp/dive-combined-ca.pem\n\
    echo "Combined CA bundle created with Hub and local certificates at /tmp/dive-combined-ca.pem"\n\
elif [ -f /var/opal/certs/ca/rootCA.pem ]; then\n\
    export SSL_CERT_FILE=/var/opal/certs/ca/rootCA.pem\n\
    export REQUESTS_CA_BUNDLE=/var/opal/certs/ca/rootCA.pem\n\
    export WEBSOCKET_SSL_CERT=/var/opal/certs/ca/rootCA.pem\n\
    echo "Using local CA certificate"\n\
else\n\
    echo "No CA certificates found, using system defaults"\n\
fi\n\
# Execute the OPAL client\n\
exec opal-client run' > /usr/local/bin/opal-entrypoint.sh && \
    chmod +x /usr/local/bin/opal-entrypoint.sh

# Set default environment variables (will be overridden by setup script)
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Switch back to non-root user
USER opal

# The entrypoint is inherited from the base image
