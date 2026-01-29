#!/bin/bash
# Fix Admin Role Checks Across All API Routes
# Adds hasAdminRole import and updates role checking logic

set -e

FRONTEND_DIR="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend"

echo "🔧 Fixing admin role checks in API routes..."

# Find all admin API route files
find "$FRONTEND_DIR/src/app/api/admin" -name "route.ts" -type f | while read -r file; do
  echo "  📝 Processing: ${file#$FRONTEND_DIR/}"
  
  # Check if file already has hasAdminRole import
  if grep -q "hasAdminRole" "$file"; then
    echo "    ✅ Already updated"
    continue
  fi
  
  # Check if file has the old role check pattern
  if grep -q "!userRoles.includes('admin') && !userRoles.includes('super_admin')" "$file"; then
    echo "    🔄 Updating role check..."
    
    # Add import if session-validation is imported
    if grep -q "from '@/lib/session-validation'" "$file"; then
      sed -i '' "s|from '@/lib/session-validation';|from '@/lib/session-validation';\nimport { hasAdminRole } from '@/lib/admin-role-utils';|" "$file"
    fi
    
    # Replace old check with new check (simple version)
    sed -i '' "s|!userRoles.includes('admin') && !userRoles.includes('super_admin')|!hasAdminRole({ roles: userRoles, name: validation.session.user.name, email: validation.session.user.email })|g" "$file"
    
    echo "    ✅ Updated"
  else
    echo "    ⏭️  No old pattern found, skipping"
  fi
done

echo "✅ Done! All admin API routes updated."
