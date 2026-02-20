#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Secret Rotation Script
# =============================================================================
# Rotates secrets in GCP Secret Manager for DIVE V3 deployments.
# Supports quarterly scheduled rotation and emergency manual rotation.
#
# Usage:
#   ./scripts/rotate-secrets.sh --instance usa --type keycloak
#   ./scripts/rotate-secrets.sh --instance all --type all --dry-run
#   ./scripts/rotate-secrets.sh --force --verbose
#
# Secret Types:
#   - keycloak  : Keycloak admin passwords
#   - postgres  : PostgreSQL passwords
#   - mongodb   : MongoDB root passwords
#   - auth      : NextAuth/JWT secrets
#   - all       : All secret types
#
# Security:
#   - No hardcoded secrets - generates cryptographically secure values
#   - Audit trail for all rotation operations
#   - Supports dry-run for previewing changes
#   - Verification step after rotation
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load NATO countries database
if [[ -f "$SCRIPT_DIR/nato-countries.sh" ]]; then
    source "$SCRIPT_DIR/nato-countries.sh"
fi

# GCP Configuration
GCP_PROJECT="${GCP_PROJECT_ID:-dive25}"
SECRET_PREFIX="dive-v3"

# Audit log directory
AUDIT_LOG_DIR="${PROJECT_ROOT}/logs/secrets"
AUDIT_LOG="${AUDIT_LOG_DIR}/rotation-audit.log"

# CLI Arguments
INSTANCE="all"
SECRET_TYPE="all"
DRY_RUN=false
FORCE=false
VERBOSE=false

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Counters
ROTATED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

# =============================================================================
# Logging Functions
# =============================================================================

log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
    audit_log "INFO" "$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    audit_log "SUCCESS" "$1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    audit_log "WARN" "$1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    audit_log "ERROR" "$1"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${DIM}  → $1${NC}"
    fi
}

audit_log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Ensure audit log directory exists
    mkdir -p "$AUDIT_LOG_DIR"

    # Append to audit log
    echo "[${timestamp}] [${level}] ${message}" >> "$AUDIT_LOG"
}

# =============================================================================
# Secret Management Functions
# =============================================================================

# Generate cryptographically secure password
generate_password() {
    local length="${1:-32}"
    openssl rand -base64 48 | tr -d '/+=' | head -c "$length"
}

# Generate cryptographically secure auth secret (for JWT)
generate_auth_secret() {
    openssl rand -base64 64 | tr -d '/+=' | head -c 64
}

# Check if secret exists in GCP
secret_exists() {
    local name="$1"
    gcloud secrets describe "$name" --project="$GCP_PROJECT" >/dev/null 2>&1
}

# Get current secret version count
get_secret_version_count() {
    local name="$1"
    gcloud secrets versions list "$name" \
        --project="$GCP_PROJECT" \
        --filter="state=ENABLED" \
        --format="value(name)" 2>/dev/null | wc -l
}

# Rotate a single secret
rotate_secret() {
    local name="$1"
    local secret_type="$2"

    if ! secret_exists "$name"; then
        log_warn "Secret does not exist: $name (skipping)"
        ((SKIPPED_COUNT++))
        return 0
    fi

    # Generate new value based on type
    local new_value
    case "$secret_type" in
        auth|jwt)
            new_value=$(generate_auth_secret)
            ;;
        *)
            new_value=$(generate_password 32)
            ;;
    esac

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rotate: $name"
        log_verbose "New value length: ${#new_value} characters"
        ((SKIPPED_COUNT++))
        return 0
    fi

    # Add new version
    if echo -n "$new_value" | gcloud secrets versions add "$name" \
        --project="$GCP_PROJECT" \
        --data-file=- 2>/dev/null; then

        local version_count
        version_count=$(get_secret_version_count "$name")
        log_success "Rotated: $name (version $version_count)"
        log_verbose "New value length: ${#new_value} characters"
        ((ROTATED_COUNT++))

        # Record rotation in audit log with more details
        audit_log "ROTATION" "Secret=$name, NewVersion=$version_count, Type=$secret_type, User=${USER:-unknown}, Host=$(hostname)"
    else
        log_error "Failed to rotate: $name"
        ((ERROR_COUNT++))
        return 1
    fi
}

