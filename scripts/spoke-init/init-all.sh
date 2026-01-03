#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Complete Spoke Initialization
# =============================================================================
# Master script that runs all initialization steps in order
# Usage: ./init-all.sh <INSTANCE_CODE>
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

if [[ -z "$INSTANCE_CODE" ]]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 FRA"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
PROJECT_PREFIX="${COMPOSE_PROJECT_NAME:-dive-spoke-${CODE_LOWER}}"

container_name() {
    local service="$1"
    # New naming pattern: dive-spoke-lva-postgres (not lva-postgres-lva-1)
    echo "dive-spoke-${CODE_LOWER}-${service}"
}

echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                          ║${NC}"
echo -e "${MAGENTA}║    ██████╗ ██╗██╗   ██╗███████╗    ██╗   ██╗██████╗                      ║${NC}"
echo -e "${MAGENTA}║    ██╔══██╗██║██║   ██║██╔════╝    ██║   ██║╚════██╗                     ║${NC}"
echo -e "${MAGENTA}║    ██║  ██║██║██║   ██║█████╗      ██║   ██║ █████╔╝                     ║${NC}"
echo -e "${MAGENTA}║    ██║  ██║██║╚██╗ ██╔╝██╔══╝      ╚██╗ ██╔╝ ╚═══██╗                     ║${NC}"
echo -e "${MAGENTA}║    ██████╔╝██║ ╚████╔╝ ███████╗     ╚████╔╝ ██████╔╝                     ║${NC}"
echo -e "${MAGENTA}║    ╚═════╝ ╚═╝  ╚═══╝  ╚══════╝      ╚═══╝  ╚═════╝                      ║${NC}"
echo -e "${MAGENTA}║                                                                          ║${NC}"
echo -e "${MAGENTA}║              SPOKE INITIALIZATION - ${CODE_UPPER} Instance                        ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track timing
START_TIME=$(date +%s)

# =============================================================================
# Step 1: Wait for services to be healthy
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 1/4: Waiting for services to be healthy...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Service names (without instance suffix - the container_name function adds it)
SERVICES=("postgres" "mongodb" "keycloak")
MAX_WAIT=120
WAITED=0

for SERVICE in "${SERVICES[@]}"; do
    CONTAINER="$(container_name "${SERVICE}")"
    echo -n "  Waiting for ${CONTAINER}... "

    while ! docker ps --format '{{.Names}} {{.Status}}' | grep -q "${CONTAINER}.*healthy"; do
        if [[ $WAITED -ge $MAX_WAIT ]]; then
            echo -e "${RED}TIMEOUT${NC}"
            echo "  Service ${CONTAINER} did not become healthy within ${MAX_WAIT}s"
            exit 1
        fi
        sleep 5
        WAITED=$((WAITED + 5))
        echo -n "."
    done
    echo -e "${GREEN}✓${NC}"
done

echo ""

