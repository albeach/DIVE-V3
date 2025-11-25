#!/usr/bin/env bash
# ============================================
# DIVE V3 - Multi-Instance Health Check
# ============================================
# Monitors all federated DIVE V3 instances
# Can be run via cron, systemd timer, or manually
#
# Usage:
#   ./scripts/monitoring/health-check.sh           # Check all instances
#   ./scripts/monitoring/health-check.sh --json    # Output JSON for APIs
#   ./scripts/monitoring/health-check.sh --alert   # Check + send alerts
#
# Environment variables for alerting:
#   SLACK_WEBHOOK_URL  - Slack webhook for alerts
#   DISCORD_WEBHOOK_URL - Discord webhook for alerts
#   ALERT_EMAIL        - Email for alerts (requires mailx)
#
# ============================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOG_DIR="${PROJECT_ROOT}/logs/monitoring"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TIMEOUT=15

# Create log directory
mkdir -p "$LOG_DIR"

# Colors (disabled in JSON mode)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Instance definitions
# Format: "code|name|app_url|idp_url|api_url"
INSTANCES=(
    "usa|United States|https://usa-app.dive25.com|https://usa-idp.dive25.com|https://usa-api.dive25.com"
    "fra|France|https://fra-app.dive25.com|https://fra-idp.dive25.com|https://fra-api.dive25.com"
    "deu|Germany|https://deu-app.prosecurity.biz|https://deu-idp.prosecurity.biz|https://deu-api.prosecurity.biz"
)

# Parse arguments
JSON_MODE=false
ALERT_MODE=false
VERBOSE=false

for arg in "$@"; do
    case $arg in
        --json) JSON_MODE=true ;;
        --alert) ALERT_MODE=true ;;
        --verbose|-v) VERBOSE=true ;;
    esac
done

# Disable colors in JSON mode
if $JSON_MODE; then
    RED="" GREEN="" YELLOW="" CYAN="" NC=""
fi

# Function to check URL health
check_url() {
    local url="$1"
    local name="$2"
    local start_time=$(date +%s%N)
    
    local http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time "$TIMEOUT" 2>/dev/null) || http_code="000"
    
    local end_time=$(date +%s%N)
    local latency_ms=$(( (end_time - start_time) / 1000000 ))
    
    local status="DOWN"
    if [[ "$http_code" =~ ^(200|301|302|303|307|308)$ ]]; then
        status="UP"
    fi
    
    echo "$http_code|$latency_ms|$status"
}

# Function to check instance
check_instance() {
    local instance_data="$1"
    local OLDIFS="$IFS"
    
    # Parse instance data (delimiter: |)
    IFS='|' read -r code name app_url idp_url api_url <<< "$instance_data"
    IFS="$OLDIFS"
    
    local app_result=$(check_url "$app_url" "Frontend")
    local idp_result=$(check_url "${idp_url}/realms/dive-v3-broker" "Keycloak")
    local api_result=$(check_url "${api_url}/health" "Backend API")
    
    # Parse results (delimiter: |)
    IFS='|' read -r app_code app_latency app_status <<< "$app_result"
    IFS='|' read -r idp_code idp_latency idp_status <<< "$idp_result"
    IFS='|' read -r api_code api_latency api_status <<< "$api_result"
    IFS="$OLDIFS"
    
    # Determine overall status
    local overall_status="HEALTHY"
    if [[ "$app_status" == "DOWN" || "$idp_status" == "DOWN" || "$api_status" == "DOWN" ]]; then
        overall_status="DEGRADED"
    fi
    if [[ "$app_status" == "DOWN" && "$idp_status" == "DOWN" && "$api_status" == "DOWN" ]]; then
        overall_status="DOWN"
    fi
    
    # Output
    if $JSON_MODE; then
        echo "{\"instance\":\"$code\",\"name\":\"$name\",\"status\":\"$overall_status\",\"services\":{\"frontend\":{\"url\":\"$app_url\",\"status\":\"$app_status\",\"http_code\":$app_code,\"latency_ms\":$app_latency},\"keycloak\":{\"url\":\"$idp_url\",\"status\":\"$idp_status\",\"http_code\":$idp_code,\"latency_ms\":$idp_latency},\"backend\":{\"url\":\"$api_url\",\"status\":\"$api_status\",\"http_code\":$api_code,\"latency_ms\":$api_latency}}}"
    else
        local status_color="$GREEN"
        [[ "$overall_status" == "DEGRADED" ]] && status_color="$YELLOW"
        [[ "$overall_status" == "DOWN" ]] && status_color="$RED"
        
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}Instance: ${code^^} - $name${NC}"
        echo -e "${CYAN}Status: ${status_color}${overall_status}${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
        local app_icon="✅" idp_icon="✅" api_icon="✅"
        [[ "$app_status" == "DOWN" ]] && app_icon="❌"
        [[ "$idp_status" == "DOWN" ]] && idp_icon="❌"
        [[ "$api_status" == "DOWN" ]] && api_icon="❌"
        
        echo -e "  $app_icon Frontend    HTTP $app_code  ${app_latency}ms"
        echo -e "  $idp_icon Keycloak    HTTP $idp_code  ${idp_latency}ms"
        echo -e "  $api_icon Backend API HTTP $api_code  ${api_latency}ms"
        echo ""
    fi
    
    # Return status for alerting
    echo "$code:$overall_status:$app_status:$idp_status:$api_status" >> /tmp/dive_health_results.txt
}

