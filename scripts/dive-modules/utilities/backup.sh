#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Backup Utilities Module (Consolidated)
# =============================================================================
# Database and configuration backup/restore operations with archival strategy
# =============================================================================
# Version: 6.0.0 (Enhanced with Archival Strategy)
# Date: 2026-01-25
#
# Enhancements:
# - Tier-based archive management (Tier 1-4 retention policies)
# - Checksum verification for backup integrity
# - External storage sync (cloud/NAS)
# - Archive encryption and security
# - Automated retention and cleanup
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
ARCHIVE_DIR="${ARCHIVE_DIR:-${HOME}/Documents/DIVE-V3-Archives}"

# Tier-based retention policies (days)
TIER1_RETENTION=3650  # 10 years - Critical data
TIER2_RETENTION=730   # 2 years - Historical documentation
TIER3_RETENTION=180   # 6 months - Development artifacts
TIER4_RETENTION=30    # 30 days - Temporary data

# Backup encryption
BACKUP_ENCRYPT="${BACKUP_ENCRYPT:-false}"
BACKUP_KEY_FILE="${DIVE_ROOT}/certs/backup-key.pem"

# External storage
EXTERNAL_STORAGE_TYPE="${EXTERNAL_STORAGE_TYPE:-}"  # gcs, s3, azure, nas, local
EXTERNAL_STORAGE_PATH="${EXTERNAL_STORAGE_PATH:-}"

# =============================================================================
# ARCHIVE MANAGEMENT FUNCTIONS
# =============================================================================

##
# Generate checksum for backup file
#
# Arguments:
#   $1 - Backup file path
##
backup_checksum_create() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    local checksum_file="${backup_file}.sha256"
    
    log_verbose "Generating SHA-256 checksum..."
    shasum -a 256 "$backup_file" > "$checksum_file"
    
    log_success "Checksum created: $checksum_file"
    echo "$checksum_file"
}

##
# Verify backup checksum
#
# Arguments:
#   $1 - Backup file path
##
backup_checksum_verify() {
    local backup_file="$1"
    local checksum_file="${backup_file}.sha256"
    
    if [ ! -f "$checksum_file" ]; then
        log_warn "Checksum file not found: $checksum_file"
        return 1
    fi
    
    log_verbose "Verifying backup integrity..."
    
    if (cd "$(dirname "$backup_file")" && shasum -a 256 -c "$(basename "$checksum_file")" >/dev/null 2>&1); then
        log_success "Backup integrity verified"
        return 0
    else
        log_error "Backup integrity check FAILED"
        return 1
    fi
}

##
# Encrypt backup file
#
# Arguments:
#   $1 - Backup file path
##
backup_encrypt() {
    local backup_file="$1"
    local encrypted_file="${backup_file}.enc"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Generate encryption key if not exists
    if [ ! -f "$BACKUP_KEY_FILE" ]; then
        log_info "Generating backup encryption key..."
        mkdir -p "$(dirname "$BACKUP_KEY_FILE")"
        openssl rand -base64 32 > "$BACKUP_KEY_FILE"
        chmod 600 "$BACKUP_KEY_FILE"
        log_warn "Backup key created: $BACKUP_KEY_FILE - STORE THIS SECURELY!"
    fi
    
    log_verbose "Encrypting backup..."
    
    if openssl enc -aes-256-cbc -salt -in "$backup_file" -out "$encrypted_file" -pass file:"$BACKUP_KEY_FILE"; then
        log_success "Backup encrypted: $encrypted_file"
        
        # Remove unencrypted file
        rm -f "$backup_file"
        
        echo "$encrypted_file"
        return 0
    else
        log_error "Backup encryption failed"
        return 1
    fi
}

##
# Decrypt backup file
#
# Arguments:
#   $1 - Encrypted backup file path
##
backup_decrypt() {
    local encrypted_file="$1"
    local decrypted_file="${encrypted_file%.enc}"
    
    if [ ! -f "$encrypted_file" ]; then
        log_error "Encrypted backup not found: $encrypted_file"
        return 1
    fi
    
    if [ ! -f "$BACKUP_KEY_FILE" ]; then
        log_error "Backup encryption key not found: $BACKUP_KEY_FILE"
        return 1
    fi
    
    log_verbose "Decrypting backup..."
    
    if openssl enc -d -aes-256-cbc -in "$encrypted_file" -out "$decrypted_file" -pass file:"$BACKUP_KEY_FILE"; then
        log_success "Backup decrypted: $decrypted_file"
        echo "$decrypted_file"
        return 0
    else
        log_error "Backup decryption failed"
        return 1
    fi
}

