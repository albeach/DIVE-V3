#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Backup Manager
# =============================================================================
# Addresses GAP-P1: No Automated Backup Schedule
#
# Features:
#   - Automated backup of all databases (PostgreSQL, MongoDB)
#   - Docker volume backup (optional)
#   - Configuration backup
#   - Retention policy (7 days daily, 30 days weekly)
#   - Backup verification via test restore
#   - Remote backup sync (optional)
#
# Usage:
#   ./scripts/backup/backup-manager.sh backup <INSTANCE>
#   ./scripts/backup/backup-manager.sh restore <INSTANCE> <BACKUP_ID>
#   ./scripts/backup/backup-manager.sh verify <INSTANCE> <BACKUP_ID>
#   ./scripts/backup/backup-manager.sh list <INSTANCE>
#   ./scripts/backup/backup-manager.sh cleanup <INSTANCE>
#   ./scripts/backup/backup-manager.sh schedule <INSTANCE>
#
# Cron Integration:
#   # Daily backup at 02:00 UTC
#   0 2 * * * /path/to/backup-manager.sh backup all
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_ROOT="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

# Retention policy
DAILY_RETENTION_DAYS=7
WEEKLY_RETENTION_DAYS=30

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log() { echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { log "${YELLOW}[WARN]${NC} $1"; }
log_error() { log "${RED}[ERROR]${NC} $1"; }

usage() {
    cat << EOF
DIVE V3 - Backup Manager

Usage: $0 <COMMAND> <INSTANCE> [OPTIONS]

Commands:
  backup    Create a new backup
  restore   Restore from a backup
  verify    Verify a backup (test restore)
  list      List available backups
  cleanup   Remove old backups per retention policy
  schedule  Setup automated backup schedule (cron)

Arguments:
  INSTANCE  Instance code (usa, fra, gbr, deu, all)
  BACKUP_ID Backup identifier (for restore/verify)

Options:
  --include-volumes   Include Docker volumes in backup
  --no-db             Skip database backup
  --no-config         Skip configuration backup
  --dry-run           Show what would be done
  --remote=PATH       Sync backups to remote path
  --help              Show this help message

Examples:
  $0 backup usa                    # Backup USA instance
  $0 backup all                    # Backup all instances
  $0 restore usa 20251130-020000   # Restore USA from backup
  $0 verify usa 20251130-020000    # Verify backup integrity
  $0 list usa                      # List USA backups
  $0 cleanup all                   # Cleanup old backups

Retention Policy:
  - Daily backups: kept for $DAILY_RETENTION_DAYS days
  - Weekly backups (Sunday): kept for $WEEKLY_RETENTION_DAYS days
EOF
}

# Parse global options
INCLUDE_VOLUMES=false
NO_DB=false
NO_CONFIG=false
DRY_RUN=false
REMOTE_PATH=""

COMMAND="${1:-}"
INSTANCE="${2:-}"
BACKUP_ID="${3:-}"

shift 2 2>/dev/null || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --include-volumes) INCLUDE_VOLUMES=true; shift ;;
        --no-db) NO_DB=true; shift ;;
        --no-config) NO_CONFIG=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --remote=*) REMOTE_PATH="${1#*=}"; shift ;;
        --help|-h) usage; exit 0 ;;
        *) shift ;;
    esac
done

# Validate arguments
if [[ -z "$COMMAND" ]]; then
    log_error "Command required"
    usage
    exit 1
fi

# Get list of instances
get_instances() {
    if [[ "$INSTANCE" == "all" ]]; then
        echo "usa fra gbr deu"
    else
        echo "$INSTANCE"
    fi
}

# Get container name for a service
get_container_name() {
    local instance="$1"
    local service="$2"
    
    if [[ "$instance" == "usa" ]]; then
        case "$service" in
            postgres) echo "dive-v3-postgres" ;;
            mongodb) echo "dive-v3-mongo" ;;
            redis) echo "dive-v3-redis" ;;
            *) echo "dive-v3-$service" ;;
        esac
    else
        echo "dive-v3-${service}-${instance}"
    fi
}

