#!/bin/bash
# DIVE V3 Remote Health Check Script
# Usage: ./scripts/remote/health-check-remote.sh [instance]
# Example: ./scripts/remote/health-check-remote.sh deu

# Configuration
INSTANCE="${1:-deu}"

# Load remote instance configuration
case "$INSTANCE" in
    deu)
        REMOTE_HOST="mike@192.168.42.120"
        REMOTE_PASSWORD="mike2222"
        REMOTE_PROJECT_DIR="/home/mike/dive-v3"
        DOMAIN="prosecurity.biz"
        ;;
    *)
        echo "Unknown instance: $INSTANCE"
        echo "Available: deu"
        exit 1
        ;;
esac

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              DIVE V3 Remote Health Check                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:    $INSTANCE"
echo "  Domain:      $DOMAIN"
echo "  Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Check endpoints
check_endpoint() {
    local name="$1"
    local url="$2"
    local start=$(date +%s%N)
    local code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 15 2>/dev/null) || code="000"
    local end=$(date +%s%N)
    local ms=$(( (end - start) / 1000000 ))
    
    if [[ "$code" =~ ^(200|301|302|303|307|308)$ ]]; then
        echo "  ✅ $name: HTTP $code (${ms}ms)"
    else
        echo "  ❌ $name: HTTP $code (${ms}ms)"
    fi
}

echo ">>> External Endpoints"
check_endpoint "Frontend" "https://deu-app.$DOMAIN"
check_endpoint "Backend API" "https://deu-api.$DOMAIN/health"
check_endpoint "Keycloak" "https://deu-idp.$DOMAIN/realms/dive-v3-broker"
check_endpoint "IdP API" "https://deu-api.$DOMAIN/api/idps/public"

echo ""
echo ">>> Container Status (via SSH)"
if command -v sshpass &> /dev/null; then
    sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
        "cd $REMOTE_PROJECT_DIR && docker-compose ps --format 'table {{.Name}}\t{{.Status}}'" 2>/dev/null || \
        echo "  ⚠️  SSH connection failed"
else
    echo "  ⚠️  sshpass not installed, skipping SSH checks"
fi

echo ""
echo ">>> Federation Connectivity"
check_endpoint "→ USA" "https://usa-api.dive25.com/health"
check_endpoint "→ FRA" "https://fra-api.dive25.com/health"
check_endpoint "→ GBR" "https://gbr-api.dive25.com/health"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Check Complete                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"

