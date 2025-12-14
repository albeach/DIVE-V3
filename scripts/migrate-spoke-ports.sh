#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Spoke Port Migration Script
# =============================================================================
# Migrates existing spokes from old port scheme to NATO-standardized ports.
#
# Old Port Scheme (hardcoded offsets in init-keycloak.sh):
#   FRA=1, GBR=3, ITA=7, ESP=8
#
# New NATO Port Scheme (from nato-countries.sh):
#   FRA=10, GBR=31, ITA=15, ESP=28
#
# Usage:
#   ./scripts/migrate-spoke-ports.sh <COUNTRY_CODE> [--dry-run]
#   ./scripts/migrate-spoke-ports.sh --all [--dry-run]
#
# Examples:
#   ./scripts/migrate-spoke-ports.sh FRA --dry-run  # Preview FRA migration
#   ./scripts/migrate-spoke-ports.sh GBR            # Migrate GBR to new ports
#   ./scripts/migrate-spoke-ports.sh --all          # Migrate all running spokes
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load NATO countries database
source "$SCRIPT_DIR/nato-countries.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Parse arguments
COUNTRIES=()
DRY_RUN=false
ALL_MODE=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --all|-a)
            ALL_MODE=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 <COUNTRY_CODE> [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run, -n  Preview changes without applying"
            echo "  --all, -a      Migrate all running spokes"
            echo "  --force, -f    Skip confirmation prompts"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 FRA --dry-run   Preview FRA migration"
            echo "  $0 GBR             Migrate GBR to new ports"
            echo "  $0 --all           Migrate all running spokes"
            exit 0
            ;;
        *)
            code="${1^^}"
            if is_nato_country "$code"; then
                COUNTRIES+=("$code")
            else
                echo -e "${RED}Error: '$1' is not a valid NATO country code${NC}"
                exit 1
            fi
            shift
            ;;
    esac
done

