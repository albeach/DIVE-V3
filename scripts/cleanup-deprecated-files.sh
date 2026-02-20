#!/bin/bash
# DIVE V3 Safe Cleanup - Remove deprecated/archived files
# Created: 2026-01-25
# Purpose: Remove legacy scripts, archived extensions, backups, and deprecated files

set -e

WORKSPACE_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
cd "$WORKSPACE_ROOT"

echo "🗑️  DIVE V3 Deprecated Files Cleanup"
echo "======================================"
echo ""
echo "Working directory: $WORKSPACE_ROOT"
echo ""

# Safety check - ensure we're in the right directory
if [[ ! -f "./dive" ]]; then
    echo "❌ Error: Not in DIVE V3 root directory"
    exit 1
fi

# Create cleanup log
CLEANUP_LOG="cleanup-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$CLEANUP_LOG") 2>&1

echo "📋 Cleanup log: $CLEANUP_LOG"
echo ""

# Function to safely remove and log
safe_remove() {
    local path="$1"
    if [[ -e "$path" ]]; then
        local size
        size=$(du -sh "$path" 2>/dev/null | cut -f1 || echo "unknown")
        echo "   Removing: $path ($size)"
        rm -rf "$path"
        echo "   ✅ Removed"
    else
        echo "   ⏭️  Already removed: $path"
    fi
}

# 1. Remove archived scripts
echo "1️⃣  Removing archived scripts..."
safe_remove "scripts/archived/"

# 2. Remove archived Keycloak extensions
echo ""
echo "2️⃣  Removing archived Keycloak extensions..."
safe_remove "keycloak/extensions/archived/"

# 3. Remove archived Terraform
echo ""
echo "3️⃣  Removing archived Terraform..."
safe_remove "terraform/archived/"
safe_remove "terraform.backup-20260124-065519/"

# 4. Remove theme backups
echo ""
echo "4️⃣  Removing Keycloak theme backups..."
safe_remove "keycloak/themes-backup/"

# 5. Remove backup files by extension
echo ""
echo "5️⃣  Removing backup files (*.BKP, *.OLD, *.old, *.backup)..."
find . -type f \( -name "*.BKP" -o -name "*.OLD" -o -name "*.old" \) -print -delete 2>/dev/null || true
find . -type f -name "*.backup" ! -path "./backups/*" -print -delete 2>/dev/null || true

# 6. Remove disabled files
echo ""
echo "6️⃣  Removing disabled files (*.disabled)..."
find . -type f -name "*.disabled" -print -delete 2>/dev/null || true

# 7. Remove one-time fix scripts
echo ""
echo "7️⃣  Removing one-time fix scripts..."
if [[ -d "scripts" ]]; then
    find scripts -maxdepth 1 -type f -name "fix-*.sh" -print -delete 2>/dev/null || true
    find scripts -maxdepth 1 -type f -name "fix-*.js" -print -delete 2>/dev/null || true
    safe_remove "scripts/clean-trailing-lines.sh"
    safe_remove "scripts/set-alb-theme.js"
    find scripts -maxdepth 1 -type f -name "validate-*.sh" -print -delete 2>/dev/null || true
fi

# 8. Remove realm backup files
echo ""
echo "8️⃣  Removing realm backup files..."
if [[ -d "keycloak/realms" ]]; then
    find keycloak/realms -type f -name "*.backup*" -print -delete 2>/dev/null || true
fi

# 9. Remove old certificate files
echo ""
echo "9️⃣  Removing old certificate files..."
safe_remove "keycloak/certs/key.pem.old"
safe_remove "keycloak/certs/certificate.pem.old"
safe_remove "backend/certs/crl/crlnumber.old"

# 10. Remove specific deprecated component files
echo ""
echo "🔟 Removing deprecated component files..."
safe_remove "frontend/src/app/admin/idp/page.tsx.OLD-BACKUP"
safe_remove "frontend/src/components/policies/PolicyEditorPanel.old.tsx"

# Summary
echo ""
echo "======================================"
echo "✅ CLEANUP COMPLETE"
echo "======================================"
echo ""
echo "📊 Summary:"
echo "   ✅ Archived scripts removed"
echo "   ✅ Archived Keycloak extensions removed"
echo "   ✅ Archived Terraform removed"
echo "   ✅ Theme backups removed"
echo "   ✅ Backup files removed (*.BKP, *.OLD, *.old)"
echo "   ✅ Disabled files removed (*.disabled)"
echo "   ✅ One-time fix scripts removed"
echo "   ✅ Realm backup files removed"
echo "   ✅ Old certificate files removed"
echo "   ✅ Deprecated component files removed"
echo ""
echo "⚠️  MANUAL ACTIONS REQUIRED:"
echo ""
echo "1. Archive backups/ to external storage:"
echo "   - backups/naming-migration-20251223-191947/"
echo "   - backups/pre-modernization-20260124/"
echo "   - backups/realm-cleanup-20260103/"
echo "   - backups/realm-naming-migration-20251226-020732/"
echo "   - backups/keycloak-idps/"
echo "   - backups/usa/weekly/"
echo "   Then run: rm -rf backups/"
echo ""
echo "2. Decide on optional services:"
echo "   - authzforce/ (keep if using Policies Lab)"
echo "   - external-idps/ (keep if using local dev IdPs)"
echo "   - dive25-landing/ (keep if using public landing page)"
echo "   - status-page/ (keep if using public status page)"
echo ""
echo "3. Review test files if needed:"
echo "   - Most test-*.sh files are active E2E tests (KEEP)"
echo "   - Review one-time validation scripts individually"
echo ""
echo "📋 Full log saved to: $CLEANUP_LOG"
echo ""
echo "🔍 Verify cleanup with: git status"
echo "🔄 Test deployment with: ./dive deploy hub"
echo ""
