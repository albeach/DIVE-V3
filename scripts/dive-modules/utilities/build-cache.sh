#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Docker Build Cache Intelligence
# =============================================================================
# Computes per-service source hashes to skip unnecessary rebuilds.
# Tracks hashes in .dive-state/build-hashes/ and compares on each build.
#
# Usage:
#   build_cache_check_service "backend"    # Returns 0 if cache hit (skip), 1 if miss (build)
#   build_cache_save_all                   # Save current hashes after successful build
#   build_cache_status                     # Show cache status for all services
# =============================================================================

# Prevent multiple sourcing
if [ -n "${BUILD_CACHE_LOADED:-}" ]; then
    return 0
fi
export BUILD_CACHE_LOADED=1

# =============================================================================
# CONFIGURATION
# =============================================================================

BUILD_CACHE_DIR="${DIVE_ROOT:-.}/.dive-state/build-hashes"

# Services that require building (derived from docker-compose.hub.yml)
# Each entry: "service_name:build_context:dockerfile"
BUILD_CACHE_SERVICES=(
    "backend:backend:Dockerfile.dev"
    "frontend:frontend:Dockerfile.prod.optimized"
    "kas:kas:Dockerfile"
    "keycloak:keycloak:Dockerfile"
    "opal-server:docker:opal-server.Dockerfile"
    "opal-client:docker:opal-client.Dockerfile"
    "caddy:docker/caddy:Dockerfile"
)

# Files to hash per service (relative to build context)
# These are the key inputs that determine if a rebuild is needed
_build_cache_hash_files() {
    local service="$1"
    local context="$2"
    local dockerfile="$3"

    # Always include the Dockerfile
    local files=("${context}/${dockerfile}")

    case "$service" in
        backend)
            files+=(
                "backend/package.json"
                "backend/package-lock.json"
                "backend/tsconfig.json"
                "backend/src"
            )
            ;;
        frontend)
            files+=(
                "frontend/package.json"
                "frontend/package-lock.json"
                "frontend/tsconfig.json"
                "frontend/next.config.ts"
                "frontend/src"
            )
            ;;
        kas)
            files+=(
                "kas/package.json"
                "kas/package-lock.json"
                "kas/tsconfig.json"
                "kas/src"
            )
            ;;
        keycloak)
            files+=(
                "keycloak/themes"
                "keycloak/providers"
            )
            ;;
        opal-server|opal-client)
            files+=(
                "docker/${dockerfile}"
            )
            ;;
        caddy)
            files+=(
                "docker/caddy/Caddyfile"
                "docker/caddy/Caddyfile.dev"
            )
            ;;
    esac

    printf '%s\n' "${files[@]}"
}

# =============================================================================
# HASH COMPUTATION
# =============================================================================

##
# Compute a hash for a service's build inputs
#
# Arguments:
#   $1 - Service name
#   $2 - Build context (relative to DIVE_ROOT)
#   $3 - Dockerfile name
#
# Output:
#   MD5 hash string on stdout
##
build_cache_compute_hash() {
    local service="$1"
    local context="$2"
    local dockerfile="$3"
    local hash_input=""

    local files
    files=$(_build_cache_hash_files "$service" "$context" "$dockerfile")

    while IFS= read -r file; do
        local full_path="${DIVE_ROOT:-.}/${file}"
        if [ -d "$full_path" ]; then
            # For directories, hash all files recursively
            local dir_hash
            dir_hash=$(find "$full_path" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.json' -o -name '*.css' -o -name '*.html' -o -name '*.java' -o -name '*.ftl' -o -name 'Dockerfile*' -o -name 'Caddyfile*' \) -exec md5 -q {} \; 2>/dev/null | sort | md5 -q 2>/dev/null || echo "dir-miss")
            hash_input+="$dir_hash"
        elif [ -f "$full_path" ]; then
            local file_hash
            file_hash=$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | awk '{print $1}' || echo "file-miss")
            hash_input+="$file_hash"
        else
            hash_input+="missing-${file}"
        fi
    done <<< "$files"

    # Final hash of all inputs
    echo "$hash_input" | md5 -q 2>/dev/null || echo "$hash_input" | md5sum 2>/dev/null | awk '{print $1}'
}

# =============================================================================
# CACHE OPERATIONS
# =============================================================================

##
# Check if a service's build cache is current
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   0 - Cache hit (source unchanged, skip build)
#   1 - Cache miss (source changed, rebuild needed)
##
build_cache_check_service() {
    local service="$1"

    # Find service config
    local config=""
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        if [ "${entry%%:*}" = "$service" ]; then
            config="$entry"
            break
        fi
    done

    if [ -z "$config" ]; then
        return 1  # Unknown service, always build
    fi

    local context dockerfile
    IFS=: read -r _ context dockerfile <<< "$config"

    local current_hash
    current_hash=$(build_cache_compute_hash "$service" "$context" "$dockerfile")

    local cached_hash_file="${BUILD_CACHE_DIR}/${service}.hash"
    if [ -f "$cached_hash_file" ]; then
        local cached_hash
        cached_hash=$(cat "$cached_hash_file")
        if [ "$current_hash" = "$cached_hash" ]; then
            return 0  # Cache hit
        fi
    fi

    return 1  # Cache miss
}

##
# Save the current hash for a service
#
# Arguments:
#   $1 - Service name
##
build_cache_save_service() {
    local service="$1"

    local config=""
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        if [ "${entry%%:*}" = "$service" ]; then
            config="$entry"
            break
        fi
    done

    [ -z "$config" ] && return 0

    local context dockerfile
    IFS=: read -r _ context dockerfile <<< "$config"

    mkdir -p "$BUILD_CACHE_DIR"
    local current_hash
    current_hash=$(build_cache_compute_hash "$service" "$context" "$dockerfile")
    echo "$current_hash" > "${BUILD_CACHE_DIR}/${service}.hash"
}

##
# Save all service hashes after a successful build
##
build_cache_save_all() {
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        local service="${entry%%:*}"
        build_cache_save_service "$service"
    done
}

##
# Get list of services that need rebuilding
#
# Output:
#   Space-separated list of service names that need rebuilding
##
build_cache_get_stale() {
    local stale=""
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        local service="${entry%%:*}"
        if ! build_cache_check_service "$service"; then
            stale="${stale:+$stale }$service"
        fi
    done
    echo "$stale"
}

##
# Display cache status for all services
##
build_cache_status() {
    echo "  Build Cache Status:"
    echo "  ────────────────────────────────────"

    local cached=0
    local stale=0
    for entry in "${BUILD_CACHE_SERVICES[@]}"; do
        local service="${entry%%:*}"
        if build_cache_check_service "$service"; then
            echo "    $service: cached (skip)"
            cached=$((cached + 1))
        else
            echo "    $service: stale (rebuild)"
            stale=$((stale + 1))
        fi
    done
    echo "  ────────────────────────────────────"
    echo "  Total: ${cached} cached, ${stale} to rebuild"
}

##
# Invalidate cache for all services
##
build_cache_invalidate() {
    if [ -d "$BUILD_CACHE_DIR" ]; then
        rm -f "${BUILD_CACHE_DIR}"/*.hash 2>/dev/null || true
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f build_cache_compute_hash
export -f build_cache_check_service
export -f build_cache_save_service
export -f build_cache_save_all
export -f build_cache_get_stale
export -f build_cache_status
export -f build_cache_invalidate
