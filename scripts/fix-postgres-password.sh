#!/bin/bash
# DIVE V3 - Fix Postgres Password Mismatch
#
# This script handles the common issue where Postgres volume persists
# with an old password but the environment has a new password.
#
# Usage: ./scripts/fix-postgres-password.sh [usa|fra|gbr|deu]

set -e

INSTANCE="${1:-usa}"
PROJECT_NAME="${INSTANCE}"

case "$INSTANCE" in
    usa)
        COMPOSE_FILE="docker-compose.yml"
        VOLUME_NAME="dive-v3_postgres_data"
        SERVICE_NAME="postgres"
        ;;
    fra)
        COMPOSE_FILE="docker-compose.fra.yml"
        VOLUME_NAME="fra_postgres_data_fra"
        SERVICE_NAME="postgres-fra"
        ;;
    gbr)
        COMPOSE_FILE="docker-compose.gbr.yml"
        VOLUME_NAME="gbr_postgres_data_gbr"
        SERVICE_NAME="postgres-gbr"
        ;;
    deu)
        COMPOSE_FILE="docker-compose.deu.yml"
        VOLUME_NAME="deu_postgres_data_deu"
        SERVICE_NAME="postgres-deu"
        ;;
    *)
        echo "Usage: $0 [usa|fra|gbr|deu]"
        exit 1
        ;;
esac

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   DIVE V3 Postgres Password Fix - $INSTANCE                     "
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if volume exists
if docker volume inspect "$VOLUME_NAME" > /dev/null 2>&1; then
    echo "⚠️  Postgres volume exists: $VOLUME_NAME"
    echo ""
    echo "This volume may contain data initialized with a different password."
    echo ""
    read -p "Do you want to delete the volume and reinitialize? (y/N): " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Stopping services..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" stop "$SERVICE_NAME" keycloak 2>/dev/null || true
        
        echo "Removing containers..."
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" rm -f "$SERVICE_NAME" keycloak 2>/dev/null || true
        
        echo "Removing volume: $VOLUME_NAME"
        docker volume rm "$VOLUME_NAME" 2>/dev/null || {
            echo "⚠️  Could not remove volume. It may be in use."
            echo "   Run: docker compose -f $COMPOSE_FILE -p $PROJECT_NAME down"
            echo "   Then try again."
            exit 1
        }
        
        echo ""
        echo "✅ Volume removed. Postgres will reinitialize on next start."
        echo ""
        echo "To restart the stack:"
        echo "   docker compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d"
    else
        echo ""
        echo "Aborted. Volume not modified."
        echo ""
        echo "Alternative: Update the password in Postgres manually:"
        echo "   docker exec -it dive-v3-${SERVICE_NAME} psql -U postgres"
        echo "   ALTER USER postgres PASSWORD 'new_password';"
    fi
else
    echo "✅ No existing Postgres volume found."
    echo "   A fresh volume will be created on next start."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "If you continue to see password errors, ensure your .env file"
echo "has the correct POSTGRES_PASSWORD value (from GCP Secret Manager)."
echo ""
echo "Run: ./scripts/sync-env.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

