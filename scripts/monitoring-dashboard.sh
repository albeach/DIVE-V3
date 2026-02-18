#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Production Monitoring Dashboard
# =============================================================================
# Real-time monitoring dashboard for Docker Compose production deployment
# Provides health checks, metrics, and alerting capabilities
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-17
# =============================================================================

set -euo pipefail

# Configuration
MONITORING_INTERVAL=30  # seconds
ALERT_THRESHOLD=3       # consecutive failures before alert
LOG_FILE="${DIVE_ROOT}/logs/monitoring-$(date +%Y%m%d).log"
METRICS_FILE="${DIVE_ROOT}/logs/metrics-$(date +%Y%m%d).json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Alert tracking
declare -A ALERT_COUNTS
declare -A LAST_STATUS

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    echo "[$timestamp] [$level] $message"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }
log_success() { log "SUCCESS" "$1"; }

# =============================================================================
# HEALTH CHECK FUNCTIONS
# =============================================================================

check_service_health() {
    local service_name="$1"
    local health_url="$2"
    local expected_status="${3:-200}"

    if curl -sk --max-time 10 --connect-timeout 5 "$health_url" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_database_connectivity() {
    local db_type="$1"
    local container_name="$2"

    case "$db_type" in
        mongodb)
            if docker exec "$container_name" mongosh --eval "db.runCommand('ping')" --quiet >/dev/null 2>&1; then
                return 0
            fi
            ;;
        postgres)
            if docker exec "$container_name" psql -U postgres -d keycloak_db -c "SELECT 1;" >/dev/null 2>&1; then
                return 0
            fi
            ;;
    esac
    return 1
}

check_federation_health() {
    # Check if federation spokes are responding
    local hub_api="${HUB_API_URL:-http://localhost:4000}"

    # Get active spokes from MongoDB
    local active_spokes
    active_spokes=$(docker exec dive-hub-mongodb mongosh --quiet \
        -u admin -p "${MONGO_PASSWORD}" \
        --authenticationDatabase admin \
        --eval "db.federation_spokes.find({status: 'approved'}).count()" 2>/dev/null || echo "0")

    if [ "$active_spokes" -gt 0 ]; then
        return 0
    fi
    return 1
}

# =============================================================================
# METRICS COLLECTION
# =============================================================================

collect_system_metrics() {
    local metrics="{"
    metrics="$metrics\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","

    # Container count
    local container_count
    container_count=$(docker ps --filter "label=com.docker.compose.project=dive-hub" --format "{{.Names}}" | wc -l)
    metrics="$metrics\"containers_running\":$container_count,"

    # Memory usage
    local mem_usage
    mem_usage=$(docker stats --no-stream --format "{{.Container}} {{.CPUPerc}} {{.MemUsage}}" | \
        awk '{sum+=$3} END {print sum/NR}')
    metrics="$metrics\"avg_memory_percent\":${mem_usage:-0},"

    # Disk usage
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    metrics="$metrics\"disk_usage_percent\":$disk_usage,"

    # Network connections
    local network_connections
    network_connections=$(netstat -tun | grep ESTABLISHED | wc -l)
    metrics="$metrics\"network_connections\":$network_connections"

    metrics="$metrics}"

    echo "$metrics" >> "$METRICS_FILE"
}

collect_service_metrics() {
    local service_name="$1"
    local container_name="$2"

    # Get container stats
    local stats
    stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_name" 2>/dev/null | tail -1)

    if [ -n "$stats" ]; then
        echo "$stats" | awk -v service="$service_name" '{print "{\"service\":\""service"\",\"container\":\""$1"\",\"cpu\":\""$2"\",\"memory\":\""$3"\",\"network\":\""$4"\",\"disk\":\""$5"\"}"}'
    fi
}

# =============================================================================
# MONITORING DASHBOARD
# =============================================================================

show_header() {
    clear
    echo "=============================================================================="
    echo "                    DIVE V3 PRODUCTION MONITORING DASHBOARD"
    echo "=============================================================================="
    echo "Instance: $(upper "${INSTANCE:-usa}") | Environment: ${ENVIRONMENT:-local}"
    echo "Timestamp: $(date)"
    echo "=============================================================================="
}

