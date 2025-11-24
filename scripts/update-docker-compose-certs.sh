#!/bin/bash
# Update docker-compose.yml to include DIVE Root CA certificates

set -e

PROJECT_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
COMPOSE_BACKUP="$PROJECT_ROOT/docker-compose.yml.pre-dive-certs.backup"

echo "============================================"
echo "Docker Compose DIVE Cert Configuration"
echo "============================================"
echo ""

# Backup existing docker-compose.yml
if [ -f "$COMPOSE_FILE" ]; then
    cp "$COMPOSE_FILE" "$COMPOSE_BACKUP"
    echo "✅ Backed up docker-compose.yml to:"
    echo "   $COMPOSE_BACKUP"
    echo ""
fi

echo "Creating updated docker-compose.yml with DIVE certificate mounts..."
echo ""
echo "The following changes will be made:"
echo ""
echo "1. Backend service:"
echo "   - Mount: ./backend/certs/dive-root-cas:/app/certs/dive-root-cas:ro"
echo "   - Env: NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem"
echo ""
echo "2. Frontend service:"
echo "   - Mount: ./frontend/certs/dive-root-cas:/app/certs/dive-root-cas:ro"
echo "   - Env: NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem"
echo ""
echo "3. Keycloak service:"
echo "   - Mount: ./keycloak/certs/dive-root-cas:/opt/keycloak/certs/dive-root-cas:ro"
echo "   - Env: Additional JAVA_OPTS for trustStore"
echo ""
echo "4. KAS service:"
echo "   - Mount: ./kas/certs/dive-root-cas:/app/certs/dive-root-cas:ro"
echo "   - Env: NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem"
echo ""
echo "⚠️  MANUAL INTEGRATION REQUIRED"
echo ""
echo "Please manually add the following to your docker-compose.yml:"
echo ""
cat << 'EOF'

# ========================================
# DIVE Root CA Certificate Configuration
# ========================================

services:
  backend:
    volumes:
      # ... existing volumes ...
      - ./backend/certs/dive-root-cas:/app/certs/dive-root-cas:ro
    environment:
      # ... existing environment variables ...
      - NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem

  frontend:
    volumes:
      # ... existing volumes ...
      - ./frontend/certs/dive-root-cas:/app/certs/dive-root-cas:ro
    environment:
      # ... existing environment variables ...
      - NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem

  keycloak:
    volumes:
      # ... existing volumes ...
      - ./keycloak/certs/dive-root-cas:/opt/keycloak/certs/dive-root-cas:ro
    environment:
      # ... existing environment variables ...
      - JAVA_OPTS=-Djavax.net.ssl.trustStore=/opt/keycloak/certs/dive-root-cas/dive-truststore.jks -Djavax.net.ssl.trustStorePassword=changeit ${JAVA_OPTS:-}

  kas:
    volumes:
      # ... existing volumes ...
      - ./kas/certs/dive-root-cas:/app/certs/dive-root-cas:ro
    environment:
      # ... existing environment variables ...
      - NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem

EOF
echo ""
echo "Configuration snippet saved to: dive-certs-compose.snippet.yml"
echo ""











