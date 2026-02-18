#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — AWS Backup Script
# =============================================================================
# Automated backup of databases and configuration to S3.
# Intended to run as a cron job on EC2 instances.
#
# Usage:
#   ./scripts/aws/backup-to-s3.sh                # Full backup
#   ./scripts/aws/backup-to-s3.sh --db-only      # Database snapshots only
#   ./scripts/aws/backup-to-s3.sh --restore DATE  # Restore from backup
#
# Cron example (daily at 2 AM):
#   0 2 * * * /opt/dive-v3/scripts/aws/backup-to-s3.sh >> /var/log/dive-backup.log 2>&1
# =============================================================================
set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

DIVE_ROOT="${DIVE_ROOT:-/opt/dive-v3}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
INSTANCE="${INSTANCE:-hub}"
AWS_REGION="${AWS_REGION:-us-gov-east-1}"
S3_BUCKET="${DIVE_BACKUP_BUCKET:-dive-v3-backups}"
BACKUP_PREFIX="${ENVIRONMENT}/${INSTANCE}"
RETENTION_DAYS="${DIVE_BACKUP_RETENTION:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/dive-backup-${TIMESTAMP}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; }

# =============================================================================
# BACKUP FUNCTIONS
# =============================================================================

backup_mongodb() {
    log "Backing up MongoDB..."
    local mongo_container
    mongo_container=$(docker ps --filter "name=mongodb" --filter "name=mongo" --format '{{.Names}}' | head -1)

    if [ -z "$mongo_container" ]; then
        err "MongoDB container not found — skipping"
        return 0
    fi

    mkdir -p "${BACKUP_DIR}/mongodb"
    docker exec "$mongo_container" mongodump \
        --out /tmp/mongodump \
        --quiet 2>/dev/null || true

    docker cp "${mongo_container}:/tmp/mongodump" "${BACKUP_DIR}/mongodb/"
    docker exec "$mongo_container" rm -rf /tmp/mongodump 2>/dev/null || true

    log "MongoDB backup complete."
}

backup_postgresql() {
    log "Backing up PostgreSQL..."
    local pg_container
    pg_container=$(docker ps --filter "name=postgres" --format '{{.Names}}' | head -1)

    if [ -z "$pg_container" ]; then
        err "PostgreSQL container not found — skipping"
        return 0
    fi

    mkdir -p "${BACKUP_DIR}/postgresql"
    docker exec "$pg_container" pg_dumpall -U postgres \
        > "${BACKUP_DIR}/postgresql/all_databases.sql" 2>/dev/null || true

    log "PostgreSQL backup complete."
}

backup_vault() {
    log "Backing up Vault snapshot..."
    local vault_container
    vault_container=$(docker ps --filter "name=vault-1" --format '{{.Names}}' | head -1)

    if [ -z "$vault_container" ]; then
        err "Vault container not found — skipping"
        return 0
    fi

    mkdir -p "${BACKUP_DIR}/vault"
    docker exec "$vault_container" vault operator raft snapshot save /tmp/vault-snapshot.snap 2>/dev/null || true
    docker cp "${vault_container}:/tmp/vault-snapshot.snap" "${BACKUP_DIR}/vault/" 2>/dev/null || true
    docker exec "$vault_container" rm -f /tmp/vault-snapshot.snap 2>/dev/null || true

    log "Vault backup complete."
}

backup_config() {
    log "Backing up configuration files..."
    mkdir -p "${BACKUP_DIR}/config"

    # .env files (scrub actual secret values)
    for env_file in "${DIVE_ROOT}/.env.hub" "${DIVE_ROOT}/instances"/*/.env; do
        if [ -f "$env_file" ]; then
            local basename
            basename=$(basename "$env_file")
            local dirname
            dirname=$(basename "$(dirname "$env_file")")
            cp "$env_file" "${BACKUP_DIR}/config/${dirname}-${basename}"
        fi
    done

    # Terraform state (if local)
    for tfstate in "${DIVE_ROOT}"/terraform/*/terraform.tfstate; do
        if [ -f "$tfstate" ]; then
            local dir_name
            dir_name=$(basename "$(dirname "$tfstate")")
            cp "$tfstate" "${BACKUP_DIR}/config/tfstate-${dir_name}.json"
        fi
    done

    # Certificate metadata (not private keys)
    if [ -d "${DIVE_ROOT}/certs" ]; then
        find "${DIVE_ROOT}/certs" -name "*.pem" -not -name "*key*" \
            -exec cp {} "${BACKUP_DIR}/config/" \; 2>/dev/null || true
    fi

    log "Configuration backup complete."
}

