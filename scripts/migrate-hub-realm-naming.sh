#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Hub Realm Naming Migration Script
# =============================================================================
# Migrates ALL occurrences of legacy hub realm names to correct naming convention
#
# OLD (incorrect):  dive-v3-broker-usa
# NEW (correct):    dive-v3-broker-usa
#
# OLD (incorrect):  dive-v3-broker-usa
# NEW (correct):    dive-v3-broker-usa
#
# This is a ONE-TIME migration script to establish naming convention consistency
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     DIVE V3 Hub Realm Naming Migration                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  This will update ALL files to use correct naming:           ║"
echo "║    dive-v3-broker-usa → dive-v3-broker-usa                       ║"
echo "║    dive-v3-broker-usa → dive-v3-broker-usa                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Dry run first
log_info "Analyzing files to be changed..."

# Find all files with legacy names
FILES_TO_UPDATE=$(find "$PROJECT_ROOT" -type f \( \
    -name "*.yml" -o \
    -name "*.yaml" -o \
    -name "*.json" -o \
    -name "*.sh" -o \
    -name "*.ts" -o \
    -name "*.js" \
  \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.next/*" \
  -not -path "*/coverage/*" \
  -not -path "*/backups/*" \
  -not -path "*/archived/*" \
  | xargs grep -l "dive-v3-broker-usa[^-]" 2>/dev/null || true)

FILE_COUNT=$(echo "$FILES_TO_UPDATE" | wc -l | tr -d ' ')

log_info "Found $FILE_COUNT files to update"
echo ""

if [ "$FILE_COUNT" = "0" ]; then
    log_success "No files need migration - naming already consistent!"
    exit 0
fi

# Show sample of files
echo "Sample files to be updated:"
echo "$FILES_TO_UPDATE" | head -10 | sed 's|'$PROJECT_ROOT'/||' | sed 's/^/  - /'
if [ "$FILE_COUNT" -gt 10 ]; then
    echo "  ... and $(($FILE_COUNT - 10)) more"
fi
echo ""

read -p "Proceed with migration? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log_info "Migration cancelled"
    exit 0
fi

# Create backup
BACKUP_DIR="$PROJECT_ROOT/backups/realm-naming-migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
log_info "Creating backup in: $BACKUP_DIR"

# Backup files
echo "$FILES_TO_UPDATE" | while read -r file; do
    if [ -f "$file" ]; then
        rel_path="${file#$PROJECT_ROOT/}"
        mkdir -p "$BACKUP_DIR/$(dirname "$rel_path")"
        cp "$file" "$BACKUP_DIR/$rel_path"
    fi
done

log_success "Backup created"
echo ""

# Perform migration
log_info "Migrating files..."

UPDATED_COUNT=0

echo "$FILES_TO_UPDATE" | while read -r file; do
    if [ -f "$file" ]; then
        # Portable sed using temporary file (works on macOS + Linux)
        local tmpfile=$(mktemp)
        
        # Migration 1: dive-v3-broker-usa → dive-v3-broker-usa (but NOT dive-v3-broker-usa, dive-v3-broker-fra, etc.)
        if grep -q "dive-v3-broker-usa[^-]" "$file"; then
            sed 's/dive-v3-broker-usa\([^-]\)/dive-v3-broker-usa\1/g' "$file" > "$tmpfile" && mv "$tmpfile" "$file"
        fi

        # Migration 2: dive-v3-broker-usa → dive-v3-broker-usa
        if grep -q "dive-v3-broker-usa" "$file"; then
            tmpfile=$(mktemp)
            sed 's/dive-v3-broker-usa/dive-v3-broker-usa/g' "$file" > "$tmpfile" && mv "$tmpfile" "$file"
        fi
    fi
done

log_success "Migration complete"
echo ""

# Verification
log_info "Verifying migration..."
REMAINING=$(find "$PROJECT_ROOT" -type f \( \
    -name "*.yml" -o \
    -name "*.yaml" -o \
    -name "*.json" -o \
    -name "*.sh" -o \
    -name "*.ts" \
  \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/backups/*" \
  -not -path "*/archived/*" \
  | xargs grep -l "dive-v3-broker-usa[^-]" 2>/dev/null | wc -l | tr -d ' ')

if [ "$REMAINING" = "0" ]; then
    log_success "✓ All files migrated successfully!"
else
    log_warn "⚠ $REMAINING files still contain legacy naming (may be in comments or archived files)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Migration Summary                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Files Updated: $FILE_COUNT                                          ║"
echo "║  Backup: backups/realm-naming-migration-...                  ║"
echo "║                                                              ║"
echo "║  Next Steps:                                                 ║"
echo "║    1. Test deployment: ./dive hub deploy                     ║"
echo "║    2. Verify frontend: https://localhost:3000                ║"
echo "║    3. Deploy spoke: ./dive spoke deploy BGR \"Bulgaria\"        ║"
echo "║    4. Verify SSO: ./dive test sso bgr                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

