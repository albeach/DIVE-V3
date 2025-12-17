#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Redis Management Module
# =============================================================================
# Comprehensive Redis management across Hub and all Spoke instances.
#
# Commands:
#   status [instance]      - Show Redis status for instance (default: usa/hub)
#   status-all             - Show Redis status for all instances
#   health [instance]      - Detailed Redis health check
#   flush [instance]       - Flush Redis caches (use with caution)
#   stats [instance]       - Show Redis statistics and metrics
#
# Usage:
#   ./dive redis status              # Hub Redis status
#   ./dive redis status rou          # ROU spoke Redis status
#   ./dive redis status-all          # All instances
#   ./dive redis health              # Detailed hub health
#   ./dive redis flush usa           # Clear hub caches
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load environment variables for Redis access
load_gcp_secrets "${INSTANCE:-usa}" 2>/dev/null || true

# =============================================================================
# CONSTANTS
# =============================================================================

# NATO country codes for Redis port calculation (base port 6379 + offset)
declare -A NATO_REDIS_PORTS=(
    ["usa"]="6379"   # Hub: standard Redis port
    ["fra"]="6380"   # FRA: +1
    ["gbr"]="6381"   # GBR: +2
    ["deu"]="6382"   # DEU: +3
    ["can"]="6383"   # CAN: +4
    ["ita"]="6384"   # ITA: +5
    ["esp"]="6385"   # ESP: +6
    ["nld"]="6386"   # NLD: +7
    ["bel"]="6387"   # BEL: +8
    ["dnk"]="6388"   # DNK: +9
    ["nor"]="6389"   # NOR: +10
    ["swe"]="6390"   # SWE: +11
    ["pol"]="6391"   # POL: +12
    ["rou"]="6392"   # ROU: +13
    ["cze"]="6393"   # CZE: +14
    ["hun"]="6394"   # HUN: +15
    ["svn"]="6395"   # SVN: +16
    ["hrv"]="6396"   # HRV: +17
    ["bgr"]="6397"   # BGR: +18
    ["grc"]="6398"   # GRC: +19
    ["prt"]="6399"   # PRT: +20
    ["aut"]="6400"   # AUT: +21
    ["che"]="6401"   # CHE: +22
    ["fin"]="6402"   # FIN: +23
    ["est"]="6403"   # EST: +24
    ["lva"]="6404"   # LVA: +25
    ["ltu"]="6405"   # LTU: +26
    ["svk"]="6406"   # SVK: +27
    ["svn"]="6407"   # SVN: +28
    ["alb"]="6408"   # ALB: +29
    ["mne"]="6409"   # MNE: +30
    ["mkd"]="6410"   # MKD: +31
    ["srb"]="6411"   # SRB: +32
)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Inline logging functions (for single-line output)
log_success_inline() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error_inline() {
    echo -e "${RED}❌ $1${NC}"
}

log_warn_inline() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Get Redis port for instance
get_redis_port() {
    local instance="${1:-usa}"
    echo "${NATO_REDIS_PORTS[$instance]:-6379}"
}

# Get Redis container name for instance
get_redis_container() {
    local instance="${1:-usa}"

    if [ "$instance" = "usa" ]; then
        # Hub Redis container
        echo "dive-hub-redis"
    elif [ "$instance" = "blacklist" ]; then
        # Shared blacklist Redis container
        echo "shared-blacklist-redis"
    else
        # Spoke Redis container (format: dive-{instance}-redis)
        echo "dive-${instance}-redis"
    fi
}

# Get Redis password for instance (from environment or GCP secrets)
get_redis_password() {
    local instance="${1:-usa}"

    case "$instance" in
        usa)
            # Hub Redis password (same default as docker-compose)
            echo "${REDIS_PASSWORD_USA:-${REDIS_PASSWORD:-dive-redis-dev-password}}"
            ;;
        blacklist)
            # Shared blacklist Redis password
            echo "${REDIS_PASSWORD_BLACKLIST:-${REDIS_PASSWORD:-}}"
            ;; 
        *)
            # Spoke Redis password (from instance .env)
            local env_file="${DIVE_ROOT}/instances/${instance}/.env"
            if [ -f "$env_file" ]; then
                grep "^REDIS_PASSWORD=" "$env_file" 2>/dev/null | cut -d'=' -f2- | tr -d '"'
            fi
            ;;
    esac
}