##
# Sync backup to external storage
#
# Arguments:
#   $1 - Backup file path
#   $2 - Storage type (gcs|s3|azure|nas|local) - optional, uses EXTERNAL_STORAGE_TYPE if not provided
##
backup_sync_external() {
    local backup_file="$1"
    local storage_type="${2:-$EXTERNAL_STORAGE_TYPE}"
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    if [ -z "$storage_type" ]; then
        log_warn "No external storage configured - skipping sync"
        return 0
    fi
    
    log_info "Syncing backup to external storage ($storage_type)..."
    
    local backup_name=$(basename "$backup_file")
    
    case "$storage_type" in
        gcs)
            if [ -z "$EXTERNAL_STORAGE_PATH" ]; then
                log_error "EXTERNAL_STORAGE_PATH not set for GCS bucket"
                return 1
            fi
            
            if command -v gsutil >/dev/null 2>&1; then
                gsutil cp "$backup_file" "${EXTERNAL_STORAGE_PATH}/${backup_name}"
                log_success "Synced to GCS: ${EXTERNAL_STORAGE_PATH}/${backup_name}"
            else
                log_error "gsutil not found - install Google Cloud SDK"
                return 1
            fi
            ;;
        
        s3)
            if [ -z "$EXTERNAL_STORAGE_PATH" ]; then
                log_error "EXTERNAL_STORAGE_PATH not set for S3 bucket"
                return 1
            fi
            
            if command -v aws >/dev/null 2>&1; then
                aws s3 cp "$backup_file" "${EXTERNAL_STORAGE_PATH}/${backup_name}"
                log_success "Synced to S3: ${EXTERNAL_STORAGE_PATH}/${backup_name}"
            else
                log_error "aws cli not found - install AWS CLI"
                return 1
            fi
            ;;
        
        azure)
            if [ -z "$EXTERNAL_STORAGE_PATH" ]; then
                log_error "EXTERNAL_STORAGE_PATH not set for Azure container"
                return 1
            fi
            
            if command -v az >/dev/null 2>&1; then
                az storage blob upload --file "$backup_file" --name "$backup_name" --container-name "$EXTERNAL_STORAGE_PATH"
                log_success "Synced to Azure: ${EXTERNAL_STORAGE_PATH}/${backup_name}"
            else
                log_error "az cli not found - install Azure CLI"
                return 1
            fi
            ;;
        
        nas|local)
            if [ -z "$EXTERNAL_STORAGE_PATH" ]; then
                log_error "EXTERNAL_STORAGE_PATH not set for NAS/local storage"
                return 1
            fi
            
            mkdir -p "$EXTERNAL_STORAGE_PATH"
            cp "$backup_file" "${EXTERNAL_STORAGE_PATH}/${backup_name}"
            log_success "Synced to local/NAS: ${EXTERNAL_STORAGE_PATH}/${backup_name}"
            ;;
        
        *)
            log_error "Unknown storage type: $storage_type"
            return 1
            ;;
    esac
    
    return 0
}

##
# Categorize backup by tier based on filename patterns
#
# Arguments:
#   $1 - Backup file path
#
# Returns:
#   1-4 (tier number)
##
backup_get_tier() {
    local backup_file="$1"
    local filename=$(basename "$backup_file")
    
    # Tier 1: Critical data (production databases, certificates, terraform state)
    if [[ "$filename" =~ (production|critical|postgres|keycloak|terraform-state|certificates) ]]; then
        echo "1"
        return 0
    fi
    
    # Tier 2: Historical documentation
    if [[ "$filename" =~ (docs-archive|historical|session) ]]; then
        echo "2"
        return 0
    fi
    
    # Tier 3: Development artifacts
    if [[ "$filename" =~ (optional|development|test) ]]; then
        echo "3"
        return 0
    fi
    
    # Tier 4: Temporary data (default)
    echo "4"
    return 0
}

##
# Get retention period for a backup based on its tier
#
# Arguments:
#   $1 - Backup file path
#
# Returns:
#   Retention period in days
##
backup_get_retention() {
    local backup_file="$1"
    local tier=$(backup_get_tier "$backup_file")
    
    case "$tier" in
        1) echo "$TIER1_RETENTION" ;;
        2) echo "$TIER2_RETENTION" ;;
        3) echo "$TIER3_RETENTION" ;;
        4) echo "$TIER4_RETENTION" ;;
        *) echo "$TIER4_RETENTION" ;;
    esac
}

