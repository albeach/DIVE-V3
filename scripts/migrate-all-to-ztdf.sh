#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Complete ZTDF Migration Script
# =============================================================================
# Migrates all hub and spoke instances from plaintext to ZTDF-encrypted
# resources with locale-aware classification labels.
#
# Usage:
#   ./scripts/migrate-all-to-ztdf.sh [options]
#
# Options:
#   --dry-run          Show what would be done without executing
#   --backup           Create backups before migration
#   --skip-hub         Skip hub migration
#   --spokes <list>    Migrate specific spokes only (comma-separated)
#   --parallel         Migrate spokes in parallel (faster but more resource intensive)
#   --verify-only      Only run verification, skip migration
#
# Examples:
#   ./scripts/migrate-all-to-ztdf.sh --backup
#   ./scripts/migrate-all-to-ztdf.sh --spokes fra,deu,gbr
#   ./scripts/migrate-all-to-ztdf.sh --verify-only
#
# Date: December 20, 2025
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# =============================================================================
# COLORS & LOGGING
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }
log_header() { echo -e "${BOLD}${MAGENTA}$1${NC}"; }

# =============================================================================
# CONFIGURATION
# =============================================================================

DRY_RUN=false
CREATE_BACKUP=false
SKIP_HUB=false
VERIFY_ONLY=false
PARALLEL=false
SPECIFIC_SPOKES=""
RESOURCE_COUNT=5000

# Migration tracking
MIGRATION_LOG="logs/migration-$(date +%Y%m%d-%H%M%S).log"
MIGRATION_REPORT="logs/migration-report-$(date +%Y%m%d-%H%M%S).json"
BACKUP_DIR="backups/ztdf-migration-$(date +%Y%m%d-%H%M%S)"

# Create log directory
mkdir -p "$(dirname "$MIGRATION_LOG")"
mkdir -p "$(dirname "$MIGRATION_REPORT")"

# Statistics
TOTAL_INSTANCES=0
MIGRATED_INSTANCES=0
FAILED_INSTANCES=0
SKIPPED_INSTANCES=0

declare -A INSTANCE_STATUS
declare -A INSTANCE_ZTDF_COUNT
declare -A INSTANCE_TOTAL_COUNT
declare -A INSTANCE_LOCALE_COUNT

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --backup)
            CREATE_BACKUP=true
            shift
            ;;
        --skip-hub)
            SKIP_HUB=true
            shift
            ;;
        --spokes)
            SPECIFIC_SPOKES="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --verify-only)
            VERIFY_ONLY=true
            shift
            ;;
        --count)
            RESOURCE_COUNT="$2"
            shift 2
            ;;
        -h|--help)
            head -n 30 "$0" | grep "^#" | sed 's/^# //'
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Run with --help for usage information"
            exit 1
            ;;
    esac
done

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

log_to_file() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$MIGRATION_LOG"
}

check_container_running() {
    local container_name="$1"
    docker ps --format '{{.Names}}' | grep -q "^${container_name}$"
}

get_mongo_stats() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    if [ "$instance_code" = "USA" ] || [ "$instance_code" = "HUB" ]; then
        local mongo_container="dive-hub-mongodb"
        local db_name="dive-v3-hub"
    else
        local mongo_container="dive-spoke-${code_lower}-mongodb"
        local db_name="dive-v3-${code_lower}"
    fi

    if ! check_container_running "$mongo_container"; then
        echo "0:0:0"
        return 1
    fi

    local mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
    local mongo_uri="mongodb://localhost:27017/${db_name}?authSource=admin"

    if [ -n "$mongo_pass" ]; then
        mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/${db_name}?authSource=admin"
    fi

    # Get counts
    local total=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

    local ztdf=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

    local locale=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
        --eval "db.resources.countDocuments({ 'ztdf.policy.securityLabel.originalClassification': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

    echo "${total}:${ztdf}:${locale}"
}

verify_instance() {
    local instance_code="$1"
    local stats=$(get_mongo_stats "$instance_code")

    IFS=':' read -r total ztdf locale <<< "$stats"

    INSTANCE_TOTAL_COUNT[$instance_code]=$total
    INSTANCE_ZTDF_COUNT[$instance_code]=$ztdf
    INSTANCE_LOCALE_COUNT[$instance_code]=$locale

    if [ "$total" -eq 0 ]; then
        INSTANCE_STATUS[$instance_code]="EMPTY"
        return 2
    elif [ "$ztdf" -ge $((total * 98 / 100)) ]; then
        if [ "$locale" -ge $((ztdf * 95 / 100)) ]; then
            INSTANCE_STATUS[$instance_code]="PASS"
            return 0
        else
            INSTANCE_STATUS[$instance_code]="PARTIAL"
            return 1
        fi
    else
        INSTANCE_STATUS[$instance_code]="FAIL"
        return 1
    fi
}

