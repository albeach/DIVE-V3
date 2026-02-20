#!/bin/bash
set -e

# DIVE V3 Backup and Recovery Script
# Production-ready backup and restore functionality for all data stores
# Supports PostgreSQL, MongoDB, Redis, and configuration files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
BACKUP_ROOT="${BACKUP_ROOT:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${BACKUP_NAME:-dive-v3-backup-$TIMESTAMP}"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_NAME"

# Database credentials (from environment)
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
MONGO_PASSWORD="${MONGO_PASSWORD}"
REDIS_PASSWORD="${REDIS_PASSWORD}"

# Retention settings
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MAX_BACKUPS="${MAX_BACKUPS:-10}"

# Encryption settings (for production)
ENCRYPT_BACKUPS="${ENCRYPT_BACKUPS:-true}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# Automated backup settings
AUTO_BACKUP_ENABLED="${AUTO_BACKUP_ENABLED:-false}"
AUTO_BACKUP_SCHEDULE="${AUTO_BACKUP_SCHEDULE:-daily}"  # daily, weekly, monthly

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date +%Y-%m-%d\ %H:%M:%S) - $1"
}

# Automated backup scheduling
schedule_backup() {
    local schedule_type="$1"

    case "$schedule_type" in
        daily)
            # Create cron job for daily backups at 2 AM
            local cron_job
            cron_job="0 2 * * * $SCRIPT_DIR/backup-restore.sh backup --name daily-$(date +\\%Y\\%m\\%d)"
            ;;
        weekly)
            # Create cron job for weekly backups (Sunday at 2 AM)
            local cron_job
            cron_job="0 2 * * 0 $SCRIPT_DIR/backup-restore.sh backup --name weekly-$(date +\\%Y\\%m\\%d)"
            ;;
        monthly)
            # Create cron job for monthly backups (1st of month at 2 AM)
            local cron_job
            cron_job="0 2 1 * * $SCRIPT_DIR/backup-restore.sh backup --name monthly-$(date +\\%Y\\%m\\%d)"
            ;;
        *)
            log_error "Unknown schedule type: $schedule_type"
            echo "Supported types: daily, weekly, monthly"
            exit 1
            ;;
    esac

    # Add to crontab if not already present
    if ! crontab -l 2>/dev/null | grep -q "backup-restore.sh backup"; then
        (crontab -l 2>/dev/null; echo "$cron_job") | crontab -
        log_success "Automated backup scheduled: $schedule_type"
        log_info "Cron job added: $cron_job"
    else
        log_info "Automated backup already scheduled"
    fi
}

# Remove automated backup schedule
unschedule_backup() {
    if crontab -l 2>/dev/null | grep -q "backup-restore.sh backup"; then
        crontab -l 2>/dev/null | grep -v "backup-restore.sh backup" | crontab -
        log_success "Automated backup unscheduled"
    else
        log_info "No automated backup schedule found"
    fi
}

# Validate environment
validate_environment() {
    log_info "Validating environment and prerequisites..."

    # Check if running in Docker environment
    if [ ! -f "/.dockerenv" ]; then
        log_warning "Not running inside Docker container - some operations may not work"
    fi

    # Check required environment variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        log_error "POSTGRES_PASSWORD environment variable not set"
        exit 1
    fi

    if [ -z "$MONGO_PASSWORD" ]; then
        log_error "MONGO_PASSWORD environment variable not set"
        exit 1
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Test database connectivity
    if ! pg_isready -h postgres -U postgres >/dev/null 2>&1; then
        log_error "PostgreSQL is not accessible"
        exit 1
    fi

    if ! mongosh --host mongo --username admin --password "$MONGO_PASSWORD" --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
        log_error "MongoDB is not accessible"
        exit 1
    fi

    if ! redis-cli -h redis -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
        log_warning "Redis is not accessible - skipping Redis backup/restore"
    fi

    log_success "Environment validation complete"
}

