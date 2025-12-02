#!/bin/bash
# =============================================================================
# DIVE V3 - Docker Compose Wrapper with GCP Secrets
# =============================================================================
# Wrapper script that loads GCP secrets before running docker compose commands.
# This ensures compose commands work even for read-only operations like 'ps'.
#
# Usage:
#   ./scripts/compose-with-secrets.sh [instance] [compose-command] [args...]
#
# Examples:
#   ./scripts/compose-with-secrets.sh usa ps
#   ./scripts/compose-with-secrets.sh fra ps --format json
#   ./scripts/compose-with-secrets.sh gbr logs backend-gbr
#   ./scripts/compose-with-secrets.sh usa up -d
# =============================================================================

set -e

INSTANCE="${1:-usa}"
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
shift  # Remove instance from args

if [ $# -eq 0 ]; then
    echo "Usage: $0 [instance] [compose-command] [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 usa ps"
    echo "  $0 fra ps --format json"
    echo "  $0 gbr logs backend-gbr"
    echo "  $0 usa up -d"
    exit 1
fi

# Determine compose file and project name
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

# Load secrets from GCP Secret Manager
# Use source to export variables to current shell
if ! source ./scripts/sync-gcp-secrets.sh "$INSTANCE_LOWER" >/dev/null 2>&1; then
    echo "⚠️  Warning: Failed to load GCP secrets. Some compose commands may fail."
    echo "   Run manually: source ./scripts/sync-gcp-secrets.sh $INSTANCE_LOWER"
    echo ""
fi

# Run docker compose command with loaded secrets
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"

