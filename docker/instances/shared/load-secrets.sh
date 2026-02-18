#!/bin/bash
# =============================================================================
# Load secrets for DIVE V3 shared services
# =============================================================================
# SSOT: Hub's .env.hub contains Vault-generated passwords.
# This script reads from .env.hub and writes the shared .env file.
#
# Provider priority: .env.hub (Vault) → AWS Secrets → GCP Secrets → defaults
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_ENV="${SCRIPT_DIR}/.env"

# Locate hub .env.hub (works from repo root or docker/instances/shared/)
find_hub_env() {
    local candidates=(
        "${DIVE_ROOT:+${DIVE_ROOT}/.env.hub}"
        "${SCRIPT_DIR}/../../../.env.hub"
        "/opt/dive-v3/.env.hub"
    )
    for f in "${candidates[@]}"; do
        [ -n "$f" ] && [ -f "$f" ] && { echo "$f"; return 0; }
    done
    return 1
}

# Read a key=value from a file
_env_get() {
    local file="$1" key="$2"
    grep "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

# ---------------------------------------------------------------------------
# Provider 1: Hub .env.hub (Vault-generated — primary SSOT)
# ---------------------------------------------------------------------------
load_from_hub_env() {
    local hub_env
    hub_env=$(find_hub_env) || return 1

    echo "Loading shared secrets from hub .env.hub: ${hub_env}"

    REDIS_PASSWORD_BLACKLIST=$(_env_get "$hub_env" "REDIS_PASSWORD_BLACKLIST")
    REDIS_PASSWORD_USA=$(_env_get "$hub_env" "REDIS_PASSWORD_USA")
    # Grafana password: use hub value or generate a default
    GRAFANA_PASSWORD=$(_env_get "$hub_env" "GRAFANA_PASSWORD")
    [ -z "$GRAFANA_PASSWORD" ] && GRAFANA_PASSWORD="admin"

    [ -n "$REDIS_PASSWORD_BLACKLIST" ] && [ -n "$REDIS_PASSWORD_USA" ]
}

# ---------------------------------------------------------------------------
# Provider 2: AWS Secrets Manager
# ---------------------------------------------------------------------------
load_from_aws() {
    command -v aws >/dev/null 2>&1 || return 1
    echo "Loading shared secrets from AWS Secrets Manager..."

    REDIS_PASSWORD_BLACKLIST=$(aws secretsmanager get-secret-value \
        --secret-id dive-v3/shared/redis-blacklist \
        --query SecretString --output text 2>/dev/null | jq -r '.password // empty' 2>/dev/null) || true
    REDIS_PASSWORD_USA=$(aws secretsmanager get-secret-value \
        --secret-id dive-v3/core/redis-usa \
        --query SecretString --output text 2>/dev/null | jq -r '.password // empty' 2>/dev/null) || true
    GRAFANA_PASSWORD=$(aws secretsmanager get-secret-value \
        --secret-id dive-v3/shared/grafana \
        --query SecretString --output text 2>/dev/null | jq -r '.password // empty' 2>/dev/null) || true
    [ -z "$GRAFANA_PASSWORD" ] && GRAFANA_PASSWORD="admin"

    [ -n "$REDIS_PASSWORD_BLACKLIST" ] && [ -n "$REDIS_PASSWORD_USA" ]
}

# ---------------------------------------------------------------------------
# Provider 3: GCP Secret Manager
# ---------------------------------------------------------------------------
load_from_gcp() {
    command -v gcloud >/dev/null 2>&1 || return 1
    echo "Loading shared secrets from GCP Secret Manager..."

    REDIS_PASSWORD_BLACKLIST=$(gcloud secrets versions access latest \
        --secret=dive-v3-redis-blacklist --project=dive25 2>/dev/null) || true
    REDIS_PASSWORD_USA=$(gcloud secrets versions access latest \
        --secret=dive-v3-redis-usa --project=dive25 2>/dev/null) || true
    GRAFANA_PASSWORD=$(gcloud secrets versions access latest \
        --secret=dive-v3-grafana --project=dive25 2>/dev/null) || true
    [ -z "$GRAFANA_PASSWORD" ] && GRAFANA_PASSWORD="admin"

    [ -n "$REDIS_PASSWORD_BLACKLIST" ] && [ -n "$REDIS_PASSWORD_USA" ]
}

# ---------------------------------------------------------------------------
# Try providers in priority order
# ---------------------------------------------------------------------------
REDIS_PASSWORD_BLACKLIST=""
REDIS_PASSWORD_USA=""
GRAFANA_PASSWORD=""

if load_from_hub_env; then
    echo "Secrets loaded from hub .env.hub (Vault SSOT)"
elif load_from_aws; then
    echo "Secrets loaded from AWS Secrets Manager"
elif load_from_gcp; then
    echo "Secrets loaded from GCP Secret Manager"
else
    echo "WARNING: No secret provider available, using dev defaults"
    REDIS_PASSWORD_BLACKLIST="dive-redis-dev-password"
    REDIS_PASSWORD_USA="dive-redis-dev-password"
    GRAFANA_PASSWORD="admin"
fi

# Export for child processes
export REDIS_PASSWORD_BLACKLIST REDIS_PASSWORD_USA GRAFANA_PASSWORD

# ---------------------------------------------------------------------------
# Write shared .env file (idempotent)
# ---------------------------------------------------------------------------
write_shared_env() {
    cat > "$SHARED_ENV" <<EOF
REDIS_PASSWORD_BLACKLIST=${REDIS_PASSWORD_BLACKLIST}
REDIS_PASSWORD_USA=${REDIS_PASSWORD_USA}
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}
EOF
    echo "Wrote shared .env: ${SHARED_ENV}"
}

# Always write the .env so docker compose can read it
write_shared_env

# ---------------------------------------------------------------------------
# Copy hub certs to shared certs dir (Prometheus/Grafana TLS)
# ---------------------------------------------------------------------------
sync_hub_certs() {
    local hub_certs
    local candidates=(
        "${DIVE_ROOT:+${DIVE_ROOT}/instances/hub/certs}"
        "${SCRIPT_DIR}/../../../instances/hub/certs"
        "/opt/dive-v3/instances/hub/certs"
    )
    for d in "${candidates[@]}"; do
        [ -n "$d" ] && [ -d "$d" ] && { hub_certs="$d"; break; }
    done

    if [ -z "$hub_certs" ]; then
        echo "WARNING: Hub certs not found — shared TLS services may fail"
        return 0
    fi

    local shared_certs="${SCRIPT_DIR}/certs"
    mkdir -p "$shared_certs"

    # Copy cert + key for Prometheus/Grafana/Alertmanager TLS
    for f in certificate.pem key.pem fullchain.pem; do
        [ -f "${hub_certs}/${f}" ] && cp -f "${hub_certs}/${f}" "${shared_certs}/${f}"
    done

    # Monitoring containers run as non-root — key.pem must be world-readable
    chmod 644 "${shared_certs}/key.pem" 2>/dev/null || true

    # Copy CA directory
    if [ -d "${hub_certs}/ca" ]; then
        mkdir -p "${shared_certs}/ca"
        cp -f "${hub_certs}/ca/"*.pem "${shared_certs}/ca/" 2>/dev/null || true
    fi

    echo "Synced hub certs to shared certs: ${shared_certs}"
}

sync_hub_certs

# If no arguments, just exit (sourcing or standalone)
if [ $# -eq 0 ]; then
    echo "Shared secrets loaded and .env written successfully"
    exit 0
fi

echo "Starting service with hub-backed secrets..."
exec "$@"
