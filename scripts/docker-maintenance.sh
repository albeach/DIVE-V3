#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Docker Maintenance Script
# =============================================================================
# Comprehensive Docker cleanup and maintenance utilities
# Prevents disk utilization from ballooning by proactive cleanup
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Simple logging functions (standalone)
log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_header() {
    echo "================================================================================="
    echo "  DIVE V3 Docker Maintenance Script"
    echo "  Prevents Docker disk utilization from ballooning"
    echo "================================================================================="
}

# =============================================================================
# CONSTANTS
# =============================================================================

DOCKER_ROOT="${HOME}/Library/Containers/com.docker.docker/Data"
DOCKER_VM_DISK="${DOCKER_ROOT}/vms/0/data/Docker.raw"
MAX_DISK_USAGE_PERCENT=80
MAX_DISK_USAGE_GB=50
WARNING_DISK_USAGE_PERCENT=60
LOG_RETENTION_DAYS=7

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

get_docker_disk_usage() {
    # Get Docker VM disk size in GB
    if [ -f "$DOCKER_VM_DISK" ]; then
        local size_bytes
        size_bytes=$(stat -f%z "$DOCKER_VM_DISK" 2>/dev/null || echo "0")
        echo $(( size_bytes / 1024 / 1024 / 1024 ))
    else
        echo "0"
    fi
}

get_docker_system_usage() {
    # Get Docker system usage breakdown
    docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}" 2>/dev/null || echo "Error getting Docker usage"
}

check_disk_usage() {
    local current_gb
    current_gb=$(get_docker_disk_usage)

    echo "Current Docker VM disk usage: ${current_gb}GB"

    if [ "$current_gb" -gt "$MAX_DISK_USAGE_GB" ]; then
        echo -e "${RED}CRITICAL: Docker disk usage (${current_gb}GB) exceeds limit (${MAX_DISK_USAGE_GB}GB)${NC}"
        return 1
    elif [ "$current_gb" -gt "$((MAX_DISK_USAGE_GB * WARNING_DISK_USAGE_PERCENT / 100))" ]; then
        echo -e "${YELLOW}WARNING: Docker disk usage (${current_gb}GB) approaching limit${NC}"
        return 0
    else
        echo -e "${GREEN}Docker disk usage is within acceptable limits${NC}"
        return 0
    fi
}

# =============================================================================
# CLEANUP FUNCTIONS
# =============================================================================

cleanup_containers() {
    local dry_run="${1:-false}"
    log_step "Cleaning up stopped containers..."

    local stopped_containers
    stopped_containers=$(docker ps -a --filter "status=exited" --format "{{.Names}}" | wc -l | tr -d ' ')

    if [ "$stopped_containers" -gt 0 ]; then
        echo "Found $stopped_containers stopped containers"
        if [ "$dry_run" = true ]; then
            docker ps -a --filter "status=exited" --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"
        else
            docker container prune -f
            echo "Removed stopped containers"
        fi
    else
        echo "No stopped containers to clean up"
    fi
}

cleanup_images() {
    local dry_run="${1:-false}"
    log_step "Cleaning up unused images..."

    local dangling_images
    dangling_images=$(docker images -f "dangling=true" --format "{{.Repository}}:{{.Tag}}" | wc -l | tr -d ' ')

    if [ "$dangling_images" -gt 0 ]; then
        echo "Found $dangling_images dangling images"
        if [ "$dry_run" = true ]; then
            docker images -f "dangling=true" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
        else
            docker image prune -f
            echo "Removed dangling images"
        fi
    else
        echo "No dangling images to clean up"
    fi

    # Also clean up unused images (not just dangling)
    local unused_images
    unused_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "<none>" | wc -l | tr -d ' ')

    if [ "$unused_images" -gt 5 ]; then
        echo "Considering cleanup of old unused images..."
        if [ "$dry_run" = false ]; then
            echo "Use 'docker image prune -a' manually for more aggressive cleanup"
        fi
    fi
}

