#!/usr/bin/env bash
# ============================================
# DIVE V3 - External Monitoring Setup
# ============================================
# Generates configuration for external monitoring services
# Supports: UptimeRobot, Pingdom, Better Uptime, Datadog
#
# Usage:
#   ./scripts/monitoring/external-monitoring-setup.sh [service]
#
# Services:
#   uptimerobot  - Generate UptimeRobot API calls
#   pingdom      - Generate Pingdom configuration
#   betteruptime - Generate Better Uptime configuration
#   datadog      - Generate Datadog synthetic tests
#   all          - Generate all configurations
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
OUTPUT_DIR="$PROJECT_ROOT/docs/monitoring"

mkdir -p "$OUTPUT_DIR"

# Instance definitions
declare -A INSTANCES
INSTANCES=(
    ["usa-app"]="https://usa-app.dive25.com"
    ["usa-idp"]="https://usa-idp.dive25.com/realms/dive-v3-broker"
    ["usa-api"]="https://usa-api.dive25.com/health"
    ["fra-app"]="https://fra-app.dive25.com"
    ["fra-idp"]="https://fra-idp.dive25.com/realms/dive-v3-broker"
    ["fra-api"]="https://fra-api.dive25.com/health"
    ["deu-app"]="https://deu-app.prosecurity.biz"
    ["deu-idp"]="https://deu-idp.prosecurity.biz/realms/dive-v3-broker"
    ["deu-api"]="https://deu-api.prosecurity.biz/health"
)

# ============================================
# UptimeRobot Configuration
# ============================================
generate_uptimerobot() {
    echo "Generating UptimeRobot configuration..."
    
    cat > "$OUTPUT_DIR/uptimerobot-monitors.json" << 'EOF'
{
  "monitors": [
EOF

    local first=true
    for name in "${!INSTANCES[@]}"; do
        local url="${INSTANCES[$name]}"
        local friendly_name="DIVE V3 - ${name^^}"
        
        if ! $first; then
            echo "," >> "$OUTPUT_DIR/uptimerobot-monitors.json"
        fi
        first=false
        
        cat >> "$OUTPUT_DIR/uptimerobot-monitors.json" << EOF
    {
      "friendly_name": "$friendly_name",
      "url": "$url",
      "type": 1,
      "interval": 300,
      "timeout": 30,
      "http_method": 1,
      "alert_contacts": "YOUR_ALERT_CONTACT_ID"
    }
EOF
    done

    cat >> "$OUTPUT_DIR/uptimerobot-monitors.json" << 'EOF'
  ]
}
EOF

    # Generate API script
    cat > "$OUTPUT_DIR/uptimerobot-setup.sh" << 'SCRIPT'
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
SCRIPT

    chmod +x "$OUTPUT_DIR/uptimerobot-setup.sh"
    echo "Created: $OUTPUT_DIR/uptimerobot-monitors.json"
    echo "Created: $OUTPUT_DIR/uptimerobot-setup.sh"
}

# ============================================
# Better Uptime Configuration
# ============================================
generate_betteruptime() {
    echo "Generating Better Uptime configuration..."
    
    cat > "$OUTPUT_DIR/betteruptime-monitors.yaml" << 'EOF'
# Better Uptime Monitor Configuration
# Import via API or UI

monitors:
EOF

    for name in "${!INSTANCES[@]}"; do
        local url="${INSTANCES[$name]}"
        local instance=$(echo "$name" | cut -d'-' -f1)
        local service=$(echo "$name" | cut -d'-' -f2)
        
        cat >> "$OUTPUT_DIR/betteruptime-monitors.yaml" << EOF
  - name: "DIVE V3 - ${instance^^} ${service^}"
    url: "$url"
    monitor_type: "status"
    check_frequency: 180
    http_method: "GET"
    request_timeout: 30
    confirmation_period: 3
    regions:
      - "us"
      - "eu"
    tags:
      - "dive-v3"
      - "$instance"
      - "$service"
EOF
    done

    echo "Created: $OUTPUT_DIR/betteruptime-monitors.yaml"
}

# ============================================
# Datadog Synthetic Tests
# ============================================
generate_datadog() {
    echo "Generating Datadog Synthetic Tests configuration..."
    
    cat > "$OUTPUT_DIR/datadog-synthetics.json" << 'EOF'
{
  "tests": [
EOF

    local first=true
    for name in "${!INSTANCES[@]}"; do
        local url="${INSTANCES[$name]}"
        local instance=$(echo "$name" | cut -d'-' -f1)
        local service=$(echo "$name" | cut -d'-' -f2)
        
        if ! $first; then
            echo "," >> "$OUTPUT_DIR/datadog-synthetics.json"
        fi
        first=false
        
        cat >> "$OUTPUT_DIR/datadog-synthetics.json" << EOF
    {
      "name": "DIVE V3 - ${instance^^} ${service^}",
      "type": "api",
      "subtype": "http",
      "config": {
        "request": {
          "method": "GET",
          "url": "$url",
          "timeout": 30
        },
        "assertions": [
          {"type": "statusCode", "operator": "is", "target": 200}
        ]
      },
      "options": {
        "tick_every": 300,
        "min_failure_duration": 180,
        "min_location_failed": 1
      },
      "locations": ["aws:us-east-1", "aws:eu-west-1"],
      "tags": ["dive-v3", "$instance", "$service"]
    }
EOF
    done

    cat >> "$OUTPUT_DIR/datadog-synthetics.json" << 'EOF'
  ]
}
EOF

    echo "Created: $OUTPUT_DIR/datadog-synthetics.json"
}

