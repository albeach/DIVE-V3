#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Enhanced Cleanup Utilities
# =============================================================================
# Provides comprehensive cleanup with verbose logging and orphan detection
# =============================================================================

# Prevent multiple sourcing
if [ -n "${ENHANCED_CLEANUP_LOADED:-}" ]; then
    return 0
fi
export ENHANCED_CLEANUP_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

##
# Enhanced nuke command with comprehensive cleanup
#
# Features:
#   - Stops and removes all DIVE containers
#   - Removes all DIVE volumes (including orphaned)
#   - Removes all DIVE networks
#   - Removes DIVE Docker images (optional)
#   - Clears build cache (optional)
#   - Verbose logging of all operations
#
# Arguments:
#   --images       Also remove DIVE Docker images
#   --cache        Also prune Docker build cache
#   --force        Skip confirmation prompt
#   --dry-run      Show what would be removed without executing
##
enhanced_nuke() {
    local remove_images=false
    local prune_cache=false
    local force=false
    local dry_run=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --images)       remove_images=true; shift ;;
            --cache)        prune_cache=true; shift ;;
            --force)        force=true; shift ;;
            --dry-run)      dry_run=true; shift ;;
            *)              shift ;;
        esac
    done

    log_info "🧹 Enhanced Cleanup - Comprehensive DIVE System Removal"
    echo ""

    # Count existing resources
    local container_count=$(docker ps -aq --filter "name=dive" | wc -l | tr -d ' ')
    local volume_count=$(docker volume ls --filter "name=dive" -q | wc -l | tr -d ' ')
    local network_count=$(docker network ls --filter "name=dive" -q | wc -l | tr -d ' ')
    local image_count=$(docker images --filter "reference=*dive*" -q | wc -l | tr -d ' ')

    log_verbose "📊 Current DIVE Resources:"
    log_verbose "   Containers: $container_count"
    log_verbose "   Volumes: $volume_count"
    log_verbose "   Networks: $network_count"
    log_verbose "   Images: $image_count"
    echo ""

    # Show what will be removed
    if [ $container_count -gt 0 ]; then
        log_verbose "🔍 Containers to be removed:"
        docker ps -a --filter "name=dive" --format "   - {{.Names}} ({{.Image}}, {{.Status}})"
        echo ""
    fi

    if [ $volume_count -gt 0 ]; then
        log_verbose "🔍 Volumes to be removed:"
        docker volume ls --filter "name=dive" --format "   - {{.Name}}"
        echo ""
    fi

    if [ $network_count -gt 0 ]; then
        log_verbose "🔍 Networks to be removed:"
        docker network ls --filter "name=dive" --format "   - {{.Name}}"
        echo ""
    fi

    if [ "$remove_images" = true ] && [ $image_count -gt 0 ]; then
        log_verbose "🔍 Images to be removed:"
        docker images --filter "reference=*dive*" --format "   - {{.Repository}}:{{.Tag}} ({{.Size}})"
        echo ""
    fi

    # Confirmation prompt (unless forced)
    if [ "$force" != true ] && [ "$dry_run" != true ]; then
        log_warn "⚠️  This will permanently remove ALL DIVE resources!"
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Cleanup cancelled"
            return 1
        fi
        echo ""
    fi

    if [ "$dry_run" = true ]; then
        log_info "🔍 DRY-RUN MODE - No changes will be made"
        return 0
    fi

    # Step 1: Stop and remove all containers
    if [ $container_count -gt 0 ]; then
        log_step "Step 1: Stopping and removing containers..."

        # Stop containers first
        log_verbose "   Stopping containers..."
        docker ps -q --filter "name=dive" | while read -r cid; do
            local cname=$(docker inspect --format='{{.Name}}' "$cid" | sed 's/^\///')
            log_verbose "   - Stopping $cname"
            docker stop "$cid" >/dev/null 2>&1 || log_warn "     Failed to stop $cname"
        done

        # Remove containers
        log_verbose "   Removing containers..."
        docker ps -aq --filter "name=dive" | while read -r cid; do
            local cname=$(docker inspect --format='{{.Name}}' "$cid" | sed 's/^\///')
            log_verbose "   - Removing $cname"
            docker rm -f "$cid" >/dev/null 2>&1 || log_warn "     Failed to remove $cname"
        done

        log_success "✓ Removed $container_count container(s)"
        echo ""
    else
        log_verbose "✓ No containers to remove"
        echo ""
    fi

    # Step 2: Remove all volumes (including orphaned)
    if [ $volume_count -gt 0 ]; then
        log_step "Step 2: Removing volumes..."

        docker volume ls --filter "name=dive" -q | while read -r vol; do
            log_verbose "   - Removing volume: $vol"
            docker volume rm "$vol" >/dev/null 2>&1 || log_warn "     Failed to remove $vol (may be in use)"
        done

        log_success "✓ Removed $volume_count volume(s)"
        echo ""
    else
        log_verbose "✓ No volumes to remove"
        echo ""
    fi

    # Step 3: Remove networks
    if [ $network_count -gt 0 ]; then
        log_step "Step 3: Removing networks..."

        docker network ls --filter "name=dive" -q | while read -r net; do
            local netname=$(docker network inspect --format='{{.Name}}' "$net")
            log_verbose "   - Removing network: $netname"
            docker network rm "$net" >/dev/null 2>&1 || log_warn "     Failed to remove $netname"
        done

        log_success "✓ Removed $network_count network(s)"
        echo ""
    else
        log_verbose "✓ No networks to remove"
        echo ""
    fi

    # Step 4: Remove images (if requested)
    if [ "$remove_images" = true ] && [ $image_count -gt 0 ]; then
        log_step "Step 4: Removing images..."

        docker images --filter "reference=*dive*" -q | while read -r img; do
            local imgname=$(docker inspect --format='{{.RepoTags}}' "$img" | sed 's/\[//;s/\]//')
            log_verbose "   - Removing image: $imgname"
            docker rmi -f "$img" >/dev/null 2>&1 || log_warn "     Failed to remove $imgname"
        done

        log_success "✓ Removed $image_count image(s)"
        echo ""
    elif [ "$remove_images" = true ]; then
        log_verbose "✓ No images to remove"
        echo ""
    fi

    # Step 5: Prune build cache (if requested)
    if [ "$prune_cache" = true ]; then
        log_step "Step 5: Pruning Docker build cache..."

        local cache_freed=$(docker builder prune -f 2>&1 | grep "Total reclaimed space" || echo "0B")
        log_verbose "   $cache_freed"

        log_success "✓ Build cache pruned"
        echo ""
    fi

    # Step 6: Remove orphaned volumes (not matching dive* pattern)
    log_step "Checking for orphaned volumes..."
    local orphaned_count=$(docker volume ls -qf dangling=true | wc -l | tr -d ' ')

    if [ $orphaned_count -gt 0 ]; then
        log_verbose "   Found $orphaned_count orphaned volume(s):"
        docker volume ls -qf dangling=true | while read -r vol; do
            log_verbose "   - $vol"
        done
        echo ""

        read -p "Remove $orphaned_count orphaned volumes? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            docker volume prune -f >/dev/null 2>&1
            log_success "✓ Removed $orphaned_count orphaned volume(s)"
        else
            log_verbose "✓ Skipped orphaned volumes"
        fi
    else
        log_verbose "✓ No orphaned volumes found"
    fi
    echo ""

    # Final summary
    log_success "🎉 Enhanced cleanup complete!"
    echo ""
    log_verbose "📊 Final State:"
    log_verbose "   Containers: $(docker ps -aq --filter 'name=dive' | wc -l | tr -d ' ')"
    log_verbose "   Volumes: $(docker volume ls --filter 'name=dive' -q | wc -l | tr -d ' ')"
    log_verbose "   Networks: $(docker network ls --filter 'name=dive' -q | wc -l | tr -d ' ')"
    if [ "$remove_images" = true ]; then
        log_verbose "   Images: $(docker images --filter 'reference=*dive*' -q | wc -l | tr -d ' ')"
    fi
    echo ""

    return 0
}

