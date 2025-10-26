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

USER 1000

# Keep the original entrypoint and command from base image

