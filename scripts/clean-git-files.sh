#!/bin/bash
#
# DIVE V3 - Clean Git Files Script
#
# This script helps resolve the issue where Git constantly shows files as modified
# due to trailing empty lines or other formatting issues.
#

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}DIVE V3 - Git Files Cleanup${NC}"
echo "============================"

echo -e "\n${YELLOW}Current git status:${NC}"
git status --porcelain | head -10
modified_count=$(git status --porcelain | wc -l)
echo "... ($modified_count total modified files)"

if [ "$modified_count" -eq 0 ]; then
    echo -e "\n${GREEN}✓ No modified files! Repository is clean.${NC}"
    exit 0
fi

echo -e "\n${YELLOW}Issue Analysis:${NC}"
echo "Files showing as modified are likely due to:"
echo "• Trailing empty lines added by editors"
echo "• Inconsistent line endings"
echo "• File permissions changes"

echo -e "\n${YELLOW}Recommended Solutions:${NC}"
echo ""
echo "1. ${GREEN}Configure your editor:${NC}"
echo "   • Set 'insert_final_newline = false' in editor settings"
echo "   • Disable automatic whitespace trimming"
echo "   • Use LF line endings (not CRLF)"
echo ""
echo "2. ${GREEN}Update .editorconfig:${NC}"
echo "   • The .editorconfig already has 'insert_final_newline = false'"
echo "   • Ensure your editor respects .editorconfig files"
echo ""
echo "3. ${GREEN}Clean existing files (one-time fix):${NC}"

read -p "Do you want to clean trailing empty lines from modified files? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo -e "\n${YELLOW}Skipped file cleaning.${NC}"
    echo -e "\n${GREEN}To clean files manually:${NC}"
    echo "python3 -c \"
import sys
for f in sys.argv[1:]:
    with open(f) as file: lines = file.readlines()
    while lines and lines[-1].strip() == '': lines.pop()
    if lines and not lines[-1].endswith('\n'): lines[-1] += '\n'
    with open(f, 'w') as file: file.writelines(lines)
\" <filename>"
    exit 0
fi

echo -e "\n${YELLOW}Cleaning trailing empty lines...${NC}"

# Get list of modified files
modified_files=$(git status --porcelain | awk '{print $2}')

cleaned=0
for file in $modified_files; do
    if [ -f "$file" ]; then
        # Check if file has trailing empty lines
        if [ $(tail -n 1 "$file" | wc -l) -eq 0 ]; then
            # Use Python to safely remove trailing empty lines
            python3 -c "
import sys
file = sys.argv[1]
with open(file, 'r') as f:
    lines = f.readlines()

# Remove trailing empty lines
while lines and lines[-1].strip() == '':
    lines.pop()

# Ensure exactly one final newline if file has content
if lines and not lines[-1].endswith('\n'):
    lines[-1] += '\n'

with open(file, 'w') as f:
    f.writelines(lines)
" "$file"

            echo -e "${GREEN}✓ Cleaned: $file${NC}"
            ((cleaned++))
        fi
    fi
done

echo -e "\n${GREEN}Cleanup complete!${NC}"
echo "Cleaned $cleaned files"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Review changes: git diff"
echo "2. If changes look good: git add -A && git commit -m 'fix: remove trailing empty lines'"
echo "3. Configure your editor to prevent this in the future"

echo -e "\n${YELLOW}Final git status:${NC}"
git status --porcelain | head -5
remaining=$(git status --porcelain | wc -l)
if [ "$remaining" -gt 5 ]; then
    echo "... ($remaining total modified files)"
fi

