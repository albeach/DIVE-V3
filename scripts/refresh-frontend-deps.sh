#!/bin/bash
# =============================================================================
# DIVE V3 - Refresh Frontend Dependencies
# =============================================================================
# This script removes stale node_modules volumes and restarts frontend containers
# to ensure new dependencies (like swagger-ui-react) are installed.
#
# Usage:
#   ./scripts/refresh-frontend-deps.sh           # Refresh all frontends
#   ./scripts/refresh-frontend-deps.sh ita       # Refresh only ITA
#   ./scripts/refresh-frontend-deps.sh hub       # Refresh only hub
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== DIVE V3 Frontend Dependency Refresh ===${NC}"

# Function to refresh a single frontend
refresh_frontend() {
    local instance="$1"
    local container_name="$2"
    local volume_pattern="$3"

    echo -e "${YELLOW}Refreshing ${instance} frontend...${NC}"

    # Stop the container
    echo "  Stopping container: $container_name"
    docker stop "$container_name" 2>/dev/null || true

    # Remove the node_modules volume
    echo "  Removing stale volumes matching: $volume_pattern"
    docker volume ls -q | grep -E "$volume_pattern" | grep . | xargs docker volume rm 2>/dev/null || true

    # Start the container (will reinstall deps)
    echo "  Starting container: $container_name"
    docker start "$container_name" 2>/dev/null || echo "  Container not found or already removed"

    echo -e "${GREEN}  ✓ ${instance} frontend refreshed${NC}"
}

TARGET="${1:-all}"

case "$TARGET" in
    hub)
        refresh_frontend "Hub" "dive-hub-frontend" "frontend_node_modules|dive-hub.*frontend"
        ;;
    ita)
        refresh_frontend "ITA" "dive-spoke-ita-frontend" "ita.*frontend_modules|dive-spoke-ita.*frontend"
        ;;
    hun)
        refresh_frontend "HUN" "dive-spoke-hun-frontend" "hun.*frontend_modules|dive-spoke-hun.*frontend"
        ;;
    usa)
        refresh_frontend "USA" "dive-spoke-usa-frontend" "usa.*frontend_modules|dive-spoke-usa.*frontend"
        ;;
    deu)
        refresh_frontend "DEU" "dive-spoke-deu-frontend" "deu.*frontend_modules|dive-spoke-deu.*frontend"
        ;;
    esp)
        refresh_frontend "ESP" "dive-spoke-esp-frontend" "esp.*frontend_modules|dive-spoke-esp.*frontend"
        ;;
    lva)
        refresh_frontend "LVA" "dive-spoke-lva-frontend" "lva.*frontend_modules|dive-spoke-lva.*frontend"
        ;;
    pol)
        refresh_frontend "POL" "dive-spoke-pol-frontend" "pol.*frontend_modules|dive-spoke-pol.*frontend"
        ;;
    all)
        echo -e "${YELLOW}Refreshing all frontend containers...${NC}"

        # Get all running frontend containers
        FRONTEND_CONTAINERS=$(docker ps --format '{{.Names}}' | grep -E 'frontend' || true)

        if [ -z "$FRONTEND_CONTAINERS" ]; then
            echo -e "${RED}No frontend containers found running${NC}"
            exit 0
        fi

        for container in $FRONTEND_CONTAINERS; do
            # Extract instance code from container name
            if [[ "$container" == *"dive-hub-frontend"* ]]; then
                instance="hub"
                volume_pattern="frontend_node_modules|dive-hub.*frontend"
            else
                # Extract instance code from dive-spoke-XXX-frontend
                instance=$(echo "$container" | sed -n 's/dive-spoke-\([a-z]*\)-frontend/\1/p')
                volume_pattern="${instance}.*frontend_modules|dive-spoke-${instance}.*frontend"
            fi

            if [ -n "$instance" ]; then
                refresh_frontend "$(echo $instance | tr '[:lower:]' '[:upper:]')" "$container" "$volume_pattern"
            fi
        done
        ;;
    *)
        echo -e "${RED}Unknown instance: $TARGET${NC}"
        echo "Usage: $0 [hub|ita|hun|usa|deu|esp|lva|pol|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=== Refresh complete ===${NC}"
echo ""
echo "Containers are restarting and will run 'npm install' to fetch new dependencies."
echo "Check logs with: docker logs -f <container-name>"
echo ""
