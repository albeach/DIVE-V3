# ============================================
# Custom Keycloak Image with curl for Admin Operations
# ============================================
# Extends official Keycloak 26.0.7 image to add curl utility
# Required for: MFA user attribute management scripts
# 
# NOTE: Keycloak 26.0.7 uses a minimal base image with NO package managers
# We download a statically-linked curl binary from the official curl project

FROM quay.io/keycloak/keycloak:26.0.7

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

# Copy custom DIVE V3 themes (base + all country variants)
COPY --chown=1000:1000 themes/ /opt/keycloak/themes/

# Copy Custom SPI JARs for conditional MFA and clearance downgrade
COPY --chown=1000:1000 providers/*.jar /opt/keycloak/providers/

# Import mkcert certificate into Java truststore
# Java doesn't automatically use system trust store, so we must import explicitly
# This allows Keycloak's Java HTTP client to trust HTTPS calls to itself during federation
# (e.g., broker realm calling national realm token endpoints)
RUN keytool -import -trustcacerts \
    -alias localhost-mkcert \
    -file /opt/keycloak/certs/certificate.pem \
    -keystore /etc/pki/ca-trust/extracted/java/cacerts \
    -storepass changeit \
    -noprompt

# Verify certificate was imported successfully
RUN keytool -list -keystore /etc/pki/ca-trust/extracted/java/cacerts -storepass changeit -alias localhost-mkcert

USER 1000

# Keep the original entrypoint and command from base image

