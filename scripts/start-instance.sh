#!/bin/bash
# =============================================================================
# DIVE V3 - Safe Instance Startup Script
# =============================================================================
# This script properly starts a DIVE V3 instance by:
# 1. Loading secrets from GCP Secret Manager (NOT .env files)
# 2. Starting Docker Compose with the correct environment
#
# Usage:
#   ./scripts/start-instance.sh [usa|fra|gbr|deu]
#
# Examples:
#   ./scripts/start-instance.sh usa    # Start USA instance
#   ./scripts/start-instance.sh fra    # Start FRA instance
# =============================================================================

set -e

INSTANCE="${1:-usa}"
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   DIVE V3 Instance Startup - ${INSTANCE_LOWER^^}                        "
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Determine compose file
case "$INSTANCE_LOWER" in
    usa)
        COMPOSE_FILE="docker-compose.yml"
        PROJECT_NAME="usa"
        ;;
    fra)
        COMPOSE_FILE="docker-compose.fra.yml"
        PROJECT_NAME="fra"
        ;;
    gbr)
        COMPOSE_FILE="docker-compose.gbr.yml"
        PROJECT_NAME="gbr"
        ;;
    deu)
        COMPOSE_FILE="docker-compose.deu.yml"
        PROJECT_NAME="deu"
        ;;
    *)
        echo "❌ Unknown instance: $INSTANCE"
        echo "   Valid instances: usa, fra, gbr, deu"
        exit 1
        ;;
esac

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Compose file not found: $COMPOSE_FILE"
    exit 1
fi

echo "📁 Compose file: $COMPOSE_FILE"
echo "🏷️  Project name: $PROJECT_NAME"
echo ""

# =============================================================================
# STEP 1: Load secrets from GCP Secret Manager
# =============================================================================
echo "🔐 Loading secrets from GCP Secret Manager..."
echo "   (NOT from .env files - security best practice)"
echo ""

if ! source ./scripts/sync-gcp-secrets.sh "$INSTANCE_LOWER"; then
    echo ""
    echo "❌ Failed to load GCP secrets!"
    echo "   Make sure you're authenticated: gcloud auth login"
    exit 1
fi

# Verify critical secrets are loaded
CRITICAL_SECRETS=(
    "POSTGRES_PASSWORD"
    "KEYCLOAK_ADMIN_PASSWORD"
    "KEYCLOAK_CLIENT_SECRET"
    "MONGO_PASSWORD"
    "AUTH_SECRET"
)

echo ""
echo "🔍 Verifying critical secrets..."
MISSING_SECRETS=()
for secret in "${CRITICAL_SECRETS[@]}"; do
    if [ -z "${!secret}" ]; then
        MISSING_SECRETS+=("$secret")
    else
        echo "   ✅ $secret loaded"
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Missing critical secrets:"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "   - $secret"
    done
    exit 1
fi

# =============================================================================
# STEP 2: Start Docker Compose
# =============================================================================
echo ""
echo "🚀 Starting Docker Compose..."
echo "   docker compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d"
echo ""

docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d

# =============================================================================
# STEP 3: Wait for services
# =============================================================================
echo ""
echo "⏳ Waiting for services to become healthy (90s max)..."
echo ""

# Wait up to 90 seconds for all services to be healthy
TIMEOUT=90
START_TIME=$(date +%s)

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo ""
        echo "⚠️  Timeout reached. Some services may still be starting."
        break
    fi
    
    # Count unhealthy services
    UNHEALTHY=$(docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps --format json 2>/dev/null | \
        jq -r 'select(.Health != "healthy" and .Health != "") | .Name' 2>/dev/null | wc -l || echo "0")
    
    if [ "$UNHEALTHY" -eq 0 ]; then
        echo ""
        echo "✅ All services are healthy!"
        break
    fi
    
    echo -ne "\r   Elapsed: ${ELAPSED}s, Unhealthy: ${UNHEALTHY}..."
    sleep 5
done

# =============================================================================
# STEP 4: Show status
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Service Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Access URLs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Frontend: https://${INSTANCE_LOWER}-app.dive25.com"
echo "   API:      https://${INSTANCE_LOWER}-api.dive25.com"
echo "   Keycloak: https://${INSTANCE_LOWER}-idp.dive25.com"
echo ""
echo "✅ ${INSTANCE_LOWER^^} instance started successfully!"
echo ""