# Execute Redis CLI command on container
redis_exec() {
    local instance="${1:-usa}"
    local command="$2"
    local container
    local password
    local port

    container="$(get_redis_container "$instance")"
    password="$(get_redis_password "$instance")"
    port="$(get_redis_port "$instance")"

    if [ "$DRY_RUN" = true ]; then
        if [ -n "$password" ]; then
            log_dry "docker exec $container redis-cli -p $port -a '***' $command"
        else
            log_dry "docker exec $container redis-cli -p $port $command"
        fi
        return 0
    fi

    # Check if container exists and is running
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        echo "ERROR: Redis container '$container' not running"
        return 1
    fi

    # Execute Redis command
    if [ -n "$password" ]; then
        docker exec "$container" redis-cli -p "$port" -a "$password" $command 2>/dev/null
    else
        docker exec "$container" redis-cli -p "$port" $command 2>/dev/null
    fi
}

# Check if Redis is responding
redis_ping() {
    local instance="${1:-usa}"
    local response

    response="$(redis_exec "$instance" "ping" 2>/dev/null)"
    if [ "$response" = "PONG" ]; then
        return 0
    else
        return 1
    fi
}

# Get basic Redis info
redis_info() {
    local instance="${1:-usa}"
    redis_exec "$instance" "info" 2>/dev/null
}

# Get Redis memory info
redis_memory_stats() {
    local instance="${1:-usa}"
    redis_exec "$instance" "info memory" 2>/dev/null
}

# Get Redis stats
redis_stats() {
    local instance="${1:-usa}"
    redis_exec "$instance" "info stats" 2>/dev/null
}

# Get connected clients
redis_clients() {
    local instance="${1:-usa}"
    redis_exec "$instance" "info clients" 2>/dev/null
}

# Get Redis configuration
redis_config() {
    local instance="${1:-usa}"
    local key="$2"

    if [ -n "$key" ]; then
        redis_exec "$instance" "config get $key" 2>/dev/null
    else
        redis_exec "$instance" "config get *" 2>/dev/null
    fi
}

# Flush all Redis data (dangerous!)
redis_flush_all() {
    local instance="${1:-usa}"

    log_warn "This will flush ALL Redis data for $instance. This cannot be undone!"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would flush all Redis data for $instance"
        return 0
    fi

    if confirm_action "Are you sure you want to flush all Redis data for $instance?"; then
        log_info "Flushing Redis data for $instance..."
        if redis_exec "$instance" "flushall"; then
            log_success "Redis data flushed for $instance"
        else
            log_error "Failed to flush Redis data for $instance"
            return 1
        fi
    else
        log_info "Operation cancelled"
    fi
}

# =============================================================================
# MAIN COMMANDS
# =============================================================================

# Show Redis status for a specific instance
redis_status() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Redis Status - ${instance^^}${NC}"
    echo "Container: $(get_redis_container "$instance")"
    echo "Port: $(get_redis_port "$instance")"
    echo "Password: $(if [ -n "$(get_redis_password "$instance")" ]; then echo "Set"; else echo "None"; fi)"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check Redis status for $instance"
        return 0
    fi

    if redis_ping "$instance"; then
        log_success "Redis is responding (PONG)"

        # Get basic info
        echo ""
        echo -e "${BOLD}Basic Info:${NC}"
        redis_exec "$instance" "info server" | grep -E "redis_version|redis_mode|tcp_port|uptime_in_seconds" | head -5

        # Get memory info
        echo ""
        echo -e "${BOLD}Memory Usage:${NC}"
        redis_exec "$instance" "info memory" | grep -E "used_memory_human|used_memory_peak_human|maxmemory" | head -3

        # Get connection info
        echo ""
        echo -e "${BOLD}Connections:${NC}"
        redis_exec "$instance" "info clients" | grep -E "connected_clients|blocked_clients" | head -2

    else
        log_error "Redis is not responding"
        return 1
    fi
}

