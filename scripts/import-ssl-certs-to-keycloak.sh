#!/usr/bin/env bash
# ============================================
# Import DIVE Self-Signed Certificates into Keycloak Java Truststore
# ============================================
# Purpose: Fix SSL certificate validation errors when Keycloak brokers to federated realms
# Issue: javax.net.ssl.SSLHandshakeException: PKIX path building failed
# Solution: Import all DIVE root CA certificates into Java's cacerts truststore

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}DIVE V3: Import SSL Certificates to Keycloak${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Configuration
CONTAINER_NAME="dive-v3-keycloak"
CERT_DIR="/opt/keycloak/certs/dive-root-cas"
JAVA_CACERTS="/usr/lib/jvm/java-21-openjdk-21.0.5.0.11-2.el9.aarch64/lib/security/cacerts"
TRUSTSTORE_PASSWORD="changeit"

echo -e "${YELLOW}Step 1: Verify container is running...${NC}"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}ERROR: Container ${CONTAINER_NAME} is not running!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Container is running${NC}"
echo

echo -e "${YELLOW}Step 2: Check certificate directory in container...${NC}"
if ! docker exec "${CONTAINER_NAME}" test -d "${CERT_DIR}"; then
    echo -e "${RED}ERROR: Certificate directory ${CERT_DIR} not found in container!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Certificate directory exists${NC}"
echo

echo -e "${YELLOW}Step 3: List available certificates...${NC}"
docker exec "${CONTAINER_NAME}" bash -c "ls -1 ${CERT_DIR}/*.pem 2>/dev/null || echo 'No .pem files found'"
echo

echo -e "${YELLOW}Step 4: Backup existing Java cacerts...${NC}"
docker exec -u root "${CONTAINER_NAME}" bash -c "cp ${JAVA_CACERTS} ${JAVA_CACERTS}.backup-\$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✓ Backup created${NC}"
echo

echo -e "${YELLOW}Step 5: Import DIVE root CA certificates...${NC}"

# Import the combined root CAs file
echo "Importing dive-root-cas.pem..."
docker exec -u root "${CONTAINER_NAME}" bash -c "
    if [ -f ${CERT_DIR}/dive-root-cas.pem ]; then
        keytool -import -noprompt \
            -trustcacerts \
            -alias dive-root-cas \
            -file ${CERT_DIR}/dive-root-cas.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1 || echo 'Certificate may already exist'
        echo '✓ Imported dive-root-cas.pem'
    else
        echo '⚠ dive-root-cas.pem not found'
    fi
"

# Import individual NLD CA certificates
echo "Importing NLD ECC Root CA..."
docker exec -u root "${CONTAINER_NAME}" bash -c "
    if [ -f ${CERT_DIR}/NLDECCDIVEROOTCAG1.cacert.pem ]; then
        keytool -import -noprompt \
            -trustcacerts \
            -alias nld-ecc-root-ca \
            -file ${CERT_DIR}/NLDECCDIVEROOTCAG1.cacert.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1 || echo 'Certificate may already exist'
        echo '✓ Imported NLDECCDIVEROOTCAG1.cacert.pem'
    else
        echo '⚠ NLDECCDIVEROOTCAG1.cacert.pem not found'
    fi
"

echo "Importing NLD RSA Root CA..."
docker exec -u root "${CONTAINER_NAME}" bash -c "
    if [ -f ${CERT_DIR}/NLDRSADIVEROOTCAG1.cacert.pem ]; then
        keytool -import -noprompt \
            -trustcacerts \
            -alias nld-rsa-root-ca \
            -file ${CERT_DIR}/NLDRSADIVEROOTCAG1.cacert.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1 || echo 'Certificate may already exist'
        echo '✓ Imported NLDRSADIVEROOTCAG1.cacert.pem'
    else
        echo '⚠ NLDRSADIVEROOTCAG1.cacert.pem not found'
    fi
"

# Import Keycloak's own certificate
echo "Importing Keycloak certificate.pem..."
docker exec -u root "${CONTAINER_NAME}" bash -c "
    if [ -f /opt/keycloak/certs/certificate.pem ]; then
        keytool -import -noprompt \
            -trustcacerts \
            -alias keycloak-self-signed \
            -file /opt/keycloak/certs/certificate.pem \
            -keystore ${JAVA_CACERTS} \
            -storepass ${TRUSTSTORE_PASSWORD} 2>&1 || echo 'Certificate may already exist'
        echo '✓ Imported certificate.pem'
    else
        echo '⚠ certificate.pem not found'
    fi
"

echo
echo -e "${GREEN}✓ Certificate import complete${NC}"
echo

echo -e "${YELLOW}Step 6: Verify imported certificates...${NC}"
docker exec -u root "${CONTAINER_NAME}" bash -c "
    keytool -list -keystore ${JAVA_CACERTS} -storepass ${TRUSTSTORE_PASSWORD} | grep -i dive
"
echo

echo -e "${YELLOW}Step 7: Restart Keycloak to apply changes...${NC}"
docker-compose restart keycloak
echo -e "${GREEN}✓ Keycloak restarted${NC}"
echo

echo -e "${YELLOW}Step 8: Wait for Keycloak to be ready...${NC}"
for i in {1..30}; do
    if curl -s -k https://localhost:8443/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Keycloak is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done
echo

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Certificate import complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Next steps:"
echo "1. Test authentication at https://localhost:3000"
echo "2. Try federating to a realm (e.g., USA)"
echo "3. Check logs: docker-compose logs -f keycloak | grep -i ssl"
echo
echo "If SSL errors persist, check:"
echo "- Certificate validity: docker exec dive-v3-keycloak keytool -list -v -keystore ${JAVA_CACERTS} -storepass changeit | grep -A 5 dive"
echo "- Keycloak logs: docker-compose logs keycloak | grep -i 'PKIX\|SSLHandshake'"

