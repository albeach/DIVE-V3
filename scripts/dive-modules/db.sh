#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Database Commands Module
# =============================================================================
# Commands: seed, backup, restore
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DATABASE COMMANDS
# =============================================================================

cmd_seed() {
    local instance="${1:-$INSTANCE}"
    
    log_step "Seeding database for $(upper "$instance")..."
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend)}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npm run seed:$instance"
        return 0
    fi
    
    docker exec "$backend_container" npm run seed 2>/dev/null || {
        log_warn "npm run seed failed, trying alternative..."
        docker exec "$backend_container" node dist/scripts/seed-resources.js 2>/dev/null || {
            log_error "Seeding failed"
            return 1
        }
    }
    
    log_success "Database seeded"
}

cmd_backup() {
    ensure_dive_root
    local backup_dir
    backup_dir="${DIVE_ROOT}/backups/$(date +%Y%m%d_%H%M%S)"
    
    log_step "Creating backup in $backup_dir..."
    
    local postgres_container="${POSTGRES_CONTAINER:-$(container_name postgres)}"
    local mongo_container="${MONGO_CONTAINER:-$(container_name mongo)}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "mkdir -p $backup_dir"
        log_dry "docker exec ${postgres_container} pg_dumpall -U postgres > $backup_dir/postgres.sql"
        log_dry "docker exec ${mongo_container} mongodump --archive > $backup_dir/mongo.archive"
        return 0
    fi
    
    mkdir -p "$backup_dir"
    
    # PostgreSQL
    log_info "Backing up PostgreSQL..."
    docker exec "$postgres_container" pg_dumpall -U postgres > "$backup_dir/postgres.sql" 2>/dev/null || log_warn "PostgreSQL backup failed"
    
    # MongoDB
    log_info "Backing up MongoDB..."
    docker exec "$mongo_container" mongodump --archive="$backup_dir/mongo.archive" 2>/dev/null || log_warn "MongoDB backup failed"
    
    log_success "Backup created: $backup_dir"
    ls -la "$backup_dir"
}

cmd_restore() {
    local backup_dir="$1"
    
    ensure_dive_root
    
    if [ -z "$backup_dir" ]; then
        echo "Usage: ./dive restore <backup-dir>"
        echo ""
        echo "Available backups:"
        find "${DIVE_ROOT}/backups/" -maxdepth 1 -type d -print 2>/dev/null | sort | tail -10
        return 1
    fi
    
    # Handle relative paths
    if [[ ! "$backup_dir" = /* ]]; then
        backup_dir="${DIVE_ROOT}/$backup_dir"
    fi
    
    if [ ! -d "$backup_dir" ]; then
        log_error "Backup directory not found: $backup_dir"
        return 1
    fi
    
    log_step "Restoring from $backup_dir..."
    
    local postgres_container="${POSTGRES_CONTAINER:-$(container_name postgres)}"
    local mongo_container="${MONGO_CONTAINER:-$(container_name mongo)}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec -i ${postgres_container} psql -U postgres < $backup_dir/postgres.sql"
        log_dry "docker exec ${mongo_container} mongorestore --archive=$backup_dir/mongo.archive"
        return 0
    fi
    
    # PostgreSQL
    if [ -f "$backup_dir/postgres.sql" ]; then
        log_info "Restoring PostgreSQL..."
        docker exec -i "$postgres_container" psql -U postgres < "$backup_dir/postgres.sql" 2>/dev/null || log_warn "PostgreSQL restore failed"
    fi
    
    # MongoDB
    if [ -f "$backup_dir/mongo.archive" ]; then
        log_info "Restoring MongoDB..."
        docker exec "$mongo_container" mongorestore --archive="$backup_dir/mongo.archive" --drop 2>/dev/null || log_warn "MongoDB restore failed"
    fi
    
    log_success "Restore complete"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_db() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        seed)    cmd_seed "$@" ;;
        backup)  cmd_backup ;;
        restore) cmd_restore "$@" ;;
        *)       module_db_help ;;
    esac
}

module_db_help() {
    echo -e "${BOLD}Database Commands:${NC}"
    echo "  seed [instance]     Seed database with test data"
    echo "  backup              Create database backup"
    echo "  restore <dir>       Restore from backup"
}






