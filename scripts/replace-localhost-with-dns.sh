#!/bin/bash
# Script to replace hardcoded localhost URLs with custom DNS hostname
# Usage: ./replace-localhost-with-dns.sh [--dry-run]
# 
# This script replaces:
#   - http://localhost:XXXX  → https://kas.js.usa.divedeeper.internal:XXXX
#   - https://localhost:XXXX → https://kas.js.usa.divedeeper.internal:XXXX
# 
# Preserves the original 4-digit port number

set -e

# Configuration
NEW_HOSTNAME="kas.js.usa.divedeeper.internal"
DRY_RUN=false

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}🔍 DRY RUN MODE - No files will be modified${NC}"
    echo ""
fi

# Files to process (exclude node_modules, .git, dist, coverage, logs, etc.)
FILES=$(find . \
    -type f \
    \( -name "*.tf" -o -name "*.sh" -o -name "*.yml" -o -name "*.yaml" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.txt" -o -name "*.env*" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/coverage/*" \
    -not -path "*/logs/*" \
    -not -path "*/.next/*" \
    -not -path "*/backups/*" \
    -not -path "*/tmp/*" \
    2>/dev/null)

TOTAL_FILES=0
MODIFIED_FILES=0
TOTAL_REPLACEMENTS=0

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Localhost → Custom DNS Hostname Replacement Script${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Old:${NC} http://localhost:XXXX  or https://localhost:XXXX"
echo -e "  ${GREEN}New:${NC} https://${NEW_HOSTNAME}:XXXX"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Process each file
for file in $FILES; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    
    # Check if file contains localhost with 4-digit port
    if grep -qE "(https?://localhost:[0-9]{4})" "$file" 2>/dev/null; then
        MODIFIED_FILES=$((MODIFIED_FILES + 1))
        
        # Count replacements in this file
        HTTP_COUNT=$(grep -oE "http://localhost:[0-9]{4}" "$file" 2>/dev/null | wc -l | tr -d ' ')
        HTTPS_COUNT=$(grep -oE "https://localhost:[0-9]{4}" "$file" 2>/dev/null | wc -l | tr -d ' ')
        FILE_REPLACEMENTS=$((HTTP_COUNT + HTTPS_COUNT))
        TOTAL_REPLACEMENTS=$((TOTAL_REPLACEMENTS + FILE_REPLACEMENTS))
        
        echo -e "${YELLOW}📝 ${file}${NC}"
        echo -e "   ${GREEN}✓${NC} Found ${FILE_REPLACEMENTS} localhost URL(s) to replace"
        
        # Show preview of changes
        if [[ "$DRY_RUN" == true ]]; then
            echo -e "   ${BLUE}Preview:${NC}"
            grep -nE "(https?://localhost:[0-9]{4})" "$file" 2>/dev/null | head -3 | while IFS=: read -r line_num content; do
                echo -e "      Line ${line_num}: ${content}"
            done
        fi
        
        if [[ "$DRY_RUN" == false ]]; then
            # Create backup
            cp "$file" "${file}.bak"
            
            # Perform replacements using sed
            # 1. Replace http://localhost:XXXX with https://NEW_HOSTNAME:XXXX
            # 2. Replace https://localhost:XXXX with https://NEW_HOSTNAME:XXXX
            sed -i.tmp \
                -e "s|http://localhost:\([0-9]\{4\}\)|https://${NEW_HOSTNAME}:\1|g" \
                -e "s|https://localhost:\([0-9]\{4\}\)|https://${NEW_HOSTNAME}:\1|g" \
                "$file"
            
            # Remove temp file created by sed
            rm -f "${file}.tmp"
            
            echo -e "   ${GREEN}✓${NC} Replaced successfully"
        fi
        
        echo ""
    fi
done

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "  Total files scanned:     ${TOTAL_FILES}"
echo -e "  Files modified:          ${MODIFIED_FILES}"
echo -e "  Total replacements:      ${TOTAL_REPLACEMENTS}"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}⚠️  DRY RUN COMPLETE - No files were modified${NC}"
    echo -e "${YELLOW}   Run without --dry-run to apply changes${NC}"
else
    echo -e "${GREEN}✅ REPLACEMENT COMPLETE${NC}"
    echo -e "${BLUE}   Backup files created: *.bak${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Important Next Steps:${NC}"
    echo -e "   1. Review changes with: git diff"
    echo -e "   2. Test the changes thoroughly"
    echo -e "   3. Remove backup files: find . -name '*.bak' -delete"
    echo -e "   4. Commit changes: git add . && git commit -m 'Replace localhost URLs with custom DNS'"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Show list of modified files if not dry run
if [[ "$DRY_RUN" == false ]] && [[ $MODIFIED_FILES -gt 0 ]]; then
    echo -e "${BLUE}Modified files:${NC}"
    for file in $FILES; do
        if [[ -f "${file}.bak" ]]; then
            echo -e "  - ${file}"
        fi
    done
    echo ""
fi

exit 0