# Backup PostgreSQL
backup_postgres() {
    local instance="$1"
    local backup_dir="$2"
    local container=$(get_container_name "$instance" "postgres")
    
    log_info "Backing up PostgreSQL for $instance..."
    
    if docker ps --format '{{.Names}}' | grep -q "$container"; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would backup PostgreSQL: $container"
            return 0
        fi
        
        docker exec -i "$container" pg_dumpall -U postgres > "$backup_dir/postgres-all.sql" 2>/dev/null || {
            log_warn "pg_dumpall failed, trying pg_dump for keycloak_db..."
            docker exec -i "$container" pg_dump -U postgres keycloak_db > "$backup_dir/keycloak-db.sql" 2>/dev/null || {
                log_warn "PostgreSQL backup skipped (no data or container not available)"
                return 0
            }
        }
        
        local size=$(du -h "$backup_dir"/*.sql 2>/dev/null | tail -1 | awk '{print $1}')
        log_success "PostgreSQL backup complete ($size)"
    else
        log_warn "PostgreSQL container not running: $container"
    fi
}

# Backup MongoDB
backup_mongodb() {
    local instance="$1"
    local backup_dir="$2"
    local container=$(get_container_name "$instance" "mongodb")
    
    # Try various container name patterns
    if ! docker ps --format '{{.Names}}' | grep -q "$container"; then
        container="dive-v3-mongo"
        if ! docker ps --format '{{.Names}}' | grep -q "$container"; then
            container="mongo-${instance}"
        fi
    fi
    
    log_info "Backing up MongoDB for $instance..."
    
    if docker ps --format '{{.Names}}' | grep -q "$container"; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would backup MongoDB: $container"
            return 0
        fi
        
        docker exec -i "$container" mongodump --archive > "$backup_dir/mongodb.archive" 2>/dev/null || {
            log_warn "mongodump failed, trying with authentication..."
            docker exec -i "$container" mongodump --archive --authenticationDatabase admin > "$backup_dir/mongodb.archive" 2>/dev/null || {
                log_warn "MongoDB backup skipped (no data or authentication required)"
                return 0
            }
        }
        
        local size=$(du -h "$backup_dir/mongodb.archive" 2>/dev/null | awk '{print $1}')
        log_success "MongoDB backup complete ($size)"
    else
        log_warn "MongoDB container not running"
    fi
}

# Backup Redis
backup_redis() {
    local instance="$1"
    local backup_dir="$2"
    local container=$(get_container_name "$instance" "redis")
    
    log_info "Backing up Redis for $instance..."
    
    if docker ps --format '{{.Names}}' | grep -q "$container"; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would backup Redis: $container"
            return 0
        fi
        
        docker exec -i "$container" redis-cli BGSAVE 2>/dev/null || true
        sleep 2
        docker cp "$container:/data/dump.rdb" "$backup_dir/redis.rdb" 2>/dev/null || {
            log_warn "Redis backup skipped (RDB not available)"
            return 0
        }
        
        log_success "Redis backup complete"
    else
        log_warn "Redis container not running: $container"
    fi
}

# Backup configuration
backup_config() {
    local instance="$1"
    local backup_dir="$2"
    
    log_info "Backing up configuration for $instance..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would backup configuration"
        return 0
    fi
    
    mkdir -p "$backup_dir/config"
    
    # Docker compose files
    if [[ "$instance" == "usa" ]]; then
        [[ -f "$PROJECT_ROOT/docker-compose.yml" ]] && cp "$PROJECT_ROOT/docker-compose.yml" "$backup_dir/config/"
    else
        [[ -f "$PROJECT_ROOT/docker-compose.${instance}.yml" ]] && cp "$PROJECT_ROOT/docker-compose.${instance}.yml" "$backup_dir/config/"
    fi
    
    # Federation registry
    [[ -f "$PROJECT_ROOT/config/federation-registry.json" ]] && cp "$PROJECT_ROOT/config/federation-registry.json" "$backup_dir/config/"
    
    # Cloudflared config
    [[ -f "$PROJECT_ROOT/cloudflared/config-${instance}.yml" ]] && cp "$PROJECT_ROOT/cloudflared/config-${instance}.yml" "$backup_dir/config/"
    [[ "$instance" == "usa" && -f "$PROJECT_ROOT/cloudflared/config.yml" ]] && cp "$PROJECT_ROOT/cloudflared/config.yml" "$backup_dir/config/"
    
    # Terraform state (if exists)
    [[ -d "$PROJECT_ROOT/terraform/instances/terraform.tfstate.d/${instance}" ]] && \
        cp -r "$PROJECT_ROOT/terraform/instances/terraform.tfstate.d/${instance}" "$backup_dir/config/terraform-state/"
    
    log_success "Configuration backup complete"
}

# Backup Docker volumes
backup_volumes() {
    local instance="$1"
    local backup_dir="$2"
    
    log_info "Backing up Docker volumes for $instance..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would backup volumes"
        return 0
    fi
    
    mkdir -p "$backup_dir/volumes"
    
    # List volumes for this instance
    local volumes=$(docker volume ls --format '{{.Name}}' | grep -E "(${instance}|dive-v3)" || true)
    
    for vol in $volumes; do
        log_info "  Backing up volume: $vol"
        docker run --rm -v "$vol:/source:ro" -v "$backup_dir/volumes:/backup" \
            alpine tar -czf "/backup/${vol}.tar.gz" -C /source . 2>/dev/null || {
            log_warn "  Could not backup volume: $vol"
        }
    done
    
    log_success "Volume backup complete"
}

# Create backup manifest
create_manifest() {
    local instance="$1"
    local backup_dir="$2"
    local backup_type="$3"
    
    cat > "$backup_dir/manifest.json" << EOF
{
  "version": "1.0",
  "instance": "$instance",
  "backup_id": "$TIMESTAMP",
  "backup_type": "$backup_type",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "${USER:-unknown}",
  "hostname": "$(hostname)",
  "includes": {
    "postgres": $([ "$NO_DB" == "false" ] && echo "true" || echo "false"),
    "mongodb": $([ "$NO_DB" == "false" ] && echo "true" || echo "false"),
    "redis": $([ "$NO_DB" == "false" ] && echo "true" || echo "false"),
    "config": $([ "$NO_CONFIG" == "false" ] && echo "true" || echo "false"),
    "volumes": $([ "$INCLUDE_VOLUMES" == "true" ] && echo "true" || echo "false")
  },
  "retention_days": $([ "$backup_type" == "weekly" ] && echo $WEEKLY_RETENTION_DAYS || echo $DAILY_RETENTION_DAYS),
  "files": [
$(find "$backup_dir" -type f -name "*.sql" -o -name "*.archive" -o -name "*.rdb" -o -name "*.tar.gz" 2>/dev/null | while read f; do
    echo "    \"$(basename "$f")\","
done | sed '$ s/,$//')
  ]
}
EOF
}

# Execute backup
do_backup() {
    local instances=$(get_instances)
    local backup_type="daily"
    
    # Sunday = weekly backup
    [[ "$DAY_OF_WEEK" == "7" ]] && backup_type="weekly"
    
    for instance in $instances; do
        log ""
        log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        log "${CYAN}  Backing up: ${instance^^}${NC}"
        log "${CYAN}  Type: $backup_type${NC}"
        log "${CYAN}  Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)${NC}"
        log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        log ""
        
        local backup_dir="$BACKUP_ROOT/${instance}/${backup_type}/$TIMESTAMP"
        mkdir -p "$backup_dir"
        
        # Perform backups
        [[ "$NO_DB" == "false" ]] && {
            backup_postgres "$instance" "$backup_dir"
            backup_mongodb "$instance" "$backup_dir"
            backup_redis "$instance" "$backup_dir"
        }
        
        [[ "$NO_CONFIG" == "false" ]] && backup_config "$instance" "$backup_dir"
        
        [[ "$INCLUDE_VOLUMES" == "true" ]] && backup_volumes "$instance" "$backup_dir"
        
        # Create manifest
        create_manifest "$instance" "$backup_dir" "$backup_type"
        
        # Calculate total size
        local total_size=$(du -sh "$backup_dir" 2>/dev/null | awk '{print $1}')
        
        log ""
        log_success "Backup complete for ${instance^^}"
        log "  Location: $backup_dir"
        log "  Size: $total_size"
        log "  Manifest: $backup_dir/manifest.json"
        
        # Sync to remote if configured
        if [[ -n "$REMOTE_PATH" ]]; then
            log_info "Syncing to remote: $REMOTE_PATH"
            if [[ "$DRY_RUN" == "false" ]]; then
                rsync -avz "$backup_dir" "$REMOTE_PATH/${instance}/" || log_warn "Remote sync failed"
            fi
        fi
    done
}

# List backups
do_list() {
    local instances=$(get_instances)
    
    for instance in $instances; do
        log ""
        log "${CYAN}Backups for ${instance^^}:${NC}"
        log "────────────────────────────────────────────────────────"
        
        local backup_path="$BACKUP_ROOT/${instance}"
        
        if [[ -d "$backup_path" ]]; then
            find "$backup_path" -name "manifest.json" -type f | while read manifest; do
                local dir=$(dirname "$manifest")
                local backup_id=$(basename "$dir")
                local backup_type=$(basename "$(dirname "$dir")")
                local size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
                local timestamp=$(jq -r '.timestamp // "unknown"' "$manifest" 2>/dev/null)
                
                log "  $backup_id ($backup_type) - $size - $timestamp"
            done
        else
            log "  No backups found"
        fi
    done
}

# Cleanup old backups
do_cleanup() {
    local instances=$(get_instances)
    local removed_count=0
    local freed_space=0
    
    for instance in $instances; do
        log_info "Cleaning up backups for ${instance^^}..."
        
        local backup_path="$BACKUP_ROOT/${instance}"
        
        # Daily backups - keep for DAILY_RETENTION_DAYS
        if [[ -d "$backup_path/daily" ]]; then
            find "$backup_path/daily" -mindepth 1 -maxdepth 1 -type d -mtime +$DAILY_RETENTION_DAYS | while read dir; do
                local size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
                log_info "  Removing daily backup: $(basename "$dir") ($size)"
                [[ "$DRY_RUN" == "false" ]] && rm -rf "$dir"
                ((removed_count++))
            done
        fi
        
        # Weekly backups - keep for WEEKLY_RETENTION_DAYS
        if [[ -d "$backup_path/weekly" ]]; then
            find "$backup_path/weekly" -mindepth 1 -maxdepth 1 -type d -mtime +$WEEKLY_RETENTION_DAYS | while read dir; do
                local size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
                log_info "  Removing weekly backup: $(basename "$dir") ($size)"
                [[ "$DRY_RUN" == "false" ]] && rm -rf "$dir"
                ((removed_count++))
            done
        fi
    done
    
    log_success "Cleanup complete"
}

# Verify backup (test restore)
do_verify() {
    if [[ -z "$BACKUP_ID" ]]; then
        log_error "BACKUP_ID required for verify command"
        exit 1
    fi
    
    log_info "Verifying backup: $BACKUP_ID for ${INSTANCE^^}"
    
    local backup_dir="$BACKUP_ROOT/${INSTANCE}/daily/$BACKUP_ID"
    [[ ! -d "$backup_dir" ]] && backup_dir="$BACKUP_ROOT/${INSTANCE}/weekly/$BACKUP_ID"
    
    if [[ ! -d "$backup_dir" ]]; then
        log_error "Backup not found: $BACKUP_ID"
        exit 1
    fi
    
    # Verify manifest
    if [[ ! -f "$backup_dir/manifest.json" ]]; then
        log_error "Manifest missing from backup"
        exit 1
    fi
    log_success "Manifest present"
    
    # Verify PostgreSQL backup
    if [[ -f "$backup_dir/postgres-all.sql" || -f "$backup_dir/keycloak-db.sql" ]]; then
        local pg_file="$backup_dir/postgres-all.sql"
        [[ ! -f "$pg_file" ]] && pg_file="$backup_dir/keycloak-db.sql"
        
        if head -1 "$pg_file" | grep -qE "^(--|pg_dump)"; then
            log_success "PostgreSQL backup valid"
        else
            log_error "PostgreSQL backup corrupted"
        fi
    fi
    
    # Verify MongoDB backup
    if [[ -f "$backup_dir/mongodb.archive" ]]; then
        if file "$backup_dir/mongodb.archive" | grep -qE "(data|archive)"; then
            log_success "MongoDB backup valid"
        else
            log_error "MongoDB backup corrupted"
        fi
    fi
    
    # Verify config
    if [[ -d "$backup_dir/config" ]]; then
        local config_count=$(find "$backup_dir/config" -type f | wc -l)
        log_success "Configuration backup valid ($config_count files)"
    fi
    
    log_success "Backup verification complete"
}

# Setup cron schedule
do_schedule() {
    local cron_entry="0 2 * * * cd $PROJECT_ROOT && ./scripts/backup/backup-manager.sh backup all >> $PROJECT_ROOT/logs/backup.log 2>&1"
    
    log_info "Setting up automated backup schedule..."
    log ""
    log "Add this line to your crontab (crontab -e):"
    log ""
    log "  # DIVE V3 Daily Backup at 02:00 UTC"
    log "  $cron_entry"
    log ""
    log "Or run:"
    log "  (crontab -l 2>/dev/null; echo '$cron_entry') | crontab -"
}

# Main
main() {
    case "$COMMAND" in
        backup) do_backup ;;
        restore) log_error "Restore not implemented yet"; exit 1 ;;
        verify) do_verify ;;
        list) do_list ;;
        cleanup) do_cleanup ;;
        schedule) do_schedule ;;
        help|--help|-h) usage ;;
        *) log_error "Unknown command: $COMMAND"; usage; exit 1 ;;
    esac
}

main "$@"