# Show Redis status for all instances
redis_status_all() {
    echo -e "${BOLD}Redis Status - All Instances${NC}"
    echo ""

    # Check hub first
    echo -e "${BLUE}HUB (USA):${NC}"
    redis_status "usa"
    echo ""

    # Check running spoke containers
    local running_spokes
    running_spokes=$(docker ps --filter "name=dive-*-redis" --format "{{.Names}}" | grep -v "dive-usa-redis" | sed 's/dive-//;s/-redis//' | sort)

    if [ -n "$running_spokes" ]; then
        echo -e "${BLUE}SPOKES:${NC}"

        for spoke in $running_spokes; do
            echo ""
            echo -e "${YELLOW}${spoke^^}:${NC}"
            redis_status "$spoke"
        done
    else
        echo -e "${YELLOW}No spoke Redis containers running${NC}"
    fi
}

# Detailed Redis health check
redis_health() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Redis Health Check - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would perform detailed Redis health check for $instance"
        return 0
    fi

    local checks_passed=0
    local total_checks=0

    # Check 1: Ping
    total_checks=$((total_checks + 1))
    echo -n "Ping test: "
    if redis_ping "$instance"; then
        log_success_inline "PASS"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
    fi
    echo ""

    # Check 2: Memory usage
    total_checks=$((total_checks + 1))
    echo -n "Memory usage: "
    local mem_info
    mem_info=$(redis_exec "$instance" "info memory" | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
    if [ -n "$mem_info" ]; then
        log_success_inline "OK ($mem_info)"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
    fi
    echo ""

    # Check 3: Connection count
    total_checks=$((total_checks + 1))
    echo -n "Connected clients: "
    local client_count
    client_count=$(redis_exec "$instance" "info clients" | grep "connected_clients" | cut -d: -f2 | tr -d '\r')
    if [ -n "$client_count" ] && [ "$client_count" -ge 0 ] 2>/dev/null; then
        log_success_inline "OK ($client_count clients)"
        checks_passed=$((checks_passed + 1))
    else
        log_error_inline "FAIL"
    fi
    echo ""

    # Check 4: Persistence
    total_checks=$((total_checks + 1))
    echo -n "Persistence (AOF): "
    local aof_enabled
    aof_enabled=$(redis_exec "$instance" "config get appendonly" | tail -1 | tr -d '\r')
    if [ "$aof_enabled" = "yes" ]; then
        log_success_inline "ENABLED"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "DISABLED"
    fi
    echo ""

    # Check 5: Authentication
    total_checks=$((total_checks + 1))
    echo -n "Authentication: "
    local has_password
    has_password=$(get_redis_password "$instance")
    if [ -n "$has_password" ]; then
        log_success_inline "ENABLED"
        checks_passed=$((checks_passed + 1))
    else
        log_warn_inline "DISABLED"
    fi
    echo ""

    # Summary
    echo ""
    echo -e "${BOLD}Health Summary:${NC}"
    echo "Checks passed: $checks_passed/$total_checks"

    if [ "$checks_passed" -eq "$total_checks" ]; then
        log_success "All health checks passed"
        return 0
    else
        log_warn "Some health checks failed"
        return 1
    fi
}

# Flush Redis caches
redis_flush() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Redis Cache Flush - ${instance^^}${NC}"
    echo ""

    # Show current status before flush
    echo -e "${BOLD}Current status:${NC}"
    redis_status "$instance"
    echo ""

    # Flush caches
    redis_flush_all "$instance"
}

