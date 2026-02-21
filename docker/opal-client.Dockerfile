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
# CRITICAL FIX (2026-01-27): Handle placeholder tokens gracefully
# - Empty token: Fail fast with clear error
# - Placeholder token: Allow container to start (will fail to connect but won't block deployment)
# - Real token: Normal operation
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# =============================================================================\n\
# CRITICAL: Validate OPAL_CLIENT_TOKEN before starting\n\
# =============================================================================\n\
# ROOT CAUSE FIX: Empty token causes infinite 403 retry loop\n\
# Best Practice: Handle placeholder tokens gracefully, fail fast for truly empty\n\
# =============================================================================\n\
# PLACEHOLDER TOKEN HANDLING:\n\
# - placeholder-token-awaiting-provision: Set during initialization phase\n\
#   - OPAL client will start but fail to connect (expected)\n\
#   - This allows deployment to proceed without blocking on OPAL token\n\
#   - Real token is provisioned in configuration phase after federation\n\
#   - Container will be restarted with real token after provisioning\n\
# =============================================================================\n\
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
elif [ "$OPAL_CLIENT_TOKEN" = "placeholder-token-awaiting-provision" ]; then\n\
    echo ""\n\
    echo "============================================================"\n\
    echo "INFO: OPAL_CLIENT_TOKEN is placeholder (awaiting provision)"\n\
    echo "============================================================"\n\
    echo ""\n\
    echo "OPAL client will start with placeholder token."\n\
    echo "This is expected during deployment - token will be set in configuration phase."\n\
    echo ""\n\
    echo "Note: OPAL client will fail to connect with placeholder token."\n\
    echo "This is non-blocking - deployment checkpoint allows OPTIONAL services to be unhealthy."\n\
    echo "Real token will be provisioned in configuration phase after federation setup."\n\
    echo ""\n\
    # Continue with placeholder - OPAL client will try to connect and fail gracefully\n\
    # Container will remain running but health check will fail (expected for OPTIONAL service)\n\
    echo "Starting OPAL client with placeholder token (will be replaced after federation)..."\n\
fi\n\
\n\
if [ -n "$OPAL_CLIENT_TOKEN" ] && [ "$OPAL_CLIENT_TOKEN" != "placeholder-token-awaiting-provision" ]; then\n\
    echo "OPAL_CLIENT_TOKEN is set (length: ${#OPAL_CLIENT_TOKEN} chars)"\n\
elif [ "$OPAL_CLIENT_TOKEN" = "placeholder-token-awaiting-provision" ]; then\n\
    echo "OPAL_CLIENT_TOKEN is placeholder (will be replaced in configuration phase)"\n\
fi\n\
\n\
# =============================================================================\n\
# Setup CA certificates for SSL trust\n\
# =============================================================================\n\
# CRITICAL: Always start with system CAs (includes Let'"'"'s Encrypt, DigiCert, etc.)\n\
# Then append DIVE custom CAs (mkcert, Vault PKI, spoke self-signed)\n\
# This ensures OPAL client trusts BOTH public CAs (Hub behind Caddy/LE)\n\
# AND internal CAs (local dev with mkcert, enterprise with Vault PKI)\n\
# =============================================================================\n\
cp /etc/ssl/certs/ca-certificates.crt /tmp/dive-combined-ca.pem 2>/dev/null || true\n\
\n\
# Append project-root CA bundle (mkcert, Vault PKI, spoke self-signed)\n\
if [ -f /var/opal/ca-bundle/rootCA.pem ] && [ -s /var/opal/ca-bundle/rootCA.pem ]; then\n\
    cat /var/opal/ca-bundle/rootCA.pem >> /tmp/dive-combined-ca.pem\n\
    echo "Added project CA bundle to trust store"\n\
fi\n\
\n\
# Append Hub-specific certs if available (local dev federation)\n\
if [ -f /var/opal/hub-certs/ca/rootCA.pem ]; then\n\
    cat /var/opal/hub-certs/ca/rootCA.pem >> /tmp/dive-combined-ca.pem\n\
    echo "Added Hub CA certificate to trust store"\n\
fi\n\
\n\
# Append spoke instance certs if available\n\
if [ -f /var/opal/certs/ca/rootCA.pem ]; then\n\
    cat /var/opal/certs/ca/rootCA.pem >> /tmp/dive-combined-ca.pem\n\
    echo "Added spoke CA certificate to trust store"\n\
fi\n\
\n\
export SSL_CERT_FILE=/tmp/dive-combined-ca.pem\n\
export REQUESTS_CA_BUNDLE=/tmp/dive-combined-ca.pem\n\
export WEBSOCKET_SSL_CERT=/tmp/dive-combined-ca.pem\n\
echo "Combined CA bundle created (system + DIVE custom CAs)"\n\
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