# Rotate secrets for a specific instance
rotate_instance_secrets() {
    local instance="$1"
    local type="$2"
    local code_lower="${instance,,}"

    log_info "Rotating secrets for instance: ${instance^^}"

    # Determine which secrets to rotate
    local secrets_to_rotate=()

    case "$type" in
        keycloak)
            secrets_to_rotate+=("${SECRET_PREFIX}-keycloak-${code_lower}")
            ;;
        postgres)
            secrets_to_rotate+=("${SECRET_PREFIX}-postgres-${code_lower}")
            ;;
        mongodb)
            secrets_to_rotate+=("${SECRET_PREFIX}-mongodb-${code_lower}")
            ;;
        auth)
            secrets_to_rotate+=("${SECRET_PREFIX}-auth-secret-${code_lower}")
            ;;
        all)
            secrets_to_rotate+=(
                "${SECRET_PREFIX}-keycloak-${code_lower}"
                "${SECRET_PREFIX}-postgres-${code_lower}"
                "${SECRET_PREFIX}-mongodb-${code_lower}"
                "${SECRET_PREFIX}-auth-secret-${code_lower}"
            )
            ;;
        *)
            log_error "Unknown secret type: $type"
            return 1
            ;;
    esac

    # Rotate each secret
    for secret_name in "${secrets_to_rotate[@]}"; do
        local secret_type
        case "$secret_name" in
            *-keycloak-*) secret_type="keycloak" ;;
            *-postgres-*) secret_type="postgres" ;;
            *-mongodb-*) secret_type="mongodb" ;;
            *-auth-secret-*) secret_type="auth" ;;
            *) secret_type="unknown" ;;
        esac

        rotate_secret "$secret_name" "$secret_type"
    done
}

# Rotate shared secrets (not instance-specific)
rotate_shared_secrets() {
    local type="$1"

    log_info "Rotating shared secrets"

    local secrets_to_rotate=()

    case "$type" in
        keycloak)
            secrets_to_rotate+=("${SECRET_PREFIX}-keycloak-client-secret")
            ;;
        auth)
            # Redis password is shared
            secrets_to_rotate+=("${SECRET_PREFIX}-redis-blacklist")
            ;;
        all)
            secrets_to_rotate+=(
                "${SECRET_PREFIX}-keycloak-client-secret"
                "${SECRET_PREFIX}-redis-blacklist"
                "${SECRET_PREFIX}-kas-signing-key"
                "${SECRET_PREFIX}-kas-encryption-key"
            )
            ;;
        *)
            # No shared secrets for other types
            return 0
            ;;
    esac

    for secret_name in "${secrets_to_rotate[@]}"; do
        local secret_type
        case "$secret_name" in
            *-keycloak-*) secret_type="keycloak" ;;
            *-redis-*) secret_type="redis" ;;
            *-kas-*) secret_type="kas" ;;
            *) secret_type="unknown" ;;
        esac

        rotate_secret "$secret_name" "$secret_type"
    done
}

# Rotate federation secrets
rotate_federation_secrets() {
    local instance="$1"
    local code_lower="${instance,,}"

    if [[ "$instance" == "usa" ]]; then
        log_verbose "Hub (USA) does not have federation secrets to hub"
        return 0
    fi

    log_info "Rotating federation secrets for ${instance^^}"

    # Federation secrets: bidirectional with USA
    local fed_secrets=(
        "${SECRET_PREFIX}-federation-usa-${code_lower}"
        "${SECRET_PREFIX}-federation-${code_lower}-usa"
    )

    for secret_name in "${fed_secrets[@]}"; do
        rotate_secret "$secret_name" "federation"
    done
}

# Get list of instances to rotate
get_instances() {
    local instance="$1"

    if [[ "$instance" == "all" ]]; then
        # Core instances (can be extended with NATO countries)
        echo "usa fra gbr deu"
    else
        echo "$instance"
    fi
}

# =============================================================================
# Verification Functions
# =============================================================================

verify_rotation() {
    local instance="$1"
    local type="$2"
    local code_lower="${instance,,}"

    log_info "Verifying rotation for ${instance^^}"

    local secrets_to_verify=()

    case "$type" in
        all)
            secrets_to_verify+=(
                "${SECRET_PREFIX}-keycloak-${code_lower}"
                "${SECRET_PREFIX}-postgres-${code_lower}"
                "${SECRET_PREFIX}-mongodb-${code_lower}"
                "${SECRET_PREFIX}-auth-secret-${code_lower}"
            )
            ;;
        *)
            secrets_to_verify+=("${SECRET_PREFIX}-${type}-${code_lower}")
            ;;
    esac

    local all_verified=true

    for secret_name in "${secrets_to_verify[@]}"; do
        if secret_exists "$secret_name"; then
            local version_count
            version_count=$(get_secret_version_count "$secret_name")
            log_verbose "$secret_name: $version_count version(s)"
        else
            log_warn "$secret_name: NOT FOUND"
            all_verified=false
        fi
    done

    if [[ "$all_verified" == "true" ]]; then
        log_success "Verification passed for ${instance^^}"
    else
        log_warn "Verification incomplete for ${instance^^}"
    fi
}