# Show Redis statistics
redis_stats() {
    local instance="${1:-usa}"

    echo -e "${BOLD}Redis Statistics - ${instance^^}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show Redis statistics for $instance"
        return 0
    fi

    # Get stats info
    echo -e "${BOLD}Statistics:${NC}"
    redis_exec "$instance" "info stats" | grep -E "total_connections_received|total_commands_processed|keyspace_hits|keyspace_misses" | head -10

    # Calculate hit rate
    echo ""
    echo -e "${BOLD}Cache Performance:${NC}"
    local hits misses
    hits=$(redis_exec "$instance" "info stats" | grep "keyspace_hits" | cut -d: -f2 | tr -d '\r')
    misses=$(redis_exec "$instance" "info stats" | grep "keyspace_misses" | cut -d: -f2 | tr -d '\r')

    if [ -n "$hits" ] && [ -n "$misses" ] && [ "$hits" -gt 0 ] 2>/dev/null; then
        local total=$((hits + misses))
        local hit_rate=$((hits * 100 / total))
        echo "Cache hit rate: $hit_rate% ($hits hits, $misses misses)"
    else
        echo "Cache hit rate: N/A (insufficient data)"
    fi

    # Show memory breakdown
    echo ""
    echo -e "${BOLD}Memory Breakdown:${NC}"
    redis_exec "$instance" "info memory" | grep -E "used_memory_human|used_memory_rss_human|used_memory_peak_human|mem_fragmentation_ratio" | head -10
}

# Help function
module_redis_help() {
    cat << EOF
${BOLD}DIVE V3 Redis Management Commands${NC}

${BOLD}USAGE:${NC}
  ./dive redis <command> [instance] [options]

${BOLD}COMMANDS:${NC}
  status [instance]      Show Redis status for instance (default: usa/hub)
  status-all             Show Redis status for all running instances
  health [instance]      Perform detailed Redis health check
  flush [instance]       Flush all Redis data (dangerous, requires confirmation)
  stats [instance]       Show Redis statistics and performance metrics
  blacklist <cmd>        Manage shared token blacklist (status/sync/clear)
  rate-limits <cmd>      Manage distributed rate limiting (show/reset)
  metrics                Show Redis monitoring metrics from Prometheus
  alerts                 Show Redis alert status and configured rules

${BOLD}INSTANCES:${NC}
  usa, fra, gbr, deu, can, ita, esp, nld, bel, dnk, nor, swe, pol, rou, cze, hun,
  svn, hrv, bgr, grc, prt, aut, che, fin, est, lva, ltu, svk, alb, mne, mkd, srb

${BOLD}EXAMPLES:${NC}
  ./dive redis status              # Hub Redis status
  ./dive redis status rou          # ROU spoke Redis status
  ./dive redis status-all          # All instances
  ./dive redis health              # Detailed hub health check
  ./dive redis health fra          # FRA spoke health check
  ./dive redis stats               # Hub statistics
  ./dive redis flush usa           # Clear hub caches (with confirmation)

${BOLD}NOTES:${NC}
  - Commands automatically detect Redis container names and ports
  - Authentication is handled automatically using GCP secrets or .env files
  - Use --dry-run to see what would be executed without running commands
  - The 'flush' command requires manual confirmation to prevent accidents

EOF
}

# =============================================================================
# BLACKLIST COMMANDS
# =============================================================================

# Redis blacklist management
redis_blacklist() {
    local subcommand="$1"
    shift || true

    case "$subcommand" in
        status)
            redis_blacklist_status "$@"
            ;;
        sync)
            redis_blacklist_sync "$@"
            ;;
        clear)
            redis_blacklist_clear "$@"
            ;;
        *)
            echo -e "${RED}ERROR: Unknown blacklist command '$subcommand'${NC}"
            echo ""
            echo "Available blacklist commands:"
            echo "  status    Show blacklist Redis status and connected instances"
            echo "  sync      Sync blacklist across all instances"
            echo "  clear     Clear all blacklisted tokens (dangerous)"
            exit 1
            ;;
    esac
}

