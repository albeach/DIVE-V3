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
    local backend_container="${BACKEND_CONTAINER:-$(container_name backend)}"

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

    local mongo_container
    mongo_container="dive-spoke-${instance_lower}-mongodb"

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

    if [ "${ztdf_count}" -lt "$((total_count * 98 / 100))" ]; then
        echo -e "${RED}✗ FAIL:${NC} Less than 98% of resources are ZTDF-encrypted"
        echo -e "  Expected: ${total_count}, Found: ${ztdf_count}"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}✓ PASS:${NC} ZTDF encryption coverage: $((ztdf_count * 100 / total_count))%"
    fi

    if [ "${locale_count}" -lt "$((ztdf_count * 95 / 100))" ]; then
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
