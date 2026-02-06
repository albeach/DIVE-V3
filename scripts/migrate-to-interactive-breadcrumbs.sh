#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Interactive Breadcrumbs Migration Script
# =============================================================================
# Migrates ALL admin pages to use InteractiveBreadcrumbs as SSOT
# =============================================================================

set -e

cd "$(dirname "$0")/.."

echo "🔄 Migrating Admin Pages to InteractiveBreadcrumbs SSOT"
echo "========================================================="
echo ""

# List of files to migrate (relative to frontend/src/app/admin)
FILES_TO_MIGRATE=(
  "approvals/page.tsx"
  "certificates/page.tsx"
  "clearance-management/page.tsx"
  "debug/page.tsx"
  "opa-policy/page.tsx"
  "sp-registry/page.tsx"
  "spoke/page.tsx"
  "tenants/page.tsx"
  "users/page.tsx"
  "analytics/sessions/page.tsx"
  "federation/audit/page.tsx"
  "federation/drift/page.tsx"
  "federation/opal/page.tsx"
  "federation/policies/page.tsx"
  "federation/spokes/page.tsx"
  "federation/statistics/page.tsx"
  "idp/new/page.tsx"
  "opal/bundles/page.tsx"
  "security/certificates/page.tsx"
  "sp-registry/new/page.tsx"
  "sp-registry/[spId]/page.tsx"
  "spoke/audit/page.tsx"
  "spoke/failover/page.tsx"
  "spoke/maintenance/page.tsx"
  "tools/decision-replay/page.tsx"
  "tools/policy-simulation/page.tsx"
  "users/provision/page.tsx"
)

for file in "${FILES_TO_MIGRATE[@]}"; do
  filepath="frontend/src/app/admin/$file"

  if [ ! -f "$filepath" ]; then
    echo "⊘ Skipping $file (not found)"
    continue
  fi

  echo "→ Processing: $file"

  # Step 1: Add import if not present
  if ! grep -q "InteractiveBreadcrumbs" "$filepath"; then
    # Find where to insert (after last import, before export/function)
    awk '
      /^import / { imports = imports $0 "\n"; next }
      !imported && /^(export|function|const|type|interface)/ {
        print imports "import { InteractiveBreadcrumbs } from '\''@/components/ui/interactive-breadcrumbs'\'';\n"
        imported = 1
      }
      { print }
    ' "$filepath" > "$filepath.tmp" && mv "$filepath.tmp" "$filepath"

    echo "  ✓ Added InteractiveBreadcrumbs import"
  fi

  # Step 2: Add InteractiveBreadcrumbs after PageLayout opening
  # Find the PageLayout opening and add breadcrumbs right after
  sed -i.bak '/return (/,/<PageLayout/{
    /<PageLayout/{
      :a
      n
      />/{
        a\      {/* Interactive Breadcrumbs - SSOT */}\
      <div className="mb-6">\
        <InteractiveBreadcrumbs />\
      </div>\

        b
      }
      ba
    }
  }' "$filepath"

  # Step 3: Remove breadcrumbs prop from PageLayout
  # This removes multi-line breadcrumbs={[...]} prop
  perl -i -0pe 's/breadcrumbs=\{\[[^\]]*\]\}\s*\n\s*//gs' "$filepath"

  rm -f "$filepath.bak"
  echo "  ✓ Migrated"
done

echo ""
echo "========================================================="
echo "✅ Migration Complete!"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Test admin pages in browser"
echo "  3. Verify breadcrumbs render correctly"
echo "  4. Commit changes when satisfied"
echo ""
