#!/bin/bash

# Migration script to update API routes to use dynamic configuration
# This script helps identify and update files that need migration

set -e

FRONTEND_DIR="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║          DIVE V3 - Dynamic Configuration Migration Helper                   ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 SCANNING FOR FILES THAT NEED MIGRATION..."
echo ""

# Find files with hardcoded URL patterns
echo "🔍 Files with hardcoded BACKEND_URL patterns:"
grep -r "process.env.BACKEND_URL\|process.env.NEXT_PUBLIC_API_URL\|process.env.NEXT_PUBLIC_BACKEND_URL" \
  "$FRONTEND_DIR/src" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  -l | grep -v "dynamic-config.ts" | grep -v "api-utils.ts" | sort | uniq || echo "  ✅ None found (or all already using api-utils)"

echo ""
echo "🔍 Files with hardcoded Keycloak URL patterns:"
grep -r "process.env.NEXT_PUBLIC_KEYCLOAK_URL\|process.env.KEYCLOAK_URL" \
  "$FRONTEND_DIR/src" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  -l | grep -v "dynamic-config.ts" | grep -v "api-utils.ts" | grep -v "auth.ts" | sort | uniq || echo "  ✅ None found (or auth.ts only)"

echo ""
echo "📝 MIGRATION PATTERNS:"
echo ""
echo "For API Routes (src/app/api/*/route.ts):"
echo "  BEFORE: const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';"
echo "  AFTER:  import { getBackendUrl } from '@/lib/api-utils';"
echo "          const BACKEND_URL = getBackendUrl();"
echo ""
echo "For React Components:"
echo "  BEFORE: const apiUrl = process.env.NEXT_PUBLIC_API_URL;"
echo "  AFTER:  import { useDynamicConfig } from '@/hooks/use-dynamic-config';"
echo "          const { apiUrl } = useDynamicConfig();"
echo ""
echo "For Server Components:"
echo "  BEFORE: const apiUrl = process.env.NEXT_PUBLIC_API_URL;"
echo "  AFTER:  import { getApiUrl } from '@/lib/dynamic-config';"
echo "          const apiUrl = getApiUrl();"
echo ""

echo "✅ ALREADY MIGRATED:"
echo "  ✓ next.config.ts - Updated CSP to include all DIVE domains"
echo "  ✓ src/app/api/health/route.ts - Using getBackendUrl()"
echo "  ✓ src/app/api/idps/public/route.ts - Using getBackendUrl()"
echo ""

echo "📚 DOCUMENTATION:"
echo "  • Complete guide: frontend/DYNAMIC_CONFIG_GUIDE.md"
echo "  • Examples:       frontend/INTEGRATION_EXAMPLE.ts"
echo "  • Core library:   src/lib/dynamic-config.ts"
echo "  • React hooks:    src/hooks/use-dynamic-config.ts"
echo "  • API utilities:  src/lib/api-utils.ts"
echo ""

echo "🚀 NEXT STEPS:"
echo "  1. Review files listed above"
echo "  2. Update them using the migration patterns"
echo "  3. Test on all domains (usa-app, fra-app, gbr-app)"
echo "  4. Verify localhost development still works"
echo ""

echo "💡 TIP: Migrate gradually - new code should use dynamic config immediately,"
echo "        existing code can be updated as you touch each file."
echo ""

echo "✨ Done!"