show_service_status() {
    echo ""
    echo "🔍 SERVICE HEALTH STATUS"
    echo "-------------------------------------------------------------------------------"

    # Backend API
    if check_service_health "Backend API" "https://localhost:4000/health"; then
        echo -e "✅ Backend API       ${GREEN}HEALTHY${NC}   https://localhost:4000/health"
        ALERT_COUNTS["backend_api"]=0
    else
        echo -e "❌ Backend API       ${RED}UNHEALTHY${NC} https://localhost:4000/health"
        ((ALERT_COUNTS["backend_api"]++))
    fi

    # Frontend
    if check_service_health "Frontend" "http://localhost:3000/api/health"; then
        echo -e "✅ Frontend          ${GREEN}HEALTHY${NC}   http://localhost:3000/api/health"
        ALERT_COUNTS["frontend"]=0
    else
        echo -e "❌ Frontend          ${RED}UNHEALTHY${NC} http://localhost:3000/api/health"
        ((ALERT_COUNTS["frontend"]++))
    fi

    # Keycloak
    if check_service_health "Keycloak" "http://localhost:8080/realms/dive-v3-broker-usa/.well-known/openid-connect-configuration"; then
        echo -e "✅ Keycloak          ${GREEN}HEALTHY${NC}   http://localhost:8080"
        ALERT_COUNTS["keycloak"]=0
    else
        echo -e "❌ Keycloak          ${RED}UNHEALTHY${NC} http://localhost:8080"
        ((ALERT_COUNTS["keycloak"]++))
    fi

    # OPA
    if check_service_health "OPA" "http://localhost:8181/health"; then
        echo -e "✅ OPA               ${GREEN}HEALTHY${NC}   http://localhost:8181"
        ALERT_COUNTS["opa"]=0
    else
        echo -e "❌ OPA               ${RED}UNHEALTHY${NC} http://localhost:8181"
        ((ALERT_COUNTS["opa"]++))
    fi

    # MongoDB
    if check_database_connectivity "mongodb" "dive-hub-mongodb"; then
        echo -e "✅ MongoDB           ${GREEN}HEALTHY${NC}   mongodb://localhost:27017"
        ALERT_COUNTS["mongodb"]=0
    else
        echo -e "❌ MongoDB           ${RED}UNHEALTHY${NC} mongodb://localhost:27017"
        ((ALERT_COUNTS["mongodb"]++))
    fi

    # PostgreSQL
    if check_database_connectivity "postgres" "dive-hub-postgres"; then
        echo -e "✅ PostgreSQL        ${GREEN}HEALTHY${NC}   postgresql://localhost:5432"
        ALERT_COUNTS["postgres"]=0
    else
        echo -e "❌ PostgreSQL        ${RED}UNHEALTHY${NC} postgresql://localhost:5432"
        ((ALERT_COUNTS["postgres"]++))
    fi
}

show_federation_status() {
    echo ""
    echo "🌐 FEDERATION STATUS"
    echo "-------------------------------------------------------------------------------"

    # Get federation statistics
    local active_spokes pending_spokes suspended_spokes

    # Use the hub CLI to get status (it queries MongoDB SSOT)
    if command -v ./dive >/dev/null 2>&1; then
        local fed_status
        fed_status=$("${DIVE_ROOT}/dive" federation status 2>/dev/null | grep "Total:" | head -1)

        if [ -n "$fed_status" ]; then
            active_spokes=$(echo "$fed_status" | sed 's/.*Active: \([0-9]*\).*/\1/')
            pending_spokes=$(echo "$fed_status" | sed 's/.*Pending: \([0-9]*\).*/\1/')
            suspended_spokes=$(echo "$fed_status" | sed 's/.*Suspended: \([0-9]*\).*/\1/')

            echo "Active Spokes:     $active_spokes"
            echo "Pending Approval:  $pending_spokes"
            echo "Suspended:         $suspended_spokes"
        else
            echo "Unable to retrieve federation status"
        fi
    else
        echo "DIVE CLI not available"
    fi

    # Check federation health
    if check_federation_health; then
        echo -e "Federation Health:  ${GREEN}OPERATIONAL${NC}"
    else
        echo -e "Federation Health:  ${YELLOW}DEGRADED${NC}"
    fi
}

