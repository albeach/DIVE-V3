#!/usr/bin/env bash
# ============================================
# DIVE V3 - Setup Scheduled Monitoring
# ============================================
# Configures scheduled health checks via:
# - macOS: launchd (LaunchAgent)
# - Linux: cron or systemd timer
#
# Usage:
#   ./scripts/monitoring/setup-scheduled-monitoring.sh install
#   ./scripts/monitoring/setup-scheduled-monitoring.sh uninstall
#   ./scripts/monitoring/setup-scheduled-monitoring.sh status
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
HEALTH_CHECK_SCRIPT="$SCRIPT_DIR/health-check.sh"
LOG_DIR="$PROJECT_ROOT/logs/monitoring"

# Configuration
CHECK_INTERVAL_MINUTES="${CHECK_INTERVAL_MINUTES:-5}"
ALERT_ON_FAILURE="${ALERT_ON_FAILURE:-true}"

# Detect OS
OS_TYPE="$(uname -s)"

mkdir -p "$LOG_DIR"

# ============================================
# macOS LaunchAgent Setup
# ============================================
setup_macos_launchd() {
    local plist_path="$HOME/Library/LaunchAgents/com.dive-v3.health-monitor.plist"
    local label="com.dive-v3.health-monitor"
    
    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$label</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$HEALTH_CHECK_SCRIPT</string>
        <string>--alert</string>
    </array>
    <key>StartInterval</key>
    <integer>$((CHECK_INTERVAL_MINUTES * 60))</integer>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/scheduled-check.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/scheduled-check-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>SLACK_WEBHOOK_URL</key>
        <string>\${SLACK_WEBHOOK_URL:-}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

    echo "Created LaunchAgent: $plist_path"
    launchctl unload "$plist_path" 2>/dev/null || true
    launchctl load "$plist_path"
    echo "LaunchAgent loaded - monitoring every $CHECK_INTERVAL_MINUTES minutes"
}

uninstall_macos_launchd() {
    local plist_path="$HOME/Library/LaunchAgents/com.dive-v3.health-monitor.plist"
    
    if [[ -f "$plist_path" ]]; then
        launchctl unload "$plist_path" 2>/dev/null || true
        rm -f "$plist_path"
        echo "LaunchAgent removed"
    else
        echo "LaunchAgent not installed"
    fi
}

status_macos_launchd() {
    local label="com.dive-v3.health-monitor"
    if launchctl list | grep -q "$label"; then
        echo "Status: RUNNING"
        launchctl list | grep "$label"
    else
        echo "Status: NOT RUNNING"
    fi
}

# ============================================
# Linux Cron Setup
# ============================================
setup_linux_cron() {
    local cron_entry="*/$CHECK_INTERVAL_MINUTES * * * * $HEALTH_CHECK_SCRIPT --alert >> $LOG_DIR/scheduled-check.log 2>&1"
    
    # Add to crontab
    (crontab -l 2>/dev/null | grep -v "dive-v3.*health-check"; echo "$cron_entry") | crontab -
    
    echo "Cron job installed - monitoring every $CHECK_INTERVAL_MINUTES minutes"
    echo "Entry: $cron_entry"
}

uninstall_linux_cron() {
    crontab -l 2>/dev/null | grep -v "dive-v3.*health-check" | crontab - || true
    echo "Cron job removed"
}

status_linux_cron() {
    if crontab -l 2>/dev/null | grep -q "dive-v3.*health-check"; then
        echo "Status: INSTALLED"
        crontab -l | grep "dive-v3.*health-check"
    else
        echo "Status: NOT INSTALLED"
    fi
}

# ============================================
# Linux Systemd Timer Setup (Alternative)
# ============================================
setup_linux_systemd() {
    local service_dir="/etc/systemd/system"
    
    # Create service file
    sudo tee "$service_dir/dive-v3-health-monitor.service" > /dev/null << EOF
[Unit]
Description=DIVE V3 Health Monitor
After=network.target

[Service]
Type=oneshot
ExecStart=$HEALTH_CHECK_SCRIPT --alert
StandardOutput=append:$LOG_DIR/scheduled-check.log
StandardError=append:$LOG_DIR/scheduled-check-error.log
EOF

    # Create timer file
    sudo tee "$service_dir/dive-v3-health-monitor.timer" > /dev/null << EOF
[Unit]
Description=DIVE V3 Health Monitor Timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=${CHECK_INTERVAL_MINUTES}min
Persistent=true

[Install]
WantedBy=timers.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable dive-v3-health-monitor.timer
    sudo systemctl start dive-v3-health-monitor.timer
    
    echo "Systemd timer installed - monitoring every $CHECK_INTERVAL_MINUTES minutes"
}

uninstall_linux_systemd() {
    sudo systemctl stop dive-v3-health-monitor.timer 2>/dev/null || true
    sudo systemctl disable dive-v3-health-monitor.timer 2>/dev/null || true
    sudo rm -f /etc/systemd/system/dive-v3-health-monitor.{service,timer}
    sudo systemctl daemon-reload
    echo "Systemd timer removed"
}

status_linux_systemd() {
    if systemctl is-active --quiet dive-v3-health-monitor.timer 2>/dev/null; then
        echo "Status: RUNNING"
        systemctl status dive-v3-health-monitor.timer --no-pager
    else
        echo "Status: NOT RUNNING"
    fi
}

# ============================================
# Main
# ============================================
ACTION="${1:-status}"

case "$OS_TYPE" in
    Darwin)
        case "$ACTION" in
            install) setup_macos_launchd ;;
            uninstall) uninstall_macos_launchd ;;
            status) status_macos_launchd ;;
            *) echo "Usage: $0 {install|uninstall|status}"; exit 1 ;;
        esac
        ;;
    Linux)
        # Prefer systemd if available, fallback to cron
        if command -v systemctl &> /dev/null; then
            case "$ACTION" in
                install) setup_linux_systemd ;;
                uninstall) uninstall_linux_systemd ;;
                status) status_linux_systemd ;;
                *) echo "Usage: $0 {install|uninstall|status}"; exit 1 ;;
            esac
        else
            case "$ACTION" in
                install) setup_linux_cron ;;
                uninstall) uninstall_linux_cron ;;
                status) status_linux_cron ;;
                *) echo "Usage: $0 {install|uninstall|status}"; exit 1 ;;
            esac
        fi
        ;;
    *)
        echo "Unsupported OS: $OS_TYPE"
        exit 1
        ;;
esac

