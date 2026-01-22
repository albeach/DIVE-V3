#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Backup Utilities Module (Consolidated)
# =============================================================================
# Database and configuration backup/restore operations
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# NEW module for backup operations
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_BACKUP_LOADED" ] && return 0
export DIVE_UTILITIES_BACKUP_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

BACKUP_DIR="${DIVE_ROOT}/backups"

# =============================================================================
# BACKUP FUNCTIONS
# =============================================================================

##
# Create full backup
#
# Arguments:
#   $1 - Target: "hub", instance code, or "all"
##
backup_create() {
    local target="${1:-all}"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="${BACKUP_DIR}/${target}_${timestamp}"

    mkdir -p "$backup_path"

    log_info "Creating backup for $target..."

    if [ "$target" = "hub" ] || [ "$target" = "all" ]; then
        backup_hub "$backup_path"
    fi

    if [ "$target" = "all" ]; then
        for spoke_dir in "${DIVE_ROOT}/instances"/*/; do
            [ -d "$spoke_dir" ] || continue
            local code=$(basename "$spoke_dir")
            backup_spoke "$code" "$backup_path"
        done
    elif [ "$target" != "hub" ]; then
        backup_spoke "$target" "$backup_path"
    fi

    # Create archive
    local archive="${BACKUP_DIR}/${target}_${timestamp}.tar.gz"
    tar -czf "$archive" -C "$BACKUP_DIR" "${target}_${timestamp}"
    rm -rf "$backup_path"

    log_success "Backup created: $archive"
    echo "$archive"
}

##
# Backup Hub databases and configuration
##
backup_hub() {
    local backup_path="$1"
    local hub_path="${backup_path}/hub"

    mkdir -p "$hub_path"

    log_verbose "Backing up Hub..."

    # PostgreSQL dump
    if docker ps --format '{{.Names}}' | grep -q "^dive-hub-postgres$"; then
        log_verbose "Dumping Hub PostgreSQL..."
        docker exec dive-hub-postgres pg_dumpall -U postgres > "${hub_path}/postgres.sql" 2>/dev/null
    fi

    # MongoDB dump
    if docker ps --format '{{.Names}}' | grep -q "^dive-hub-mongodb$"; then
        log_verbose "Dumping Hub MongoDB..."
        docker exec dive-hub-mongodb mongodump --archive --gzip > "${hub_path}/mongodb.archive" 2>/dev/null
    fi

    # Configuration
    cp -r "${DIVE_ROOT}/data/hub/config" "${hub_path}/config" 2>/dev/null || true

    log_success "Hub backup complete"
}

##
# Backup Spoke databases and configuration
#
# Arguments:
#   $1 - Instance code
#   $2 - Backup path
##
backup_spoke() {
    local instance_code="$1"
    local backup_path="$2"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_path="${backup_path}/${code_lower}"

    mkdir -p "$spoke_path"

    log_verbose "Backing up Spoke $code_upper..."

    # PostgreSQL dump
    local pg_container="dive-spoke-${code_lower}-postgres"
    if docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        log_verbose "Dumping $code_upper PostgreSQL..."
        docker exec "$pg_container" pg_dumpall -U postgres > "${spoke_path}/postgres.sql" 2>/dev/null
    fi

    # MongoDB dump
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        log_verbose "Dumping $code_upper MongoDB..."
        docker exec "$mongo_container" mongodump --archive --gzip > "${spoke_path}/mongodb.archive" 2>/dev/null
    fi

    # Configuration
    cp "${DIVE_ROOT}/instances/${code_lower}/config.json" "${spoke_path}/" 2>/dev/null || true
    cp -r "${DIVE_ROOT}/instances/${code_lower}/certs" "${spoke_path}/" 2>/dev/null || true

    log_success "Spoke $code_upper backup complete"
}

##
# Restore from backup
#
# Arguments:
#   $1 - Backup file path
##
backup_restore() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    log_warn "Restoring from backup: $backup_file"
    log_warn "This will overwrite existing data!"

    read -p "Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        return 0
    fi

    local temp_dir=$(mktemp -d)
    tar -xzf "$backup_file" -C "$temp_dir"

    local backup_name=$(ls "$temp_dir")
    local backup_path="${temp_dir}/${backup_name}"

    # Restore Hub if present
    if [ -d "${backup_path}/hub" ]; then
        restore_hub "${backup_path}/hub"
    fi

    # Restore Spokes if present
    for spoke_dir in "${backup_path}"/*/; do
        [ -d "$spoke_dir" ] || continue
        local code=$(basename "$spoke_dir")
        [ "$code" = "hub" ] && continue

        restore_spoke "$code" "$spoke_dir"
    done

    rm -rf "$temp_dir"

    log_success "Restore complete"
}

