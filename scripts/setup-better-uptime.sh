#!/bin/bash
# =============================================================================
# DIVE V3 - Better Uptime Setup Script
# =============================================================================
# This script helps configure Better Uptime monitors using their API.
# 
# Prerequisites:
#   1. Sign up at https://betteruptime.com
#   2. Get your API token from Settings → API
#   3. Set BETTER_UPTIME_API_TOKEN environment variable
#
# Usage:
#   export BETTER_UPTIME_API_TOKEN="your-api-token"
#   ./scripts/setup-better-uptime.sh
#
# Alternatively, you can manually create monitors in the Better Uptime dashboard
# using the configuration in monitoring/better-uptime-config.json
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/monitoring/better-uptime-config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║          DIVE V3 - Better Uptime Setup                                ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Check for API token
if [ -z "$BETTER_UPTIME_API_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  BETTER_UPTIME_API_TOKEN not set${NC}"
    echo ""
    echo "To use the API for automated setup:"
    echo "  1. Sign up at https://betteruptime.com"
    echo "  2. Go to Settings → API"
    echo "  3. Create an API token"
    echo "  4. Run: export BETTER_UPTIME_API_TOKEN=\"your-token\""
    echo "  5. Re-run this script"
    echo ""
    echo -e "${BLUE}Alternatively, manually create monitors:${NC}"
    echo ""
    USE_MANUAL=true
else
    USE_MANUAL=false
fi

# Display monitors to create
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MONITORS TO CREATE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🇺🇸 USA Instance"
echo "   ├── Frontend:  https://usa-app.dive25.com"
echo "   ├── API:       https://usa-api.dive25.com/health"
echo "   └── Keycloak:  https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration"
echo ""
echo "🇫🇷 France Instance"
echo "   ├── Frontend:  https://fra-app.dive25.com"
echo "   ├── API:       https://fra-api.dive25.com/health"
echo "   └── Keycloak:  https://fra-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration"
echo ""
echo "🇬🇧 United Kingdom Instance"
echo "   ├── Frontend:  https://gbr-app.dive25.com"
echo "   ├── API:       https://gbr-api.dive25.com/health"
echo "   └── Keycloak:  https://gbr-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration"
echo ""
echo "🇩🇪 Germany Instance"
echo "   ├── Frontend:  https://deu-app.prosecurity.biz"
echo "   ├── API:       https://deu-api.prosecurity.biz/health"
echo "   └── Keycloak:  https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration"
echo ""
echo "🌐 Infrastructure"
echo "   └── Landing:   https://dive25.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$USE_MANUAL" = true ]; then
    echo ""
    echo -e "${BLUE}MANUAL SETUP STEPS:${NC}"
    echo ""
    echo "1. Go to https://betteruptime.com and sign up/login"
    echo ""
    echo "2. Create Monitor Groups:"
    echo "   • USA Instance"
    echo "   • France Instance"
    echo "   • United Kingdom Instance"
    echo "   • Germany Instance"
    echo "   • Infrastructure"
    echo ""
    echo "3. Create Monitors (for each URL above):"
    echo "   • Monitor Type: HTTP(s)"
    echo "   • Check Frequency: 3 minutes"
    echo "   • Expected Status: 200"
    echo "   • Regions: US, EU"
    echo ""
    echo "4. Create Status Page:"
    echo "   • Name: DIVE V3 Status"
    echo "   • Subdomain: dive25 (or custom domain: status.dive25.com)"
    echo "   • Add all monitor groups"
    echo ""
    echo "5. Add DNS record in Cloudflare:"
    echo "   • Type: CNAME"
    echo "   • Name: status"
    echo "   • Target: statuspage.betteruptime.com"
    echo ""
    exit 0
fi

# API-based setup
API_BASE="https://betteruptime.com/api/v2"
AUTH_HEADER="Authorization: Bearer $BETTER_UPTIME_API_TOKEN"

echo ""
echo -e "${BLUE}Creating monitors via API...${NC}"
echo ""

# Function to create a monitor
create_monitor() {
    local name="$1"
    local url="$2"
    local group="$3"
    
    echo -n "  Creating: $name... "
    
    response=$(curl -s -X POST "$API_BASE/monitors" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{
            \"monitor_type\": \"status\",
            \"url\": \"$url\",
            \"pronounceable_name\": \"$name\",
            \"check_frequency\": 180,
            \"expected_status_codes\": [200],
            \"regions\": [\"us\", \"eu\"]
        }")
    
    if echo "$response" | grep -q '"id"'; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo "    Error: $response"
    fi
}

# Create monitors
create_monitor "USA - Frontend" "https://usa-app.dive25.com" "USA Instance"
create_monitor "USA - Backend API" "https://usa-api.dive25.com/health" "USA Instance"
create_monitor "USA - Keycloak IdP" "https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration" "USA Instance"

create_monitor "FRA - Frontend" "https://fra-app.dive25.com" "France Instance"
create_monitor "FRA - Backend API" "https://fra-api.dive25.com/health" "France Instance"
create_monitor "FRA - Keycloak IdP" "https://fra-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration" "France Instance"

create_monitor "GBR - Frontend" "https://gbr-app.dive25.com" "United Kingdom Instance"
create_monitor "GBR - Backend API" "https://gbr-api.dive25.com/health" "United Kingdom Instance"
create_monitor "GBR - Keycloak IdP" "https://gbr-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration" "United Kingdom Instance"

create_monitor "DEU - Frontend" "https://deu-app.prosecurity.biz" "Germany Instance"
create_monitor "DEU - Backend API" "https://deu-api.prosecurity.biz/health" "Germany Instance"
create_monitor "DEU - Keycloak IdP" "https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration" "Germany Instance"

create_monitor "Landing Page" "https://dive25.com" "Infrastructure"

echo ""
echo -e "${GREEN}✓ Monitor setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Go to https://betteruptime.com/team/status-pages"
echo "  2. Create a new status page"
echo "  3. Add your monitors to the status page"
echo "  4. Configure custom domain: status.dive25.com"
echo ""


