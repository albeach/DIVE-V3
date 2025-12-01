#!/bin/bash
# =============================================================================
# DIVE V3 - Federation Registry Validation Script
# =============================================================================
# Purpose: Validate federation-registry.json against JSON schema
# Usage: ./scripts/federation/validate-config.sh [--verbose]
# Exit Codes:
#   0 - Valid configuration
#   1 - Schema validation failed
#   2 - Port conflicts detected
#   3 - Invalid federation matrix
#   4 - Missing required files
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
SCHEMA_FILE="$PROJECT_ROOT/config/federation-registry.schema.json"
VERBOSE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

verbose_log() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}  →${NC} $1"
    fi
}

# Check required commands
check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if ! command -v ajv &> /dev/null; then
        log_warning "ajv-cli not found, skipping JSON schema validation"
        log_warning "Install with: npm install -g ajv-cli"
        return 1
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Install with: brew install ${missing_deps[*]}"
        return 1
    fi
    
    log_success "All dependencies found"
    return 0
}

# Validate file existence
validate_files() {
    log_info "Validating file existence..."
    
    if [ ! -f "$REGISTRY_FILE" ]; then
        log_error "Registry file not found: $REGISTRY_FILE"
        return 4
    fi
    verbose_log "Registry file: $REGISTRY_FILE"
    
    if [ ! -f "$SCHEMA_FILE" ]; then
        log_error "Schema file not found: $SCHEMA_FILE"
        return 4
    fi
    verbose_log "Schema file: $SCHEMA_FILE"
    
    log_success "Required files exist"
    return 0
}

# Validate JSON syntax
validate_json_syntax() {
    log_info "Validating JSON syntax..."
    
    if ! jq empty "$REGISTRY_FILE" 2>/dev/null; then
        log_error "Invalid JSON syntax in registry file"
        jq empty "$REGISTRY_FILE"
        return 1
    fi
    
    if ! jq empty "$SCHEMA_FILE" 2>/dev/null; then
        log_error "Invalid JSON syntax in schema file"
        jq empty "$SCHEMA_FILE"
        return 1
    fi
    
    log_success "JSON syntax valid"
    return 0
}

# Validate against JSON schema
validate_schema() {
    log_info "Validating against JSON schema..."
    
    if ! command -v ajv &> /dev/null; then
        log_warning "Skipping schema validation (ajv-cli not installed)"
        return 0
    fi
    
    if ! ajv validate -s "$SCHEMA_FILE" -d "$REGISTRY_FILE" --strict=false 2>&1; then
        log_error "Schema validation failed"
        return 1
    fi
    
    log_success "Schema validation passed"
    return 0
}

# Check for port conflicts
validate_port_conflicts() {
    log_info "Checking for port conflicts..."
    
    local ports_file=$(mktemp)
    local conflicts=false
    
    # Extract all ports with their instance
    jq -r '.instances | to_entries[] | 
        .key as $instance | 
        .value.ports | to_entries[] | 
        "\($instance):\(.key):\(.value)"' "$REGISTRY_FILE" > "$ports_file"
    
    verbose_log "Port mappings extracted"
    
    # Group by port number and check for duplicates (excluding different types/hosts)
    while IFS=: read -r instance1 service1 port1; do
        while IFS=: read -r instance2 service2 port2; do
            if [ "$port1" = "$port2" ] && [ "$instance1" != "$instance2" ]; then
                # Check if both instances are local (port conflict)
                type1=$(jq -r ".instances.$instance1.type" "$REGISTRY_FILE")
                type2=$(jq -r ".instances.$instance2.type" "$REGISTRY_FILE")
                
                if [ "$type1" = "local" ] && [ "$type2" = "local" ]; then
                    log_error "Port conflict: $instance1:$service1 and $instance2:$service2 both use port $port1"
                    conflicts=true
                fi
            fi
        done < "$ports_file"
    done < "$ports_file"
    
    rm -f "$ports_file"
    
    if [ "$conflicts" = true ]; then
        return 2
    fi
    
    log_success "No port conflicts detected"
    return 0
}

