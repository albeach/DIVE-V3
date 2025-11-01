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

# Download statically-linked curl binary
# Using curl-static from stunnel/static-curl project which provides precompiled static binaries
ADD https://github.com/moparisthebest/static-curl/releases/download/v8.4.0/curl-amd64 /usr/bin/curl

# Make it executable
RUN chmod +x /usr/bin/curl

# Verify it works
RUN /usr/bin/curl --version

# ============================================
# Import Self-Signed SSL Certificate into Java Truststore
# ============================================
# Copy SSL certificates into the image
COPY --chown=1000:1000 certs/ /opt/keycloak/certs/

# Copy custom DIVE V3 themes (base + all country variants)
COPY --chown=1000:1000 themes/ /opt/keycloak/themes/

# Import self-signed certificate into Java truststore
# This allows Keycloak's Java HTTP client to trust HTTPS calls to itself during federation
# (e.g., broker realm calling national realm token endpoints)
RUN keytool -import -trustcacerts \
    -alias localhost-selfsigned \
    -file /opt/keycloak/certs/certificate.pem \
    -keystore /etc/pki/ca-trust/extracted/java/cacerts \
    -storepass changeit \
    -noprompt

# Verify certificate was imported
RUN keytool -list -keystore /etc/pki/ca-trust/extracted/java/cacerts -storepass changeit -alias localhost-selfsigned

USER 1000

# Keep the original entrypoint and command from base image

