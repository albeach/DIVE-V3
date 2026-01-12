# ============================================
# Custom Keycloak Image with curl for Admin Operations
# ============================================
# Extends official Keycloak image to add curl utility
# Required for: MFA user attribute management scripts
#
# VERSION SSOT: The default version is defined here but can be overridden
# at build time via: docker build --build-arg KEYCLOAK_VERSION=26.4.7 ...
# The authoritative version is in scripts/dive-modules/common.sh
#
# NOTE: Keycloak 26.x uses a minimal base image with NO package managers
# We download a statically-linked curl binary from the official curl project

ARG KEYCLOAK_VERSION=26.5.0
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}

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
# DIVE V3 Realm Import (Best Practice)
# ============================================
# Copy realm templates for automatic import on startup
# Environment variables are substituted at runtime
COPY --chown=1000:1000 realms/ /opt/keycloak/realm-templates/
COPY --chown=1000:1000 scripts/import-realm.sh /opt/keycloak/scripts/import-realm.sh

# Create import directory with correct ownership BEFORE switching to user 1000
# This ensures the keycloak user can write to it at runtime
RUN mkdir -p /opt/keycloak/data/import && \
    chown -R 1000:1000 /opt/keycloak/data/import && \
    chmod +x /opt/keycloak/scripts/import-realm.sh

# ============================================
# DIVE V3 Custom SPI Providers (v3.1.0 - January 2026)
# ============================================
# CRITICAL FIX: Re-enabled custom AMR mapper (January 2026)
#
# The native oidc-amr-mapper does NOT work in Keycloak 26 because:
# 1. It reads "reference" config from authenticator execution configs
# 2. auth-username-password-form has configurable=false (cannot set reference)
# 3. Therefore "pwd" is never added to AMR, resulting in amr: []
#
# Custom DIVE SPIs provide:
# - dive-amr-protocol-mapper: Derives AMR from ACR (ACR works correctly)
#   - ACR "1" → AMR ["pwd"]           (AAL1: password only)
#   - ACR "2" → AMR ["pwd", "otp"]    (AAL2: password + OTP)
#   - ACR "3" → AMR ["pwd", "hwk"]    (AAL3: password + WebAuthn)
# - AMREnrichmentEventListener: Sets session notes for AMR/ACR
#
# Reference: HANDOFF_AMR_ACR_FINAL.md
COPY --chown=1000:1000 extensions/archived/target/dive-keycloak-extensions.jar /opt/keycloak/providers/

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