# Create backup manifest
create_manifest() {
    local manifest_file="$BACKUP_DIR/manifest.json"

    cat > "$manifest_file" << EOF
{
    "backup_name": "$BACKUP_NAME",
    "timestamp": "$TIMESTAMP",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0.0",
    "components": {
        "postgresql": {
            "host": "postgres",
            "port": 5432,
            "databases": ["keycloak_db", "dive_v3_app"]
        },
        "mongodb": {
            "host": "mongo",
            "port": 27017,
            "databases": ["dive-v3"]
        },
        "redis": {
            "host": "redis",
            "port": 6379
        },
        "configuration": {
            "policies": "/policies",
            "keycloak_themes": "/keycloak/themes",
            "certs": "/certs"
        }
    },
    "metadata": {
        "retention_days": $RETENTION_DAYS,
        "created_by": "$(whoami)",
        "hostname": "$(hostname)"
    }
}
EOF

    log_info "Created backup manifest: $manifest_file"
}

# Backup PostgreSQL databases
backup_postgresql() {
    log_info "Starting PostgreSQL backup..."

    local pg_backup_dir="$BACKUP_DIR/postgresql"
    mkdir -p "$pg_backup_dir"

    # Backup keycloak_db
    log_info "Backing up keycloak_db..."
    pg_dump -h postgres -U postgres -d keycloak_db \
        --no-password \
        --format=custom \
        --compress=9 \
        --verbose \
        --file="$pg_backup_dir/keycloak_db.backup"

    # Backup dive_v3_app (if it exists)
    if psql -h postgres -U postgres -lqt | cut -d\| -f1 | grep -qw dive_v3_app; then
        log_info "Backing up dive_v3_app..."
        pg_dump -h postgres -U postgres -d dive_v3_app \
            --no-password \
            --format=custom \
            --compress=9 \
            --verbose \
            --file="$pg_backup_dir/dive_v3_app.backup"
    else
        log_warning "dive_v3_app database not found - skipping"
    fi

    # Create SQL dump for schema verification
    pg_dumpall -h postgres -U postgres --no-password --schema-only > "$pg_backup_dir/schema.sql"

    log_success "PostgreSQL backup complete"
}

# Backup MongoDB databases
backup_mongodb() {
    log_info "Starting MongoDB backup..."

    local mongo_backup_dir="$BACKUP_DIR/mongodb"
    mkdir -p "$mongo_backup_dir"

    # Use mongodump for consistent backup
    mongodump \
        --host mongo \
        --username admin \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --db dive-v3 \
        --out "$mongo_backup_dir" \
        --gzip \
        --verbose

    # Also create a metadata file with collection info
    mongosh --host mongo --username admin --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin --eval "
            db = db.getSiblingDB('dive-v3');
            print('MongoDB Collections:');
            db.getCollectionNames().forEach(function(collection) {
                var count = db[collection].countDocuments();
                print(collection + ': ' + count + ' documents');
            });
        " > "$mongo_backup_dir/collections.txt"

    log_success "MongoDB backup complete"
}

# Backup Redis data
backup_redis() {
    log_info "Starting Redis backup..."

    local redis_backup_dir="$BACKUP_DIR/redis"
    mkdir -p "$redis_backup_dir"

    # Save Redis data
    if redis-cli -h redis -a "$REDIS_PASSWORD" save >/dev/null 2>&1; then
        # Copy the dump file from Redis data directory
        cp /data/dump.rdb "$redis_backup_dir/dump.rdb"
        log_success "Redis backup complete"
    else
        log_warning "Redis save command failed - Redis may not be accessible"
    fi
}

# Backup configuration files
backup_configuration() {
    log_info "Starting configuration backup..."

    local config_backup_dir="$BACKUP_DIR/configuration"
    mkdir -p "$config_backup_dir"

    # Backup policies
    if [ -d "/policies" ]; then
        cp -r /policies "$config_backup_dir/"
    fi

    # Backup Keycloak themes
    if [ -d "/keycloak/themes" ]; then
        cp -r /keycloak/themes "$config_backup_dir/"
    fi

    # Backup certificates (excluding private keys for security)
    if [ -d "/certs" ]; then
        mkdir -p "$config_backup_dir/certs"
        # Only copy public certificates, not private keys
        find /certs \( -name "*.pem" -o -name "*.crt" -o -name "*.pub" \) -type f -exec cp {} "$config_backup_dir/certs/" \; 2>/dev/null || true
    fi

    # Backup environment variables (sanitized)
    env | grep -E "^(KEYCLOAK|MONGO|POSTGRES|REDIS|API|FRONTEND)_" | sed 's/=.*/=***SANITIZED***/' > "$config_backup_dir/sanitized_env.txt"

    log_success "Configuration backup complete"
}

