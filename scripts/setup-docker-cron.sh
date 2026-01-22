#!/usr/bin/env bash
# =============================================================================
# Setup Automated Docker Maintenance Cron Jobs
# =============================================================================
# Installs cron jobs to run Docker maintenance automatically
# Prevents disk utilization from ballooning by regular cleanup
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Simple logging functions (standalone)
log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_header() {
    echo "================================================================================="
    echo "  DIVE V3 Docker Cron Setup"
    echo "  Automated Docker maintenance scheduling"
    echo "================================================================================="
}

# =============================================================================
# CONSTANTS
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAINTENANCE_SCRIPT="${SCRIPT_DIR}/docker-maintenance.sh"
CRON_FILE="/tmp/dive-docker-cron"
LOG_FILE="${HOME}/Library/Logs/DIVE-Docker-Maintenance.log"

# =============================================================================
# FUNCTIONS
# =============================================================================

setup_cron_job() {
    local frequency="$1"
    local cron_schedule="$2"

    print_header
    echo -e "${BOLD}Setting up Docker Maintenance Cron Job${NC}"
    echo "Frequency: $frequency"
    echo "Schedule: $cron_schedule"
    echo ""

    # Create cron job entry
    local cron_entry="${cron_schedule} ${MAINTENANCE_SCRIPT} cleanup >> ${LOG_FILE} 2>&1"

    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "docker-maintenance.sh"; then
        echo -e "${YELLOW}Cron job already exists. Updating...${NC}"
        # Remove existing cron job
        crontab -l 2>/dev/null | grep -v "docker-maintenance.sh" | crontab -
    fi

    # Add new cron job
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -

    echo -e "${GREEN}✓ Cron job installed${NC}"
    echo "Log file: $LOG_FILE"
    echo ""
    echo "To view cron jobs: crontab -l"
    echo "To remove cron job: crontab -l | grep -v docker-maintenance | crontab -"
}

setup_weekly_cron() {
    # Run every Sunday at 2 AM
    setup_cron_job "Weekly (Sunday 2 AM)" "0 2 * * 0"
}

setup_daily_cron() {
    # Run every day at 2 AM
    setup_cron_job "Daily (2 AM)" "0 2 * * *"
}

setup_hourly_cron() {
    # Run every 6 hours (for development/testing)
    setup_cron_job "Every 6 hours" "0 */6 * * *"
}

remove_cron_job() {
    print_header
    echo -e "${BOLD}Removing Docker Maintenance Cron Job${NC}"
    echo ""

    if crontab -l 2>/dev/null | grep -q "docker-maintenance.sh"; then
        crontab -l 2>/dev/null | grep -v "docker-maintenance.sh" | crontab -
        echo -e "${GREEN}✓ Cron job removed${NC}"
    else
        echo -e "${YELLOW}No cron job found${NC}"
    fi
}

list_cron_jobs() {
    print_header
    echo -e "${BOLD}Current Docker Maintenance Cron Jobs${NC}"
    echo ""

    if crontab -l 2>/dev/null | grep -q "docker-maintenance.sh"; then
        echo "Active cron jobs:"
        crontab -l 2>/dev/null | grep "docker-maintenance.sh" | nl
    else
        echo -e "${YELLOW}No Docker maintenance cron jobs found${NC}"
    fi
    echo ""
    echo "All cron jobs:"
    crontab -l 2>/dev/null || echo "No cron jobs configured"
}

test_cron_job() {
    print_header
    echo -e "${BOLD}Testing Docker Maintenance Cron Job${NC}"
    echo ""

    if [ ! -x "$MAINTENANCE_SCRIPT" ]; then
        log_error "Maintenance script not found or not executable: $MAINTENANCE_SCRIPT"
        return 1
    fi

    echo "Running maintenance script..."
    if "$MAINTENANCE_SCRIPT" cleanup --dry-run; then
        echo -e "${GREEN}✓ Test successful${NC}"
    else
        log_error "Test failed"
        return 1
    fi
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  daily      Install daily cron job (recommended for production)"
    echo "  weekly     Install weekly cron job (conservative)"
    echo "  hourly     Install 6-hourly cron job (for development/testing)"
    echo "  remove     Remove existing cron job"
    echo "  list       List current cron jobs"
    echo "  test       Test the maintenance script"
    echo ""
    echo "Examples:"
    echo "  $0 daily    # Install daily maintenance"
    echo "  $0 test     # Test before installing"
    echo "  $0 remove   # Remove cron job"
}

main() {
    local command="${1:-}"

    case "$command" in
        daily)
            setup_daily_cron
            ;;
        weekly)
            setup_weekly_cron
            ;;
        hourly)
            setup_hourly_cron
            ;;
        remove)
            remove_cron_job
            ;;
        list)
            list_cron_jobs
            ;;
        test)
            test_cron_job
            ;;
        --help|-h|"")
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"