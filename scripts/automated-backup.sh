#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Automated Backup System
# =============================================================================
# Comprehensive backup solution for production DIVE V3 deployments
# Supports MongoDB, PostgreSQL, configuration files, and encryption
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-17
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_ROOT="${DIVE_ROOT}/backups"
BACKUP_RETENTION_DAYS=30
BACKUP_PREFIX="dive-v3-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${DIVE_ROOT}/logs/backup-$(date +%Y%m%d).log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

create_backup_dir() {
    local backup_dir="$1"
    mkdir -p "$backup_dir"
    chmod 700 "$backup_dir"
}

# =============================================================================
# DATABASE BACKUP FUNCTIONS
# =============================================================================

backup_mongodb() {
    local backup_dir="$1"
    local container_name="${2:-dive-hub-mongodb}"

    log_info "Starting MongoDB backup..."

    local mongo_backup_dir="$backup_dir/mongodb"
    create_backup_dir "$mongo_backup_dir"

    # Get MongoDB credentials
    local mongo_user="admin"
    local mongo_password
    mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

    if [ -z "$mongo_password" ]; then
        log_error "MongoDB password not found in environment"
        return 1
    fi

    # Create backup using mongodump
    if docker exec "$container_name" mongodump \
        --username "$mongo_user" \
        --password "$mongo_password" \
        --authenticationDatabase admin \
        --db dive-v3-hub \
        --out /tmp/mongodb-backup; then

        # Copy backup from container
        docker cp "$container_name:/tmp/mongodb-backup" "$mongo_backup_dir/"

        # Clean up container
        docker exec "$container_name" rm -rf /tmp/mongodb-backup

        log_success "MongoDB backup completed: $mongo_backup_dir"
        return 0
    else
        log_error "MongoDB backup failed"
        return 1
    fi
}