cleanup_volumes() {
    local dry_run="${1:-false}"
    log_step "Cleaning up unused volumes..."

    local unused_volumes
    unused_volumes=$(docker volume ls -qf "dangling=true" | wc -l | tr -d ' ')

    if [ "$unused_volumes" -gt 0 ]; then
        echo "Found $unused_volumes unused volumes"
        if [ "$dry_run" = true ]; then
            docker volume ls -qf "dangling=true"
        else
            docker volume prune -f
            echo "Removed unused volumes"
        fi
    else
        echo "No unused volumes to clean up"
    fi
}

cleanup_build_cache() {
    local dry_run="${1:-false}"
    log_step "Cleaning up build cache..."

    local build_cache_size
    build_cache_size=$(docker buildx du --format "{{.Size}}" 2>/dev/null | head -1 || echo "0B")

    if [[ "$build_cache_size" != "0B" ]]; then
        echo "Build cache size: $build_cache_size"
        if [ "$dry_run" = false ]; then
            docker buildx prune -f
            echo "Cleaned build cache"
        fi
    else
        echo "No build cache to clean up"
    fi
}

cleanup_networks() {
    local dry_run="${1:-false}"
    log_step "Cleaning up unused networks..."

    local unused_networks
    unused_networks=$(docker network ls --format "{{.Name}}" | grep -v -E "(bridge|host|none)" | wc -l | tr -d ' ')

    if [ "$unused_networks" -gt 0 ]; then
        echo "Found unused networks"
        if [ "$dry_run" = true ]; then
            docker network ls --format "table {{.Name}}\t{{.Driver}}"
        else
            docker network prune -f
            echo "Removed unused networks"
        fi
    else
        echo "No unused networks to clean up"
    fi
}

cleanup_logs() {
    local dry_run="${1:-false}"
    log_step "Checking container logs..."

    # This is informational - Docker Desktop handles log rotation automatically
    echo "Docker Desktop automatically rotates logs. Current log size:"
    du -sh "${DOCKER_ROOT}/log" 2>/dev/null || echo "Log directory not found"

    # Check for any containers with large log files
    echo "Checking for containers with large logs..."
    docker ps -a --format "{{.Names}}" | head -10 | while read -r container; do
        local log_size
        log_size=$(timeout 5 docker logs "$container" 2>&1 | wc -c 2>/dev/null || echo "0")
        if [ "$log_size" -gt 1000000 ]; then # > 1MB
            echo "Large logs detected in container: $container (${log_size} bytes)"
        fi
    done
}

optimize_images() {
    local dry_run="${1:-false}"
    log_step "Optimizing Docker images..."

    echo "Checking for images that can be optimized..."

    # Find images with multiple tags (potential cleanup)
    local multi_tag_images
    multi_tag_images=$(docker images --format "{{.Repository}}" | sort | uniq -c | awk '$1 > 1 {print $2}' | wc -l | tr -d ' ')

    if [ "$multi_tag_images" -gt 0 ]; then
        echo "Found $multi_tag_images images with multiple tags"
        if [ "$dry_run" = true ]; then
            docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | head -20
        fi
    fi

    # Suggest using multi-stage builds and smaller base images
    echo "Recommendations:"
    echo "- Use alpine-based images when possible"
    echo "- Implement multi-stage builds to reduce image size"
    echo "- Clean up development dependencies in production images"
}

# =============================================================================
# MAIN FUNCTIONS
# =============================================================================

docker_maintenance_status() {
    print_header
    echo -e "${BOLD}Docker Maintenance Status${NC}"
    echo ""

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        return 1
    fi

    # Check disk usage
    check_disk_usage
    echo ""

    # Show current usage
    echo "Current Docker system usage:"
    get_docker_system_usage
    echo ""

    # Show recommendations
    echo "Maintenance recommendations:"
    echo "- Run 'docker-maintenance.sh cleanup' weekly"
    echo "- Monitor disk usage with 'docker-maintenance.sh status'"
    echo "- Use 'docker-maintenance.sh optimize' for image optimization tips"
}

