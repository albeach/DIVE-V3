# ============================================
# Custom Keycloak Image with curl for Admin Operations
# ============================================
# Extends official Keycloak 26.0.7 image to add curl utility
# Required for: MFA user attribute management scripts
# 
# NOTE: Keycloak 26.0.7 uses a minimal base image with NO package managers
# We download a statically-linked curl binary from the official curl project

FROM quay.io/keycloak/keycloak:26.4.2

USER root

# ============================================
# Multi-Platform curl Installation
# ============================================
# Download appropriate curl binary based on architecture
# Supports: AMD64 (x86_64) and ARM64 (aarch64)
# Use ADD instead of curl to avoid chicken-and-egg problem
ARG TARGETARCH
RUN echo "Building for architecture: ${TARGETARCH}"

# Download curl binary using ADD (works without curl being present)
ADD --chmod=755 https://github.com/moparisthebest/static-curl/releases/download/v8.4.0/curl-amd64 /tmp/curl-amd64
ADD --chmod=755 https://github.com/moparisthebest/static-curl/releases/download/v8.4.0/curl-aarch64 /tmp/curl-aarch64

# Copy the appropriate binary based on architecture
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        cp /tmp/curl-amd64 /usr/bin/curl; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        cp /tmp/curl-aarch64 /usr/bin/curl; \
    else \
        echo "Unsupported architecture: ${TARGETARCH}" && exit 1; \
    fi && \
    rm /tmp/curl-* && \
    chmod +x /usr/bin/curl && \
    /usr/bin/curl --version

# ============================================
# Import mkcert SSL Certificate into Java Truststore
# ============================================
# Copy mkcert-generated SSL certificates into the image
# These are locally-trusted certificates (no browser warnings in development)
COPY --chown=1000:1000 certs/ /opt/keycloak/certs/

# Import mkcert root CA into Java truststore for IdP broker federation
COPY certs/rootCA.pem /tmp/rootCA.pem
RUN keytool -importcert -noprompt -trustcacerts \
    -alias mkcert-root-ca \
    -file /tmp/rootCA.pem \
    -keystore /etc/pki/java/cacerts \
    -storepass changeit && \
    rm /tmp/rootCA.pem

# Copy custom DIVE V3 themes (base + all country variants)
COPY --chown=1000:1000 themes/ /opt/keycloak/themes/

# ============================================
# v2.0.0 CHANGE: Custom SPIs REMOVED
# ============================================
# Custom SPI JARs have been REMOVED in favor of native Keycloak 26.4.2 features
# All ACR/AMR tracking, conditional MFA, and OTP handling now use built-in capabilities
# See: docs/NATIVE-KEYCLOAK-REFACTORING.md for migration details
#
# REMOVED LINE (v1.x):
# COPY --chown=1000:1000 providers/*.jar /opt/keycloak/providers/

# ============================================
# Certificate Trust Configuration
# ============================================
# Certificates are imported at RUNTIME (not build time) for flexibility
# This allows the same image to work with different certificates
# See: scripts/import-keycloak-certs-runtime.sh
#
# Certificate mounting handled via docker-compose volumes:
#   - /opt/keycloak/certs/certificate.pem (Keycloak's own cert)
#   - /opt/keycloak/certs/key.pem (Keycloak's private key)
#   - /opt/app/certs/rootCA.pem (mkcert CA for trust)
#   - /opt/keycloak/certs/dive-root-cas/ (DIVE Root CAs for federation)
#
# Runtime import is handled by deploy-ubuntu.sh Phase 10
# or manually via: ./scripts/import-keycloak-certs-runtime.sh

USER 1000

# Keep the original entrypoint and command from base image

