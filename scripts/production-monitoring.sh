#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Production Monitoring & Health Dashboard
# =============================================================================
# Comprehensive monitoring system for Docker Compose production deployments
# Integrates with existing health check scripts and provides real-time monitoring
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-17
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITORING_INTERVAL="${MONITORING_INTERVAL:-30}"
ALERT_THRESHOLD="${ALERT_THRESHOLD:-3}"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
METRICS_DIR="${METRICS_DIR:-$PROJECT_ROOT/metrics}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# Create required directories
mkdir -p "$LOG_DIR" "$METRICS_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Alert tracking
declare -A ALERT_COUNTS
declare -A LAST_STATUS
declare -A SERVICE_PORTS

# Initialize service ports
SERVICE_PORTS["backend"]="4000"
SERVICE_PORTS["frontend"]="3000"
SERVICE_PORTS["keycloak"]="8080"
SERVICE_PORTS["opa"]="8181"

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_file
    log_file="$LOG_DIR/monitoring-$(date +%Y%m%d).log"
    echo "[$timestamp] [$level] $message" >> "$log_file"
}

log_info() { log "INFO" "$1"; echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { log "SUCCESS" "$1"; echo -e "${GREEN}✓${NC} $1"; }
log_warn() { log "WARN" "$1"; echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { log "ERROR" "$1"; echo -e "${RED}✗${NC} $1"; }

# =============================================================================
# HEALTH CHECK FUNCTIONS
# =============================================================================

check_service_health() {
    local service_name="$1"
    local container_pattern="$2"
    local _port="${3:-}"

    # Check if container is running
    if ! docker ps --filter "name=$container_pattern" --format "{{.Names}}" | grep -q "$container_pattern"; then
        echo "DOWN"
        return 1
    fi

    # Check container health status
    local health_status
    health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_pattern" 2>/dev/null || echo "no-health-check")

    if [ "$health_status" = "healthy" ]; then
        echo "HEALTHY"
        return 0
    elif [ "$health_status" = "starting" ]; then
        echo "STARTING"
        return 0
    else
        echo "UNHEALTHY"
        return 1
    fi
}

check_http_endpoint() {
    local url="$1"
    local timeout="${2:-5}"

    if curl -k --max-time "$timeout" --connect-timeout "$timeout" "$url" &>/dev/null; then
        echo "UP"
        return 0
    else
        echo "DOWN"
        return 1
    fi
}

check_database_connectivity() {
    local db_type="$1"
    local container_name="$2"

    case "$db_type" in
        mongodb)
            if docker exec "$container_name" mongosh --eval "db.runCommand('ping')" --quiet >/dev/null 2>&1; then
                echo "CONNECTED"
                return 0
            fi
            ;;
        postgres)
            if docker exec "$container_name" psql -U postgres -d keycloak_db -c "SELECT 1;" >/dev/null 2>&1; then
                echo "CONNECTED"
                return 0
            fi
            ;;
    esac
    echo "DISCONNECTED"
    return 1
}

check_federation_health() {
    # Check federation status via CLI
    if command -v "${PROJECT_ROOT}/dive" >/dev/null 2>&1; then
        local fed_status
        fed_status=$("${PROJECT_ROOT}/dive" federation status 2>/dev/null | grep "Active:" | sed 's/.*Active: \([0-9]*\).*/\1/' || echo "0")

        if [ "$fed_status" -gt 0 ]; then
            echo "ACTIVE ($fed_status spokes)"
            return 0
        fi
    fi

    echo "INACTIVE"
    return 1
}

# =============================================================================
# METRICS COLLECTION
# =============================================================================

collect_system_metrics() {
    local metrics_file
    metrics_file="$METRICS_DIR/metrics-$(date +%Y%m%d).json"

    # Get system metrics
    local cpu_usage mem_usage disk_usage load_avg
    cpu_usage=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}')
    mem_usage=$(free | grep "^Mem:" | awk '{printf "%.1f", $3/$2 * 100.0}')
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/,//g')

    # Get container metrics
    local container_count
    container_count=$(docker ps --filter "label=com.docker.compose.project=dive-hub" --format "{{.Names}}" | wc -l)

    # Create metrics JSON
    cat > "$metrics_file" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "system": {
        "cpu_load": "$cpu_usage",
        "memory_percent": $mem_usage,
        "disk_percent": $disk_usage,
        "load_average": "$load_avg"
    },
    "containers": {
        "total_running": $container_count
    }
}
EOF

    log_info "System metrics collected: $metrics_file"
}