show_system_resources() {
    echo ""
    echo "💻 SYSTEM RESOURCES"
    echo "-------------------------------------------------------------------------------"

    # Container statistics
    local container_count
    container_count=$(docker ps --filter "label=com.docker.compose.project=dive-hub" --format "{{.Names}}" | wc -l)
    echo "Containers Running: $container_count"

    # Memory usage
    local total_mem mem_used mem_free
    if command -v free >/dev/null 2>&1; then
        total_mem=$(free -h | grep "^Mem:" | awk '{print $2}')
        mem_used=$(free -h | grep "^Mem:" | awk '{print $3}')
        mem_free=$(free -h | grep "^Mem:" | awk '{print $4}')
        echo "Memory: $mem_used used / $total_mem total ($mem_free free)"
    fi

    # Disk usage
    local disk_usage
    disk_usage=$(df -h / | tail -1 | awk '{print $3"/"$2" ("$5" used)"}')
    echo "Disk Usage: $disk_usage"

    # CPU load
    local load_avg
    load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
    echo "Load Average: $load_avg"
}

show_alerts() {
    echo ""
    echo "🚨 ACTIVE ALERTS"
    echo "-------------------------------------------------------------------------------"

    local has_alerts=false

    for service in "${!ALERT_COUNTS[@]}"; do
        if [ "${ALERT_COUNTS[$service]}" -ge "$ALERT_THRESHOLD" ]; then
            has_alerts=true
            echo -e "⚠️  ${service} has been unhealthy for ${ALERT_COUNTS[$service]} checks"
        fi
    done

    if [ "$has_alerts" = false ]; then
        echo -e "${GREEN}✅ No active alerts${NC}"
    fi
}

show_recent_logs() {
    echo ""
    echo "📋 RECENT LOG ACTIVITY (Last 5 minutes)"
    echo "-------------------------------------------------------------------------------"

    if [ -f "$LOG_FILE" ]; then
        # Portable date calculation (macOS + Linux)
        local time_filter
        if date -v-5M '+%Y-%m-%d %H:%M' >/dev/null 2>&1; then
            # macOS
            time_filter=$(date -v-5M '+%Y-%m-%d %H:%M')
        else
            # Linux
            time_filter=$(date -d '5 minutes ago' '+%Y-%m-%d %H:%M')
        fi
        local recent_logs
        recent_logs=$(tail -20 "$LOG_FILE" 2>/dev/null | grep "$time_filter" || true)

        if [ -n "$recent_logs" ]; then
            echo "$recent_logs" | tail -10
        else
            echo "No recent log activity"
        fi
    else
        echo "Log file not found: $LOG_FILE"
    fi
}

# =============================================================================
# MAIN MONITORING LOOP
# =============================================================================

main() {
    # Ensure log directory exists
    mkdir -p "${DIVE_ROOT}/logs"

    echo "Starting DIVE V3 Production Monitoring Dashboard..."
    echo "Press Ctrl+C to exit"
    echo ""

    # Initialize alert counts
    ALERT_COUNTS["backend_api"]=0
    ALERT_COUNTS["frontend"]=0
    ALERT_COUNTS["keycloak"]=0
    ALERT_COUNTS["opa"]=0
    ALERT_COUNTS["mongodb"]=0
    ALERT_COUNTS["postgres"]=0

    while true; do
        show_header
        show_service_status
        show_federation_status
        show_system_resources
        show_alerts
        show_recent_logs

        # Collect metrics
        collect_system_metrics

        echo ""
        echo "Next update in ${MONITORING_INTERVAL} seconds... (Ctrl+C to exit)"

        sleep "$MONITORING_INTERVAL"
    done
}

# =============================================================================
# COMMAND LINE INTERFACE
# =============================================================================

case "${1:-dashboard}" in
    dashboard|monitor)
        main
        ;;
    check)
        # Quick health check
        show_service_status
        ;;
    metrics)
        # Show current metrics
        collect_system_metrics
        echo "Metrics collected to: $METRICS_FILE"
        ;;
    alerts)
        # Show current alerts
        show_alerts
        ;;
    logs)
        # Show recent logs
        show_recent_logs
        ;;
    *)
        echo "Usage: $0 [dashboard|check|metrics|alerts|logs]"
        echo ""
        echo "Commands:"
        echo "  dashboard  - Start real-time monitoring dashboard"
        echo "  check      - Quick health check of all services"
        echo "  metrics    - Collect and display system metrics"
        echo "  alerts     - Show active alerts"
        echo "  logs       - Show recent log activity"
        exit 1
        ;;
esac