#!/bin/bash

# Automated migration script for API routes
# Replaces hardcoded URL patterns with dynamic configuration

set -e

FRONTEND_DIR="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend"

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║          DIVE V3 - Automated API Routes Migration                           ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "🔧 Migrating API routes to use dynamic configuration..."
echo ""

# Counter for tracking changes
MIGRATED=0

# Find all API route files
API_ROUTES=$(find "$FRONTEND_DIR/src/app/api" -name "route.ts" -type f | grep -v "__tests__" || true)

for file in $API_ROUTES; do
  # Check if file contains hardcoded URL patterns
  if grep -q "process.env.BACKEND_URL\|process.env.NEXT_PUBLIC_API_URL\|process.env.NEXT_PUBLIC_BACKEND_URL" "$file" 2>/dev/null; then
    
    # Check if already has the import
    if ! grep -q "from '@/lib/api-utils'" "$file" 2>/dev/null; then
      
      echo "  📝 Migrating: $(basename $(dirname $file))/$(basename $file)"
      
      # Create backup
      cp "$file" "$file.bak"
      
      # Add import after the first import block
      sed -i '' '/^import.*from/a\
import { getBackendUrl } from '\''@/lib/api-utils'\'';
' "$file"
      
      # Replace hardcoded BACKEND_URL patterns
      sed -i '' 's/const BACKEND_URL = process\.env\.BACKEND_URL || process\.env\.NEXT_PUBLIC_API_URL || process\.env\.NEXT_PUBLIC_BACKEND_URL || '\''[^'\'']*'\'';/const BACKEND_URL = getBackendUrl();/g' "$file"
      sed -i '' 's/const BACKEND_URL = process\.env\.BACKEND_URL || process\.env\.NEXT_PUBLIC_API_URL || '\''[^'\'']*'\'';/const BACKEND_URL = getBackendUrl();/g' "$file"
      sed -i '' 's/const backendUrl = process\.env\.BACKEND_URL || process\.env\.NEXT_PUBLIC_API_URL || process\.env\.NEXT_PUBLIC_BACKEND_URL || '\''[^'\'']*'\'';/const backendUrl = getBackendUrl();/g' "$file"
      sed -i '' 's/const backendUrl = process\.env\.BACKEND_URL || process\.env\.NEXT_PUBLIC_API_URL || '\''[^'\'']*'\'';/const backendUrl = getBackendUrl();/g' "$file"
      
      MIGRATED=$((MIGRATED + 1))
    fi
  fi
done

echo ""
echo "✅ Migration complete!"
echo "   Migrated files: $MIGRATED"
echo ""

if [ $MIGRATED -gt 0 ]; then
  echo "📋 Backup files created with .bak extension"
  echo "   Review changes and remove backups when satisfied"
  echo ""
  echo "To remove all backups:"
  echo "  find $FRONTEND_DIR/src/app/api -name '*.bak' -delete"
  echo ""
fi

echo "🧪 TESTING:"
echo "  1. Run TypeScript compiler: cd frontend && npm run build"
echo "  2. Test locally: npm run dev"
echo "  3. Test on each domain:"
echo "     - https://usa-app.dive25.com"
echo "     - https://fra-app.dive25.com"
echo "     - https://gbr-app.dive25.com"
echo ""

echo "✨ Done!"