collect_service_metrics() {
    local service_name="$1"
    local container_pattern="$2"
    local metrics_file
    metrics_file="$METRICS_DIR/${service_name}-$(date +%Y%m%d).json"

    # Get detailed container stats
    local stats
    stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_pattern" 2>/dev/null | tail -1)

    if [ -n "$stats" ]; then
        local container cpu mem net disk
        container=$(echo "$stats" | awk '{print $1}')
        cpu=$(echo "$stats" | awk '{print $2}' | sed 's/%//')
        mem=$(echo "$stats" | awk '{print $3}' | sed 's/%//')
        net=$(echo "$stats" | awk '{print $4}')
        disk=$(echo "$stats" | awk '{print $5}')

        cat > "$metrics_file" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "service": "$service_name",
    "container": "$container",
    "metrics": {
        "cpu_percent": ${cpu:-0},
        "memory_percent": ${mem:-0},
        "network_io": "$net",
        "block_io": "$disk"
    }
}
EOF

        log_info "Service metrics collected for $service_name: $metrics_file"
    fi
}

# =============================================================================
# ALERTING SYSTEM
# =============================================================================

send_alert() {
    local service="$1"
    local status="$2"
    local message="$3"

    log_error "ALERT: $service is $status - $message"

    # Send email alert if configured
    if [ -n "$ALERT_EMAIL" ]; then
        echo "DIVE V3 Alert: $service $status

$message

Timestamp: $(date)
Service: $service
Status: $status

Please check the monitoring dashboard at:
${PROJECT_ROOT}/scripts/production-monitoring.sh dashboard

DIVE V3 Monitoring System" | \
        mail -s "DIVE V3 Alert: $service $status" "$ALERT_EMAIL" 2>/dev/null || \
        log_warn "Failed to send email alert to $ALERT_EMAIL"
    fi

    # Could integrate with Slack, PagerDuty, etc. here
}

check_alerts() {
    for service in "${!ALERT_COUNTS[@]}"; do
        if [ "${ALERT_COUNTS[$service]}" -ge "$ALERT_THRESHOLD" ]; then
            local last_status="${LAST_STATUS[$service]:-unknown}"
            if [ "$last_status" != "alerted" ]; then
                send_alert "$service" "DOWN" "Service has been unhealthy for ${ALERT_COUNTS[$service]} consecutive checks"
                LAST_STATUS[$service]="alerted"
            fi
        else
            # Reset alert status when service recovers
            if [ "${LAST_STATUS[$service]}" = "alerted" ]; then
                log_success "ALERT RECOVERY: $service is back to healthy"
                LAST_STATUS[$service]="healthy"
            fi
        fi
    done
}

# =============================================================================
# DASHBOARD DISPLAY
# =============================================================================

show_header() {
    clear
    echo -e "${CYAN}"
    echo "=============================================================================="
    echo "                DIVE V3 PRODUCTION MONITORING DASHBOARD"
    echo "=============================================================================="
    echo -e "${NC}"
    echo "Environment: ${ENVIRONMENT:-local} | Instance: ${INSTANCE:-usa}"
    echo "Last Update: $(date)"
    echo "Monitoring Interval: ${MONITORING_INTERVAL}s | Alert Threshold: ${ALERT_THRESHOLD}"
    echo "=============================================================================="
}