backup_postgresql() {
    local backup_dir="$1"
    local container_name="${2:-dive-hub-postgres}"

    log_info "Starting PostgreSQL backup..."

    local postgres_backup_file="$backup_dir/postgresql/keycloak_db.sql"
    create_backup_dir "$(dirname "$postgres_backup_file")"

    # Get PostgreSQL credentials
    local postgres_password
    postgres_password=$(grep "^POSTGRES_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

    if [ -z "$postgres_password" ]; then
        log_error "PostgreSQL password not found in environment"
        return 1
    fi

    # Create backup using pg_dump
    if docker exec -e PGPASSWORD="$postgres_password" "$container_name" \
        pg_dump -U postgres -d keycloak_db > "$postgres_backup_file"; then

        log_success "PostgreSQL backup completed: $postgres_backup_file"
        return 0
    else
        log_error "PostgreSQL backup failed"
        return 1
    fi
}

# =============================================================================
# CONFIGURATION BACKUP FUNCTIONS
# =============================================================================

backup_configuration() {
    local backup_dir="$1"

    log_info "Starting configuration backup..."

    local config_backup_dir="$backup_dir/configuration"
    create_backup_dir "$config_backup_dir"

    # Backup instance configurations
    if [ -d "${DIVE_ROOT}/instances" ]; then
        cp -r "${DIVE_ROOT}/instances" "$config_backup_dir/"
        log_info "Instance configurations backed up"
    fi

    # Backup terraform state (if exists)
    if [ -d "${DIVE_ROOT}/terraform" ]; then
        cp -r "${DIVE_ROOT}/terraform" "$config_backup_dir/"
        log_info "Terraform configurations backed up"
    fi

    # Backup docker-compose files
    find "${DIVE_ROOT}" -name "docker-compose*.yml" -exec cp {} "$config_backup_dir/" \;
    log_info "Docker Compose files backed up"

    # Backup environment files (excluding secrets)
    find "${DIVE_ROOT}" -name ".env*" -exec cp {} "$config_backup_dir/" \;
    log_info "Environment files backed up"

    log_success "Configuration backup completed: $config_backup_dir"
}

backup_certificates() {
    local backup_dir="$1"

    log_info "Starting certificate backup..."

    local cert_backup_dir="$backup_dir/certificates"
    create_backup_dir "$cert_backup_dir"

    # Backup certificates directory
    if [ -d "${DIVE_ROOT}/certs" ]; then
        cp -r "${DIVE_ROOT}/certs" "$cert_backup_dir/"
        log_info "Certificates backed up"
    fi

    # Backup OPAL keys
    if [ -d "${DIVE_ROOT}/certs/opal" ]; then
        cp -r "${DIVE_ROOT}/certs/opal" "$cert_backup_dir/"
        log_info "OPAL keys backed up"
    fi

    log_success "Certificate backup completed: $cert_backup_dir"
}

# =============================================================================
# BACKUP ARCHIVING AND ENCRYPTION
# =============================================================================

create_backup_archive() {
    local backup_dir="$1"
    local archive_file="$2"

    log_info "Creating backup archive: $archive_file"

    # Create compressed archive
    if cd "$backup_dir" && tar -czf "$archive_file" .; then
        log_success "Backup archive created: $archive_file"

        # Calculate and log archive size
        local size
        size=$(du -sh "$archive_file" | cut -f1)
        log_info "Archive size: $size"

        return 0
    else
        log_error "Failed to create backup archive"
        return 1
    fi
}

encrypt_backup() {
    local archive_file="$1"
    local encrypted_file="$2"

    log_info "Encrypting backup archive..."

    # Generate encryption key if not exists
    local key_file="${DIVE_ROOT}/certs/backup-key.pem"
    if [ ! -f "$key_file" ]; then
        openssl rand -base64 32 > "$key_file"
        chmod 600 "$key_file"
        log_info "Generated new backup encryption key"
    fi

    # Encrypt using AES-256-CBC
    if openssl enc -aes-256-cbc -salt -in "$archive_file" -out "$encrypted_file" -kfile "$key_file"; then
        # Remove unencrypted archive
        rm -f "$archive_file"
        log_success "Backup encrypted: $encrypted_file"
        return 0
    else
        log_error "Backup encryption failed"
        return 1
    fi
}

# =============================================================================
# BACKUP CLEANUP AND RETENTION
# =============================================================================

cleanup_old_backups() {
    local backup_root="$1"
    local retention_days="$2"

    log_info "Cleaning up backups older than $retention_days days..."

    local deleted_count=0

    # Find and remove old backup files
    while IFS= read -r -d '' old_backup; do
        if rm -rf "$old_backup"; then
            ((deleted_count++))
            log_info "Removed old backup: $old_backup"
        fi
    done < <(find "$backup_root" -name "dive-v3-*.tar.gz.enc" -mtime +"$retention_days" -print0)

    log_success "Cleanup completed: $deleted_count old backups removed"
}

# =============================================================================
# BACKUP VERIFICATION
# =============================================================================

verify_backup() {
    local backup_file="$1"

    log_info "Verifying backup integrity: $backup_file"

    # Check file exists and is readable
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file does not exist: $backup_file"
        return 1
    fi

    # Check file size
    local size
    size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    if [ "$size" -eq 0 ]; then
        log_error "Backup file is empty: $backup_file"
        return 1
    fi

    log_info "Backup file size: $size bytes"
    log_success "Backup verification completed"
    return 0
}

# =============================================================================
# MAIN BACKUP FUNCTION
# =============================================================================

perform_backup() {
    local backup_type="${1:-full}"
    local encrypt="${2:-true}"

    log_info "Starting DIVE V3 backup (type: $backup_type)"

    # Create backup directory
    local backup_dir="$BACKUP_ROOT/$BACKUP_PREFIX"
    create_backup_dir "$backup_dir"

    local success=true

    # Perform backups based on type
    case "$backup_type" in
        full)
            backup_mongodb "$backup_dir" || success=false
            backup_postgresql "$backup_dir" || success=false
            backup_configuration "$backup_dir" || success=false
            backup_certificates "$backup_dir" || success=false
            ;;
        database)
            backup_mongodb "$backup_dir" || success=false
            backup_postgresql "$backup_dir" || success=false
            ;;
        config)
            backup_configuration "$backup_dir" || success=false
            backup_certificates "$backup_dir" || success=false
            ;;
        *)
            log_error "Unknown backup type: $backup_type"
            exit 1
            ;;
    esac

    if [ "$success" = false ]; then
        log_error "Some backup operations failed"
        exit 1
    fi

    # Create and optionally encrypt archive
    local archive_file="$BACKUP_ROOT/${BACKUP_PREFIX}.tar.gz"
    create_backup_archive "$backup_dir" "$archive_file"

    if [ "$encrypt" = true ]; then
        local encrypted_file="${archive_file}.enc"
        encrypt_backup "$archive_file" "$encrypted_file"
        archive_file="$encrypted_file"
    fi

    # Verify backup
    verify_backup "$archive_file"

    # Cleanup temporary directory
    rm -rf "$backup_dir"

    # Cleanup old backups
    cleanup_old_backups "$BACKUP_ROOT" "$BACKUP_RETENTION_DAYS"

    log_success "DIVE V3 backup completed successfully: $archive_file"
    echo "Backup completed: $archive_file"
}