# Encrypt backup (if enabled)
encrypt_backup() {
    local archive_path="$1"

    if [ "$ENCRYPT_BACKUPS" != "true" ]; then
        echo "$archive_path"
        return 0
    fi

    log_info "Encrypting backup..."

    # Generate or use existing encryption key
    local key_file="$BACKUP_ROOT/backup-key.pem"
    if [ ! -f "$key_file" ]; then
        if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
            echo -n "$BACKUP_ENCRYPTION_KEY" | openssl enc -base64 -d > "$key_file" 2>/dev/null || \
            echo -n "$BACKUP_ENCRYPTION_KEY" > "$key_file"
        else
            openssl rand -base64 32 > "$key_file"
        fi
        chmod 600 "$key_file"
        log_info "Generated backup encryption key"
    fi

    # Encrypt the archive
    local encrypted_archive="${archive_path}.enc"
    if openssl enc -aes-256-cbc -salt -in "$archive_path" -out "$encrypted_archive" -pass file:"$key_file"; then
        # Remove unencrypted archive
        rm -f "$archive_path"

        log_success "Backup encrypted: $encrypted_archive"
        echo "$encrypted_archive"
    else
        log_error "Backup encryption failed"
        echo "$archive_path"
    fi
}

# Compress backup
compress_backup() {
    log_info "Compressing backup..."

    local archive_name="$BACKUP_NAME.tar.gz"
    local archive_path="$BACKUP_ROOT/$archive_name"

    cd "$BACKUP_ROOT"
    tar -czf "$archive_name" "$BACKUP_NAME"

    # Calculate size
    local size
    size=$(du -sh "$archive_path" | cut -f1)
    log_success "Backup compressed: $archive_path ($size)"

    # Encrypt if enabled
    local final_archive
    final_archive=$(encrypt_backup "$archive_path")

    # Remove uncompressed directory
    rm -rf "$BACKUP_DIR"

    echo "$final_archive"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups (retention: ${RETENTION_DAYS} days, max: ${MAX_BACKUPS} backups)..."

    local backup_count=0
    local deleted_count=0

    # Find and sort backups by modification time (newest first)
    while IFS= read -r -d '' backup; do
        backup_count=$((backup_count + 1))

        # Check age
        local backup_age_days=$(( ($(date +%s) - $(stat -c %Y "$backup" 2>/dev/null || stat -f %m "$backup")) / 86400 ))

        if [ $backup_count -gt $MAX_BACKUPS ] || [ $backup_age_days -gt $RETENTION_DAYS ]; then
            log_info "Deleting old backup: $(basename "$backup") (age: ${backup_age_days} days)"
            rm -f "$backup"
            deleted_count=$((deleted_count + 1))
        fi
    done < <(find "$BACKUP_ROOT" -name "dive-v3-backup-*.tar.gz" -type f -print0 | xargs -0 ls -t)

    if [ $deleted_count -gt 0 ]; then
        log_success "Cleaned up $deleted_count old backups"
    else
        log_info "No old backups to clean up"
    fi
}

# Perform backup
perform_backup() {
    log_info "Starting DIVE V3 backup: $BACKUP_NAME"
    log_info "Backup directory: $BACKUP_DIR"

    validate_environment
    create_manifest
    backup_postgresql
    backup_mongodb
    backup_redis
    backup_configuration

    local archive_path
    archive_path=$(compress_backup)
    cleanup_old_backups

    log_success "Backup completed successfully!"
    log_info "Backup archive: $archive_path"

    # Print backup summary
    echo
    echo "=================================================="
    echo "DIVE V3 Backup Summary"
    echo "=================================================="
    echo "Backup Name: $BACKUP_NAME"
    echo "Created: $(date)"
    echo "Archive: $archive_path"
    echo "Size: $(du -sh "$archive_path" | cut -f1)"
    echo "Retention: ${RETENTION_DAYS} days / ${MAX_BACKUPS} backups max"
    echo "=================================================="
}

# Extract backup
extract_backup() {
    local archive_path="$1"
    local extract_dir="$BACKUP_ROOT/extracted_$TIMESTAMP"

    log_info "Extracting backup: $archive_path"

    if [ ! -f "$archive_path" ]; then
        log_error "Backup archive not found: $archive_path"
        exit 1
    fi

    mkdir -p "$extract_dir"
    tar -xzf "$archive_path" -C "$extract_dir"

    # Find the extracted backup directory
    local backup_dir
    backup_dir=$(find "$extract_dir" -name "dive-v3-backup-*" -type d | head -1)

    if [ -z "$backup_dir" ]; then
        log_error "Could not find backup directory in archive"
        exit 1
    fi

    echo "$backup_dir"
}