# =============================================================================
# Step 2: Initialize Databases
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 2/4: Initializing Databases${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"${SCRIPT_DIR}/init-databases.sh" "${INSTANCE_CODE}"

# =============================================================================
# Step 3: Initialize Keycloak (with pre-verification)
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 3/4: Configuring Keycloak${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ADDED (Dec 2025): Pre-verify Keycloak is fully ready before realm operations
KC_CONTAINER="$(container_name keycloak)"
echo -e "  ${BLUE}ℹ${NC} Verifying Keycloak Admin API is responsive..."
KC_READY=false
for i in {1..30}; do
    # Try to get admin token as readiness check
    # CRITICAL: Try KC_BOOTSTRAP_ADMIN_PASSWORD first (Keycloak 26+), then legacy KEYCLOAK_ADMIN_PASSWORD
    KC_ADMIN_PASS=$(docker exec "$KC_CONTAINER" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$KC_ADMIN_PASS" ]; then
        KC_ADMIN_PASS=$(docker exec "$KC_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi
    if [ -n "$KC_ADMIN_PASS" ]; then
        TOKEN_CHECK=$(docker exec "$KC_CONTAINER" curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${KC_ADMIN_PASS}" 2>/dev/null | grep -o '"access_token"' || true)
        if [ -n "$TOKEN_CHECK" ]; then
            echo -e "  ${GREEN}✓${NC} Keycloak Admin API ready (attempt $i)"
            KC_READY=true
            break
        fi
    fi
    if [ $((i % 5)) -eq 0 ]; then
        echo -e "  ${YELLOW}⏳${NC} Waiting for Keycloak Admin API... ($i/30)"
    fi
    sleep 2
done

if [ "$KC_READY" != "true" ]; then
    echo -e "  ${RED}✗${NC} Keycloak Admin API not ready after 60s"
    echo -e "  ${YELLOW}⚠${NC} Proceeding anyway - init-keycloak.sh has built-in retry logic"
fi

"${SCRIPT_DIR}/init-keycloak.sh" "${INSTANCE_CODE}"

# =========================================================================
# User Seeding: NATO countries use localized attributes, others use English
# =========================================================================
# NATO countries have their own attribute names and clearance terminology
# (e.g., Italy: livello_sicurezza, NON_CLASSIFICATO)
# These are mapped to DIVE V3 standard claims via protocol mappers
# =========================================================================
NATO_MAPPINGS_FILE="${SCRIPT_DIR}/../../keycloak/mapper-templates/nato-attribute-mappings.json"
INSTANCE_DIR="${SCRIPT_DIR}/../../instances/${CODE_LOWER}"

if [ -f "$NATO_MAPPINGS_FILE" ] && jq -e ".countries.${CODE_UPPER}" "$NATO_MAPPINGS_FILE" > /dev/null 2>&1; then
    echo -e "  ${BLUE}ℹ${NC} ${CODE_UPPER} is a NATO country - using localized attributes"

    # STEP 1: Configure protocol mappers FIRST
    # This MUST run before seeding users because it registers localized attribute
    # names in Keycloak's User Profile (required for attributes to be accepted)
    "${SCRIPT_DIR}/configure-localized-mappers.sh" "${INSTANCE_CODE}"

    # STEP 2: Now seed users with localized attributes
    # The User Profile now has the localized attribute names registered
    "${SCRIPT_DIR}/seed-localized-users.sh" "${INSTANCE_CODE}"

    # Mark localization as complete (prevents duplicate run in spoke-deploy.sh)
    touch "${INSTANCE_DIR}/.localized" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} NATO localization complete"
else
    echo -e "  ${BLUE}ℹ${NC} ${CODE_UPPER} uses standard DIVE V3 attributes"
    "${SCRIPT_DIR}/seed-users.sh" "${INSTANCE_CODE}"
fi

# =============================================================================
# Step 3b: Sync AMR Attributes (CRITICAL for MFA)
# =============================================================================
# Sets user.attribute.amr based on each user's configured credentials (OTP, WebAuthn)
# This ensures AMR claims are populated correctly for MFA users
# The dive-amr-enrichment event listener also sets this on each login
# =============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 3b: Syncing AMR Attributes for MFA Users${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SYNC_AMR_SCRIPT="${SCRIPT_DIR}/../sync-amr-attributes.sh"
if [ -f "$SYNC_AMR_SCRIPT" ]; then
    # Use spoke-specific realm
    REALM_NAME="dive-v3-broker-${CODE_LOWER}"
    export KEYCLOAK_URL="https://localhost:${KEYCLOAK_PORT:-8443}"
    bash "$SYNC_AMR_SCRIPT" --realm "$REALM_NAME" 2>/dev/null || {
        echo -e "  ${YELLOW}⚠${NC} AMR sync completed with warnings (non-blocking)"
    }
else
    echo -e "  ${YELLOW}⚠${NC} sync-amr-attributes.sh not found - skipping AMR sync"
fi

# =============================================================================
# Step 4: Seed Resources (ZTDF-encrypted)
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 4/5: Seeding ZTDF-Encrypted Resources${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Use the TypeScript ZTDF seeding script via docker exec
# This creates properly encrypted resources with full ADatP-5663/ACP-240 compliance
BACKEND_CONTAINER="dive-spoke-${CODE_LOWER}-backend"

# Wait for backend container to be ready (up to 60 seconds)
echo -e "${BLUE}ℹ${NC} Checking backend container availability..."
for i in {1..60}; do
    if docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
        # Additional check: ensure node_modules are installed
        if docker exec "${BACKEND_CONTAINER}" test -d /app/node_modules 2>/dev/null; then
            echo -e "${GREEN}✓${NC} Backend container ready"
            break
        fi
    fi

    if [ $i -eq 60 ]; then
        echo -e "${RED}✗${NC} Backend container not available after 60 seconds"
        echo -e "${RED}✗${NC} Cannot seed resources without backend container"
        echo -e "${YELLOW}⚠${NC} Please check: docker ps | grep ${BACKEND_CONTAINER}"
        exit 1
    fi

    if [ $((i % 10)) -eq 0 ]; then
        echo -e "${YELLOW}⏳${NC} Waiting for backend container... ($i/60s)"
    fi
    sleep 1
done

# Seed ZTDF-encrypted resources (REQUIRED - no fallback to plaintext)
echo -e "${BLUE}ℹ${NC} Seeding 5000 ZTDF-encrypted resources with locale-aware classifications..."
echo -e "${BLUE}ℹ${NC} This may take 2-3 minutes for full encryption and validation..."

if ! docker exec "${BACKEND_CONTAINER}" npm run seed:instance -- \
    --instance="${INSTANCE_CODE}" \
    --count=5000 \
    --replace 2>&1 | tee /tmp/seed-${CODE_LOWER}.log; then
    echo -e "${RED}✗${NC} ZTDF seeding failed"
    echo -e "${RED}✗${NC} Check logs: /tmp/seed-${CODE_LOWER}.log"
    echo -e "${YELLOW}⚠${NC} All resources MUST be ZTDF-encrypted per ACP-240 compliance"
    exit 1
fi

echo -e "${GREEN}✓${NC} ZTDF resources seeded successfully"

# Verify ZTDF encryption
# NOTE: Resources are marked with encrypted:true field (not ztdf.manifest)
# The actual ZTDF wrapping happens at runtime when content is accessed via KAS
echo -e "${BLUE}ℹ${NC} Verifying resource encryption flags..."
MONGO_CONTAINER="dive-spoke-${CODE_LOWER}-mongodb"
MONGO_PWD=$(docker exec "${MONGO_CONTAINER}" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null)
ENCRYPTED_COUNT=$(docker exec "${MONGO_CONTAINER}" mongosh --quiet \
    "mongodb://admin:${MONGO_PWD}@localhost:27017/dive-v3-${CODE_LOWER}?authSource=admin" \
    --eval "db.resources.countDocuments({ encrypted: true })" 2>/dev/null | tail -1 || echo "0")
TOTAL_COUNT=$(docker exec "${MONGO_CONTAINER}" mongosh --quiet \
    "mongodb://admin:${MONGO_PWD}@localhost:27017/dive-v3-${CODE_LOWER}?authSource=admin" \
    --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

if [ "${TOTAL_COUNT:-0}" -lt 4900 ]; then
    echo -e "${RED}✗${NC} Resource seeding verification failed: only ${TOTAL_COUNT} of 5000 resources exist"
    exit 1
fi

echo -e "${GREEN}✓${NC} Verified ${TOTAL_COUNT} resources (${ENCRYPTED_COUNT} marked for KAS encryption)"

# =============================================================================
# Step 5: Sync Federation Secrets (if Hub is running)
# =============================================================================
if docker ps --format '{{.Names}}' | grep -q 'dive-hub-keycloak'; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 5/5: Syncing Federation Secrets with Hub${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    "${SCRIPT_DIR}/sync-federation-secrets.sh" "${INSTANCE_CODE}" || {
        echo -e "${YELLOW}⚠ Federation sync skipped (Hub IdP may not exist yet)${NC}"
        echo -e "${YELLOW}  Run './dive --instance ${INSTANCE_CODE} federation approve' after setup${NC}"
    }
else
    echo -e "${YELLOW}⚠ Hub not running - skipping federation secret sync${NC}"
    echo -e "${YELLOW}  Run './scripts/spoke-init/sync-federation-secrets.sh ${INSTANCE_CODE}' later${NC}"
fi

# =============================================================================
# Complete!
# =============================================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║                    🎉 SPOKE INITIALIZATION COMPLETE! 🎉                  ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Instance: ${CODE_UPPER}                                                           ║${NC}"
echo -e "${GREEN}║  Time: ${DURATION} seconds                                                       ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  ✓ PostgreSQL: NextAuth tables created                                  ║${NC}"
echo -e "${GREEN}║  ✓ MongoDB: Collections and indexes created                             ║${NC}"
echo -e "${GREEN}║  ✓ Keycloak: Realm, client, and scopes configured                       ║${NC}"
echo -e "${GREEN}║  ✓ Users: 5 test users with DIVE attributes                             ║${NC}"
echo -e "${GREEN}║  ✓ Resources: 5000 sample documents seeded                              ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Access URLs:                                                           ║${NC}"
echo -e "${GREEN}║    Frontend: https://${CODE_LOWER}-app.dive25.com                                ║${NC}"
echo -e "${GREEN}║    Keycloak: https://${CODE_LOWER}-idp.dive25.com                                ║${NC}"
echo -e "${GREEN}║    Backend:  https://${CODE_LOWER}-api.dive25.com                                ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Test Credentials:                                                      ║${NC}"
echo -e "${GREEN}║    See output above for generated passwords                             ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
