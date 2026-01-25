#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Secret Lint Script
# =============================================================================
# Detects hardcoded secrets, default passwords, and inline credentials
# in the codebase. Used by CI and ./dive secrets lint.
#
# Exit codes:
#   0 - No secrets found (clean)
#   1 - Hardcoded secrets detected
#   2 - Script error
#
# Usage:
#   ./scripts/lint-secrets.sh              # Full scan
#   ./scripts/lint-secrets.sh --ci         # CI mode (strict)
#   ./scripts/lint-secrets.sh --verbose    # Show matched lines
#   ./scripts/lint-secrets.sh --fix        # Show remediation hints
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Options
VERBOSE=false
CI_MODE=false
SHOW_FIX=false
QUIET=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v) VERBOSE=true ;;
        --ci) CI_MODE=true ;;
        --fix) SHOW_FIX=true ;;
        --quiet|-q) QUIET=true ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --verbose, -v    Show matched lines"
            echo "  --ci             CI mode (strict, no colors)"
            echo "  --fix            Show remediation hints"
            echo "  --quiet, -q      Minimal output"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 2 ;;
    esac
    shift
done

# CI mode: disable colors
if [[ "$CI_MODE" == "true" ]]; then
    RED=''
    GREEN=''
    YELLOW=''
    CYAN=''
    NC=''
fi

# Counters
TOTAL_VIOLATIONS=0

log() {
    [[ "$QUIET" == "true" ]] && return
    echo -e "$1"
}

log_violation() {
    local type="$1"
    local file="$2"
    local detail="$3"
    
    ((TOTAL_VIOLATIONS++))
    
    echo -e "${RED}✗${NC} [$type] $file"
    if [[ "$VERBOSE" == "true" && -n "$detail" ]]; then
        echo -e "  ${YELLOW}$detail${NC}"
    fi
}

# =============================================================================
# TARGETED SCANS (optimized for speed)
# =============================================================================

# Scan compose files for hardcoded passwords (not using ${...} syntax)
check_compose_files() {
    log "${CYAN}Checking compose files for hardcoded secrets...${NC}"
    
    local compose_files=(
        "$PROJECT_ROOT/docker-compose.yml"
        "$PROJECT_ROOT/docker-compose.hub.yml"
        "$PROJECT_ROOT/docker-compose.dev.yml"
        "$PROJECT_ROOT/docker/base/services.yml"
    )
    
    # Add spoke compose files
    for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
        if [[ -f "${spoke_dir}docker-compose.yml" ]]; then
            compose_files+=("${spoke_dir}docker-compose.yml")
        fi
    done
    
    for file in "${compose_files[@]}"; do
        [[ ! -f "$file" ]] && continue
        
        local rel_path="${file#$PROJECT_ROOT/}"
        
        # Check for PASSWORD: or SECRET: followed by literal value (not ${...})
        # Pattern: VALUE that doesn't start with $ or "
        if grep -qE '(PASSWORD|SECRET):\s+[a-zA-Z0-9]' "$file" 2>/dev/null; then
            # Exclude lines with ${...} substitution
            local matches
            matches=$(grep -nE '(PASSWORD|SECRET):\s+[a-zA-Z0-9]' "$file" 2>/dev/null | grep -v '\$\{' | head -5 || true)
            if [[ -n "$matches" ]]; then
                log_violation "HARDCODED_YAML" "$rel_path" "$matches"
            fi
        fi
        
        # Check for inline mongodb:// or redis:// with password (not ${...})
        if grep -qE '(mongodb|redis|postgresql)://[^$]*:[^$\{]+@' "$file" 2>/dev/null; then
            log_violation "INLINE_CREDENTIAL" "$rel_path" "Contains inline credentials in connection string"
        fi
    done
}

# Check for missing ${VAR:?required} syntax in spoke files
check_required_syntax() {
    log "${CYAN}Checking for proper \${VAR:?required} syntax in spokes...${NC}"
    
    for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
        local file="${spoke_dir}docker-compose.yml"
        [[ ! -f "$file" ]] && continue
        
        local rel_path="${file#$PROJECT_ROOT/}"
        local dirname=$(basename "$spoke_dir")
        
        # Skip hub/shared
        [[ "$dirname" == "hub" || "$dirname" == "shared" ]] && continue
        
        # Check if PASSWORD variables use :? syntax
        if grep -qE 'PASSWORD.*\$\{[A-Z_]+\}' "$file" 2>/dev/null; then
            # Look for PASSWORD vars without :? 
            if grep -E 'PASSWORD.*\$\{[A-Z_]+\}' "$file" 2>/dev/null | grep -qv ':?' ; then
                log_violation "MISSING_REQUIRED" "$rel_path" "Password variables should use \${VAR:?required} syntax"
            fi
        fi
    done
}