##
# Archive management - move old backups to archive directory
#
# Arguments:
#   $1 - Age threshold in days (optional, default: 7)
##
backup_archive_old() {
    local age_days="${1:-7}"
    
    log_info "Archiving backups older than $age_days days..."
    
    mkdir -p "$ARCHIVE_DIR"
    
    local count=0
    
    find "$BACKUP_DIR" -name "*.tar.gz" -o -name "*.tar.gz.enc" -type f -mtime "+$age_days" 2>/dev/null | while read -r backup; do
        local backup_name=$(basename "$backup")
        local tier=$(backup_get_tier "$backup")
        
        log_verbose "Archiving: $backup_name (Tier $tier)"
        
        # Create tier-specific subdirectory
        local tier_dir="${ARCHIVE_DIR}/tier${tier}"
        mkdir -p "$tier_dir"
        
        # Move to archive with checksum
        mv "$backup" "$tier_dir/"
        
        # Move checksum file if exists
        if [ -f "${backup}.sha256" ]; then
            mv "${backup}.sha256" "$tier_dir/"
        fi
        
        ((count++))
    done
    
    log_success "Archived $count backups"
}

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

    # Generate checksum
    backup_checksum_create "$archive"
    
    # Encrypt if enabled
    if [ "$BACKUP_ENCRYPT" = "true" ]; then
        archive=$(backup_encrypt "$archive")
        # Update checksum for encrypted file
        backup_checksum_create "$archive"
    fi
    
    # Sync to external storage if configured
    if [ -n "$EXTERNAL_STORAGE_TYPE" ]; then
        backup_sync_external "$archive"
    fi

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
# List available backups with tier and retention info
##
backup_list() {
    echo "=== Available Backups ==="
    echo ""

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "No backups found in $BACKUP_DIR"
        return 0
    fi

    printf "%-40s %-8s %-6s %-10s %-20s %-10s\n" "BACKUP" "SIZE" "TIER" "RETENTION" "DATE" "CHECKSUM"
    printf "%-40s %-8s %-6s %-10s %-20s %-10s\n" "──────" "────" "────" "─────────" "────" "────────"

    for backup in "${BACKUP_DIR}"/*.tar.gz*; do
        [ -f "$backup" ] || continue
        
        # Skip checksum files
        [[ "$backup" == *.sha256 ]] && continue

        local name=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        local tier=$(backup_get_tier "$backup")
        local retention=$(backup_get_retention "$backup")
        local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$backup" 2>/dev/null || \
                    stat -c "%y" "$backup" 2>/dev/null | cut -d. -f1)
        
        # Check if checksum exists
        local checksum_status="✗"
        if [ -f "${backup}.sha256" ]; then
            if backup_checksum_verify "$backup" 2>/dev/null; then
                checksum_status="✓"
            else
                checksum_status="✗ FAIL"
            fi
        fi

        printf "%-40s %-8s %-6s %-10s %-20s %-10s\n" "$name" "$size" "T$tier" "${retention}d" "$date" "$checksum_status"
    done
    
    echo ""
    echo "Tier Legend:"
    echo "  T1: Critical data (${TIER1_RETENTION}d retention)"
    echo "  T2: Historical docs (${TIER2_RETENTION}d retention)"
    echo "  T3: Development (${TIER3_RETENTION}d retention)"
    echo "  T4: Temporary (${TIER4_RETENTION}d retention)"
}

##
# Delete old backups based on tier-based retention policies
#
# Arguments:
#   $1 - Force cleanup (skip confirmation) - optional
##
backup_cleanup() {
    local force="${1:-false}"

    log_info "Cleaning up old backups based on tier retention policies..."
    
    if [ "$force" != "true" ]; then
        log_info "Tier 1 (Critical): $TIER1_RETENTION days"
        log_info "Tier 2 (Historical): $TIER2_RETENTION days"
        log_info "Tier 3 (Development): $TIER3_RETENTION days"
        log_info "Tier 4 (Temporary): $TIER4_RETENTION days"
    fi

    if [ ! -d "$BACKUP_DIR" ]; then
        log_info "No backup directory found"
        return 0
    fi

    local total_cleaned=0
    
    # Process each backup file
    find "$BACKUP_DIR" -name "*.tar.gz" -o -name "*.tar.gz.enc" -type f 2>/dev/null | while read -r backup; do
        [ -f "$backup" ] || continue
        
        local tier=$(backup_get_tier "$backup")
        local retention=$(backup_get_retention "$backup")
        
        # Get file age in days
        local mtime=$(stat -f %m "$backup" 2>/dev/null || stat -c %Y "$backup" 2>/dev/null)
        local now=$(date +%s)
        local age_days=$(( (now - mtime) / 86400 ))
        
        if [ "$age_days" -gt "$retention" ]; then
            log_verbose "Deleting expired backup (Tier $tier, ${age_days}d old): $(basename "$backup")"
            rm -f "$backup"
            rm -f "${backup}.sha256"  # Remove checksum too
            ((total_cleaned++))
        fi
    done

    if [ "$total_cleaned" -gt 0 ]; then
        log_success "Cleaned up $total_cleaned expired backups"
    else
        log_info "No expired backups to clean"
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Archive management functions
export -f backup_checksum_create
export -f backup_checksum_verify
export -f backup_encrypt
export -f backup_decrypt
export -f backup_sync_external
export -f backup_get_tier
export -f backup_get_retention
export -f backup_archive_old

# Backup/restore functions
export -f backup_create
export -f backup_hub
export -f backup_spoke
export -f backup_restore
export -f restore_hub
export -f restore_spoke
export -f backup_list
export -f backup_cleanup

log_verbose "Backup utilities module loaded (v6.0.0 with archival strategy)"
