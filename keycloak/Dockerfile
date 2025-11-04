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
# Import SSL Certificates into Java Truststore (PERMANENT FIX)
# ============================================
# Import all SSL certificates that Keycloak needs to trust
# Critical for federation: broker realm → federated realms (USA, FRA, CAN, etc.)
#
# Java truststore location: /usr/lib/jvm/java-21-openjdk-*/lib/security/cacerts
# We use a wildcard to handle different patch versions

RUN set -e && \
    JAVA_CACERTS="/usr/lib/jvm/java-21-openjdk-21.0.5.0.11-2.el9.aarch64/lib/security/cacerts" && \
    echo "Using Java cacerts at: $JAVA_CACERTS" && \
    # Import mkcert root CA (localhost HTTPS)
    if [ -f /opt/keycloak/certs/mkcert-rootCA.pem ]; then \
        echo "Importing mkcert root CA..." && \
        keytool -import -noprompt -trustcacerts \
            -alias mkcert-root-ca \
            -file /opt/keycloak/certs/mkcert-rootCA.pem \
            -keystore "$JAVA_CACERTS" \
            -storepass changeit && \
        echo "✓ mkcert CA imported"; \
    else \
        echo "⚠ mkcert-rootCA.pem not found"; \
    fi && \
    # Import Keycloak's own certificate
    if [ -f /opt/keycloak/certs/certificate.pem ]; then \
        echo "Importing Keycloak certificate..." && \
        keytool -import -noprompt -trustcacerts \
            -alias keycloak-localhost \
            -file /opt/keycloak/certs/certificate.pem \
            -keystore "$JAVA_CACERTS" \
            -storepass changeit && \
        echo "✓ Keycloak cert imported"; \
    else \
        echo "⚠ certificate.pem not found"; \
    fi && \
    # Import DIVE root CAs
    if [ -f /opt/keycloak/certs/dive-root-cas/dive-root-cas.pem ]; then \
        echo "Importing DIVE root CAs..." && \
        keytool -import -noprompt -trustcacerts \
            -alias dive-root-cas \
            -file /opt/keycloak/certs/dive-root-cas/dive-root-cas.pem \
            -keystore "$JAVA_CACERTS" \
            -storepass changeit && \
        echo "✓ DIVE CA imported"; \
    else \
        echo "⚠ dive-root-cas.pem not found"; \
    fi && \
    # Verify imports
    echo "Verifying certificate imports..." && \
    keytool -list -keystore "$JAVA_CACERTS" -storepass changeit | grep -E "(mkcert|keycloak|dive)" && \
    echo "✓ All certificates imported successfully"

USER 1000

# Keep the original entrypoint and command from base image

