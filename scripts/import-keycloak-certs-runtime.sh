#!/usr/bin/env bash
# ============================================
# Import Certificates into Keycloak Java Truststore (Runtime)
# ============================================
# Purpose: Import SSL/TLS certificates into running Keycloak container
# When: After Keycloak container starts (Phase 10 of deploy-ubuntu.sh)
# Why: Allows Keycloak to trust:
#      - Its own certificate (for federation callbacks)
#      - mkcert Root CA (for local HTTPS trust)
#      - DIVE Root CAs (for external IdP federation)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="dive-v3-keycloak"
TRUSTSTORE_PASSWORD="changeit"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Import Certificates to Keycloak Runtime${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Verify container is running
echo -e "${YELLOW}Step 1: Verify Keycloak container is running...${NC}"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}❌ Error: Container ${CONTAINER_NAME} is not running!${NC}"
    echo "   Start services first: docker compose up -d"
    exit 1
fi
echo -e "${GREEN}✓${NC} Keycloak container is running"
echo ""

# Step 2: Detect Java cacerts path dynamically
echo -e "${YELLOW}Step 2: Detecting Java truststore location...${NC}"
JAVA_CACERTS=$(docker exec "${CONTAINER_NAME}" bash -c '
    for dir in /usr/lib/jvm/java-*-openjdk-*/lib/security; do
        if [ -f "$dir/cacerts" ]; then
            echo "$dir/cacerts"
            exit 0
        fi
    done
    # Fallback locations
    [ -f /usr/lib/jvm/default-java/lib/security/cacerts ] && echo "/usr/lib/jvm/default-java/lib/security/cacerts" && exit 0
    [ -f /etc/pki/java/cacerts ] && echo "/etc/pki/java/cacerts" && exit 0
    echo ""
')

if [ -z "$JAVA_CACERTS" ]; then
    echo -e "${RED}❌ Error: Could not find Java cacerts truststore${NC}"
    echo "   Keycloak federation may not work properly"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found Java cacerts at: ${BLUE}${JAVA_CACERTS}${NC}"
echo ""

# Step 3: Backup existing truststore
echo -e "${YELLOW}Step 3: Backup existing truststore...${NC}"
docker exec -u root "${CONTAINER_NAME}" bash -c \
    "cp ${JAVA_CACERTS} ${JAVA_CACERTS}.backup-\$(date +%Y%m%d-%H%M%S) 2>/dev/null || true"
echo -e "${GREEN}✓${NC} Truststore backed up"
echo ""

# Step 4: Import mkcert Root CA
echo -e "${YELLOW}Step 4: Import mkcert Root CA (for local HTTPS trust)...${NC}"
MKCERT_IMPORTED=false

# Try /opt/app/certs/rootCA.pem first (from docker-compose.mkcert.yml)
if docker exec "${CONTAINER_NAME}" test -f /opt/app/certs/rootCA.pem 2>/dev/null; then
    if docker exec -u root "${CONTAINER_NAME}" bash -c "
        keytool -import -noprompt -trustcacerts \
            -alias mkcert-root-ca \
            -file /opt/app/certs/rootCA.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1
    " | grep -qE "Certificate was added|already exists"; then
        echo -e "${GREEN}✓${NC} mkcert Root CA imported from /opt/app/certs/rootCA.pem"
        MKCERT_IMPORTED=true
    fi
fi

# Fallback: Try old location
if [ "$MKCERT_IMPORTED" = "false" ] && docker exec "${CONTAINER_NAME}" test -f /opt/keycloak/certs/rootCA.pem 2>/dev/null; then
    if docker exec -u root "${CONTAINER_NAME}" bash -c "
        keytool -import -noprompt -trustcacerts \
            -alias mkcert-root-ca \
            -file /opt/keycloak/certs/rootCA.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1
    " | grep -qE "Certificate was added|already exists"; then
        echo -e "${GREEN}✓${NC} mkcert Root CA imported from /opt/keycloak/certs/rootCA.pem"
        MKCERT_IMPORTED=true
    fi
fi

if [ "$MKCERT_IMPORTED" = "false" ]; then
    echo -e "${YELLOW}⚠${NC}  mkcert Root CA not found or already imported"
    echo "   This is OK if using production certificates"
fi
echo ""

# Step 5: Import Keycloak's own certificate
echo -e "${YELLOW}Step 5: Import Keycloak's own certificate (for callbacks)...${NC}"
if docker exec "${CONTAINER_NAME}" test -f /opt/keycloak/certs/certificate.pem 2>/dev/null || \
   docker exec "${CONTAINER_NAME}" test -f /opt/app/certs/certificate.pem 2>/dev/null; then
    
    CERT_FILE="/opt/keycloak/certs/certificate.pem"
    if ! docker exec "${CONTAINER_NAME}" test -f "$CERT_FILE" 2>/dev/null; then
        CERT_FILE="/opt/app/certs/certificate.pem"
    fi
    
    if docker exec -u root "${CONTAINER_NAME}" bash -c "
        keytool -import -noprompt -trustcacerts \
            -alias keycloak-self-signed \
            -file ${CERT_FILE} \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1
    " | grep -qE "Certificate was added|already exists"; then
        echo -e "${GREEN}✓${NC} Keycloak certificate imported"
    else
        echo -e "${YELLOW}⚠${NC}  Keycloak certificate already imported or failed"
    fi
else
    echo -e "${YELLOW}⚠${NC}  Keycloak certificate not found"
fi
echo ""

# Step 6: Import DIVE Root CAs (optional - for federation)
echo -e "${YELLOW}Step 6: Import DIVE Root CAs (for external IdP federation)...${NC}"
DIVE_CA_IMPORTED=false

if docker exec "${CONTAINER_NAME}" test -f /opt/keycloak/certs/dive-root-cas/dive-root-cas.pem 2>/dev/null; then
    if docker exec -u root "${CONTAINER_NAME}" bash -c "
        keytool -import -noprompt -trustcacerts \
            -alias dive-root-cas \
            -file /opt/keycloak/certs/dive-root-cas/dive-root-cas.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1
    " | grep -qE "Certificate was added|already exists"; then
        echo -e "${GREEN}✓${NC} DIVE Root CAs imported"
        DIVE_CA_IMPORTED=true
    fi
fi

if [ "$DIVE_CA_IMPORTED" = "false" ]; then
    echo -e "${YELLOW}⚠${NC}  DIVE Root CAs not found or already imported"
    echo "   This is OK if not using federation with external IdPs"
fi
echo ""

# Step 7: Verify imports
echo -e "${YELLOW}Step 7: Verify certificate imports...${NC}"
echo ""
docker exec -u root "${CONTAINER_NAME}" bash -c "
    echo 'Imported certificates:'
    keytool -list -keystore ${JAVA_CACERTS} -storepass ${TRUSTSTORE_PASSWORD} 2>/dev/null | \
        grep -E '(mkcert|keycloak|dive)' || echo '  (none found - may need manual import)'
"
echo ""

# Step 8: Restart Keycloak to apply changes
echo -e "${YELLOW}Step 8: Restart Keycloak to apply truststore changes...${NC}"
docker restart "${CONTAINER_NAME}" > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Keycloak restarted"
echo ""

# Step 9: Wait for Keycloak to be ready
echo -e "${YELLOW}Step 9: Wait for Keycloak to be ready...${NC}"
for i in {1..30}; do
    if curl -s -k https://localhost:8443/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Keycloak is ready!"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Certificate import complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Test Keycloak admin: https://localhost:8443/admin"
echo "  2. Test federation (if external IdPs configured)"
echo "  3. Check logs: docker compose logs keycloak | grep -i 'ssl\|cert\|trust'"
echo ""
echo "If SSL errors persist:"
echo "  - Verify certificates mounted: docker exec ${CONTAINER_NAME} ls -la /opt/app/certs/"
echo "  - Check truststore: docker exec ${CONTAINER_NAME} keytool -list -keystore ${JAVA_CACERTS} -storepass changeit"
echo "  - Review logs: docker compose logs keycloak | grep -i PKIX"
echo ""