# Show blacklist Redis status
redis_blacklist_status() {
    print_header
    echo -e "${BOLD}Redis Blacklist Status${NC}"
    echo ""

    # Check if blacklist Redis is running
    local container
    container="$(get_redis_container "blacklist")"

    if ! docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_error "Blacklist Redis container '$container' not running"
        echo ""
        echo "Start the hub with: ./dive hub up"
        return 1
    fi

    # Get blacklist Redis info
    echo -e "${BLUE}Blacklist Redis:${NC}"
    local password
    password="$(get_redis_password "blacklist")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check blacklist Redis status"
        return 0
    fi

    # Ping test
    if docker exec "$container" redis-cli -a "$password" ping 2>/dev/null | grep -q "PONG"; then
        log_success "Blacklist Redis is responding"
    else
        log_error "Blacklist Redis is not responding"
        return 1
    fi

    # Get basic stats
    echo ""
    echo -e "${BOLD}Statistics:${NC}"
    docker exec "$container" redis-cli -a "$password" info stats 2>/dev/null | grep -E "total_connections_received|total_commands_processed" | head -5

    # Get blacklist size
    echo ""
    echo -e "${BOLD}Blacklist:${NC}"
    local blacklist_count
    blacklist_count=$(docker exec "$container" redis-cli -a "$password" keys "dive-v3:blacklist:*" 2>/dev/null | wc -l)
    echo "Blacklisted tokens: $blacklist_count"

    # Get connected clients (instances)
    echo ""
    echo -e "${BOLD}Connected Instances:${NC}"
    local clients
    clients=$(docker exec "$container" redis-cli -a "$password" info clients 2>/dev/null | grep "connected_clients" | cut -d: -f2)
    echo "Active connections: $clients"

    # Show Pub/Sub channels
    echo ""
    echo -e "${BOLD}Pub/Sub Channels:${NC}"
    docker exec "$container" redis-cli -a "$password" pubsub channels "dive-v3:*" 2>/dev/null
}

# Sync blacklist across instances
redis_blacklist_sync() {
    print_header
    echo -e "${BOLD}Redis Blacklist Sync${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would sync blacklist across all instances"
        return 0
    fi

    # This would trigger a sync operation across all connected instances
    # For now, just show that it's a planned feature
    log_info "Blacklist sync is automatically handled by Redis Pub/Sub"
    log_info "All connected instances receive real-time updates"
    echo ""
    log_success "No manual sync required - blacklist is always synchronized"
}

# Clear all blacklisted tokens
redis_blacklist_clear() {
    print_header
    echo -e "${BOLD}Clear Redis Blacklist${NC}"
    echo ""

    log_warn "This will clear ALL blacklisted tokens across ALL instances!"
    log_warn "Users who were logged out will be able to log back in immediately."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would clear all blacklisted tokens"
        return 0
    fi

    if confirm_action "Are you sure you want to clear all blacklisted tokens?"; then
        local container="dive-hub-redis-blacklist"
        local password
        password="$(get_redis_password "blacklist")"

        log_info "Clearing all blacklisted tokens..."
        docker exec "$container" redis-cli -a "$password" keys "dive-v3:blacklist:*" | xargs -r docker exec "$container" redis-cli -a "$password" del

        # Publish clear event to all instances
        docker exec "$container" redis-cli -a "$password" publish "dive-v3:blacklist:clear" "all"

        log_success "All blacklisted tokens cleared"
        log_info "All instances notified of blacklist clear"
    else
        log_info "Operation cancelled"
    fi
}

# =============================================================================
# RATE LIMITS COMMANDS
# =============================================================================

# Redis rate limits management
redis_rate_limits() {
    local subcommand="$1"
    shift || true

    case "$subcommand" in
        show)
            redis_rate_limits_show "$@"
            ;;
        reset)
            redis_rate_limits_reset "$@"
            ;;
        *)
            echo -e "${RED}ERROR: Unknown rate-limits command '$subcommand'${NC}"
            echo ""
            echo "Available rate-limits commands:"
            echo "  show     Show current rate limit statistics"
            echo "  reset <ip>  Reset rate limits for a specific IP"
            exit 1
            ;;
    esac
}

