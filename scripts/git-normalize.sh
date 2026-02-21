#!/bin/bash
#
# DIVE V3 - Git Repository Normalization Script
#
# This script ensures consistent line endings and prevents persistent file
# modification issues in the Git repository.
#
# Usage:
#   ./scripts/git-normalize.sh [check|fix]
#
# Options:
#   check - Check for line ending and Git configuration issues
#   fix   - Fix line ending and Git configuration issues
#
# If no option is provided, runs in check mode.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Git Repository Normalization${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

MODE="${1:-check}"

# Check Git configuration
check_git_config() {
    echo -e "${YELLOW}Checking Git configuration...${NC}"

    local issues=0

    # Check autocrlf
    if [[ "$(git config core.autocrlf)" != "false" ]]; then
        echo -e "${RED}✗ core.autocrlf should be 'false'${NC}"
        if [[ "$MODE" == "fix" ]]; then
            git config core.autocrlf false
            echo -e "${GREEN}✓ Fixed core.autocrlf${NC}"
        fi
        ((issues++))
    else
        echo -e "${GREEN}✓ core.autocrlf is correctly set${NC}"
    fi

    # Check filemode
    if [[ "$(git config core.filemode)" != "false" ]]; then
        echo -e "${RED}✗ core.filemode should be 'false'${NC}"
        if [[ "$MODE" == "fix" ]]; then
            git config core.filemode false
            echo -e "${GREEN}✓ Fixed core.filemode${NC}"
        fi
        ((issues++))
    else
        echo -e "${GREEN}✓ core.filemode is correctly set${NC}"
    fi

    # Check ignorecase (optional - may be needed for macOS)
    if [[ "$(git config core.ignorecase)" == "true" ]]; then
        echo -e "${YELLOW}⚠ core.ignorecase is 'true' - this may cause case-sensitivity issues on macOS${NC}"
    fi

    return $issues
}

# Check for line ending issues
check_line_endings() {
    echo ""
    echo -e "${YELLOW}Checking line endings...${NC}"

    local issues=0

    # Find files with CRLF line endings (excluding node_modules and .git)
    local crlf_files
    crlf_files=$(find "$PROJECT_ROOT" -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" -o -name "*.md" -o -name "*.sh" -o -name "*.py" -o -name "*.java" -o -name "*.xml" -o -name "*.properties" -o -name "*.rego" -o -name "*.ftl" -o -name "*.css" -o -name "*.scss" -o -name "*.html" | grep -v node_modules | grep -v ".git" | xargs grep -l $'\r' 2>/dev/null || true)

    if [[ -n "$crlf_files" ]]; then
        echo -e "${RED}✗ Found files with CRLF line endings:${NC}"
        echo "$crlf_files" | while read -r file; do
            echo "  - $file"
        done

        if [[ "$MODE" == "fix" ]]; then
            echo "$crlf_files" | while read -r file; do
                if command -v dos2unix &> /dev/null; then
                    dos2unix "$file" 2>/dev/null
                    echo -e "${GREEN}✓ Converted $file${NC}"
                else
                    echo -e "${YELLOW}⚠ dos2unix not available, skipping $file${NC}"
                fi
            done
        fi

        issues=$(echo "$crlf_files" | wc -l | tr -d ' ')
    else
        echo -e "${GREEN}✓ All text files have correct LF line endings${NC}"
    fi

    return $issues
}

# Check for untracked certificate files
check_certificates() {
    echo ""
    echo -e "${YELLOW}Checking for untracked certificate files...${NC}"

    local issues=0

    # Find certificate files that might be tracked
    local cert_files
    cert_files=$(find "$PROJECT_ROOT" -name "*.crt" -o -name "*.pem" -o -name "*.key" -o -name "*.p12" -o -name "*.pfx" | grep -v node_modules | grep -v ".git" || true)

    if [[ -n "$cert_files" ]]; then
        echo -e "${YELLOW}⚠ Found certificate files - ensuring they're not tracked:${NC}"

        echo "$cert_files" | while read -r file; do
            if git ls-files --error-unmatch "$file" &>/dev/null; then
                echo -e "${RED}✗ Certificate file is tracked: $file${NC}"
                if [[ "$MODE" == "fix" ]]; then
                    git rm --cached "$file" 2>/dev/null || true
                    echo -e "${GREEN}✓ Removed $file from tracking${NC}"
                fi
                ((issues++))
            else
                echo -e "${GREEN}✓ $file is properly ignored${NC}"
            fi
        done
    else
        echo -e "${GREEN}✓ No certificate files found${NC}"
    fi

    return $issues
}

# Check .editorconfig settings
check_editorconfig() {
    echo ""
    echo -e "${YELLOW}Checking .editorconfig settings...${NC}"

    local issues=0

    if [[ -f "$PROJECT_ROOT/.editorconfig" ]]; then
        if grep -q "insert_final_newline = true" "$PROJECT_ROOT/.editorconfig"; then
            echo -e "${RED}✗ .editorconfig has 'insert_final_newline = true' which can cause file modifications${NC}"
            if [[ "$MODE" == "fix" ]]; then
                sed -i.bak 's/insert_final_newline = true/insert_final_newline = false/' "$PROJECT_ROOT/.editorconfig"
                rm "$PROJECT_ROOT/.editorconfig.bak" 2>/dev/null || true
                echo -e "${GREEN}✓ Fixed .editorconfig insert_final_newline setting${NC}"
            fi
            ((issues++))
        else
            echo -e "${GREEN}✓ .editorconfig insert_final_newline is safe${NC}"
        fi

        if grep -q "trim_trailing_whitespace = true" "$PROJECT_ROOT/.editorconfig" && ! grep -q "trim_trailing_whitespace = false" "$PROJECT_ROOT/.editorconfig"; then
            echo -e "${YELLOW}⚠ .editorconfig trims trailing whitespace - this may cause modifications${NC}"
        fi
    else
        echo -e "${GREEN}✓ No .editorconfig file found${NC}"
    fi

    return $issues
}

# Main execution
main() {
    local total_issues=0

    check_git_config
    total_issues=$((total_issues + $?))

    check_line_endings
    total_issues=$((total_issues + $?))

    check_certificates
    total_issues=$((total_issues + $?))

    check_editorconfig
    total_issues=$((total_issues + $?))

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

    if [[ $total_issues -eq 0 ]]; then
        echo -e "${GREEN}✓✓✓ No issues found! Repository is properly normalized. ✓✓✓${NC}"
    else
        if [[ "$MODE" == "check" ]]; then
            echo -e "${RED}✗✗✗ Found $total_issues issues. Run '$0 fix' to resolve them. ✗✗✗${NC}"
        else
            echo -e "${GREEN}✓✓✓ Fixed $total_issues issues! ✓✓✓${NC}"
        fi
    fi

    echo ""
    echo -e "${CYAN}Recommendations:${NC}"
    echo "  • Run this script periodically: ./scripts/git-normalize.sh check"
    echo "  • If issues persist, check your editor's auto-format settings"
    echo "  • Ensure certificate files are never committed to Git"
    echo ""

    return $total_issues
}

main