show_service_status() {
    echo ""
    echo -e "${CYAN}🔍 SERVICE HEALTH STATUS${NC}"
    echo "-------------------------------------------------------------------------------"

    # Hub Services
    local services=("backend" "frontend" "keycloak" "opa" "mongodb" "postgres")
    local container_patterns=("dive-hub-backend" "dive-hub-frontend" "dive-hub-keycloak" "dive-hub-opa" "dive-hub-mongodb" "dive-hub-postgres")

    for i in "${!services[@]}"; do
        local service="${services[$i]}"
        local pattern="${container_patterns[$i]}"
        local status

        case "$service" in
            backend|frontend|keycloak|opa)
                status=$(check_service_health "$service" "$pattern")
                ;;
            mongodb)
                status=$(check_database_connectivity "mongodb" "$pattern")
                ;;
            postgres)
                status=$(check_database_connectivity "postgres" "$pattern")
                ;;
        esac

        case "$status" in
            "HEALTHY"|"CONNECTED")
                echo -e "✅ $service${NC} $(printf '%*s' $((15 - ${#service})) '') ${GREEN}$status${NC}"
                ALERT_COUNTS[$service]=0
                ;;
            "STARTING")
                echo -e "⏳ $service${NC} $(printf '%*s' $((15 - ${#service})) '') ${YELLOW}$status${NC}"
                ;;
            "UNHEALTHY"|"DISCONNECTED"|"DOWN")
                echo -e "❌ $service${NC} $(printf '%*s' $((15 - ${#service})) '') ${RED}$status${NC}"
                ((ALERT_COUNTS[$service]++))
                ;;
        esac

        # Collect metrics for healthy services
        if [ "$status" = "HEALTHY" ] || [ "$status" = "CONNECTED" ]; then
            collect_service_metrics "$service" "$pattern"
        fi
    done
}

show_federation_status() {
    echo ""
    echo -e "${CYAN}🌐 FEDERATION STATUS${NC}"
    echo "-------------------------------------------------------------------------------"

    local fed_status
    fed_status=$(check_federation_health)

    case "$fed_status" in
        "INACTIVE")
            echo -e "❌ Federation Status: ${RED}$fed_status${NC}"
            ;;
        *)
            echo -e "✅ Federation Status: ${GREEN}$fed_status${NC}"
            ;;
    esac
}

show_system_resources() {
    echo ""
    echo -e "${CYAN}💻 SYSTEM RESOURCES${NC}"
    echo "-------------------------------------------------------------------------------"

    # Read latest metrics
    local metrics_file
    metrics_file="$METRICS_DIR/metrics-$(date +%Y%m%d).json"
    if [ -f "$metrics_file" ]; then
        local cpu_load mem_percent disk_percent load_avg container_count

        cpu_load=$(jq -r '.system.cpu_load // "N/A"' "$metrics_file" 2>/dev/null || echo "N/A")
        mem_percent=$(jq -r '.system.memory_percent // "N/A"' "$metrics_file" 2>/dev/null || echo "N/A")
        disk_percent=$(jq -r '.system.disk_percent // "N/A"' "$metrics_file" 2>/dev/null || echo "N/A")
        load_avg=$(jq -r '.system.load_average // "N/A"' "$metrics_file" 2>/dev/null || echo "N/A")
        container_count=$(jq -r '.containers.total_running // "N/A"' "$metrics_file" 2>/dev/null || echo "N/A")

        echo "CPU Load:         $cpu_load"
        echo "Memory Usage:     ${mem_percent}%"
        echo "Disk Usage:       ${disk_percent}%"
        echo "Load Average:     $load_avg"
        echo "Running Containers: $container_count"
    else
        echo "Metrics not available - run collection first"
    fi
}

show_alerts() {
    echo ""
    echo -e "${CYAN}🚨 ACTIVE ALERTS${NC}"
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

show_recent_activity() {
    echo ""
    echo -e "${CYAN}📋 RECENT MONITORING ACTIVITY${NC}"
    echo "-------------------------------------------------------------------------------"

    local log_file
    log_file="$LOG_DIR/monitoring-$(date +%Y%m%d).log"
    if [ -f "$log_file" ]; then
        tail -10 "$log_file" 2>/dev/null | while read -r line; do
            # Color code log levels
            case "$line" in
                *" [ERROR] "*)
                    echo -e "${RED}${line}${NC}"
                    ;;
                *" [WARN] "*)
                    echo -e "${YELLOW}${line}${NC}"
                    ;;
                *" [SUCCESS] "*)
                    echo -e "${GREEN}${line}${NC}"
                    ;;
                *)
                    echo "$line"
                    ;;
            esac
        done
    else
        echo "No recent activity logs available"
    fi
}

# =============================================================================
# MAIN MONITORING FUNCTIONS
# =============================================================================

