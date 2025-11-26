#!/usr/bin/env bash
# ============================================
# DIVE V3 - Alerting Configuration Setup
# ============================================
# Configures webhooks for Slack, Discord, and Email alerts
#
# Usage:
#   ./scripts/monitoring/setup-alerting.sh
#
# This script:
# 1. Creates an .env.alerts file with webhook URLs
# 2. Tests the webhook connections
# 3. Configures the health check scripts to use them
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
ALERTS_ENV="$PROJECT_ROOT/.env.alerts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔔 DIVE V3 Alerting Configuration${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Function to test Slack webhook
test_slack() {
    local webhook_url="$1"
    echo -n "Testing Slack webhook... "
    
    response=$(curl -s -X POST -H 'Content-type: application/json' \
        --data '{"text":"🧪 DIVE V3 Test Alert - Configuration successful!"}' \
        "$webhook_url" 2>/dev/null)
    
    if [[ "$response" == "ok" ]]; then
        echo -e "${GREEN}SUCCESS${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC} ($response)"
        return 1
    fi
}

# Function to test Discord webhook
test_discord() {
    local webhook_url="$1"
    echo -n "Testing Discord webhook... "
    
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'Content-type: application/json' \
        --data '{"content":"🧪 DIVE V3 Test Alert - Configuration successful!"}' \
        "$webhook_url" 2>/dev/null)
    
    if [[ "$http_code" == "204" || "$http_code" == "200" ]]; then
        echo -e "${GREEN}SUCCESS${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC} (HTTP $http_code)"
        return 1
    fi
}

# Interactive setup
echo -e "${YELLOW}This wizard will configure alerting webhooks.${NC}"
echo -e "${YELLOW}Leave blank to skip a service.${NC}"
echo ""

# Slack
echo -e "${BLUE}📢 Slack Configuration${NC}"
echo "Create a webhook: https://api.slack.com/messaging/webhooks"
read -p "Slack Webhook URL (leave blank to skip): " SLACK_URL

# Discord  
echo ""
echo -e "${BLUE}🎮 Discord Configuration${NC}"
echo "Create a webhook: Server Settings → Integrations → Webhooks"
read -p "Discord Webhook URL (leave blank to skip): " DISCORD_URL

# Email (using mailgun or sendgrid if available)
echo ""
echo -e "${BLUE}📧 Email Configuration${NC}"
read -p "Alert Email Address (leave blank to skip): " ALERT_EMAIL

# Summary
echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}Configuration Summary${NC}"
echo -e "${CYAN}============================================${NC}"

# Write config
cat > "$ALERTS_ENV" << EOF
# DIVE V3 Alerting Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Slack Webhook
# Create at: https://api.slack.com/messaging/webhooks
SLACK_WEBHOOK_URL="${SLACK_URL:-}"

# Discord Webhook
# Create at: Server Settings → Integrations → Webhooks
DISCORD_WEBHOOK_URL="${DISCORD_URL:-}"

# Email Alert Recipient
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Alert Thresholds
LATENCY_THRESHOLD_MS=1000
CONSECUTIVE_FAILURES_ALERT=2
EOF

echo "Saved configuration to: $ALERTS_ENV"
echo ""

# Test webhooks
if [[ -n "${SLACK_URL:-}" ]]; then
    test_slack "$SLACK_URL"
fi

if [[ -n "${DISCORD_URL:-}" ]]; then
    test_discord "$DISCORD_URL"
fi

# Update LaunchAgent if running
PLIST_PATH="$HOME/Library/LaunchAgents/com.dive-v3.health-monitor.plist"
if [[ -f "$PLIST_PATH" ]]; then
    echo ""
    echo -e "${YELLOW}Updating LaunchAgent with new alert configuration...${NC}"
    
    # Reload to pick up environment
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    
    # Update plist with new environment variables
    /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:SLACK_WEBHOOK_URL" "$PLIST_PATH" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:SLACK_WEBHOOK_URL string '${SLACK_URL:-}'" "$PLIST_PATH" 2>/dev/null || true
    
    /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:DISCORD_WEBHOOK_URL" "$PLIST_PATH" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:DISCORD_WEBHOOK_URL string '${DISCORD_URL:-}'" "$PLIST_PATH" 2>/dev/null || true
    
    /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:ALERT_EMAIL" "$PLIST_PATH" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:ALERT_EMAIL string '${ALERT_EMAIL:-}'" "$PLIST_PATH" 2>/dev/null || true
    
    launchctl load "$PLIST_PATH"
    echo -e "${GREEN}LaunchAgent updated and reloaded${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Alerting configuration complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "To test alerts manually, run:"
echo "  source $ALERTS_ENV && ./scripts/monitoring/health-check.sh --alert"
echo ""
echo "To trigger a test alert:"
echo "  source $ALERTS_ENV"
echo "  curl -X POST -H 'Content-type: application/json' \\"
echo "    --data '{\"text\":\"🧪 Manual test alert\"}' \"\$SLACK_WEBHOOK_URL\""