# Restore PostgreSQL
restore_postgresql() {
    local backup_dir="$1"

    log_info "Restoring PostgreSQL databases..."

    local pg_backup_dir="$backup_dir/postgresql"

    if [ ! -d "$pg_backup_dir" ]; then
        log_warning "PostgreSQL backup directory not found - skipping"
        return
    fi

    # Stop Keycloak to prevent conflicts
    log_info "Stopping Keycloak during PostgreSQL restore..."
    docker compose stop keycloak || true

    # Restore keycloak_db
    if [ -f "$pg_backup_dir/keycloak_db.backup" ]; then
        log_info "Restoring keycloak_db..."
        pg_restore -h postgres -U postgres -d keycloak_db \
            --no-password \
            --clean \
            --if-exists \
            --create \
            --verbose \
            "$pg_backup_dir/keycloak_db.backup"
    fi

    # Restore dive_v3_app
    if [ -f "$pg_backup_dir/dive_v3_app.backup" ]; then
        log_info "Restoring dive_v3_app..."
        pg_restore -h postgres -U postgres -d postgres \
            --no-password \
            --clean \
            --if-exists \
            --create \
            --verbose \
            "$pg_backup_dir/dive_v3_app.backup"
    fi

    # Restart Keycloak
    log_info "Restarting Keycloak..."
    docker compose start keycloak || true

    log_success "PostgreSQL restore complete"
}

# Restore MongoDB
restore_mongodb() {
    local backup_dir="$1"

    log_info "Restoring MongoDB databases..."

    local mongo_backup_dir="$backup_dir/mongodb"

    if [ ! -d "$mongo_backup_dir" ]; then
        log_warning "MongoDB backup directory not found - skipping"
        return
    fi

    # Stop backend to prevent conflicts
    log_info "Stopping backend during MongoDB restore..."
    docker compose stop backend || true

    # Restore MongoDB
    log_info "Restoring MongoDB data..."
    mongorestore \
        --host mongo \
        --username admin \
        --password "$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --db dive-v3 \
        --drop \
        --gzip \
        --verbose \
        "$mongo_backup_dir/dive-v3"

    # Restart backend
    log_info "Restarting backend..."
    docker compose start backend || true

    log_success "MongoDB restore complete"
}

# Restore Redis
restore_redis() {
    local backup_dir="$1"

    log_info "Restoring Redis data..."

    local redis_backup_dir="$backup_dir/redis"

    if [ ! -d "$redis_backup_dir" ] || [ ! -f "$redis_backup_dir/dump.rdb" ]; then
        log_warning "Redis backup not found - skipping"
        return
    fi

    # Stop Redis
    log_info "Stopping Redis during restore..."
    docker compose stop redis || true

    # Copy dump file
    cp "$redis_backup_dir/dump.rdb" /data/dump.rdb
    chown redis:redis /data/dump.rdb

    # Restart Redis
    log_info "Restarting Redis..."
    docker compose start redis || true

    log_success "Redis restore complete"
}

# List available backups
list_backups() {
    log_info "Available backups in $BACKUP_ROOT:"

    if [ ! -d "$BACKUP_ROOT" ]; then
        log_warning "Backup directory does not exist: $BACKUP_ROOT"
        return
    fi

    local count=0
    echo
    echo "Backup Name                     | Created               | Size      | Age"
    echo "------------------------------- | --------------------- | --------- | ----"
    while IFS= read -r -d '' backup; do
        local name
        name=$(basename "$backup" .tar.gz)
        local created
        created=$(stat -c %y "$backup" 2>/dev/null | cut -d'.' -f1 || stat -f %Sm "$backup" | cut -d' ' -f1-2)
        local size
        size=$(du -sh "$backup" | cut -f1)
        local age_days=$(( ($(date +%s) - $(stat -c %Y "$backup" 2>/dev/null || stat -f %m "$backup")) / 86400 ))
        printf "%-30s | %-21s | %-9s | %d days\n" "$name" "$created" "$size" "$age_days"
        count=$((count + 1))
    done < <(find "$BACKUP_ROOT" -name "dive-v3-backup-*.tar.gz" -type f -print0 | xargs -0 ls -t)

    if [ $count -eq 0 ]; then
        echo "No backups found."
    else
        echo
        log_info "Total backups: $count"
    fi
}