run_quick_check() {
    log_info "Running quick health check..."

    show_header
    show_service_status
    show_federation_status
    show_alerts

    local unhealthy_count=0
    for service in "${!ALERT_COUNTS[@]}"; do
        if [ "${ALERT_COUNTS[$service]}" -gt 0 ]; then
            ((unhealthy_count++))
        fi
    done

    echo ""
    if [ "$unhealthy_count" -eq 0 ]; then
        log_success "All services are healthy"
        exit 0
    else
        log_error "$unhealthy_count service(s) are unhealthy"
        exit 1
    fi
}

run_monitoring_dashboard() {
    log_info "Starting monitoring dashboard (interval: ${MONITORING_INTERVAL}s)"

    while true; do
        show_header
        show_service_status
        show_federation_status
        show_system_resources
        show_alerts
        show_recent_activity

        # Collect system metrics
        collect_system_metrics

        # Check for alerts
        check_alerts

        echo ""
        echo "Next update in ${MONITORING_INTERVAL} seconds... (Ctrl+C to exit)"

        sleep "$MONITORING_INTERVAL"
    done
}

run_keycloak_health_check() {
    log_info "Running Keycloak health verification..."

    if [ -f "${SCRIPT_DIR}/verify-keycloak-health.sh" ]; then
        bash "${SCRIPT_DIR}/verify-keycloak-health.sh"
    else
        log_error "Keycloak health check script not found"
        exit 1
    fi
}

run_federation_monitoring() {
    log_info "Running federation flow monitoring..."

    if [ -f "${SCRIPT_DIR}/monitor-federation-flow.sh" ]; then
        bash "${SCRIPT_DIR}/monitor-federation-flow.sh"
    else
        log_error "Federation monitoring script not found"
        exit 1
    fi
}

# =============================================================================
# COMMAND LINE INTERFACE
# =============================================================================

show_usage() {
    cat << EOF
DIVE V3 Production Monitoring System

Usage: $0 <command> [options]

Commands:
    dashboard     Start real-time monitoring dashboard
    check         Quick health check of all services
    keycloak      Run Keycloak health verification
    federation    Monitor federation flows
    metrics       Collect and display current metrics
    alerts        Show current alert status

Options:
    --interval N  Monitoring interval in seconds (default: 30)
    --threshold N Alert threshold for consecutive failures (default: 3)
    --email ADDR  Email address for alerts
    --help, -h    Show this help message

Environment Variables:
    MONITORING_INTERVAL    Dashboard refresh interval
    ALERT_THRESHOLD        Consecutive failures before alert
    ALERT_EMAIL           Email address for alerts
    LOG_DIR               Directory for log files
    METRICS_DIR           Directory for metrics files

Examples:
    $0 dashboard                    # Start monitoring dashboard
    $0 check                        # Quick health check
    $0 dashboard --interval 60      # Dashboard with 60s interval
    $0 check --email admin@example.com  # Check with email alerts

Log files are stored in: $LOG_DIR
Metrics files are stored in: $METRICS_DIR
EOF
}

main() {
    # Parse command line arguments
    local command="dashboard"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --interval)
                MONITORING_INTERVAL="$2"
                shift 2
                ;;
            --threshold)
                ALERT_THRESHOLD="$2"
                shift 2
                ;;
            --email)
                ALERT_EMAIL="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            dashboard|check|keycloak|federation|metrics|alerts)
                command="$1"
                shift
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Initialize alert tracking
    ALERT_COUNTS["backend"]=0
    ALERT_COUNTS["frontend"]=0
    ALERT_COUNTS["keycloak"]=0
    ALERT_COUNTS["opa"]=0
    ALERT_COUNTS["mongodb"]=0
    ALERT_COUNTS["postgres"]=0

    case "$command" in
        dashboard)
            run_monitoring_dashboard
            ;;
        check)
            run_quick_check
            ;;
        keycloak)
            run_keycloak_health_check
            ;;
        federation)
            run_federation_monitoring
            ;;
        metrics)
            collect_system_metrics
            echo "Metrics collected. View latest metrics in: $METRICS_DIR"
            ;;
        alerts)
            show_alerts
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

# Handle Ctrl+C gracefully
trap 'echo -e "\nMonitoring stopped by user"; exit 0' INT TERM

main "$@"
# sc2034-anchor
: "${SERVICE_PORTS:-}"
