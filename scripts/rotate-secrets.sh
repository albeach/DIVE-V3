#!/bin/bash
# =============================================================================
# DIVE V3 - Automated Secret Rotation Script
# =============================================================================
# This script rotates secrets stored in GCP Secret Manager and restarts
# affected services. It's designed for quarterly execution.
#
# Usage:
#   ./scripts/rotate-secrets.sh [OPTIONS]
#
# Options:
#   --dry-run          Show what would be rotated without making changes
#   --instance <name>  Rotate secrets for specific instance only (usa|fra|gbr|deu)
#   --type <type>      Rotate specific secret type (keycloak|postgres|mongodb|auth|all)
#   --force            Skip confirmation prompts
#   --verbose          Show detailed output
#
# Examples:
#   ./scripts/rotate-secrets.sh --dry-run                    # Preview all rotations
#   ./scripts/rotate-secrets.sh --instance usa --type auth   # Rotate USA auth secrets
#   ./scripts/rotate-secrets.sh --force                      # Rotate all without prompts
#
# Security:
#   - New passwords are generated using /dev/urandom
#   - Old secret versions are preserved (GCP versioning)
#   - All rotations are logged to audit log
#   - Affected services are restarted automatically
#
# =============================================================================

set -euo pipefail

# Configuration
GCP_PROJECT="dive25"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/secrets"
AUDIT_LOG="$LOG_DIR/rotation-audit.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
DRY_RUN=false
INSTANCE="all"
SECRET_TYPE="all"
FORCE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --instance)
            INSTANCE="$2"
            shift 2
            ;;
        --type)
            SECRET_TYPE="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            head -50 "$0" | grep -E "^#" | tail -n +2 | sed 's/^# //'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Setup logging
mkdir -p "$LOG_DIR"

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo -e "${timestamp} [${level}] ${message}" >> "$AUDIT_LOG"
    
    case $level in
        INFO)  echo -e "${GREEN}✅${NC} $message" ;;
        WARN)  echo -e "${YELLOW}⚠️${NC} $message" ;;
        ERROR) echo -e "${RED}❌${NC} $message" ;;
        DEBUG) [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}🔍${NC} $message" ;;
    esac
}

# Generate secure password (32 chars, alphanumeric + special chars)
generate_password() {
    # Generate a secure password with letters, numbers, and special characters
    # Avoiding characters that cause shell escaping issues: \ ' " ` $ 
    local password=$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9!@#%^&*()-_=+[]{}|:;<>,.?' | head -c 32)
    echo "$password"
}

# Rotate a single secret
rotate_secret() {
    local secret_name="$1"
    local new_value="$2"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DEBUG" "[DRY RUN] Would rotate: $secret_name"
        return 0
    fi
    
    # Add new version to secret
    log "DEBUG" "Rotating secret: $secret_name"
    
    if echo -n "$new_value" | gcloud secrets versions add "$secret_name" \
        --data-file=- \
        --project="$GCP_PROJECT" 2>/dev/null; then
        log "INFO" "Rotated: $secret_name"
        return 0
    else
        log "ERROR" "Failed to rotate: $secret_name"
        return 1
    fi
}

# Get list of instances to process
get_instances() {
    if [[ "$INSTANCE" == "all" ]]; then
        echo "usa fra gbr deu"
    else
        echo "$INSTANCE"
    fi
}

# Rotate instance-specific secrets
rotate_instance_secrets() {
    local inst="$1"
    local inst_upper=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
    
    log "INFO" "Processing instance: $inst_upper"
    
    local rotated=0
    local failed=0
    
    # Keycloak admin password
    if [[ "$SECRET_TYPE" == "all" || "$SECRET_TYPE" == "keycloak" ]]; then
        local new_keycloak_pass=$(generate_password)
        if rotate_secret "dive-v3-keycloak-$inst" "$new_keycloak_pass"; then
            ((rotated++))
        else
            ((failed++))
        fi
    fi
    
    # PostgreSQL password
    if [[ "$SECRET_TYPE" == "all" || "$SECRET_TYPE" == "postgres" ]]; then
        local new_postgres_pass=$(generate_password)
        if rotate_secret "dive-v3-postgres-$inst" "$new_postgres_pass"; then
            ((rotated++))
        else
            ((failed++))
        fi
    fi
    
    # MongoDB password
    if [[ "$SECRET_TYPE" == "all" || "$SECRET_TYPE" == "mongodb" ]]; then
        local new_mongo_pass=$(generate_password)
        if rotate_secret "dive-v3-mongodb-$inst" "$new_mongo_pass"; then
            ((rotated++))
        else
            ((failed++))
        fi
    fi
    
    # Auth secret
    if [[ "$SECRET_TYPE" == "all" || "$SECRET_TYPE" == "auth" ]]; then
        local new_auth_secret=$(generate_password)
        if rotate_secret "dive-v3-auth-secret-$inst" "$new_auth_secret"; then
            ((rotated++))
        else
            ((failed++))
        fi
        
        # JWT secret
        local new_jwt_secret=$(generate_password)
        if rotate_secret "dive-v3-jwt-secret-$inst" "$new_jwt_secret"; then
            ((rotated++))
        else
            ((failed++))
        fi
        
        # NextAuth secret
        local new_nextauth_secret=$(generate_password)
        if rotate_secret "dive-v3-nextauth-secret-$inst" "$new_nextauth_secret"; then
            ((rotated++))
        else
            ((failed++))
        fi
        
        # Keycloak client secret
        local new_client_secret=$(generate_password)
        if rotate_secret "dive-v3-keycloak-client-secret-$inst" "$new_client_secret"; then
            ((rotated++))
        else
            ((failed++))
        fi
        
        # Redis password
        local new_redis_pass=$(generate_password)
        if rotate_secret "dive-v3-redis-$inst" "$new_redis_pass"; then
            ((rotated++))
        else
            ((failed++))
        fi
    fi
    
    log "INFO" "$inst_upper: Rotated $rotated secrets, $failed failed"
}