# Validate federation matrix
validate_federation_matrix() {
    log_info "Validating federation matrix..."
    
    local matrix_valid=true
    
    # Get all instance codes
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    
    # Check each instance has a federation entry
    for instance in $instances; do
        if ! jq -e ".federation.matrix.$instance" "$REGISTRY_FILE" > /dev/null 2>&1; then
            log_error "Instance '$instance' missing from federation matrix"
            matrix_valid=false
            continue
        fi
        
        verbose_log "Checking federation partners for $instance"
        
        # Check each partner exists
        local partners=$(jq -r ".federation.matrix.$instance[]" "$REGISTRY_FILE")
        for partner in $partners; do
            if ! jq -e ".instances.$partner" "$REGISTRY_FILE" > /dev/null 2>&1; then
                log_error "Instance '$instance' references non-existent partner '$partner'"
                matrix_valid=false
            else
                verbose_log "  ✓ $instance → $partner"
            fi
        done
    done
    
    # Check for symmetric relationships (if A→B then B→A)
    for instance in $instances; do
        local partners=$(jq -r ".federation.matrix.$instance[]" "$REGISTRY_FILE")
        for partner in $partners; do
            local reverse_partners=$(jq -r ".federation.matrix.$partner[]?" "$REGISTRY_FILE")
            if ! echo "$reverse_partners" | grep -q "^${instance}$"; then
                log_warning "Asymmetric federation: $instance → $partner exists, but $partner → $instance missing"
            fi
        done
    done
    
    if [ "$matrix_valid" = false ]; then
        return 3
    fi
    
    log_success "Federation matrix valid"
    return 0
}

# Validate Cloudflare tunnel IDs
validate_cloudflare_tunnels() {
    log_info "Validating Cloudflare tunnel IDs..."
    
    local tunnel_ids=$(jq -r '.instances[].cloudflare.tunnelId' "$REGISTRY_FILE")
    local unique_ids=$(echo "$tunnel_ids" | sort -u | wc -l | tr -d ' ')
    local total_ids=$(echo "$tunnel_ids" | wc -l | tr -d ' ')
    
    if [ "$unique_ids" != "$total_ids" ]; then
        log_error "Duplicate Cloudflare tunnel IDs detected"
        return 1
    fi
    
    # Validate UUID format
    for id in $tunnel_ids; do
        if ! [[ "$id" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]; then
            log_error "Invalid Cloudflare tunnel ID format: $id"
            return 1
        fi
        verbose_log "Valid tunnel ID: $id"
    done
    
    log_success "Cloudflare tunnel IDs valid"
    return 0
}

# Validate required secrets are defined
validate_secrets() {
    log_info "Validating secret definitions..."
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local secrets_valid=true
    
    local required_secrets=(
        "keycloakAdmin"
        "keycloakClientSecret"
        "postgres"
        "mongodb"
        "redis"
    )
    
    for instance in $instances; do
        verbose_log "Checking secrets for $instance"
        for secret in "${required_secrets[@]}"; do
            if ! jq -e ".instances.$instance.secrets.$secret" "$REGISTRY_FILE" > /dev/null 2>&1; then
                log_error "Instance '$instance' missing required secret: $secret"
                secrets_valid=false
            fi
        done
    done
    
    if [ "$secrets_valid" = false ]; then
        return 1
    fi
    
    log_success "All required secrets defined"
    return 0
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE" | wc -l | tr -d ' ')
    local local_instances=$(jq -r '.instances[] | select(.type=="local")' "$REGISTRY_FILE" | jq -s length)
    local remote_instances=$(jq -r '.instances[] | select(.type=="remote")' "$REGISTRY_FILE" | jq -s length)
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  DIVE V3 Federation Registry Validation Report"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "  Registry Version: $(jq -r '.version' "$REGISTRY_FILE")"
    echo "  Last Updated:     $(jq -r '.metadata.lastUpdated' "$REGISTRY_FILE")"
    echo ""
    echo "  Total Instances:  $instances"
    echo "    - Local:        $local_instances"
    echo "    - Remote:       $remote_instances"
    echo ""
    echo "  Instances:"
    jq -r '.instances | to_entries[] | "    - \(.key | ascii_upcase) (\(.value.name)): \(.value.type)"' "$REGISTRY_FILE"
    echo ""
    echo "  Federation Model: $(jq -r '.federation.model' "$REGISTRY_FILE")"
    echo "  Trust Model:      $(jq -r '.federation.trustModel' "$REGISTRY_FILE")"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  DIVE V3 Federation Registry Validator"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    local exit_code=0
    
    # Run all validation checks
    check_dependencies || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_files || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_json_syntax || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_schema || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_port_conflicts || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_federation_matrix || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_cloudflare_tunnels || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    validate_secrets || exit_code=$?
    [ $exit_code -ne 0 ] && exit $exit_code
    
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_success "All validation checks passed!"
        generate_report
        echo -e "${GREEN}✓✓✓ Configuration is valid and ready to use ✓✓✓${NC}"
        echo ""
    else
        log_error "Validation failed with exit code $exit_code"
        echo ""
    fi
    
    exit $exit_code
}

# Run main function
main "$@"