# Function to send Slack alert
send_slack_alert() {
    local message="$1"
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -sk -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1
    fi
}

# Function to send Discord alert
send_discord_alert() {
    local message="$1"
    if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
        curl -sk -X POST -H 'Content-type: application/json' \
            --data "{\"content\":\"$message\"}" \
            "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1
    fi
}

# Function to send email alert
send_email_alert() {
    local subject="$1"
    local body="$2"
    if [[ -n "${ALERT_EMAIL:-}" ]] && command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL"
    fi
}

# Main execution
main() {
    rm -f /tmp/dive_health_results.txt
    touch /tmp/dive_health_results.txt
    
    if ! $JSON_MODE; then
        echo -e "${CYAN}============================================${NC}"
        echo -e "${CYAN}🏥 DIVE V3 Health Check${NC}"
        echo -e "${CYAN}Time: $(date)${NC}"
        echo -e "${CYAN}============================================${NC}"
        echo ""
    fi
    
    local json_results=()
    
    for instance in "${INSTANCES[@]}"; do
        if $JSON_MODE; then
            json_results+=("$(check_instance "$instance")")
        else
            check_instance "$instance"
        fi
    done
    
    # Output JSON array
    if $JSON_MODE; then
        echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"instances\":[$(IFS=','; echo "${json_results[*]}")]}"
    fi
    
    # Process results for alerting
    if $ALERT_MODE; then
        local has_issues=false
        local alert_message="🚨 DIVE V3 Health Alert\n\n"
        
        while IFS=':' read -r code overall app idp api; do
            if [[ "$overall" != "HEALTHY" ]]; then
                has_issues=true
                alert_message+="Instance: ${code^^}\n"
                alert_message+="Status: $overall\n"
                [[ "$app" == "DOWN" ]] && alert_message+="  ❌ Frontend DOWN\n"
                [[ "$idp" == "DOWN" ]] && alert_message+="  ❌ Keycloak DOWN\n"
                [[ "$api" == "DOWN" ]] && alert_message+="  ❌ Backend API DOWN\n"
                alert_message+="\n"
            fi
        done < /tmp/dive_health_results.txt
        
        if $has_issues; then
            alert_message+="Time: $(date)\n"
            
            send_slack_alert "$alert_message"
            send_discord_alert "$alert_message"
            send_email_alert "🚨 DIVE V3 Health Alert" "$alert_message"
            
            if ! $JSON_MODE; then
                echo -e "${RED}⚠️  ALERTS SENT - Issues detected!${NC}"
            fi
        fi
    fi
    
    # Summary
    if ! $JSON_MODE; then
        echo -e "${CYAN}============================================${NC}"
        echo -e "${CYAN}Summary${NC}"
        echo -e "${CYAN}============================================${NC}"
        
        local healthy=0 degraded=0 down=0
        while IFS=':' read -r code overall app idp api; do
            case "$overall" in
                HEALTHY) healthy=$((healthy + 1)) ;;
                DEGRADED) degraded=$((degraded + 1)) ;;
                DOWN) down=$((down + 1)) ;;
            esac
        done < /tmp/dive_health_results.txt
        
        echo -e "  ${GREEN}Healthy:  $healthy${NC}"
        echo -e "  ${YELLOW}Degraded: $degraded${NC}"
        echo -e "  ${RED}Down:     $down${NC}"
        echo ""
        
        # Exit with appropriate code
        [[ $down -gt 0 ]] && exit 2
        [[ $degraded -gt 0 ]] && exit 1
    fi
    
    # Log results
    cat /tmp/dive_health_results.txt >> "$LOG_DIR/health-check-$TIMESTAMP.log"
    
    exit 0
}

main "$@"

