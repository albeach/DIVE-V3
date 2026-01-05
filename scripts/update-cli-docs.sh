#!/usr/local/bin/bash
# DIVE CLI Documentation Update Script
# Updates all documentation to reflect new CLI pattern
# Pattern: ./dive --instance CODE spoke CMD → ./dive spoke CMD CODE

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIVE_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DIVE CLI Documentation Update                            ║${NC}"
echo -e "${BLUE}║  Converting to new pattern: ./dive spoke CMD CODE         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Files to update (primary documentation)
PRIMARY_DOCS=(
    "START-HERE.md"
    "QUICK_TEST_GUIDE.md"
    "PHASE1-QUICKSTART.md"
    "PHASE2-QUICKSTART.md"
    "PHASE3-QUICKSTART.md"
    "NEW_COMMANDS_QUICKREF.md"
    "ZTDF_CLI_QUICKREF.md"
)

# Count total instances
echo -e "${YELLOW}→ Scanning for old CLI patterns...${NC}"
TOTAL_INSTANCES=$(grep -r "dive --instance.*spoke" --include="*.md" . 2>/dev/null | grep -v ".git" | wc -l | tr -d ' ')
echo -e "  Found ${TOTAL_INSTANCES} instances of old pattern"
echo ""

# Common replacements
declare -A REPLACEMENTS=(
    # Deploy
    ["./dive --instance fra spoke deploy"]="./dive spoke deploy FRA"
    ["./dive --instance deu spoke deploy"]="./dive spoke deploy DEU"
    ["./dive --instance gbr spoke deploy"]="./dive spoke deploy GBR"
    ["./dive --instance \$\{CODE\} spoke deploy"]="./dive spoke deploy \${CODE}"
    ["./dive --instance \$CODE spoke deploy"]="./dive spoke deploy \$CODE"
    ["./dive --instance <code> spoke deploy"]="./dive spoke deploy CODE"
    ["./dive --instance CODE spoke deploy"]="./dive spoke deploy CODE"

    # Status
    ["./dive --instance fra spoke status"]="./dive spoke status FRA"
    ["./dive --instance deu spoke status"]="./dive spoke status DEU"
    ["./dive --instance gbr spoke status"]="./dive spoke status GBR"
    ["./dive --instance \$\{CODE\} spoke status"]="./dive spoke status \${CODE}"
    ["./dive --instance \$CODE spoke status"]="./dive spoke status \$CODE"
    ["./dive --instance <code> spoke status"]="./dive spoke status CODE"

    # Logs
    ["./dive --instance fra spoke logs"]="./dive spoke logs FRA"
    ["./dive --instance deu spoke logs"]="./dive spoke logs DEU"
    ["./dive --instance \$\{CODE\} spoke logs"]="./dive spoke logs \${CODE}"
    ["./dive --instance \$CODE spoke logs"]="./dive spoke logs \$CODE"

    # Seed
    ["./dive --instance fra spoke seed"]="./dive spoke seed FRA"
    ["./dive --instance deu spoke seed"]="./dive spoke seed DEU"
    ["./dive --instance \$\{CODE\} spoke seed"]="./dive spoke seed \${CODE}"
    ["./dive --instance \$CODE spoke seed"]="./dive spoke seed \$CODE"

    # Verify
    ["./dive --instance fra spoke verify"]="./dive spoke verify FRA"
    ["./dive --instance deu spoke verify"]="./dive spoke verify DEU"
    ["./dive --instance \$\{CODE\} spoke verify"]="./dive spoke verify \${CODE}"

    # Health
    ["./dive --instance fra spoke health"]="./dive spoke health FRA"
    ["./dive --instance \$\{CODE\} spoke health"]="./dive spoke health \${CODE}"

    # Register
    ["./dive --instance fra spoke register"]="./dive spoke register FRA"
    ["./dive --instance deu spoke register"]="./dive spoke register DEU"
    ["./dive --instance \$\{CODE\} spoke register"]="./dive spoke register \${CODE}"
)

# Function to update a file
update_file() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return
    fi

    echo -e "${YELLOW}→ Updating: ${file}${NC}"

    # Create backup
    cp "$file" "${file}.backup"

    local changes=0

    # Apply all replacements
    for old_pattern in "${!REPLACEMENTS[@]}"; do
        new_pattern="${REPLACEMENTS[$old_pattern]}"

        if grep -qF "$old_pattern" "$file"; then
            sed -i '' "s|${old_pattern}|${new_pattern}|g" "$file"
            local count=$(grep -cF "$new_pattern" "$file" 2>/dev/null || echo 0)
            if [ $count -gt 0 ]; then
                changes=$((changes + count))
            fi
        fi
    done

    if [ $changes -gt 0 ]; then
        echo -e "  ${GREEN}✓ Updated ${changes} instances${NC}"
    else
        echo -e "  ${BLUE}ℹ No changes needed${NC}"
        rm "${file}.backup"
    fi
}

# Update primary documentation
echo -e "${BLUE}Updating primary documentation...${NC}"
echo ""

for doc in "${PRIMARY_DOCS[@]}"; do
    if [ -f "$doc" ]; then
        update_file "$doc"
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Documentation Update Complete                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Backup files created with .backup extension${NC}"
echo -e "${YELLOW}Review changes and remove backups when satisfied${NC}"
echo ""
echo -e "${BLUE}To remove backups:${NC}"
echo -e "  find . -name '*.md.backup' -delete"
echo ""
echo -e "${BLUE}To restore if needed:${NC}"
echo -e "  for f in *.md.backup; do mv \"\$f\" \"\${f%.backup}\"; done"
echo ""