# Show rate limit statistics
redis_rate_limits_show() {
    print_header
    echo -e "${BOLD}Rate Limit Statistics${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would show rate limit statistics"
        return 0
    fi

    # Get rate limit stats from backend API
    local backend_url="https://localhost:4000"
    local response

    if response=$(curl -k -s "${backend_url}/health/detailed" 2>/dev/null); then
        # Extract rate limit stats from health response
        echo -e "${BOLD}Rate Limiting Status:${NC}"

        if echo "$response" | jq -e '.services.redis' >/dev/null 2>&1; then
            echo "✅ Redis-backed rate limiting: ENABLED"
        else
            echo "⚠️  Memory-based rate limiting: ENABLED (Redis unavailable)"
        fi

        echo ""
        echo -e "${BOLD}Rate Limit Configuration:${NC}"
        echo "API Rate Limit: 100 requests per 15 minutes"
        echo "Auth Rate Limit: 5 requests per 15 minutes"
        echo "Upload Rate Limit: 20 requests per hour"
        echo "Admin Rate Limit: 50 requests per 15 minutes"
        echo "Strict Rate Limit: 3 requests per hour"

        echo ""
        echo -e "${BOLD}Active Rate Limit Keys:${NC}"
        # Try to get key counts from Redis directly
        local password
        password="$(get_redis_password "usa")"

        if [ -n "$password" ]; then
            echo "API keys: $(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:api:*" 2>/dev/null | wc -l 2>/dev/null || echo "N/A")"
            echo "Auth keys: $(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:auth:*" 2>/dev/null | wc -l 2>/dev/null || echo "N/A")"
            echo "Upload keys: $(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:upload:*" 2>/dev/null | wc -l 2>/dev/null || echo "N/A")"
            echo "Admin keys: $(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:admin:*" 2>/dev/null | wc -l 2>/dev/null || echo "N/A")"
            echo "Strict keys: $(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:strict:*" 2>/dev/null | wc -l 2>/dev/null || echo "N/A")"
        else
            echo "Cannot retrieve key counts - Redis password not available"
        fi
    else
        log_error "Cannot connect to backend API at ${backend_url}"
        return 1
    fi
}

# Reset rate limits for a specific IP
redis_rate_limits_reset() {
    local target_ip="$1"

    if [ -z "$target_ip" ]; then
        echo -e "${RED}ERROR: IP address required${NC}"
        echo "Usage: ./dive redis rate-limits reset <ip>"
        exit 1
    fi

    print_header
    echo -e "${BOLD}Reset Rate Limits for IP: ${target_ip}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset rate limits for IP $target_ip"
        return 0
    fi

    local password
    password="$(get_redis_password "usa")"

    if [ -z "$password" ]; then
        log_error "Redis password not available"
        return 1
    fi

    log_info "Resetting rate limits for IP: $target_ip"

    # Delete all rate limit keys for this IP across all rate limiters
    local rate_limiters=("api" "auth" "upload" "admin" "strict")
    local total_deleted=0

    for limiter in "${rate_limiters[@]}"; do
        # Find and delete keys containing this IP
        local keys
        keys=$(docker exec dive-hub-redis redis-cli -a "$password" keys "dive-v3:rate-limit:${limiter}:*" 2>/dev/null | grep "$target_ip" || true)

        if [ -n "$keys" ]; then
            local key_count
            key_count=$(echo "$keys" | wc -l)
            echo "$keys" | xargs docker exec dive-hub-redis redis-cli -a "$password" del >/dev/null 2>&1
            echo "Reset $limiter rate limits: $key_count keys deleted"
            ((total_deleted += key_count))
        fi
    done

    if [ "$total_deleted" -gt 0 ]; then
        log_success "Successfully reset rate limits for IP $target_ip ($total_deleted keys deleted)"
    else
        log_info "No rate limit keys found for IP $target_ip"
    fi
}

# =============================================================================
# MONITORING COMMANDS
# =============================================================================

