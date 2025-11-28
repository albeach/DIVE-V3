#!/bin/bash
# DIVE V3 Theme Sync Script
# Syncs Keycloak themes from main repo to remote instances
# Usage: ./scripts/remote/sync-themes.sh [instance]
# Example: ./scripts/remote/sync-themes.sh deu
#
# LESSONS LEARNED (2024-11-26):
# - Must use -o PubkeyAuthentication=no for sshpass (local keys have passphrases)
# - DEU themes are at /opt/dive-v3/keycloak/themes/
# - Need sudo with password piped via: echo 'password' | sudo -S command
# - Use tar to avoid macOS extended attributes issues with rsync

set -e

# Configuration
INSTANCE="${1:-deu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Source the SSH helper
source "$SCRIPT_DIR/ssh-helper.sh"

# Check prerequisites
if ! check_ssh_prereqs; then
    exit 1
fi

# Get instance configuration
REMOTE_HOST=$(get_remote_config "$INSTANCE" "host")
REMOTE_DIR=$(get_remote_config "$INSTANCE" "dir")
DOMAIN=$(get_remote_config "$INSTANCE" "domain")

if [ -z "$REMOTE_HOST" ]; then
    echo "Unknown instance: $INSTANCE"
    echo "Available instances: deu"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              DIVE V3 Theme Sync                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:    $INSTANCE"
echo "  Host:        $REMOTE_HOST"
echo "  Remote Dir:  $REMOTE_DIR/keycloak/themes/"
echo "  Source:      $PROJECT_ROOT/keycloak/themes/dive-v3"
echo "  Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Use the sync_themes function from ssh-helper.sh
sync_themes "$INSTANCE"

# Verify
echo ""
echo ">>> Verifying Keycloak..."
sleep 15

IDP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${INSTANCE}-idp.$DOMAIN/realms/dive-v3-broker" 2>/dev/null || echo "000")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Sync Complete                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Keycloak: HTTP $IDP_STATUS"
echo ""

if [[ "$IDP_STATUS" == "200" ]]; then
    echo "✅ Theme sync successful!"
    echo ""
    echo "Test at: https://${INSTANCE}-app.$DOMAIN"
else
    echo "⚠️  Keycloak may still be starting"
    echo ""
    echo "Troubleshooting:"
    echo "  source scripts/remote/ssh-helper.sh"
    echo "  ssh_remote $INSTANCE 'docker logs dive-v3-keycloak-$INSTANCE --tail 50'"
fi