backup_instance() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Backing up $instance_code..."

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would backup $instance_code to $BACKUP_DIR/$code_lower"
        return 0
    fi

    mkdir -p "$BACKUP_DIR/$code_lower"

    if [ "$instance_code" = "USA" ] || [ "$instance_code" = "HUB" ]; then
        local mongo_container="dive-hub-mongodb"
        local db_name="dive-v3-hub"
    else
        local mongo_container="dive-spoke-${code_lower}-mongodb"
        local db_name="dive-v3-${code_lower}"
    fi

    if check_container_running "$mongo_container"; then
        docker exec "$mongo_container" mongodump \
            --db="$db_name" \
            --archive="/tmp/backup-${code_lower}.archive" 2>/dev/null || {
            log_warn "Backup failed for $instance_code"
            return 1
        }

        docker cp "$mongo_container:/tmp/backup-${code_lower}.archive" \
            "$BACKUP_DIR/$code_lower/mongodb.archive" 2>/dev/null

        docker exec "$mongo_container" rm "/tmp/backup-${code_lower}.archive" 2>/dev/null

        log_success "Backed up $instance_code"
        log_to_file "BACKUP: $instance_code → $BACKUP_DIR/$code_lower"
    else
        log_warn "MongoDB container not running for $instance_code"
        return 1
    fi
}

migrate_instance() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_header "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Migrating: $instance_code"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    TOTAL_INSTANCES=$((TOTAL_INSTANCES + 1))

    # Verify current state
    log_step "Checking current state..."
    verify_instance "$instance_code"
    local verify_result=$?

    local total=${INSTANCE_TOTAL_COUNT[$instance_code]}
    local ztdf=${INSTANCE_ZTDF_COUNT[$instance_code]}
    local locale=${INSTANCE_LOCALE_COUNT[$instance_code]}

    echo "  Total Resources:        $total"
    echo "  ZTDF Encrypted:         $ztdf"
    echo "  With Locale Labels:     $locale"
    echo ""

    if [ $verify_result -eq 0 ]; then
        log_success "$instance_code already compliant (skipping)"
        INSTANCE_STATUS[$instance_code]="SKIP"
        SKIPPED_INSTANCES=$((SKIPPED_INSTANCES + 1))
        log_to_file "SKIP: $instance_code (already compliant)"
        return 0
    fi

    if [ "$VERIFY_ONLY" = true ]; then
        log_info "Verify-only mode (skipping migration)"
        return 0
    fi

    # Backup if requested
    if [ "$CREATE_BACKUP" = true ]; then
        backup_instance "$instance_code" || {
            log_error "Backup failed for $instance_code"
            FAILED_INSTANCES=$((FAILED_INSTANCES + 1))
            INSTANCE_STATUS[$instance_code]="BACKUP_FAILED"
            return 1
        }
    fi

    # Check backend container
    local backend_container
    if [ "$instance_code" = "USA" ] || [ "$instance_code" = "HUB" ]; then
        backend_container="dive-hub-backend"
    else
        backend_container="dive-spoke-${code_lower}-backend"
    fi

    log_step "Checking backend container..."
    if ! check_container_running "$backend_container"; then
        log_error "Backend container not running: $backend_container"
        FAILED_INSTANCES=$((FAILED_INSTANCES + 1))
        INSTANCE_STATUS[$instance_code]="BACKEND_DOWN"
        log_to_file "FAIL: $instance_code (backend not running)"
        return 1
    fi

    # Wait for backend readiness
    log_step "Waiting for backend to be ready..."
    for i in {1..30}; do
        if docker exec "$backend_container" test -d /app/node_modules 2>/dev/null; then
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Backend not ready after 30 seconds"
            FAILED_INSTANCES=$((FAILED_INSTANCES + 1))
            INSTANCE_STATUS[$instance_code]="BACKEND_NOT_READY"
            return 1
        fi
        sleep 1
    done
    log_success "Backend ready"

    # Run ZTDF seeding
    log_step "Seeding $RESOURCE_COUNT ZTDF-encrypted resources..."

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would seed $instance_code with $RESOURCE_COUNT resources"
        MIGRATED_INSTANCES=$((MIGRATED_INSTANCES + 1))
        INSTANCE_STATUS[$instance_code]="DRY_RUN"
        return 0
    fi

    local start_time=$(date +%s)

    if docker exec "$backend_container" npm run seed:instance -- \
        --instance="$instance_code" \
        --count="$RESOURCE_COUNT" \
        --replace 2>&1 | tee -a "$MIGRATION_LOG"; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        log_success "Seeded $instance_code in ${duration}s"

        # Verify migration
        log_step "Verifying ZTDF encryption..."
        verify_instance "$instance_code"

        if [ $? -eq 0 ]; then
            log_success "$instance_code migration successful"
            MIGRATED_INSTANCES=$((MIGRATED_INSTANCES + 1))
            INSTANCE_STATUS[$instance_code]="SUCCESS"
            log_to_file "SUCCESS: $instance_code (${duration}s)"
        else
            log_warn "$instance_code migrated but verification failed"
            MIGRATED_INSTANCES=$((MIGRATED_INSTANCES + 1))
            INSTANCE_STATUS[$instance_code]="VERIFY_FAILED"
            log_to_file "PARTIAL: $instance_code (migration ok, verify failed)"
        fi
    else
        log_error "Seeding failed for $instance_code"
        FAILED_INSTANCES=$((FAILED_INSTANCES + 1))
        INSTANCE_STATUS[$instance_code]="SEED_FAILED"
        log_to_file "FAIL: $instance_code (seeding failed)"
        return 1
    fi
}

