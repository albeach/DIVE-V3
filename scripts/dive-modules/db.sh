#!/usr/local/bin/bash
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
    local count="${1:-5000}"
    local instance_arg="${2:-$INSTANCE}"
    local instance
    instance=$(upper "$instance_arg")

    log_step "Seeding ${count} ZTDF-encrypted resources for ${instance}..."
    # Pass instance to container_name for correct hub/spoke prefix resolution
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend "$instance")}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npm run seed:instance -- --instance=${instance} --count=${count} --replace"
        return 0
    fi

    # Ensure backend container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_error "Backend container '${backend_container}' is not running"
        return 1
    fi

    # Run ZTDF seeding script
    log_info "Using ZTDF seeding script with locale-aware classifications..."
    if ! docker exec "$backend_container" npm run seed:instance -- \
        --instance="${instance}" \
        --count="${count}" \
        --replace 2>&1; then
        log_error "ZTDF seeding failed"
        return 1
    fi

    log_success "Database seeded with ${count} ZTDF-encrypted resources"

    # Auto-verify
    cmd_seed_verify "$instance"
}

cmd_seed_verify() {
    local instance_arg="${1:-$INSTANCE}"
    local instance
    instance=$(upper "$instance_arg")
    local instance_lower
    instance_lower=$(lower "$instance")

    log_step "Verifying ZTDF encryption for ${instance}..."

    # Use container_name for correct hub/spoke prefix resolution
    local mongo_container
    mongo_container=$(container_name mongodb "$instance")

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${mongo_container} mongosh --eval 'db.resources.countDocuments()'"
        return 0
    fi

    # Check container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        log_error "MongoDB container '${mongo_container}' is not running"
        return 1
    fi

    # Get MongoDB password
    local mongo_pass
    mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")

    local mongo_uri="mongodb://localhost:27017/dive-v3-${instance_lower}?authSource=admin"
    if [ -n "$mongo_pass" ]; then
        mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/dive-v3-${instance_lower}?authSource=admin"
    fi

    # Count total resources
    local total_count
    total_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

    # Count ZTDF-encrypted resources
    local ztdf_count
    ztdf_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

    # Count resources with originalClassification
    local locale_count
    locale_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({ 'ztdf.policy.securityLabel.originalClassification': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

    # Count plaintext (legacy) resources
    local plaintext_count
    plaintext_count=$((total_count - ztdf_count))

    echo ""
    echo -e "${BOLD}📊 Seed Verification Results (${instance}):${NC}"
    echo ""
    echo -e "  Total Resources:              ${BOLD}${total_count}${NC}"
    echo -e "  ZTDF Encrypted:               ${BOLD}${ztdf_count}${NC} ${GREEN}✓${NC}"
    echo -e "  With Locale Classification:   ${BOLD}${locale_count}${NC} ${GREEN}✓${NC}"
    echo -e "  Legacy Plaintext:             ${BOLD}${plaintext_count}${NC}"
    echo ""

    # Validation checks
    local errors=0

    # Handle empty database case (no documents seeded yet)
    if [ "${total_count:-0}" -eq 0 ]; then
        echo -e "${YELLOW}⚠ INFO:${NC} No documents in database - initial deployment or seeding not run yet"
        echo ""
        return 0
    fi

    if [ "${ztdf_count}" -lt "$((total_count * 98 / 100))" ]; then
        echo -e "${RED}✗ FAIL:${NC} Less than 98% of resources are ZTDF-encrypted"
        echo -e "  Expected: ${total_count}, Found: ${ztdf_count}"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}✓ PASS:${NC} ZTDF encryption coverage: $((ztdf_count * 100 / total_count))%"
    fi

    if [ "${ztdf_count:-0}" -eq 0 ]; then
        echo -e "${YELLOW}⚠ WARNING:${NC} No ZTDF resources to check locale classifications"
    elif [ "${locale_count}" -lt "$((ztdf_count * 95 / 100))" ]; then
        echo -e "${YELLOW}⚠ WARNING:${NC} Less than 95% of ZTDF resources have locale classifications"
        echo -e "  Expected: ${ztdf_count}, Found: ${locale_count}"
    else
        echo -e "${GREEN}✓ PASS:${NC} Locale classification coverage: $((locale_count * 100 / ztdf_count))%"
    fi

    if [ "${plaintext_count}" -gt 0 ]; then
        echo -e "${YELLOW}⚠ WARNING:${NC} Found ${plaintext_count} plaintext resources (should be 0 for new deployments)"
    fi

    echo ""

    if [ "$errors" -gt 0 ]; then
        log_error "Verification failed with ${errors} error(s)"
        return 1
    fi

    log_success "Verification passed"
    return 0
}

cmd_backup() {
    ensure_dive_root
    local backup_dir
    backup_dir="${DIVE_ROOT}/backups/$(date +%Y%m%d_%H%M%S)"

    log_step "Creating backup in $backup_dir..."

    # Determine container names - handle hub vs spoke environments
    local postgres_container
    local mongo_container

    if [ "$COMMAND" = "hub" ] || [ "${COMPOSE_PROJECT_NAME:-}" = "dive-hub" ]; then
        # Hub environment uses dive-hub-* containers
        postgres_container="${COMPOSE_PROJECT_NAME:-dive-hub}-postgres"
        mongo_container="${COMPOSE_PROJECT_NAME:-dive-hub}-mongodb"
    else
        # Spoke environment uses dive-v3-* containers
        postgres_container="${POSTGRES_CONTAINER:-$(container_name postgres)}"
        mongo_container="${MONGO_CONTAINER:-$(container_name mongo)}"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "mkdir -p $backup_dir"
        log_dry "docker exec ${postgres_container} pg_dumpall -U postgres > $backup_dir/postgres.sql"
        log_dry "docker exec ${mongo_container} mongodump --username admin --password '***' --authenticationDatabase admin --archive=$backup_dir/mongo.archive --db dive-v3"
        return 0
    fi

    mkdir -p "$backup_dir"

    # PostgreSQL backup
    log_info "Backing up PostgreSQL..."
    if docker exec "$postgres_container" pg_dumpall -U postgres > "$backup_dir/postgres.sql" 2>/dev/null; then
        log_success "PostgreSQL backup completed ($(stat -f%z "$backup_dir/postgres.sql" 2>/dev/null || echo "size unknown") bytes)"
    else
        log_warn "PostgreSQL backup failed"
    fi

    # MongoDB backup with authentication
    log_info "Backing up MongoDB..."
    local mongo_password
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        # Hub environment - get password from .env.hub
        mongo_password=$(grep "MONGO_PASSWORD=" "${DIVE_ROOT}/.env.hub" | cut -d'=' -f2)
    else
        # Spoke environment - try to get from environment or secrets
        mongo_password="${MONGO_PASSWORD:-$(get_secret_value mongodb-$INSTANCE 2>/dev/null || echo 'admin')}"
    fi

    if docker exec "$mongo_container" mongodump \
        --username admin \
        --password "$mongo_password" \
        --authenticationDatabase admin \
        --archive \
        --db dive-v3 > "$backup_dir/mongo.archive" 2>/dev/null; then
        log_success "MongoDB backup completed ($(stat -f%z "$backup_dir/mongo.archive" 2>/dev/null || echo "size unknown") bytes)"
    else
        log_warn "MongoDB backup failed"
    fi

    log_success "Backup created: $backup_dir"
    ls -la "$backup_dir"

    # Verify backup integrity
    if [ -s "$backup_dir/postgres.sql" ] && [ -s "$backup_dir/mongo.archive" ]; then
        log_success "Backup verification passed - both databases backed up successfully"
    else
        log_warn "Backup verification failed - some databases may not have been backed up properly"
    fi
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

    # Determine container names - handle hub vs spoke environments
    local postgres_container
    local mongo_container

    if [ "$COMMAND" = "hub" ] || [ "${COMPOSE_PROJECT_NAME:-}" = "dive-hub" ]; then
        # Hub environment uses dive-hub-* containers
        postgres_container="${COMPOSE_PROJECT_NAME:-dive-hub}-postgres"
        mongo_container="${COMPOSE_PROJECT_NAME:-dive-hub}-mongodb"
    else
        # Spoke environment uses dive-v3-* containers
        postgres_container="${POSTGRES_CONTAINER:-$(container_name postgres)}"
        mongo_container="${MONGO_CONTAINER:-$(container_name mongo)}"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec -i ${postgres_container} psql -U postgres < $backup_dir/postgres.sql"
        log_dry "docker exec ${mongo_container} mongorestore --username admin --password '***' --authenticationDatabase admin --archive=$backup_dir/mongo.archive --drop"
        return 0
    fi

    # PostgreSQL restore
    if [ -f "$backup_dir/postgres.sql" ]; then
        log_info "Restoring PostgreSQL..."
        if docker exec -i "$postgres_container" psql -U postgres < "$backup_dir/postgres.sql" 2>/dev/null; then
            log_success "PostgreSQL restore completed"
        else
            log_warn "PostgreSQL restore failed"
        fi
    else
        log_warn "PostgreSQL backup file not found: $backup_dir/postgres.sql"
    fi

    # MongoDB restore with authentication
    if [ -f "$backup_dir/mongo.archive" ]; then
        log_info "Restoring MongoDB..."
        local mongo_password
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            # Hub environment - get password from .env.hub
            mongo_password=$(grep "MONGO_PASSWORD=" "${DIVE_ROOT}/.env.hub" | cut -d'=' -f2)
        else
            # Spoke environment - try to get from environment or secrets
            mongo_password="${MONGO_PASSWORD:-$(get_secret_value mongodb-$INSTANCE 2>/dev/null || echo 'admin')}"
        fi

        if docker exec -i "$mongo_container" mongorestore \
            --username admin \
            --password "$mongo_password" \
            --authenticationDatabase admin \
            --archive \
            --drop < "$backup_dir/mongo.archive" 2>/dev/null; then
            log_success "MongoDB restore completed"
        else
            log_warn "MongoDB restore failed"
        fi
    else
        log_warn "MongoDB backup file not found: $backup_dir/mongo.archive"
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
        seed)        cmd_seed "$@" ;;
        verify)      cmd_seed_verify "$@" ;;
        backup)      cmd_backup ;;
        restore)     cmd_restore "$@" ;;
        *)           module_db_help ;;
    esac
}

module_db_help() {
    echo -e "${BOLD}Database Commands:${NC}"
    echo ""
    echo "Usage:"
    echo "  ./dive seed [count] [instance]         Seed ZTDF-encrypted resources"
    echo "  ./dive --instance FRA seed              Seed 5000 docs to FRA"
    echo "  ./dive --instance USA seed 10000        Seed 10000 docs to USA"
    echo ""
    echo "Verification:"
    echo "  ./dive --instance <code> seed verify    Verify ZTDF encryption"
    echo ""
    echo "Backup/Restore:"
    echo "  ./dive backup                           Create database backup"
    echo "  ./dive restore <dir>                    Restore from backup"
    echo ""
    echo "Features:"
    echo "  - ZTDF encryption with AES-256-GCM"
    echo "  - Locale-aware classification labels (ACP-240 Section 4.3)"
    echo "  - Multi-KAS key access objects"
    echo "  - COI-based community keys"
    echo "  - Automatic verification after seeding"
}
