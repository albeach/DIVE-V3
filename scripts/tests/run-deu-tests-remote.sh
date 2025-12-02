#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Run DEU Tests on Remote Server
# =============================================================================
# Syncs test scripts to DEU server and runs them remotely using the correct
# domain (prosecurity.biz) and local instance endpoints.
#
# Usage:
#   ./scripts/tests/run-deu-tests-remote.sh [test-script]
#
# Examples:
#   ./scripts/tests/run-deu-tests-remote.sh verify-comprehensive-federation.sh
#   ./scripts/tests/run-deu-tests-remote.sh verify-federated-search.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Ensure we're using the correct test script directory
TEST_SCRIPT_DIR="$PROJECT_ROOT/scripts/tests"

# Source SSH helper
source "$PROJECT_ROOT/scripts/remote/ssh-helper.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REMOTE_DIR="/opt/dive-v3"
TEST_SCRIPT="${1:-verify-comprehensive-federation.sh}"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  DIVE V3 - Remote DEU Test Execution                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
if ! check_ssh_prereqs; then
    echo -e "${RED}❌ sshpass not found. Please install it first.${NC}"
    exit 1
fi

# Step 1: Sync test scripts to remote server
echo -e "${BLUE}━━━ Step 1: Syncing Test Scripts to DEU Server ━━━${NC}"
echo ""

# Create remote test directory
ssh_remote deu "mkdir -p ${REMOTE_DIR}/scripts/tests" || true

# Sync the test script
echo "Syncing ${TEST_SCRIPT}..."
if [ -f "${TEST_SCRIPT_DIR}/${TEST_SCRIPT}" ]; then
    rsync_remote deu "${TEST_SCRIPT_DIR}/${TEST_SCRIPT}" "${REMOTE_DIR}/scripts/tests/${TEST_SCRIPT}"
elif [ -f "${SCRIPT_DIR}/${TEST_SCRIPT}" ]; then
    rsync_remote deu "${SCRIPT_DIR}/${TEST_SCRIPT}" "${REMOTE_DIR}/scripts/tests/${TEST_SCRIPT}"