# =============================================================================
# CLI Argument Parsing
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --instance|-i)
                INSTANCE="${2,,}"
                shift 2
                ;;
            --type|-t)
                SECRET_TYPE="${2,,}"
                shift 2
                ;;
            --dry-run|-n)
                DRY_RUN=true
                shift
                ;;
            --force|-f)
                FORCE=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
DIVE V3 - Secret Rotation Script

Usage:
  $0 [OPTIONS]

Options:
  --instance, -i <CODE>   Instance to rotate (all/usa/fra/gbr/deu)
  --type, -t <TYPE>       Secret type (all/keycloak/postgres/mongodb/auth)
  --dry-run, -n           Preview changes without rotating
  --force, -f             Skip confirmation prompts
  --verbose, -v           Show detailed output
  --help, -h              Show this help

Examples:
  $0 --instance usa --type keycloak         # Rotate USA Keycloak password
  $0 --instance all --type all --dry-run    # Preview full rotation
  $0 --instance fra --type all --force      # Force rotate all FRA secrets

Environment Variables:
  GCP_PROJECT_ID    GCP project (default: dive25)

Audit Log:
  All rotation operations are logged to: logs/secrets/rotation-audit.log

Security Notes:
  - Secrets are generated using cryptographically secure random bytes
  - No hardcoded values are used
  - All rotations are audited with timestamp, user, and host
EOF
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    parse_args "$@"

    # Initialize audit log with session header
    mkdir -p "$AUDIT_LOG_DIR"
    audit_log "SESSION_START" "Instance=$INSTANCE, Type=$SECRET_TYPE, DryRun=$DRY_RUN, Force=$FORCE, User=${USER:-unknown}"

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  DIVE V3 - Secret Rotation${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Display rotation plan
    echo -e "${BOLD}Rotation Plan:${NC}"
    echo -e "  Instance:    ${CYAN}$INSTANCE${NC}"
    echo -e "  Type:        ${CYAN}$SECRET_TYPE${NC}"
    echo -e "  Dry Run:     ${CYAN}$DRY_RUN${NC}"
    echo -e "  Timestamp:   ${CYAN}$(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
    echo ""

    # Confirmation for non-dry-run
    if [[ "$DRY_RUN" != "true" && "$FORCE" != "true" ]]; then
        echo -e "${YELLOW}⚠ WARNING: This will rotate secrets in GCP Secret Manager.${NC}"
        echo -e "${YELLOW}  Services using these secrets will need to be restarted.${NC}"
        echo ""
        read -p "Continue? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Rotation cancelled by user"
            exit 0
        fi
    fi

    # Check GCP authentication
    if ! gcloud auth print-access-token >/dev/null 2>&1; then
        log_error "GCP authentication required. Run: gcloud auth login"
        exit 1
    fi

    echo ""
    echo -e "${BOLD}Starting rotation...${NC}"
    echo ""

    # Rotate shared secrets first (if type is 'all')
    if [[ "$SECRET_TYPE" == "all" ]]; then
        rotate_shared_secrets "$SECRET_TYPE"
        echo ""
    fi

    # Rotate instance-specific secrets
    for inst in $(get_instances "$INSTANCE"); do
        rotate_instance_secrets "$inst" "$SECRET_TYPE"

        # Rotate federation secrets if type is 'all'
        if [[ "$SECRET_TYPE" == "all" ]]; then
            rotate_federation_secrets "$inst"
        fi

        echo ""
    done

    # Verification
    echo -e "${BOLD}Verifying rotation...${NC}"
    echo ""

    for inst in $(get_instances "$INSTANCE"); do
        verify_rotation "$inst" "$SECRET_TYPE"
    done

    # Summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Rotation Summary${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}Rotated:${NC}   $ROTATED_COUNT"
    echo -e "  ${YELLOW}Skipped:${NC}   $SKIPPED_COUNT"
    echo -e "  ${RED}Errors:${NC}    $ERROR_COUNT"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${CYAN}ℹ This was a dry run. No secrets were actually rotated.${NC}"
        echo -e "${CYAN}  Remove --dry-run to perform actual rotation.${NC}"
    else
        echo -e "${CYAN}ℹ Audit log written to: $AUDIT_LOG${NC}"

        if [[ $ROTATED_COUNT -gt 0 ]]; then
            echo ""
            echo -e "${YELLOW}⚠ IMPORTANT: Services using rotated secrets need to be restarted.${NC}"
            echo -e "${YELLOW}  Run: ./dive hub restart && ./dive spoke restart all${NC}"
        fi
    fi
    echo ""

    # Log session end
    audit_log "SESSION_END" "Rotated=$ROTATED_COUNT, Skipped=$SKIPPED_COUNT, Errors=$ERROR_COUNT"

    # Exit with error if there were failures
    if [[ $ERROR_COUNT -gt 0 ]]; then
        exit 1
    fi
}

# Run main function
main "$@"