# Rotate shared secrets
rotate_shared_secrets() {
    log "INFO" "Processing shared secrets"
    
    if [[ "$SECRET_TYPE" == "all" || "$SECRET_TYPE" == "shared" ]]; then
        # Blacklist Redis
        local new_redis_pass=$(generate_password)
        rotate_secret "dive-v3-redis-blacklist" "$new_redis_pass"
        
        # Grafana admin
        local new_grafana_pass=$(generate_password)
        rotate_secret "dive-v3-grafana" "$new_grafana_pass"
    fi
}

# Restart services to pick up new secrets
restart_services() {
    local inst="$1"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DEBUG" "[DRY RUN] Would restart services for: $inst"
        return 0
    fi
    
    log "INFO" "Restarting services for: $inst"
    
    case "$inst" in
        usa)
            cd "$PROJECT_ROOT"
            source ./scripts/sync-gcp-secrets.sh usa
            docker compose -p usa restart || log "WARN" "Failed to restart USA services"
            ;;
        fra)
            cd "$PROJECT_ROOT"
            source ./scripts/sync-gcp-secrets.sh fra
            docker compose -p fra -f docker-compose.fra.yml restart || log "WARN" "Failed to restart FRA services"
            ;;
        gbr)
            cd "$PROJECT_ROOT"
            source ./scripts/sync-gcp-secrets.sh gbr
            docker compose -p gbr -f docker-compose.gbr.yml restart || log "WARN" "Failed to restart GBR services"
            ;;
        deu)
            # DEU is remote - use deploy script
            if [[ -x "$SCRIPT_DIR/remote/deploy-remote.sh" ]]; then
                "$SCRIPT_DIR/remote/deploy-remote.sh" deu --skip-verify || log "WARN" "Failed to restart DEU services"
            else
                log "WARN" "DEU remote deployment script not found"
            fi
            ;;
    esac
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           DIVE V3 - Secret Rotation                          ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  GCP Project:  $GCP_PROJECT"
    echo "  Instance:     $INSTANCE"
    echo "  Secret Type:  $SECRET_TYPE"
    echo "  Dry Run:      $DRY_RUN"
    echo "  Timestamp:    $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""
    
    # Check prerequisites
    if ! command -v gcloud &> /dev/null; then
        log "ERROR" "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi
    
    if ! gcloud auth print-access-token &>/dev/null; then
        log "ERROR" "Not authenticated with GCP. Run: gcloud auth login"
        exit 1
    fi
    
    # Confirmation prompt
    if [[ "$DRY_RUN" == "false" && "$FORCE" == "false" ]]; then
        echo -e "${YELLOW}⚠️  WARNING: This will rotate secrets and restart services!${NC}"
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    
    # Log rotation start
    log "INFO" "=== Secret Rotation Started ==="
    log "INFO" "Instance: $INSTANCE, Type: $SECRET_TYPE, DryRun: $DRY_RUN"
    
    # Rotate shared secrets first
    if [[ "$INSTANCE" == "all" ]]; then
        rotate_shared_secrets
    fi
    
    # Rotate instance secrets
    for inst in $(get_instances); do
        rotate_instance_secrets "$inst"
    done
    
    # Restart services (if not dry run)
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        log "INFO" "Restarting affected services..."
        
        for inst in $(get_instances); do
            restart_services "$inst"
        done
    fi
    
    # Summary
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           Secret Rotation Complete                           ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}This was a dry run. No changes were made.${NC}"
        echo "Run without --dry-run to perform actual rotation."
    else
        log "INFO" "=== Secret Rotation Completed ==="
        echo ""
        echo "Next steps:"
        echo "  1. Verify all services are healthy"
        echo "  2. Test authentication flows"
        echo "  3. Update any external systems using these secrets"
        echo ""
        echo "Audit log: $AUDIT_LOG"
    fi
}

main "$@"