##
# Restore Hub from backup
##
restore_hub() {
    local backup_path="$1"

    log_info "Restoring Hub..."

    # PostgreSQL restore
    if [ -f "${backup_path}/postgres.sql" ]; then
        log_verbose "Restoring Hub PostgreSQL..."
        docker exec -i dive-hub-postgres psql -U postgres < "${backup_path}/postgres.sql" 2>/dev/null
    fi

    # MongoDB restore
    if [ -f "${backup_path}/mongodb.archive" ]; then
        log_verbose "Restoring Hub MongoDB..."
        docker exec -i dive-hub-mongodb mongorestore --archive --gzip < "${backup_path}/mongodb.archive" 2>/dev/null
    fi

    log_success "Hub restore complete"
}

##
# Restore Spoke from backup
#
# Arguments:
#   $1 - Instance code
#   $2 - Backup path
##
restore_spoke() {
    local instance_code="$1"
    local backup_path="$2"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_info "Restoring Spoke $code_upper..."

    # PostgreSQL restore
    local pg_container="dive-spoke-${code_lower}-postgres"
    if [ -f "${backup_path}/postgres.sql" ] && docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        log_verbose "Restoring $code_upper PostgreSQL..."
        docker exec -i "$pg_container" psql -U postgres < "${backup_path}/postgres.sql" 2>/dev/null
    fi

    # MongoDB restore
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if [ -f "${backup_path}/mongodb.archive" ] && docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        log_verbose "Restoring $code_upper MongoDB..."
        docker exec -i "$mongo_container" mongorestore --archive --gzip < "${backup_path}/mongodb.archive" 2>/dev/null
    fi

    log_success "Spoke $code_upper restore complete"
}

##
# List available backups
##
backup_list() {
    echo "=== Available Backups ==="
    echo ""

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "No backups found in $BACKUP_DIR"
        return 0
    fi

    printf "%-40s %-10s %-20s\n" "BACKUP" "SIZE" "DATE"
    printf "%-40s %-10s %-20s\n" "──────" "────" "────"

    for backup in "${BACKUP_DIR}"/*.tar.gz; do
        [ -f "$backup" ] || continue

        local name=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$backup" 2>/dev/null || \
                    stat -c "%y" "$backup" 2>/dev/null | cut -d. -f1)

        printf "%-40s %-10s %-20s\n" "$name" "$size" "$date"
    done
}

##
# Delete old backups
#
# Arguments:
#   $1 - Keep count (default: 5)
##
backup_cleanup() {
    local keep="${1:-5}"

    log_info "Cleaning up old backups (keeping $keep most recent)..."

    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "No backup directory found"
        return 0
    fi

    local count=$(ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | wc -l)

    if [ "$count" -le "$keep" ]; then
        log_info "Only $count backups exist, nothing to clean"
        return 0
    fi

    local to_delete=$((count - keep))

    ls -1t "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | tail -n "$to_delete" | while read backup; do
        log_verbose "Deleting: $(basename "$backup")"
        rm -f "$backup"
    done

    log_success "Cleaned up $to_delete old backups"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f backup_create
export -f backup_hub
export -f backup_spoke
export -f backup_restore
export -f restore_hub
export -f restore_spoke
export -f backup_list
export -f backup_cleanup

log_verbose "Backup utilities module loaded"