docker_maintenance_cleanup() {
    local dry_run=false
    local aggressive=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run) dry_run=true ;;
            --aggressive) aggressive=true ;;
            *) break ;;
        esac
        shift
    done

    print_header
    if [ "$dry_run" = true ]; then
        echo -e "${BOLD}Docker Maintenance - DRY RUN${NC}"
        echo "No changes will be made"
    elif [ "$aggressive" = true ]; then
        echo -e "${BOLD}Docker Maintenance - AGGRESSIVE CLEANUP${NC}"
        echo -e "${YELLOW}WARNING: This will remove more items including some that may be needed${NC}"
    else
        echo -e "${BOLD}Docker Maintenance - Standard Cleanup${NC}"
    fi
    echo ""

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        return 1
    fi

    local start_size
    start_size=$(get_docker_disk_usage)
    echo "Starting Docker VM disk size: ${start_size}GB"
    echo ""

    # Perform cleanup steps
    cleanup_containers "$dry_run"
    cleanup_images "$dry_run"
    cleanup_volumes "$dry_run"
    cleanup_build_cache "$dry_run"
    cleanup_networks "$dry_run"
    cleanup_logs "$dry_run"

    if [ "$aggressive" = true ] && [ "$dry_run" = false ]; then
        echo ""
        log_step "Performing aggressive cleanup..."
        docker system prune -a -f
        docker volume prune -f
        echo "Aggressive cleanup completed"
    fi

    echo ""
    local end_size
    end_size=$(get_docker_disk_usage)
    local saved=$((start_size - end_size))

    if [ "$saved" -gt 0 ]; then
        echo -e "${GREEN}✓ Cleanup completed - saved ${saved}GB of disk space${NC}"
    elif [ "$dry_run" = true ]; then
        echo -e "${CYAN}DRY RUN completed - no changes made${NC}"
    else
        echo -e "${GREEN}✓ Cleanup completed - no space reclaimed (already clean)${NC}"
    fi

    echo ""
    echo "Final Docker VM disk size: ${end_size}GB"
}

docker_maintenance_optimize() {
    print_header
    echo -e "${BOLD}Docker Optimization Recommendations${NC}"
    echo ""

    optimize_images true

    echo ""
    echo "Additional optimization strategies:"
    echo "1. Use .dockerignore files to exclude unnecessary files"
    echo "2. Use Docker layer caching effectively"
    echo "3. Regularly clean up development containers"
    echo "4. Use docker system prune in CI/CD pipelines"
    echo "5. Implement log rotation in container configurations"
    echo "6. Use named volumes instead of bind mounts when possible"
    echo "7. Regularly audit and remove unused images"
}

docker_maintenance_monitor() {
    print_header
    echo -e "${BOLD}Docker Disk Usage Monitor${NC}"
    echo ""

    # Continuous monitoring for a short period
    echo "Monitoring Docker disk usage for 30 seconds..."
    echo "Press Ctrl+C to stop"
    echo ""

    local start_time
    start_time=$(date +%s)

    while true; do
        local current_time
        current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt 30 ]; then
            break
        fi

        local usage
        usage=$(get_docker_disk_usage)
        echo "$(date '+%H:%M:%S'): ${usage}GB"

        sleep 5
    done

    echo ""
    echo "Monitoring complete"
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

main() {
    local command="${1:-status}"

    case "$command" in
        status)
            docker_maintenance_status
            ;;
        cleanup)
            shift
            docker_maintenance_cleanup "$@"
            ;;
        optimize)
            docker_maintenance_optimize
            ;;
        monitor)
            docker_maintenance_monitor
            ;;
        --help|-h)
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  status          Show current Docker maintenance status"
            echo "  cleanup         Perform standard Docker cleanup"
            echo "  optimize        Show optimization recommendations"
            echo "  monitor         Monitor disk usage for 30 seconds"
            echo ""
            echo "Options:"
            echo "  --dry-run       Show what would be cleaned without doing it"
            echo "  --aggressive    Perform more aggressive cleanup (use with caution)"
            echo ""
            echo "Examples:"
            echo "  $0 status"
            echo "  $0 cleanup --dry-run"
            echo "  $0 cleanup --aggressive"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Use '$0 --help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"