# Helper functions
log_info() { echo -e "${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_header() { 
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Get current running port for a service
get_current_port() {
    local container="$1"
    local internal_port="$2"
    docker port "$container" "$internal_port" 2>/dev/null | cut -d: -f2 || echo ""
}

# Detect running spokes
get_running_spokes() {
    local running=()
    for code in "${!NATO_COUNTRIES[@]}"; do
        [[ "$code" == "USA" ]] && continue  # Skip hub
        local code_lower="${code,,}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${code_lower}-keycloak\|keycloak-${code_lower}"; then
            running+=("$code")
        fi
    done
    echo "${running[@]}"
}

# Show port comparison
show_port_comparison() {
    local code="$1"
    local code_lower="${code,,}"
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    
    log_header "$name ($code) $flag - Port Migration"
    
    # Get new (NATO) ports
    eval "$(get_country_ports "$code")"
    
    # Try to detect current ports from running containers
    local kc_container="${code_lower}-keycloak-${code_lower}-1"
    local be_container="${code_lower}-backend-${code_lower}-1"
    local fe_container="${code_lower}-frontend-${code_lower}-1"
    
    local current_kc_port=$(get_current_port "$kc_container" "8443")
    local current_be_port=$(get_current_port "$be_container" "4000")
    local current_fe_port=$(get_current_port "$fe_container" "3000")
    
    echo ""
    echo "  Service       Current → New (NATO)"
    echo "  ─────────────────────────────────────"
    
    # Keycloak
    if [[ -n "$current_kc_port" ]]; then
        if [[ "$current_kc_port" == "$SPOKE_KEYCLOAK_HTTPS_PORT" ]]; then
            echo -e "  Keycloak:     ${GREEN}$current_kc_port${NC} (already correct)"
        else
            echo -e "  Keycloak:     ${YELLOW}$current_kc_port${NC} → ${GREEN}$SPOKE_KEYCLOAK_HTTPS_PORT${NC}"
        fi
    else
        echo -e "  Keycloak:     ${DIM}not running${NC} → ${GREEN}$SPOKE_KEYCLOAK_HTTPS_PORT${NC}"
    fi
    
    # Backend
    if [[ -n "$current_be_port" ]]; then
        if [[ "$current_be_port" == "$SPOKE_BACKEND_PORT" ]]; then
            echo -e "  Backend:      ${GREEN}$current_be_port${NC} (already correct)"
        else
            echo -e "  Backend:      ${YELLOW}$current_be_port${NC} → ${GREEN}$SPOKE_BACKEND_PORT${NC}"
        fi
    else
        echo -e "  Backend:      ${DIM}not running${NC} → ${GREEN}$SPOKE_BACKEND_PORT${NC}"
    fi
    
    # Frontend
    if [[ -n "$current_fe_port" ]]; then
        if [[ "$current_fe_port" == "$SPOKE_FRONTEND_PORT" ]]; then
            echo -e "  Frontend:     ${GREEN}$current_fe_port${NC} (already correct)"
        else
            echo -e "  Frontend:     ${YELLOW}$current_fe_port${NC} → ${GREEN}$SPOKE_FRONTEND_PORT${NC}"
        fi
    else
        echo -e "  Frontend:     ${DIM}not running${NC} → ${GREEN}$SPOKE_FRONTEND_PORT${NC}"
    fi
    
    echo ""
    echo "  Full NATO port assignments:"
    echo "    Frontend:   $SPOKE_FRONTEND_PORT"
    echo "    Backend:    $SPOKE_BACKEND_PORT"
    echo "    Keycloak:   $SPOKE_KEYCLOAK_HTTPS_PORT"
    echo "    PostgreSQL: $SPOKE_POSTGRES_PORT"
    echo "    MongoDB:    $SPOKE_MONGODB_PORT"
    echo "    Redis:      $SPOKE_REDIS_PORT"
    echo "    OPA:        $SPOKE_OPA_PORT"
    echo "    KAS:        $SPOKE_KAS_PORT"
}

# Generate updated docker-compose with NATO ports
generate_nato_docker_compose() {
    local code="$1"
    local code_lower="${code,,}"
    local output_file="$2"
    
    # Get NATO ports
    eval "$(get_country_ports "$code")"
    
    local instance_dir="$PROJECT_ROOT/instances/${code_lower}"
    local compose_file="$instance_dir/docker-compose.yml"
    
    if [[ ! -f "$compose_file" ]]; then
        log_error "docker-compose.yml not found: $compose_file"
        return 1
    fi
    
    # Create backup
    cp "$compose_file" "${compose_file}.bak.$(date +%Y%m%d_%H%M%S)"
    
    # Update port mappings in docker-compose.yml
    # This uses sed to replace port patterns
    local tmp_file=$(mktemp)
    
    # Read and update the compose file
    # Pattern: "OLD_PORT:INTERNAL_PORT" -> "NEW_PORT:INTERNAL_PORT"
    sed -E \
        -e "s/\"[0-9]+:3000\"/\"${SPOKE_FRONTEND_PORT}:3000\"/g" \
        -e "s/\"[0-9]+:4000\"/\"${SPOKE_BACKEND_PORT}:4000\"/g" \
        -e "s/\"[0-9]+:8443\"/\"${SPOKE_KEYCLOAK_HTTPS_PORT}:8443\"/g" \
        -e "s/\"[0-9]+:8080\"/\"${SPOKE_KEYCLOAK_HTTP_PORT}:8080\"/g" \
        -e "s/\"[0-9]+:5432\"/\"${SPOKE_POSTGRES_PORT}:5432\"/g" \
        -e "s/\"[0-9]+:27017\"/\"${SPOKE_MONGODB_PORT}:27017\"/g" \
        -e "s/\"[0-9]+:6379\"/\"${SPOKE_REDIS_PORT}:6379\"/g" \
        -e "s/\"[0-9]+:8181\"/\"${SPOKE_OPA_PORT}:8181\"/g" \
        "$compose_file" > "$tmp_file"
    
    if [[ -n "$output_file" ]]; then
        cp "$tmp_file" "$output_file"
    else
        cp "$tmp_file" "$compose_file"
    fi
    
    rm "$tmp_file"
    log_success "Generated NATO-compliant docker-compose.yml"
}

# Migrate a single spoke
migrate_spoke() {
    local code="$1"
    local code_lower="${code,,}"
    local name=$(get_country_name "$code")
    
    show_port_comparison "$code"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run mode - no changes will be made"
        return 0
    fi
    
    # Confirmation
    if [[ "$FORCE" != "true" ]]; then
        echo ""
        read -p "Proceed with migration for $name ($code)? [y/N] " confirm
        if [[ "${confirm,,}" != "y" ]]; then
            log_warn "Migration cancelled"
            return 0
        fi
    fi
    
    echo ""
    log_info "Starting migration for $name ($code)..."
    
    local instance_dir="$PROJECT_ROOT/instances/${code_lower}"
    
    # Step 1: Stop current containers
    log_info "Step 1/4: Stopping containers..."
    if docker compose -f "$instance_dir/docker-compose.yml" down 2>/dev/null || \
       docker-compose -f "$instance_dir/docker-compose.yml" down 2>/dev/null; then
        log_success "Containers stopped"
    else
        log_warn "No running containers or compose file not found"
    fi
    
    # Step 2: Update docker-compose.yml
    log_info "Step 2/4: Updating docker-compose.yml with NATO ports..."
    generate_nato_docker_compose "$code"
    
    # Step 3: Update instance.json if it exists
    if [[ -f "$instance_dir/instance.json" ]]; then
        log_info "Step 3/4: Updating instance.json..."
        eval "$(get_country_ports "$code")"
        
        local tmp_json=$(mktemp)
        jq --arg fe "$SPOKE_FRONTEND_PORT" \
           --arg be "$SPOKE_BACKEND_PORT" \
           --arg kc "$SPOKE_KEYCLOAK_HTTPS_PORT" \
           --arg pg "$SPOKE_POSTGRES_PORT" \
           --arg mg "$SPOKE_MONGODB_PORT" \
           --arg rd "$SPOKE_REDIS_PORT" \
           --arg op "$SPOKE_OPA_PORT" \
           '.ports.frontend = ($fe | tonumber) |
            .ports.backend = ($be | tonumber) |
            .ports.keycloak_https = ($kc | tonumber) |
            .ports.postgres = ($pg | tonumber) |
            .ports.mongodb = ($mg | tonumber) |
            .ports.redis = ($rd | tonumber) |
            .ports.opa = ($op | tonumber)' \
           "$instance_dir/instance.json" > "$tmp_json"
        
        cp "$tmp_json" "$instance_dir/instance.json"
        rm "$tmp_json"
        log_success "instance.json updated"
    else
        log_info "Step 3/4: No instance.json found (skipping)"
    fi
    
    # Step 4: Restart containers
    log_info "Step 4/4: Restarting containers..."
    if docker compose -f "$instance_dir/docker-compose.yml" up -d 2>/dev/null || \
       docker-compose -f "$instance_dir/docker-compose.yml" up -d 2>/dev/null; then
        log_success "Containers started on new ports"
    else
        log_error "Failed to start containers"
        return 1
    fi
    
    echo ""
    log_success "Migration complete for $name ($code)"
    echo ""
    echo "  New endpoints:"
    eval "$(get_country_ports "$code")"
    echo "    Frontend:  https://localhost:$SPOKE_FRONTEND_PORT"
    echo "    Backend:   https://localhost:$SPOKE_BACKEND_PORT"
    echo "    Keycloak:  https://localhost:$SPOKE_KEYCLOAK_HTTPS_PORT"
    echo ""
    echo "  Verify with:"
    echo "    ./scripts/nato-verify-federation.sh $code"
}

# =============================================================================
# Main Execution
# =============================================================================

echo "═══════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 - Spoke Port Migration"
echo "═══════════════════════════════════════════════════════════════════════"

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  Mode: ${YELLOW}DRY RUN${NC} (no changes will be made)"
fi
echo ""

# If --all mode, detect running spokes
if [[ "$ALL_MODE" == "true" ]]; then
    log_info "Detecting running spokes..."
    COUNTRIES=($(get_running_spokes))
    
    if [[ ${#COUNTRIES[@]} -eq 0 ]]; then
        log_warn "No running spokes detected"
        echo ""
        echo "Available NATO countries:"
        list_nato_countries | head -10
        exit 0
    fi
    
    log_info "Found ${#COUNTRIES[@]} running spoke(s): ${COUNTRIES[*]}"
fi

# Validate we have at least one country
if [[ ${#COUNTRIES[@]} -eq 0 ]]; then
    echo "Usage: $0 <COUNTRY_CODE> [OPTIONS]"
    echo ""
    echo "Run with --help for more information"
    exit 1
fi

# Migrate each country
for code in "${COUNTRIES[@]}"; do
    migrate_spoke "$code" || log_error "Migration failed for $code"
done

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Port Migration Complete"
echo "═══════════════════════════════════════════════════════════════════════"