upload_to_s3() {
    log "Compressing backup..."
    local archive="/tmp/dive-backup-${TIMESTAMP}.tar.gz"
    tar -czf "$archive" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"

    local s3_key="${BACKUP_PREFIX}/${TIMESTAMP}/backup.tar.gz"
    log "Uploading to s3://${S3_BUCKET}/${s3_key}..."

    aws s3 cp "$archive" "s3://${S3_BUCKET}/${s3_key}" \
        --region "$AWS_REGION" \
        --sse AES256

    local size
    size=$(du -sh "$archive" | cut -f1)
    log "Uploaded: s3://${S3_BUCKET}/${s3_key} ($size)"

    # Cleanup local
    rm -rf "$BACKUP_DIR" "$archive"
}

cleanup_old_backups() {
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."

    local cutoff_date
    cutoff_date=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || \
                  date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null || echo "")

    if [ -z "$cutoff_date" ]; then
        log "Could not compute cutoff date — skipping cleanup"
        return 0
    fi

    # List and delete old backups
    aws s3 ls "s3://${S3_BUCKET}/${BACKUP_PREFIX}/" --region "$AWS_REGION" 2>/dev/null | \
    while read -r _ _ _ prefix; do
        local backup_date
        backup_date=$(echo "$prefix" | grep -oP '^\d{8}' || echo "")
        if [ -n "$backup_date" ] && [ "$backup_date" -lt "$cutoff_date" ]; then
            log "  Deleting old backup: $prefix"
            aws s3 rm "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${prefix}" \
                --recursive --region "$AWS_REGION" 2>/dev/null || true
        fi
    done

    log "Cleanup complete."
}

# =============================================================================
# RESTORE
# =============================================================================

restore_from_s3() {
    local restore_date="${1:?Usage: backup-to-s3.sh --restore YYYYMMDD-HHMMSS}"

    local s3_key="${BACKUP_PREFIX}/${restore_date}/backup.tar.gz"
    local restore_dir="/tmp/dive-restore-${restore_date}"

    log "Downloading backup: s3://${S3_BUCKET}/${s3_key}"
    mkdir -p "$restore_dir"
    aws s3 cp "s3://${S3_BUCKET}/${s3_key}" "${restore_dir}/backup.tar.gz" \
        --region "$AWS_REGION"

    log "Extracting backup..."
    tar -xzf "${restore_dir}/backup.tar.gz" -C "$restore_dir"

    log "Backup extracted to: $restore_dir"
    echo ""
    echo "Restore steps (manual for safety):"
    echo ""
    echo "  1. Stop services:    ./dive down"
    echo "  2. Restore MongoDB:  docker exec dive-hub-mongodb mongorestore /tmp/mongodump"
    echo "  3. Restore Postgres: docker exec -i dive-hub-postgres psql -U postgres < all_databases.sql"
    echo "  4. Restore Vault:    vault operator raft snapshot restore vault-snapshot.snap"
    echo "  5. Start services:   ./dive up"
    echo ""
    echo "Backup files are in: $restore_dir"
}

# =============================================================================
# S3 BUCKET SETUP
# =============================================================================

setup_s3_bucket() {
    log "Setting up S3 backup bucket: $S3_BUCKET"

    if aws s3api head-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
        log "Bucket already exists."
        return 0
    fi

    aws s3api create-bucket \
        --bucket "$S3_BUCKET" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION"

    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$S3_BUCKET" \
        --versioning-configuration Status=Enabled \
        --region "$AWS_REGION"

    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "$S3_BUCKET" \
        --server-side-encryption-configuration '{
            "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
        }' \
        --region "$AWS_REGION"

    # Lifecycle rule for automatic cleanup
    aws s3api put-bucket-lifecycle-configuration \
        --bucket "$S3_BUCKET" \
        --lifecycle-configuration "{
            \"Rules\": [{
                \"ID\": \"AutoCleanup\",
                \"Status\": \"Enabled\",
                \"Filter\": {\"Prefix\": \"\"},
                \"Expiration\": {\"Days\": ${RETENTION_DAYS}},
                \"NoncurrentVersionExpiration\": {\"NoncurrentDays\": 7}
            }]
        }" \
        --region "$AWS_REGION"

    log "S3 bucket created with versioning, encryption, and ${RETENTION_DAYS}-day lifecycle."
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    local mode="full"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --db-only)     mode="db"; shift ;;
            --restore)     restore_from_s3 "$2"; return $? ;;
            --setup)       setup_s3_bucket; return $? ;;
            *)             shift ;;
        esac
    done

    log "Starting DIVE V3 backup (${ENVIRONMENT}/${INSTANCE}, mode: ${mode})"

    mkdir -p "$BACKUP_DIR"

    backup_mongodb
    backup_postgresql

    if [ "$mode" = "full" ]; then
        backup_vault
        backup_config
    fi

    upload_to_s3
    cleanup_old_backups

    log "Backup complete!"
}

main "$@"