# =============================================================================
# RESTORE FUNCTIONALITY
# =============================================================================

restore_backup() {
    local backup_file="$1"
    local restore_type="${2:-full}"

    log_info "Starting DIVE V3 restore from: $backup_file"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file does not exist: $backup_file"
        exit 1
    fi

    # Create temporary restore directory
    local restore_dir="${DIVE_ROOT}/restore-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$restore_dir"

    # Decrypt if needed
    local archive_file="$backup_file"
    if [[ "$backup_file" == *.enc ]]; then
        log_info "Decrypting backup..."
        local decrypted_file="${backup_file%.enc}"
        local key_file="${DIVE_ROOT}/certs/backup-key.pem"

        if [ ! -f "$key_file" ]; then
            log_error "Backup encryption key not found: $key_file"
            exit 1
        fi

        openssl enc -d -aes-256-cbc -in "$backup_file" -out "$decrypted_file" -kfile "$key_file"
        archive_file="$decrypted_file"
    fi

    # Extract archive
    log_info "Extracting backup archive..."
    tar -xzf "$archive_file" -C "$restore_dir"

    # Clean up decrypted file if it was temporary
    if [[ "$backup_file" == *.enc ]]; then
        rm -f "$archive_file"
    fi

    log_success "Backup extracted to: $restore_dir"
    echo "Restore preparation completed. Manual intervention required for:"
    echo "  - Database restoration"
    echo "  - Service restart"
    echo "  - Configuration validation"
    echo ""
    echo "Extracted files available at: $restore_dir"
}

# =============================================================================
# COMMAND LINE INTERFACE
# =============================================================================

show_usage() {
    cat << EOF
DIVE V3 Automated Backup System

Usage: $0 <command> [options]

Commands:
    backup [type] [encrypt]  - Create backup
        type: full (default), database, config
        encrypt: true (default), false

    restore <file> [type]    - Restore from backup
        file: path to backup file (.tar.gz or .tar.gz.enc)
        type: full (default), database, config

    cleanup [days]          - Clean up old backups
        days: retention period in days (default: 30)

    list                    - List available backups

    verify <file>           - Verify backup integrity

Examples:
    $0 backup                    # Full encrypted backup
    $0 backup database false     # Database backup, no encryption
    $0 restore /path/to/backup.tar.gz.enc
    $0 cleanup 7                 # Keep only last 7 days
    $0 list                      # Show available backups

Backup files are stored in: $BACKUP_ROOT
Logs are written to: $LOG_FILE
EOF
}

main() {
    # Ensure backup directory exists
    mkdir -p "$BACKUP_ROOT"

    case "${1:-help}" in
        backup)
            perform_backup "${2:-full}" "${3:-true}"
            ;;
        restore)
            if [ -z "${2:-}" ]; then
                echo "Error: Backup file required for restore"
                exit 1
            fi
            restore_backup "$2" "${3:-full}"
            ;;
        cleanup)
            cleanup_old_backups "$BACKUP_ROOT" "${2:-$BACKUP_RETENTION_DAYS}"
            ;;
        list)
            echo "Available backups in $BACKUP_ROOT:"
            find "$BACKUP_ROOT" -name "dive-v3-*.tar.gz*" -type f -printf "%T@ %s %p\n" | \
                sort -nr | head -20 | while read -r line; do
                local timestamp size filepath
                timestamp=$(echo "$line" | cut -d' ' -f1)
                size=$(echo "$line" | cut -d' ' -f2)
                filepath=$(echo "$line" | cut -d' ' -f3-)
                printf "%-20s %8s %s\n" "$(date -d "@$timestamp" '+%Y-%m-%d %H:%M')" "$(numfmt --to=iec-i --suffix=B "$size")" "$filepath"
            done
            ;;
        verify)
            if [ -z "${2:-}" ]; then
                echo "Error: Backup file required for verification"
                exit 1
            fi
            verify_backup "$2"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo "Unknown command: $1"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

main "$@"