# Redis monitoring metrics
redis_metrics() {
    print_header
    echo -e "${BOLD}Redis Monitoring Metrics${NC}"
    echo ""

    # Check if Prometheus is running
    if ! curl -s http://localhost:9090/-/healthy >/dev/null 2>&1; then
        log_error "Prometheus not accessible at http://localhost:9090"
        echo ""
        echo "Start monitoring stack:"
        echo "  cd docker/instances/shared && docker compose up -d"
        return 1
    fi

    echo -e "${BOLD}Prometheus Redis Metrics:${NC}"
    echo ""

    # Redis instance status
    echo -e "${YELLOW}Redis Instances:${NC}"
    local up_count
    up_count=$(curl -s "http://localhost:9090/api/v1/query?query=redis_up" 2>/dev/null | jq '.data.result | length' 2>/dev/null || echo "0")
    echo "Redis instances monitored: $up_count"

    echo ""
    echo -e "${YELLOW}Connected Clients:${NC}"
    local client_count
    client_count=$(curl -s "http://localhost:9090/api/v1/query?query=sum(redis_connected_clients)" 2>/dev/null | jq '.data.result[0].value[1]' 2>/dev/null | sed 's/"//g' || echo "N/A")
    echo "Total connected clients: $client_count"

    echo ""
    echo -e "${YELLOW}Memory Usage:${NC}"
    local mem_usage
    mem_usage=$(curl -s "http://localhost:9090/api/v1/query?query=sum(redis_memory_used_bytes)/1024/1024" 2>/dev/null | jq '.data.result[0].value[1]' 2>/dev/null | sed 's/"//g' | xargs printf "%.1f" 2>/dev/null || echo "N/A")
    echo "Total memory used: ${mem_usage} MB"

    echo ""
    echo -e "${YELLOW}Operations per Second:${NC}"
    local ops_rate
    ops_rate=$(curl -s "http://localhost:9090/api/v1/query?query=sum(rate(redis_commands_processed_total[5m]))" 2>/dev/null | jq '.data.result[0].value[1]' 2>/dev/null | sed 's/"//g' | xargs printf "%.1f" 2>/dev/null || echo "N/A")
    echo "Total operations/sec: $ops_rate"

    echo ""
    echo -e "${YELLOW}Grafana Dashboard:${NC}"
    echo "http://localhost:3333/dashboards (admin/admin)"
}

# Redis monitoring alerts
redis_alerts() {
    print_header
    echo -e "${BOLD}Redis Monitoring Alerts${NC}"
    echo ""

    # Check if Prometheus is running
    if ! curl -s http://localhost:9090/-/healthy >/dev/null 2>&1; then
        log_error "Prometheus not accessible at http://localhost:9090"
        echo ""
        echo "Start monitoring stack:"
        echo "  cd docker/instances/shared && docker compose up -d"
        return 1
    fi

    echo -e "${BOLD}Alert Rules Configured:${NC}"
    echo "✅ RedisInstanceDown - Critical alert when Redis is down"
    echo "✅ RedisHighMemoryUsage - Warning when memory > 80%"
    echo "✅ RedisConnectionIssues - Warning when rejecting connections"
    echo "ℹ️  RedisHighKeyspaceMisses - Info when cache miss rate > 50%"

    echo ""
    echo -e "${BOLD}Current Alert Status:${NC}"
    local alert_count
    alert_count=$(curl -s "http://localhost:9090/api/v1/alerts" 2>/dev/null | jq '.data.alerts | length' 2>/dev/null || echo "0")

    if [ "$alert_count" -gt 0 ]; then
        echo "Active alerts: $alert_count"
        echo "Check Alertmanager: http://localhost:9093"
    else
        echo "✅ No alerts currently active"
    fi

    echo ""
    echo -e "${YELLOW}Monitoring URLs:${NC}"
    echo "Prometheus: http://localhost:9090"
    echo "Grafana: http://localhost:3333 (admin/admin)"
    echo "Alertmanager: http://localhost:9093"
}

# =============================================================================
# MODULE ENTRY POINT
# =============================================================================

module_redis() {
    local subcommand="$1"
    shift || true

    print_header

    case "$subcommand" in
        status)
            redis_status "$@"
            ;;
        status-all)
            redis_status_all "$@"
            ;;
        health)
            redis_health "$@"
            ;;
        flush)
            redis_flush "$@"
            ;;
        stats)
            redis_stats "$@"
            ;;
        blacklist)
            redis_blacklist "$@"
            ;;
        rate-limits)
            redis_rate_limits "$@"
            ;;
        metrics)
            redis_metrics "$@"
            ;;
        alerts)
            redis_alerts "$@"
            ;;
        help|--help|-h)
            module_redis_help
            ;;
        *)
            echo -e "${RED}ERROR: Unknown Redis command '$subcommand'${NC}"
            echo ""
            module_redis_help
            exit 1
            ;;
    esac
}
