#!/usr/bin/env bash
# =============================================================================
# Spoke Deployment Debugging Script
# =============================================================================
# Usage: ./scripts/debug-spoke-deploy.sh <CODE>
# Example: ./scripts/debug-spoke-deploy.sh NLD
# =============================================================================

set -euo pipefail

CODE="${1:?Spoke code required}"
CODE_UPPER="${CODE^^}"
CODE_LOWER="${CODE,,}"
DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                 SPOKE DEPLOYMENT DEBUG REPORT                       ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Instance: $CODE_UPPER"
echo "Date: $(date)"
echo ""

# 1. Check instance directory
echo "=== 1. INSTANCE DIRECTORY ==="
if [ -d "$DIVE_ROOT/instances/$CODE_LOWER" ]; then
    echo "✅ Directory exists: $DIVE_ROOT/instances/$CODE_LOWER"
    echo ""
    echo "Files:"
    ls -lh "$DIVE_ROOT/instances/$CODE_LOWER" | grep -E "^-" | awk '{print "  " $9 " (" $5 ")"}'
else
    echo "❌ Directory missing: $DIVE_ROOT/instances/$CODE_LOWER"
    exit 1
fi
echo ""

# 2. Check docker-compose.yml
echo "=== 2. DOCKER-COMPOSE.YML ==="
if [ -f "$DIVE_ROOT/instances/$CODE_LOWER/docker-compose.yml" ]; then
    echo "✅ docker-compose.yml exists"
    echo ""
    echo "Ports configured:"
    grep -E '^\s+-\s+"[0-9]+:[0-9]+"' "$DIVE_ROOT/instances/$CODE_LOWER/docker-compose.yml" | sed 's/^/  /'
else
    echo "❌ docker-compose.yml missing"
    exit 1
fi
echo ""

# 3. Check .env file
echo "=== 3. ENVIRONMENT FILE ==="
if [ -f "$DIVE_ROOT/instances/$CODE_LOWER/.env" ]; then
    echo "✅ .env file exists"
    echo ""
    echo "Key variables:"
    grep -E "^(SPOKE_CODE|SPOKE_NAME|POSTGRES_PASSWORD|KEYCLOAK_ADMIN_PASSWORD|MONGO_PASSWORD)" "$DIVE_ROOT/instances/$CODE_LOWER/.env" | sed 's/=.*/=***/' | sed 's/^/  /'
else
    echo "❌ .env file missing"
fi
echo ""

# 4. Check running containers
echo "=== 4. RUNNING CONTAINERS ==="
CONTAINERS=$(docker ps --filter "name=dive-spoke-$CODE_LOWER" --format "{{.Names}}" | wc -l | tr -d ' ')
if [ "$CONTAINERS" -gt 0 ]; then
    echo "✅ Found $CONTAINERS running containers"
    echo ""
    docker ps --filter "name=dive-spoke-$CODE_LOWER" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo "⚠️  No containers running for $CODE_UPPER"
fi
echo ""

# 5. Check container health
echo "=== 5. CONTAINER HEALTH ==="
for service in postgres mongodb redis keycloak opa backend frontend; do
    container="dive-spoke-${CODE_LOWER}-$service"
    if docker ps --filter "name=$container" --format "{{.Names}}" | grep -q "$container"; then
        status=$(docker ps --filter "name=$container" --format "{{.Status}}" | head -1)
        echo "  $service: $status"
    else
        echo "  $service: ❌ NOT RUNNING"
    fi
done
echo ""

# 6. Check networks
echo "=== 6. DOCKER NETWORKS ==="
if docker network ls | grep -q "dive-spoke-${CODE_LOWER}"; then
    echo "✅ Spoke network exists"
else
    echo "⚠️  Spoke network missing"
fi

if docker network ls | grep -q "dive-shared"; then
    echo "✅ Shared network exists"
else
    echo "❌ Shared network missing"
fi
echo ""

# 7. Check recent container logs for errors
echo "=== 7. RECENT ERRORS IN LOGS ==="
for service in keycloak backend frontend; do
    container="dive-spoke-${CODE_LOWER}-$service"
    if docker ps -a --filter "name=$container" --format "{{.Names}}" | grep -q "$container"; then
        echo "  Checking $service..."
        errors=$(docker logs "$container" 2>&1 | tail -100 | grep -iE "(error|fail|exception)" | head -5 || true)
        if [ -n "$errors" ]; then
            echo "$errors" | sed 's/^/    /'
        else
            echo "    No recent errors"
        fi
    fi
done
echo ""

# 8. Check Keycloak admin access
echo "=== 8. KEYCLOAK CONNECTIVITY ==="
KC_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
if docker ps --filter "name=$KC_CONTAINER" --format "{{.Names}}" | grep -q "$KC_CONTAINER"; then
    if docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh help > /dev/null 2>&1; then
        echo "✅ Keycloak kcadm.sh accessible"
    else
        echo "❌ Keycloak kcadm.sh not accessible"
    fi
else
    echo "❌ Keycloak container not running"
fi
echo ""

# 9. Check IdP configuration in Hub
echo "=== 9. HUB IdP CONFIGURATION ==="
HUB_KC="dive-hub-keycloak"
if docker ps --filter "name=$HUB_KC" --format "{{.Names}}" | grep -q "$HUB_KC"; then
    source "$DIVE_ROOT/.env.hub" 2>/dev/null || true
    if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        docker exec "$HUB_KC" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || true

        if docker exec "$HUB_KC" /opt/keycloak/bin/kcadm.sh get identity-provider/instances/${CODE_LOWER}-idp -r dive-v3-broker-usa 2>/dev/null | grep -q "alias"; then
            echo "✅ ${CODE_LOWER}-idp exists in Hub"
            echo ""
            echo "Configuration:"
            docker exec "$HUB_KC" /opt/keycloak/bin/kcadm.sh get identity-provider/instances/${CODE_LOWER}-idp -r dive-v3-broker-usa 2>/dev/null | \
                jq -r '.config | "  authorizationUrl: \(.authorizationUrl)\n  tokenUrl: \(.tokenUrl)\n  issuer: \(.issuer)"'
        else
            echo "❌ ${CODE_LOWER}-idp NOT found in Hub"
        fi
    else
        echo "⚠️  Hub admin password not found"
    fi
else
    echo "❌ Hub Keycloak not running"
fi
echo ""

# 10. Check spoke IdP configuration for USA
echo "=== 10. SPOKE IdP CONFIGURATION (usa-idp) ==="
if docker ps --filter "name=$KC_CONTAINER" --format "{{.Names}}" | grep -q "$KC_CONTAINER"; then
    source "$DIVE_ROOT/instances/$CODE_LOWER/.env" 2>/dev/null || true
    if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || true

        if docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get identity-provider/instances/usa-idp -r "dive-v3-broker-$CODE_LOWER" 2>/dev/null | grep -q "alias"; then
            echo "✅ usa-idp exists in $CODE_UPPER spoke"
            echo ""
            echo "Configuration:"
            docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get identity-provider/instances/usa-idp -r "dive-v3-broker-$CODE_LOWER" 2>/dev/null | \
                jq -r '.config | "  authorizationUrl: \(.authorizationUrl)\n  tokenUrl: \(.tokenUrl)\n  issuer: \(.issuer)"'
        else
            echo "❌ usa-idp NOT found in $CODE_UPPER spoke"
        fi
    else
        echo "⚠️  Spoke admin password not found"
    fi
else
    echo "❌ Spoke Keycloak not running"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                        DEBUG REPORT COMPLETE                        ║"
echo "╚════════════════════════════════════════════════════════════════════╝"


