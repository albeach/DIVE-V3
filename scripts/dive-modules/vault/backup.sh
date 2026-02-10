#!/usr/bin/env bash
##
# DIVE V3 — Vault Automated Backup Module
#
# Extends existing module_vault_snapshot() with retention management
# and scheduling (macOS LaunchAgent / Linux cron).
#
# Commands:
#   ./dive vault backup-run       Create snapshot + prune old
#   ./dive vault backup-list      List snapshots with size/date
#   ./dive vault backup-schedule  Enable/disable daily backups
#
# Date: February 2026
##

# Configurable via environment
VAULT_BACKUP_DIR="${DIVE_ROOT}/backups/vault"
VAULT_BACKUP_RETENTION_DAYS="${VAULT_BACKUP_RETENTION_DAYS:-7}"
VAULT_BACKUP_HOUR="${VAULT_BACKUP_HOUR:-2}"
VAULT_BACKUP_PLIST_ID="com.dive.vault-backup"
VAULT_BACKUP_PLIST_PATH="${HOME}/Library/LaunchAgents/${VAULT_BACKUP_PLIST_ID}.plist"

##
# Create a Vault snapshot and prune old backups
# Usage: ./dive vault backup-run
##
module_vault_backup_run() {
    log_info "Running Vault backup with ${VAULT_BACKUP_RETENTION_DAYS}-day retention..."

    mkdir -p "$VAULT_BACKUP_DIR"

    # Step 1: Create snapshot using existing function
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local snap_path="${VAULT_BACKUP_DIR}/vault-snapshot-${timestamp}.snap"

    if ! module_vault_snapshot "$snap_path"; then
        log_error "Snapshot creation failed"
        return 1
    fi

    # Step 2: Prune snapshots older than retention period
    local pruned=0
    while IFS= read -r old_snap; do
        [ -z "$old_snap" ] && continue
        rm -f "$old_snap"
        pruned=$((pruned + 1))
        log_verbose "  Pruned: $(basename "$old_snap")"
    done < <(find "$VAULT_BACKUP_DIR" -name "vault-snapshot-*.snap" -mtime "+${VAULT_BACKUP_RETENTION_DAYS}" 2>/dev/null)

    # Step 3: Summary
    local remaining
    remaining=$(find "$VAULT_BACKUP_DIR" -name "vault-snapshot-*.snap" 2>/dev/null | wc -l | tr -d ' ')
    local total_size
    total_size=$(du -sh "$VAULT_BACKUP_DIR" 2>/dev/null | awk '{print $1}')

    log_success "Vault backup complete"
    log_info "  Snapshot: $(basename "$snap_path")"
    if [ "$pruned" -gt 0 ]; then
        log_info "  Pruned: ${pruned} snapshot(s) older than ${VAULT_BACKUP_RETENTION_DAYS} days"
    fi
    log_info "  Total: ${remaining} snapshot(s), ${total_size}"
}

##
# List all Vault snapshots
# Usage: ./dive vault backup-list
##
module_vault_backup_list() {
    if [ ! -d "$VAULT_BACKUP_DIR" ]; then
        log_info "No backup directory found: $VAULT_BACKUP_DIR"
        return 0
    fi

    local count
    count=$(find "$VAULT_BACKUP_DIR" -name "vault-snapshot-*.snap" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$count" -eq 0 ]; then
        log_info "No Vault snapshots found"
        log_info "  Create one with: ./dive vault backup-run"
        return 0
    fi

    echo ""
    printf "  %-40s  %8s  %s\n" "SNAPSHOT" "SIZE" "DATE"
    printf "  %-40s  %8s  %s\n" "────────────────────────────────────────" "────────" "───────────────────"

    find "$VAULT_BACKUP_DIR" -name "vault-snapshot-*.snap" -exec ls -lh {} \; 2>/dev/null | \
        sort -k9 | \
        while read -r _ _ _ _ size _ _ _ filepath; do
            local filename
            filename=$(basename "$filepath")
            local filedate
            filedate=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$filepath" 2>/dev/null || date -r "$filepath" "+%Y-%m-%d %H:%M" 2>/dev/null)
            printf "  %-40s  %8s  %s\n" "$filename" "$size" "$filedate"
        done

    echo ""
    local total_size
    total_size=$(du -sh "$VAULT_BACKUP_DIR" 2>/dev/null | awk '{print $1}')
    log_info "Total: ${count} snapshot(s), ${total_size}"
    log_info "Retention: ${VAULT_BACKUP_RETENTION_DAYS} days"
}

##
# Enable or disable automated daily backups
# Usage: ./dive vault backup-schedule [enable|disable]
##
module_vault_backup_schedule() {
    local action="${1:-enable}"

    case "$action" in
        enable)
            _vault_backup_schedule_enable
            ;;
        disable)
            _vault_backup_schedule_disable
            ;;
        status)
            _vault_backup_schedule_status
            ;;
        *)
            log_error "Usage: ./dive vault backup-schedule [enable|disable|status]"
            return 1
            ;;
    esac
}

