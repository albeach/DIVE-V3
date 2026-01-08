#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Docker Naming Convention Audit Script
# =============================================================================
# Finds all docker-compose invocations and checks for naming consistency
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULES_DIR="${DIVE_ROOT}/scripts/dive-modules"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DIVE V3 Docker Naming Convention Audit${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

total_issues=0
total_files=0

# Audit report
AUDIT_REPORT="${DIVE_ROOT}/NAMING_AUDIT_REPORT.md"
cat > "$AUDIT_REPORT" <<'EOF'
# Docker Naming Convention Audit Report

**Date:** $(date +%Y-%m-%d)
**Scope:** All dive-modules scripts

---

## Executive Summary

This audit systematically reviewed ALL docker-compose invocations and Docker resource
references across the entire dive-modules codebase to ensure consistency with the
SSOT naming convention.

---

## Audit Criteria

### ✅ CORRECT Patterns
```bash
# Explicit project name with -p flag
docker compose -p dive-hub -f docker-compose.hub.yml up
docker compose -p dive-spoke-fra -f instances/fra/docker-compose.yml up

# Using project name from compose file (with correct name: directive)
cd instances/fra && docker compose up  # If compose file has name: dive-spoke-fra

# Container name patterns
dive-hub-postgres
dive-spoke-fra-keycloak

# Volume patterns
dive-hub_hub_postgres_data
dive-spoke-fra_fra_mongodb_data

# Network patterns
dive-hub_hub-internal
dive-spoke-fra_fra-network
dive-shared (external)
```

### ❌ INCORRECT Patterns
```bash
# Missing -p flag (relies on directory name)
docker compose up  # ❌ Project name = directory name (unpredictable)

# Wrong project name
docker compose -p fra up  # ❌ Missing dive-spoke prefix

# Bare container references without prefix
docker ps | grep keycloak  # ❌ Could match multiple instances

# Volume references without project prefix
docker volume ls | grep postgres  # ❌ Too broad
```

---

## Files Audited

EOF

# Function to audit a file
audit_file() {
    local file="$1"
    local filename=$(basename "$file")
    local issues=0

    echo -e "${BLUE}Auditing: ${filename}${NC}"

    # Check for docker compose without -p flag
    local compose_no_p=$(grep -n "docker compose" "$file" 2>/dev/null | grep -v " -p " | grep -v "^[[:space:]]*#" | wc -l | tr -d ' ')

    # Check for docker-compose (old syntax)
    local old_syntax=$(grep -n "docker-compose" "$file" 2>/dev/null | grep -v "^[[:space:]]*#" | wc -l | tr -d ' ')

    # Check for COMPOSE_PROJECT_NAME without dive prefix
    local bad_project=$(grep -n "COMPOSE_PROJECT_NAME" "$file" 2>/dev/null | grep -v "dive-hub" | grep -v "dive-spoke" | grep -v "^[[:space:]]*#" | wc -l | tr -d ' ')

    # Check for hardcoded container names without prefix
    local bad_containers=$(grep -nE "docker (ps|exec|logs|inspect|rm|stop)" "$file" 2>/dev/null | grep -v "dive-hub-" | grep -v "dive-spoke-" | grep -v "\$" | grep -v "^[[:space:]]*#" | wc -l | tr -d ' ')

    # Sum up issues
    issues=$((compose_no_p + old_syntax + bad_project))

    if [ $issues -gt 0 ]; then
        echo -e "  ${RED}✗ Found $issues potential issue(s)${NC}"

        # Details
        if [ $compose_no_p -gt 0 ]; then
            echo -e "    ${YELLOW}- $compose_no_p docker compose invocation(s) without -p flag${NC}"
        fi
        if [ $old_syntax -gt 0 ]; then
            echo -e "    ${YELLOW}- $old_syntax old docker-compose syntax (should be 'docker compose')${NC}"
        fi
        if [ $bad_project -gt 0 ]; then
            echo -e "    ${YELLOW}- $bad_project COMPOSE_PROJECT_NAME without dive prefix${NC}"
        fi

        # Append to report
        cat >> "$AUDIT_REPORT" <<EOF

### ❌ $filename
**Issues Found:** $issues

$([ $compose_no_p -gt 0 ] && echo "- $compose_no_p docker compose invocation(s) without -p flag")
$([ $old_syntax -gt 0 ] && echo "- $old_syntax old docker-compose syntax")
$([ $bad_project -gt 0 ] && echo "- $bad_project COMPOSE_PROJECT_NAME without dive prefix")

**Lines:**
\`\`\`bash
$(grep -n "docker compose" "$file" 2>/dev/null | grep -v " -p " | grep -v "^[[:space:]]*#" | head -5)
\`\`\`

EOF
    else
        echo -e "  ${GREEN}✓ No issues found${NC}"
        cat >> "$AUDIT_REPORT" <<EOF

### ✅ $filename
**Status:** CLEAN - No naming issues detected

EOF
    fi

    echo ""

    echo $issues
}

# Audit all module files
for module_file in "${MODULES_DIR}"/*.sh; do
    [ -f "$module_file" ] || continue
    [ "$(basename "$module_file")" = "naming.sh" ] && continue  # Skip naming.sh (just created)

    total_files=$((total_files + 1))
    file_issues=$(audit_file "$module_file")
    total_issues=$((total_issues + file_issues))
done

# Summary
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Audit Summary:${NC}"
echo "  Files audited:       $total_files"
echo "  Total issues found:  $total_issues"
echo ""

if [ $total_issues -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CLEAR - No naming convention issues detected!${NC}"

    cat >> "$AUDIT_REPORT" <<EOF

---

## Summary

- **Files Audited:** $total_files
- **Issues Found:** $total_issues

### ✅ Result: ALL CLEAR

All dive-modules scripts follow the Docker naming convention SSOT.
No remediation required.

---

## Recommendations

1. Continue using explicit \`-p\` flags for all docker compose invocations
2. Use SSOT naming functions from \`naming.sh\` module
3. Run this audit periodically (e.g., pre-commit hook)

EOF
else
    echo -e "${YELLOW}⚠️  ISSUES DETECTED - Review required${NC}"
    echo ""
    echo "Detailed audit report: ${AUDIT_REPORT}"

    cat >> "$AUDIT_REPORT" <<EOF

---

## Summary

- **Files Audited:** $total_files
- **Issues Found:** $total_issues

### ⚠️ Result: REMEDIATION REQUIRED

Found $total_issues potential naming convention violations that need review.

---

## Remediation Steps

1. Review each file with issues
2. Add explicit \`-p dive-hub\` or \`-p dive-spoke-{code}\` to docker compose commands
3. Replace old \`docker-compose\` with \`docker compose\`
4. Ensure COMPOSE_PROJECT_NAME uses dive prefixes
5. Re-run this audit to verify fixes

EOF
fi

echo ""
echo "Full report generated: ${AUDIT_REPORT}"
echo ""
