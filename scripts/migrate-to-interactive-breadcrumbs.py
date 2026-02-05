#!/usr/bin/env python3
"""
DIVE V3 - Interactive Breadcrumbs Migration Script
Migrates ALL admin pages to use InteractiveBreadcrumbs as SSOT
"""

import re
import sys
from pathlib import Path

# Base directory
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "src" / "app" / "admin"

# Files to migrate
FILES_TO_MIGRATE = [
    "approvals/page.tsx",
    "certificates/page.tsx",
    "clearance-management/page.tsx",
    "debug/page.tsx",
    "opa-policy/page.tsx",
    "sp-registry/page.tsx",
    "spoke/page.tsx",
    "tenants/page.tsx",
    "users/page.tsx",
    "analytics/sessions/page.tsx",
    "federation/audit/page.tsx",
    "federation/drift/page.tsx",
    "federation/opal/page.tsx",
    "federation/policies/page.tsx",
    "federation/spokes/page.tsx",
    "federation/statistics/page.tsx",
    "idp/new/page.tsx",
    "opal/bundles/page.tsx",
    "security/certificates/page.tsx",
    "sp-registry/new/page.tsx",
    "sp-registry/[spId]/page.tsx",
    "spoke/audit/page.tsx",
    "spoke/failover/page.tsx",
    "spoke/maintenance/page.tsx",
    "tools/decision-replay/page.tsx",
    "tools/policy-simulation/page.tsx",
    "users/provision/page.tsx",
]

IMPORT_LINE = "import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';"
BREADCRUMBS_JSX = """      {/* Interactive Breadcrumbs - SSOT */}
      <div className="mb-6">
        <InteractiveBreadcrumbs />
      </div>
"""


def migrate_file(filepath: Path) -> bool:
    """Migrate a single file to use InteractiveBreadcrumbs"""
    
    if not filepath.exists():
        print(f"⊘ Skipping {filepath.relative_to(FRONTEND_DIR.parent.parent.parent)} (not found)")
        return False
    
    content = filepath.read_text()
    original_content = content
    
    # Check if already migrated
    if "InteractiveBreadcrumbs" in content:
        print(f"✓ Already migrated: {filepath.relative_to(FRONTEND_DIR)}")
        return False
    
    print(f"→ Processing: {filepath.relative_to(FRONTEND_DIR)}")
    
    # Step 1: Add import after last import statement
    if IMPORT_LINE not in content:
        # Find the last import line
        import_matches = list(re.finditer(r'^import .*?;$', content, re.MULTILINE))
        if import_matches:
            last_import = import_matches[-1]
            insert_pos = last_import.end()
            content = content[:insert_pos] + "\n" + IMPORT_LINE + content[insert_pos:]
            print(f"  ✓ Added InteractiveBreadcrumbs import")
    
    # Step 2: Remove breadcrumbs prop from PageLayout
    # Match: breadcrumbs={[...]} across multiple lines
    breadcrumbs_pattern = r'\s*breadcrumbs=\{\s*\[[\s\S]*?\]\s*\}\s*\n'
    if re.search(breadcrumbs_pattern, content):
        content = re.sub(breadcrumbs_pattern, '\n', content)
        print(f"  ✓ Removed breadcrumbs prop")
    
    # Step 3: Add InteractiveBreadcrumbs after PageLayout opening tag
    # Find <PageLayout...> and add breadcrumbs after the closing >
    pagelayout_pattern = r'(<PageLayout[^>]*>)\s*\n'
    
    def add_breadcrumbs(match):
        return match.group(1) + "\n" + BREADCRUMBS_JSX
    
    if re.search(pagelayout_pattern, content):
        # Only add if not already present
        if '<InteractiveBreadcrumbs />' not in content:
            content = re.sub(pagelayout_pattern, add_breadcrumbs, content, count=1)
            print(f"  ✓ Added InteractiveBreadcrumbs component")
    
    # Write back if changed
    if content != original_content:
        filepath.write_text(content)
        print(f"  ✅ Migrated successfully")
        return True
    else:
        print(f"  ⚠ No changes needed")
        return False


def main():
    print("🔄 Migrating Admin Pages to InteractiveBreadcrumbs SSOT")
    print("=" * 60)
    print()
    
    migrated_count = 0
    skipped_count = 0
    
    for file_path in FILES_TO_MIGRATE:
        full_path = FRONTEND_DIR / file_path
        if migrate_file(full_path):
            migrated_count += 1
        else:
            skipped_count += 1
        print()
    
    print("=" * 60)
    print("✅ Migration Complete!")
    print(f"   Migrated: {migrated_count} files")
    print(f"   Skipped: {skipped_count} files")
    print()
    print("Next steps:")
    print("  1. Review changes: git diff")
    print("  2. Test admin pages in browser")
    print("  3. Verify breadcrumbs render correctly")
    print("  4. Commit changes when satisfied")
    print()


if __name__ == "__main__":
    main()