# ============================================
# Pingdom Configuration
# ============================================
generate_pingdom() {
    echo "Generating Pingdom configuration..."
    
    cat > "$OUTPUT_DIR/pingdom-checks.json" << 'EOF'
{
  "checks": [
EOF

    local first=true
    for name in "${!INSTANCES[@]}"; do
        local url="${INSTANCES[$name]}"
        local host=$(echo "$url" | sed 's|https://||' | cut -d'/' -f1)
        local path=$(echo "$url" | sed "s|https://$host||")
        [[ -z "$path" ]] && path="/"
        
        if ! $first; then
            echo "," >> "$OUTPUT_DIR/pingdom-checks.json"
        fi
        first=false
        
        cat >> "$OUTPUT_DIR/pingdom-checks.json" << EOF
    {
      "name": "DIVE V3 - ${name^^}",
      "host": "$host",
      "type": "http",
      "url": "$path",
      "encryption": true,
      "resolution": 5,
      "probe_filters": ["region:NA", "region:EU"]
    }
EOF
    done

    cat >> "$OUTPUT_DIR/pingdom-checks.json" << 'EOF'
  ]
}
EOF

    echo "Created: $OUTPUT_DIR/pingdom-checks.json"
}

# ============================================
# Status Page Configuration
# ============================================
generate_statuspage() {
    echo "Generating status page configuration..."
    
    cat > "$OUTPUT_DIR/statuspage-components.json" << 'EOF'
{
  "page": {
    "name": "DIVE V3 Coalition ICAM",
    "domain": "status.dive25.com",
    "allow_page_subscribers": true,
    "allow_incident_subscribers": true
  },
  "component_groups": [
    {
      "name": "United States (USA)",
      "components": ["usa-app", "usa-idp", "usa-api"]
    },
    {
      "name": "France (FRA)",
      "components": ["fra-app", "fra-idp", "fra-api"]
    },
    {
      "name": "Germany (DEU)",
      "components": ["deu-app", "deu-idp", "deu-api"]
    }
  ],
  "components": [
EOF

    local first=true
    for name in "${!INSTANCES[@]}"; do
        local url="${INSTANCES[$name]}"
        local instance=$(echo "$name" | cut -d'-' -f1)
        local service=$(echo "$name" | cut -d'-' -f2)
        
        local display_name=""
        case "$service" in
            app) display_name="Frontend Application" ;;
            idp) display_name="Identity Provider (Keycloak)" ;;
            api) display_name="Backend API" ;;
        esac
        
        if ! $first; then
            echo "," >> "$OUTPUT_DIR/statuspage-components.json"
        fi
        first=false
        
        cat >> "$OUTPUT_DIR/statuspage-components.json" << EOF
    {
      "id": "$name",
      "name": "$display_name",
      "description": "${instance^^} $display_name",
      "group": "${instance^^}",
      "showcase": true
    }
EOF
    done

    cat >> "$OUTPUT_DIR/statuspage-components.json" << 'EOF'
  ]
}
EOF

    echo "Created: $OUTPUT_DIR/statuspage-components.json"
}

# ============================================
# Main
# ============================================
SERVICE="${1:-all}"

case "$SERVICE" in
    uptimerobot) generate_uptimerobot ;;
    betteruptime) generate_betteruptime ;;
    datadog) generate_datadog ;;
    pingdom) generate_pingdom ;;
    statuspage) generate_statuspage ;;
    all)
        generate_uptimerobot
        generate_betteruptime
        generate_datadog
        generate_pingdom
        generate_statuspage
        ;;
    *)
        echo "Usage: $0 {uptimerobot|betteruptime|datadog|pingdom|statuspage|all}"
        exit 1
        ;;
esac

echo ""
echo "============================================"
echo "External monitoring configurations generated!"
echo "Location: $OUTPUT_DIR/"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Choose a monitoring service (UptimeRobot is free)"
echo "2. Create an account and get API key"
echo "3. Run the setup script or import the configuration"
echo ""
echo "Recommended free options:"
echo "  - UptimeRobot: 50 free monitors, 5-min intervals"
echo "  - Better Uptime: 10 free monitors, 3-min intervals"
echo ""