_vault_backup_schedule_enable() {
    local dive_bin
    dive_bin=$(cd "$DIVE_ROOT" && pwd)/dive

    if [ "$(uname)" = "Darwin" ]; then
        # macOS: LaunchAgent plist
        mkdir -p "$(dirname "$VAULT_BACKUP_PLIST_PATH")"

        cat > "$VAULT_BACKUP_PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${VAULT_BACKUP_PLIST_ID}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${dive_bin}</string>
        <string>vault</string>
        <string>backup-run</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${VAULT_BACKUP_HOUR}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${DIVE_ROOT}/logs/vault-backup.log</string>
    <key>StandardErrorPath</key>
    <string>${DIVE_ROOT}/logs/vault-backup.log</string>
    <key>WorkingDirectory</key>
    <string>${DIVE_ROOT}</string>
</dict>
</plist>
PLIST

        # Load the agent
        launchctl unload "$VAULT_BACKUP_PLIST_PATH" 2>/dev/null
        launchctl load "$VAULT_BACKUP_PLIST_PATH"

        log_success "Vault daily backup scheduled (macOS LaunchAgent)"
        log_info "  Schedule: daily at ${VAULT_BACKUP_HOUR}:00"
        log_info "  Retention: ${VAULT_BACKUP_RETENTION_DAYS} days"
        log_info "  Log: ${DIVE_ROOT}/logs/vault-backup.log"
        log_info "  Disable: ./dive vault backup-schedule disable"
    else
        # Linux: crontab
        local cron_entry="0 ${VAULT_BACKUP_HOUR} * * * cd ${DIVE_ROOT} && ${dive_bin} vault backup-run >> ${DIVE_ROOT}/logs/vault-backup.log 2>&1"

        # Remove existing entry, add new
        (crontab -l 2>/dev/null | grep -v "vault backup-run"; echo "$cron_entry") | crontab -

        log_success "Vault daily backup scheduled (crontab)"
        log_info "  Schedule: daily at ${VAULT_BACKUP_HOUR}:00"
        log_info "  Retention: ${VAULT_BACKUP_RETENTION_DAYS} days"
        log_info "  Log: ${DIVE_ROOT}/logs/vault-backup.log"
        log_info "  Disable: ./dive vault backup-schedule disable"
    fi

    mkdir -p "${DIVE_ROOT}/logs"
}

_vault_backup_schedule_disable() {
    if [ "$(uname)" = "Darwin" ]; then
        if [ -f "$VAULT_BACKUP_PLIST_PATH" ]; then
            launchctl unload "$VAULT_BACKUP_PLIST_PATH" 2>/dev/null
            rm -f "$VAULT_BACKUP_PLIST_PATH"
            log_success "Vault daily backup disabled (LaunchAgent removed)"
        else
            log_info "No LaunchAgent found — backup was not scheduled"
        fi
    else
        if crontab -l 2>/dev/null | grep -q "vault backup-run"; then
            crontab -l 2>/dev/null | grep -v "vault backup-run" | crontab -
            log_success "Vault daily backup disabled (crontab entry removed)"
        else
            log_info "No crontab entry found — backup was not scheduled"
        fi
    fi
}

_vault_backup_schedule_status() {
    local scheduled=false

    if [ "$(uname)" = "Darwin" ]; then
        if [ -f "$VAULT_BACKUP_PLIST_PATH" ] && launchctl list 2>/dev/null | grep -q "$VAULT_BACKUP_PLIST_ID"; then
            scheduled=true
        fi
    else
        if crontab -l 2>/dev/null | grep -q "vault backup-run"; then
            scheduled=true
        fi
    fi

    if [ "$scheduled" = "true" ]; then
        log_success "Vault backup schedule: ACTIVE"
        log_info "  Schedule: daily at ${VAULT_BACKUP_HOUR}:00"
        log_info "  Retention: ${VAULT_BACKUP_RETENTION_DAYS} days"
        log_info "  Backup dir: ${VAULT_BACKUP_DIR}"
    else
        log_info "Vault backup schedule: NOT ACTIVE"
        log_info "  Enable: ./dive vault backup-schedule enable"
    fi
}
