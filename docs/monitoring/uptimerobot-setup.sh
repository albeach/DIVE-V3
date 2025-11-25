#!/bin/bash
# UptimeRobot API Setup Script
# Set your API key: export UPTIMEROBOT_API_KEY="your-api-key"

API_KEY="${UPTIMEROBOT_API_KEY:-}"
if [[ -z "$API_KEY" ]]; then
    echo "Error: Set UPTIMEROBOT_API_KEY environment variable"
    exit 1
fi

# Monitors to create
declare -A MONITORS=(
    ["DIVE V3 - USA Frontend"]="https://usa-app.dive25.com"
    ["DIVE V3 - USA Keycloak"]="https://usa-idp.dive25.com/realms/dive-v3-broker"
    ["DIVE V3 - USA API"]="https://usa-api.dive25.com/health"
    ["DIVE V3 - FRA Frontend"]="https://fra-app.dive25.com"
    ["DIVE V3 - FRA Keycloak"]="https://fra-idp.dive25.com/realms/dive-v3-broker"
    ["DIVE V3 - FRA API"]="https://fra-api.dive25.com/health"
    ["DIVE V3 - DEU Frontend"]="https://deu-app.prosecurity.biz"
    ["DIVE V3 - DEU Keycloak"]="https://deu-idp.prosecurity.biz/realms/dive-v3-broker"
    ["DIVE V3 - DEU API"]="https://deu-api.prosecurity.biz/health"
)

for name in "${!MONITORS[@]}"; do
    url="${MONITORS[$name]}"
    echo "Creating monitor: $name"
    
    curl -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
        -d "api_key=$API_KEY" \
        -d "friendly_name=$name" \
        -d "url=$url" \
        -d "type=1" \
        -d "interval=300"
    
    echo ""
done
