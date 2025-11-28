#!/bin/bash
# DIVE V3 Configuration Drift Check
# Compares local and remote instance configurations
# Usage: ./scripts/remote/check-drift.sh [instance]
# Example: ./scripts/remote/check-drift.sh deu

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Source SSH helper
source "$SCRIPT_DIR/ssh-helper.sh"

INSTANCE="${1:-deu}"

if ! check_ssh_prereqs; then
    exit 1
fi

INSTANCE_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')
echo "╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗"
echo "║                         CONFIGURATION DRIFT CHECK: $INSTANCE_UPPER                                                      ║"
echo "╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
echo ""

REMOTE_DIR=$(get_remote_dir "$INSTANCE")
DOMAIN=$(get_remote_domain "$INSTANCE")
DRIFT_FOUND=0

# 1. Check Policy Files
echo "=== 1. Policy File Comparison ==="
echo ""
echo "┌─────────────────────────────────────────────────────────────────────────────────────────┐"
echo "│ Policy File                         │ Local Size │ Remote Size │ Status              │"
echo "├─────────────────────────────────────────────────────────────────────────────────────────┤"

for policy in "$PROJECT_ROOT"/policies/*.rego; do
    if [ -f "$policy" ]; then
        filename=$(basename "$policy")
        local_size=$(wc -c < "$policy" | tr -d ' ')
        remote_size=$(ssh_remote "$INSTANCE" "wc -c < '$REMOTE_DIR/policies/$filename' 2>/dev/null" | tr -d ' ' || echo "0")
        
        if [ "$local_size" == "$remote_size" ]; then
            status="✅ Same"
        elif [ "$remote_size" == "0" ]; then
            status="❌ Missing"
            DRIFT_FOUND=1
        else
            diff=$((local_size - remote_size))
            status="⚠️  Drift ($diff bytes)"
            DRIFT_FOUND=1
        fi
        
        printf "│ %-37s │ %-10s │ %-11s │ %-19s │\n" "$filename" "$local_size" "$remote_size" "$status"
    fi
done
echo "└─────────────────────────────────────────────────────────────────────────────────────────┘"
echo ""

# 2. Check Federation Partners
echo "=== 2. Federation Partners ==="
echo ""
LOCAL_IDPS=$(curl -sk "https://usa-api.dive25.com/api/idps/public" 2>/dev/null | jq -r '.idps[].alias' | sort)
REMOTE_IDPS=$(curl -sk "https://${INSTANCE}-api.${DOMAIN}/api/idps/public" 2>/dev/null | jq -r '.idps[].alias' | sort)

echo "Local (USA): $LOCAL_IDPS"
echo "Remote ($INSTANCE): $REMOTE_IDPS"
echo ""

LOCAL_COUNT=$(echo "$LOCAL_IDPS" | wc -l | tr -d ' ')
REMOTE_COUNT=$(echo "$REMOTE_IDPS" | wc -l | tr -d ' ')

if [ "$LOCAL_COUNT" != "$REMOTE_COUNT" ]; then
    echo "⚠️  Federation partner count mismatch: Local=$LOCAL_COUNT, Remote=$REMOTE_COUNT"
    DRIFT_FOUND=1
else
    echo "✅ Federation partners aligned"
fi
echo ""

# 3. Check Service Health
echo "=== 3. Service Health ==="
echo ""
echo "┌─────────────────────────────────────────────────────────────────────────────────────────┐"
echo "│ Service         │ Status                                                               │"
echo "├─────────────────────────────────────────────────────────────────────────────────────────┤"

# Backend
BACKEND_STATUS=$(curl -sk "https://${INSTANCE}-api.${DOMAIN}/health" --max-time 10 | jq -r '.status' 2>/dev/null || echo "unreachable")
printf "│ %-15s │ %-69s │\n" "Backend" "$BACKEND_STATUS"

# Frontend
FRONTEND_CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://${INSTANCE}-app.${DOMAIN}" --max-time 10 2>/dev/null || echo "000")
printf "│ %-15s │ %-69s │\n" "Frontend" "HTTP $FRONTEND_CODE"

# Keycloak
KC_CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://${INSTANCE}-idp.${DOMAIN}/realms/dive-v3-broker" --max-time 10 2>/dev/null || echo "000")
printf "│ %-15s │ %-69s │\n" "Keycloak" "HTTP $KC_CODE"

echo "└─────────────────────────────────────────────────────────────────────────────────────────┘"
echo ""

# 4. Summary
echo "╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗"
if [ "$DRIFT_FOUND" == "1" ]; then
    echo "║  ⚠️   DRIFT DETECTED - Run ./scripts/remote/sync-policies.sh $INSTANCE to resolve                               ║"
else
    echo "║  ✅  NO DRIFT DETECTED - Remote instance is in sync                                                            ║"
fi
echo "╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"

