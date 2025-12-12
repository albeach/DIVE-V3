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

# Copy the CA certificate and add to system trust store
COPY certs/ca.crt /usr/local/share/ca-certificates/dive-hub-ca.crt

# Install curl for healthcheck and update CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Set environment variables for Python SSL
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Switch back to non-root user
USER opal

# The entrypoint is inherited from the base image