# =============================================================================
# DISCOVER INSTANCES
# =============================================================================

discover_instances() {
    local instances=()

    # Hub (USA)
    if [ "$SKIP_HUB" != true ]; then
        if check_container_running "dive-hub-backend"; then
            instances+=("USA")
        else
            log_warn "Hub not running (skipping)"
        fi
    fi

    # Spokes
    if [ -n "$SPECIFIC_SPOKES" ]; then
        # User specified spokes
        IFS=',' read -ra SPOKE_LIST <<< "$SPECIFIC_SPOKES"
        for spoke in "${SPOKE_LIST[@]}"; do
            local spoke_upper=$(upper "$spoke")
            instances+=("$spoke_upper")
        done
    else
        # Discover all spokes
        for dir in instances/*/; do
            if [ ! -d "$dir" ]; then
                continue
            fi

            local basename=$(basename "$dir")
            if [[ "$basename" == "hub" || "$basename" == "usa" || "$basename" == "shared" ]]; then
                continue
            fi

            local spoke_upper=$(upper "$basename")
            local backend_container="dive-spoke-${basename}-backend"

            if check_container_running "$backend_container"; then
                instances+=("$spoke_upper")
            else
                log_warn "Spoke $spoke_upper not running (skipping)"
            fi
        done
    fi

    echo "${instances[@]}"
}

# =============================================================================
# GENERATE REPORT
# =============================================================================

generate_report() {
    log_header "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  MIGRATION REPORT"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Summary
    echo -e "${BOLD}Summary:${NC}"
    echo "  Total Instances:        $TOTAL_INSTANCES"
    echo -e "  ${GREEN}Migrated:${NC}               $MIGRATED_INSTANCES"
    echo -e "  ${RED}Failed:${NC}                 $FAILED_INSTANCES"
    echo -e "  ${YELLOW}Skipped:${NC}                $SKIPPED_INSTANCES"
    echo ""

    # Detailed results
    echo -e "${BOLD}Detailed Results:${NC}"
    echo ""
    printf "  %-10s  %-12s  %-8s  %-8s  %-8s  %s\n" \
        "INSTANCE" "STATUS" "TOTAL" "ZTDF" "LOCALE" "COVERAGE"
    echo "  ────────────────────────────────────────────────────────────────"

    for instance_code in "${!INSTANCE_STATUS[@]}"; do
        local status="${INSTANCE_STATUS[$instance_code]}"
        local total="${INSTANCE_TOTAL_COUNT[$instance_code]:-0}"
        local ztdf="${INSTANCE_ZTDF_COUNT[$instance_code]:-0}"
        local locale="${INSTANCE_LOCALE_COUNT[$instance_code]:-0}"
        local coverage="N/A"

        if [ "$total" -gt 0 ]; then
            coverage="$((ztdf * 100 / total))%"
        fi

        local status_color
        case "$status" in
            SUCCESS|PASS|SKIP) status_color="${GREEN}" ;;
            FAIL|SEED_FAILED|BACKEND_DOWN) status_color="${RED}" ;;
            *) status_color="${YELLOW}" ;;
        esac

        printf "  %-10s  ${status_color}%-12s${NC}  %-8s  %-8s  %-8s  %s\n" \
            "$instance_code" "$status" "$total" "$ztdf" "$locale" "$coverage"
    done

    echo ""

    # JSON Report
    cat > "$MIGRATION_REPORT" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "summary": {
    "total_instances": $TOTAL_INSTANCES,
    "migrated": $MIGRATED_INSTANCES,
    "failed": $FAILED_INSTANCES,
    "skipped": $SKIPPED_INSTANCES
  },
  "instances": {
EOF

    local first=true
    for instance_code in "${!INSTANCE_STATUS[@]}"; do
        if [ "$first" = false ]; then
            echo "," >> "$MIGRATION_REPORT"
        fi
        first=false

        cat >> "$MIGRATION_REPORT" <<EOF
    "$instance_code": {
      "status": "${INSTANCE_STATUS[$instance_code]}",
      "total_resources": ${INSTANCE_TOTAL_COUNT[$instance_code]:-0},
      "ztdf_encrypted": ${INSTANCE_ZTDF_COUNT[$instance_code]:-0},
      "locale_labeled": ${INSTANCE_LOCALE_COUNT[$instance_code]:-0}
    }
EOF
    done

    cat >> "$MIGRATION_REPORT" <<EOF

  },
  "backup_location": "$BACKUP_DIR",
  "log_file": "$MIGRATION_LOG"
}
EOF

    echo -e "${BOLD}Reports:${NC}"
    echo "  Log:     $MIGRATION_LOG"
    echo "  Report:  $MIGRATION_REPORT"

    if [ "$CREATE_BACKUP" = true ]; then
        echo "  Backups: $BACKUP_DIR"
    fi

    echo ""

    # Final status
    if [ $FAILED_INSTANCES -eq 0 ]; then
        log_success "Migration completed successfully!"
        return 0
    else
        log_warn "Migration completed with $FAILED_INSTANCES failure(s)"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    clear

    log_header "╔════════════════════════════════════════════════════════════════╗"
    log_header "║                                                                ║"
    log_header "║        DIVE V3 - ZTDF Migration (All Hub & Spokes)            ║"
    log_header "║                                                                ║"
    log_header "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Configuration summary
    echo -e "${BOLD}Configuration:${NC}"
    echo "  Resource Count:     $RESOURCE_COUNT"
    echo "  Dry Run:            $DRY_RUN"
    echo "  Create Backups:     $CREATE_BACKUP"
    echo "  Skip Hub:           $SKIP_HUB"
    echo "  Verify Only:        $VERIFY_ONLY"
    echo "  Parallel:           $PARALLEL"

    if [ -n "$SPECIFIC_SPOKES" ]; then
        echo "  Specific Spokes:    $SPECIFIC_SPOKES"
    fi
    echo ""

    # Discover instances
    log_step "Discovering instances..."
    mapfile -t INSTANCES < <(discover_instances | tr ' ' '\n')

    if [ ${#INSTANCES[@]} -eq 0 ]; then
        log_error "No running instances found"
        exit 1
    fi

    log_success "Found ${#INSTANCES[@]} instance(s): ${INSTANCES[*]}"
    echo ""

    # Confirmation
    if [ "$DRY_RUN" != true ] && [ "$VERIFY_ONLY" != true ]; then
        echo -e "${YELLOW}⚠️  This will re-seed ${#INSTANCES[@]} instance(s) with ZTDF-encrypted resources.${NC}"
        if [ "$CREATE_BACKUP" = true ]; then
            echo "   Backups will be created before migration."
        else
            echo -e "${RED}   No backups will be created (use --backup to create backups).${NC}"
        fi
        echo ""
        read -p "  Continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled by user"
            exit 0
        fi
        echo ""
    fi

    # Migrate instances
    local start_time=$(date +%s)

    if [ "$PARALLEL" = true ] && [ ${#INSTANCES[@]} -gt 1 ]; then
        log_info "Migrating instances in parallel..."
        echo ""

        for instance in "${INSTANCES[@]}"; do
            migrate_instance "$instance" &
        done

        wait
    else
        for instance in "${INSTANCES[@]}"; do
            migrate_instance "$instance"
        done
    fi

    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    # Generate report
    generate_report

    echo ""
    echo "  Total Time: ${total_duration}s"
    echo ""

    # Exit code
    if [ $FAILED_INSTANCES -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main
main "$@"