##
# Clean up specific instance
#
# Arguments:
#   $1 - Instance code (USA, FRA, GBR, DEU, EST)
#   --volumes      Also remove volumes
#   --force        Skip confirmation
##
enhanced_cleanup_instance() {
    local instance_code="$1"
    shift

    local remove_volumes=false
    local force=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --volumes)  remove_volumes=true; shift ;;
            --force)    force=true; shift ;;
            *)          shift ;;
        esac
    done

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        return 1
    fi

    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    log_info "🧹 Cleaning up instance: $instance_code"
    echo ""

    # Count resources
    local container_count=$(docker ps -aq --filter "name=dive-spoke-${code_lower}" | wc -l | tr -d ' ')

    if [ $container_count -eq 0 ]; then
        log_verbose "✓ No containers found for $instance_code"
        return 0
    fi

    # Stop containers
    log_step "Stopping containers for $instance_code..."
    docker ps -q --filter "name=dive-spoke-${code_lower}" | while read -r cid; do
        local cname=$(docker inspect --format='{{.Name}}' "$cid" | sed 's/^\///')
        log_verbose "   - Stopping $cname"
        docker stop "$cid" >/dev/null 2>&1
    done

    # Remove containers
    log_step "Removing containers for $instance_code..."
    docker ps -aq --filter "name=dive-spoke-${code_lower}" | while read -r cid; do
        local cname=$(docker inspect --format='{{.Name}}' "$cid" | sed 's/^\///')
        log_verbose "   - Removing $cname"
        docker rm -f "$cid" >/dev/null 2>&1
    done

    log_success "✓ Removed $container_count container(s)"
    echo ""

    # Remove volumes if requested
    if [ "$remove_volumes" = true ]; then
        log_step "Removing volumes for $instance_code..."
        local volume_count=$(docker volume ls --filter "name=dive-spoke-${code_lower}" -q | wc -l | tr -d ' ')

        if [ $volume_count -gt 0 ]; then
            docker volume ls --filter "name=dive-spoke-${code_lower}" -q | while read -r vol; do
                log_verbose "   - Removing volume: $vol"
                docker volume rm "$vol" >/dev/null 2>&1
            done
            log_success "✓ Removed $volume_count volume(s)"
        else
            log_verbose "✓ No volumes to remove"
        fi
        echo ""
    fi

    log_success "🎉 Cleanup complete for $instance_code"
    return 0
}

# Export functions
export -f enhanced_nuke
export -f enhanced_cleanup_instance