# Check TypeScript/JavaScript files in src directories only
check_source_files() {
    log "${CYAN}Checking source files for hardcoded secrets...${NC}"
    
    local src_dirs=(
        "$PROJECT_ROOT/backend/src"
        "$PROJECT_ROOT/frontend/src"
        "$PROJECT_ROOT/kas/src"
    )
    
    for src_dir in "${src_dirs[@]}"; do
        [[ ! -d "$src_dir" ]] && continue
        
        # Look for password = "literal" patterns (not process.env)
        # Exclude test files - they may have dummy data
        while IFS= read -r match; do
            [[ -z "$match" ]] && continue
            local file=$(echo "$match" | cut -d: -f1)
            local rel_path="${file#$PROJECT_ROOT/}"
            
            # Skip test files
            if [[ "$file" == *"__tests__"* || "$file" == *".test."* || "$file" == *".spec."* ]]; then
                continue
            fi
            
            # Skip if it's referencing process.env
            if echo "$match" | grep -q 'process\.env'; then
                continue
            fi
            
            log_violation "HARDCODED_PASSWORD" "$rel_path" "$(echo "$match" | cut -d: -f3-)"
        done < <(find "$src_dir" \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/__tests__/*" ! -name "*.test.*" ! -name "*.spec.*" 2>/dev/null | head -100 | xargs grep -nE 'password\s*[:=]\s*["\x27][^$][^"\x27]{6,}["\x27]' 2>/dev/null | grep -v 'process\.env' | grep -v 'passwordSchema' | grep -v 'password.*type' | grep -v '//' | head -10 || true)
    done
}

# Check for .env files that should not be committed
# NOTE: .env.local is expected to have secrets (it's in .gitignore)
# We only flag .env files that are NOT in .gitignore
check_env_files() {
    log "${CYAN}Checking for .env files with secrets...${NC}"
    
    # Only check .env files that might be accidentally committed
    # .env.local and similar are expected to have secrets
    local env_files=(
        "$PROJECT_ROOT/.env"
        "$PROJECT_ROOT/backend/.env"
        "$PROJECT_ROOT/frontend/.env"
    )
    
    for file in "${env_files[@]}"; do
        [[ ! -f "$file" ]] && continue
        
        local rel_path="${file#$PROJECT_ROOT/}"
        
        # Check if file is in gitignore
        if git check-ignore -q "$file" 2>/dev/null; then
            # File is ignored, skip
            continue
        fi
        
        # Check if it has actual password values (not empty, not placeholders)
        if grep -qE '^[A-Z_]*(PASSWORD|SECRET)[A-Z_]*=[^<\n].{8,}' "$file" 2>/dev/null; then
            log_violation "ENV_FILE" "$rel_path" "Contains secrets and NOT in .gitignore!"
        fi
    done
}

# Check for common weak passwords
check_weak_passwords() {
    log "${CYAN}Checking for weak/default passwords...${NC}"
    
    local weak_patterns=(
        'DivePilot2025!'
        'admin123'
        'password123'
        'changeme'
        'secret123'
    )
    
    local files_to_check=(
        "$PROJECT_ROOT/docker-compose.yml"
        "$PROJECT_ROOT/docker-compose.hub.yml"
    )
    
    # Add spoke files
    for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
        [[ -f "${spoke_dir}docker-compose.yml" ]] && files_to_check+=("${spoke_dir}docker-compose.yml")
    done
    
    for file in "${files_to_check[@]}"; do
        [[ ! -f "$file" ]] && continue
        local rel_path="${file#$PROJECT_ROOT/}"
        
        for pattern in "${weak_patterns[@]}"; do
            if grep -qF "$pattern" "$file" 2>/dev/null; then
                log_violation "WEAK_PASSWORD" "$rel_path" "Contains weak password pattern: $pattern"
                break
            fi
        done
    done
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    log ""
    log "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    log "${CYAN}                     DIVE V3 Secret Lint                                ${NC}"
    log "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    log ""
    
    cd "$PROJECT_ROOT"
    
    # Run all checks (optimized for speed)
    check_compose_files
    check_required_syntax
    check_source_files
    check_env_files
    check_weak_passwords
    
    # Summary
    log ""
    log "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
    
    if [[ $TOTAL_VIOLATIONS -eq 0 ]]; then
        log "${GREEN}✓ No hardcoded secrets detected${NC}"
        log "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
        exit 0
    else
        log "${RED}✗ Found $TOTAL_VIOLATIONS secret violation(s)${NC}"
        log "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
        
        if [[ "$SHOW_FIX" == "true" ]]; then
            log ""
            log "${YELLOW}Remediation:${NC}"
            log "  1. Move secrets to GCP Secret Manager: gcloud secrets create dive-v3-<type>-<instance>"
            log "  2. Use environment variables: \${PASSWORD:?required}"
            log "  3. Load secrets via CLI: ./dive secrets load"
            log "  4. Reference docs/SECRETS_NAMING_CONVENTION.md"
            log ""
        fi
        
        exit 1
    fi
}

main "$@"