else
    echo -e "${YELLOW}Warning: Test script ${TEST_SCRIPT} not found${NC}"
    echo "Searched in:"
    echo "  - ${TEST_SCRIPT_DIR}/${TEST_SCRIPT}"
    echo "  - ${SCRIPT_DIR}/${TEST_SCRIPT}"
    echo ""
    echo "Available scripts in ${TEST_SCRIPT_DIR}:"
    ls -1 "${TEST_SCRIPT_DIR}"/*.sh 2>/dev/null | xargs -n1 basename || true
    exit 1
fi

# Sync required helper scripts
echo "Syncing helper scripts..."
for helper in sync-gcp-secrets.sh; do
    if [ -f "$PROJECT_ROOT/scripts/$helper" ]; then
        rsync_remote deu "$PROJECT_ROOT/scripts/$helper" "${REMOTE_DIR}/scripts/$helper"
    fi
done

# Sync config files
echo "Syncing config files..."
rsync_remote deu "$PROJECT_ROOT/config/federation-registry.json" "${REMOTE_DIR}/config/federation-registry.json" || true
rsync_remote deu "$PROJECT_ROOT/config/kas-registry.json" "${REMOTE_DIR}/config/kas-registry.json" || true

# Ensure GCP key directory exists and key is accessible
echo "Verifying GCP service account key..."
ssh_remote deu "mkdir -p ${REMOTE_DIR}/gcp && ls -la ${REMOTE_DIR}/gcp/deu-sa-key.json 2>/dev/null || echo 'Warning: GCP key not found at ${REMOTE_DIR}/gcp/deu-sa-key.json'"

echo -e "${GREEN}✅ Files synced${NC}"
echo ""

# Step 2: Make scripts executable
echo -e "${BLUE}━━━ Step 2: Setting Permissions ━━━${NC}"
ssh_remote deu "chmod +x ${REMOTE_DIR}/scripts/tests/*.sh ${REMOTE_DIR}/scripts/*.sh 2>/dev/null || true"
echo -e "${GREEN}✅ Permissions set${NC}"
echo ""

# Step 3: Run test on remote server
echo -e "${BLUE}━━━ Step 3: Running Test on DEU Server ━━━${NC}"
echo "Test script: ${TEST_SCRIPT}"
echo "Remote path: ${REMOTE_DIR}/scripts/tests/${TEST_SCRIPT}"
echo ""

# Step 3a: Install gcloud CLI in backend container if not present
echo -e "${BLUE}━━━ Step 3a: Installing gcloud CLI in Backend Container ━━━${NC}"
echo "Checking if gcloud is installed..."
if ssh_remote deu "docker exec dive-v3-backend-deu which gcloud" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ gcloud already installed${NC}"
else
    echo "Installing Python and gcloud CLI..."
    ssh_remote deu "docker exec dive-v3-backend-deu sh -c '
        # Install Python (required for gcloud installer)
        apk add --no-cache python3 py3-pip >/dev/null 2>&1 && \
        # Create python symlink (gcloud expects \"python\" not \"python3\")
        ln -sf /usr/bin/python3 /usr/bin/python 2>/dev/null || true && \
        # Install gcloud CLI via direct download
        cd /tmp && \
        curl -sSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz -o gcloud.tar.gz && \
        tar -xzf gcloud.tar.gz >/dev/null 2>&1 && \
        ./google-cloud-sdk/install.sh --quiet --usage-reporting=false --path-update=false >/dev/null 2>&1 && \
        export PATH=\$PATH:/tmp/google-cloud-sdk/bin && \
        /tmp/google-cloud-sdk/bin/gcloud --version | head -1 && \
        echo \"✅ gcloud installed successfully\"
    '" || echo -e "${RED}❌ Failed to install gcloud${NC}"
fi
echo ""

# Step 3b: Copy test script and GCP key into backend container
echo -e "${BLUE}━━━ Step 3b: Copying Test Files into Backend Container ━━━${NC}"
ssh_remote deu "docker cp ${REMOTE_DIR}/scripts/tests/${TEST_SCRIPT} dive-v3-backend-deu:/tmp/${TEST_SCRIPT} 2>/dev/null"
ssh_remote deu "docker cp ${REMOTE_DIR}/gcp/deu-sa-key.json dive-v3-backend-deu:/tmp/deu-sa-key.json 2>/dev/null || echo 'Warning: Could not copy GCP key'"
echo -e "${GREEN}✅ Files copied${NC}"
echo ""

# Step 3c: Load GCP secrets using sync script on remote server
echo -e "${BLUE}━━━ Step 3c: Loading GCP Secrets from Remote Server ━━━${NC}"
echo "Using sync-gcp-secrets-deu.sh script on remote server..."
GCP_SECRETS=$(ssh_remote deu "cd ${REMOTE_DIR} && export GOOGLE_APPLICATION_CREDENTIALS=${REMOTE_DIR}/gcp/deu-sa-key.json && source scripts/sync-gcp-secrets-deu.sh 2>&1 && env | grep -E 'KEYCLOAK_CLIENT_SECRET_DEU|MONGO_PASSWORD_DEU' | head -2")
if [ -n "$GCP_SECRETS" ]; then
    echo -e "${GREEN}✅ GCP secrets loaded${NC}"
    # Export secrets for use in container
    export KEYCLOAK_CLIENT_SECRET_DEU=$(echo "$GCP_SECRETS" | grep KEYCLOAK_CLIENT_SECRET_DEU | cut -d= -f2)
else
    echo -e "${YELLOW}⚠️  Failed to load GCP secrets${NC}"
fi
echo ""

# Step 3d: Run test - use remote server execution (has gcloud access)
echo -e "${BLUE}━━━ Step 3d: Running Test on Remote Server ━━━${NC}"
echo "Running test on remote server (has gcloud CLI access)..."
ssh_remote deu "cd ${REMOTE_DIR} && \
    export GOOGLE_APPLICATION_CREDENTIALS=${REMOTE_DIR}/gcp/deu-sa-key.json && \
    source scripts/sync-gcp-secrets-deu.sh >/dev/null 2>&1 && \
    sh scripts/tests/${TEST_SCRIPT} 2>&1"

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ DEU remote tests completed successfully!${NC}"
else
    echo -e "${RED}❌ DEU remote tests failed (exit code: $RESULT)${NC}"
fi

exit $RESULT