# Perform restore
perform_restore() {
    local archive_path="$1"

    if [ -z "$archive_path" ]; then
        log_error "Backup archive path is required for restore"
        echo "Usage: $0 restore <backup-archive-path>"
        echo
        echo "Available backups:"
        list_backups
        exit 1
    fi

    log_info "Starting DIVE V3 restore from: $archive_path"

    # Confirm destructive operation
    echo
    echo "⚠️  WARNING: This will overwrite existing data!"
    echo "   - PostgreSQL databases will be dropped and recreated"
    echo "   - MongoDB collections will be dropped and restored"
    echo "   - Redis data will be replaced"
    echo
    read -p "Type 'yes' to confirm restore: " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi

    validate_environment
    local backup_dir
    backup_dir=$(extract_backup "$archive_path")

    # Perform restores
    restore_postgresql "$backup_dir"
    restore_mongodb "$backup_dir"
    restore_redis "$backup_dir"

    # Clean up extracted files
    rm -rf "$BACKUP_ROOT/extracted_$TIMESTAMP"

    log_success "Restore completed successfully!"

    echo
    echo "=================================================="
    echo "DIVE V3 Restore Summary"
    echo "=================================================="
    echo "Backup: $(basename "$archive_path")"
    echo "Restored: $(date)"
    echo "Components: PostgreSQL, MongoDB, Redis"
    echo "=================================================="
    echo
    log_warning "Please verify application functionality after restore"
}

# Show usage
show_usage() {
    cat << EOF
DIVE V3 Backup and Recovery Script

Usage: $0 <command> [options]

Commands:
    backup              Create a new backup
    restore <archive>   Restore from backup archive
    list                List available backups
    cleanup             Clean up old backups only
    schedule <type>     Schedule automated backups (daily/weekly/monthly)
    unschedule          Remove automated backup schedule

Options:
    --name NAME         Custom backup name (default: auto-generated)
    --retention DAYS    Backup retention in days (default: $RETENTION_DAYS)
    --max-backups N     Maximum number of backups to keep (default: $MAX_BACKUPS)
    --help, -h          Show this help message

Environment Variables:
    BACKUP_ROOT         Backup storage directory (default: $PROJECT_ROOT/backups)
    POSTGRES_PASSWORD   PostgreSQL password (required)
    MONGO_PASSWORD      MongoDB password (required)
    REDIS_PASSWORD      Redis password (optional)
    RETENTION_DAYS      Backup retention period
    MAX_BACKUPS         Maximum backup count

Examples:
    # Create backup
    $0 backup

    # Create backup with custom name
    $0 backup --name my-backup-20251218

    # Restore from specific backup
    $0 restore backups/dive-v3-backup-20251218_143000.tar.gz

    # List available backups
    $0 list

    # Clean up old backups
    $0 cleanup

Backup Contents:
    • PostgreSQL: keycloak_db, dive_v3_app databases
    • MongoDB: dive-v3 database with all collections
    • Redis: Complete data dump
    • Configuration: Policies, themes, certificates (public only)

Security Notes:
    • Private keys are NOT included in backups
    • Environment variables are sanitized in backups
    • Database passwords required for restore operations
EOF
}

# Main execution
main() {
    case "${1:-}" in
        backup)
            shift
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --name)
                        BACKUP_NAME="dive-v3-backup-$2"
                        shift 2
                        ;;
                    --retention)
                        RETENTION_DAYS="$2"
                        shift 2
                        ;;
                    --max-backups)
                        MAX_BACKUPS="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown backup option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done
            perform_backup
            ;;
        restore)
            if [ -z "$2" ]; then
                log_error "Backup archive path required for restore"
                show_usage
                exit 1
            fi
            perform_restore "$2"
            ;;
        list)
            list_backups
            ;;
        cleanup)
            cleanup_old_backups
            ;;
        schedule)
            if [ -z "$2" ]; then
                log_error "Schedule type required (daily/weekly/monthly)"
                exit 1
            fi
            schedule_backup "$2"
            ;;
        unschedule)
            unschedule_backup
            ;;
        --help|-h|"")
            show_usage
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
