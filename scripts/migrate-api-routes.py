#!/usr/bin/env python3
"""
Migrate API routes to use dynamic configuration
"""

import os
import re
from pathlib import Path

def migrate_file(filepath):
    """Migrate a single file to use dynamic configuration"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Check if already migrated
    if "from '@/lib/api-utils'" in content or 'from "@/lib/api-utils"' in content:
        return False
    
    # Check if file needs migration (multiple patterns)
    patterns = [
        r"const BACKEND_URL = process\.env\.BACKEND_URL \|\| process\.env\.NEXT_PUBLIC[^;]+;",
        r"const backendUrl\s*=\s*process\.env\.(BACKEND_URL|NEXT_PUBLIC[^;]+);",
        r"const backendUrl\s*=\s*process\.env\.BACKEND_URL\s*\|\|[^;]+;",
    ]
    
    needs_migration = False
    for pattern in patterns:
        if re.search(pattern, content):
            needs_migration = True
            break
    
    if not needs_migration:
        return False
    
    # Find the last import statement
    import_pattern = r"(import[^;]+;)"
    imports = list(re.finditer(import_pattern, content))
    
    if not imports:
        print(f"  ⚠️  No imports found in {filepath}")
        return False
    
    # Insert our import after the last import
    last_import = imports[-1]
    insert_pos = last_import.end()
    
    new_import = "\nimport { getBackendUrl } from '@/lib/api-utils';"
    content = content[:insert_pos] + new_import + content[insert_pos:]
    
    # Replace all patterns
    content = re.sub(
        r"const BACKEND_URL = process\.env\.BACKEND_URL \|\| process\.env\.NEXT_PUBLIC[^;]+;",
        "const BACKEND_URL = getBackendUrl();",
        content
    )
    content = re.sub(
        r"const backendUrl\s*=\s*process\.env\.(BACKEND_URL|NEXT_PUBLIC_BACKEND_URL|NEXT_PUBLIC_API_URL)(\s*\|\|[^;]+)?;",
        "const backendUrl = getBackendUrl();",
        content
    )
    content = re.sub(
        r"const backendUrl\s*=\s*process\.env\.BACKEND_URL\s*\|\|[^;]+;",
        "const backendUrl = getBackendUrl();",
        content
    )
    
    # Write back
    with open(filepath, 'w') as f:
        f.write(content)
    
    return True

def main():
    frontend_dir = Path("/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend")
    api_dir = frontend_dir / "src" / "app" / "api"
    
    if not api_dir.exists():
        print(f"❌ API directory not found: {api_dir}")
        return
    
    print("🔍 Scanning for API routes to migrate...")
    print()
    
    migrated_count = 0
    skipped_count = 0
    
    # Find all route.ts files
    for route_file in api_dir.rglob("route.ts"):
        # Skip test files
        if "__tests__" in str(route_file):
            continue
        
        relative_path = route_file.relative_to(frontend_dir)
        
        if migrate_file(route_file):
            print(f"  ✅ Migrated: {relative_path}")
            migrated_count += 1
        else:
            skipped_count += 1
    
    print()
    print("━" * 80)
    print(f"✨ Migration complete!")
    print(f"   Migrated: {migrated_count} files")
    print(f"   Skipped:  {skipped_count} files (already migrated or no BACKEND_URL)")
    print("━" * 80)

if __name__ == "__main__":
    main()
