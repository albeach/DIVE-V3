#!/usr/bin/env python3
"""
Fix import placement issues in migrated files
Removes duplicate/misplaced imports added after dynamic imports
"""

import re
from pathlib import Path

def fix_import_placement(filepath):
    """Fix imports that were added in wrong locations"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Check if file has the misplaced import issue
    pattern = r"(await import\(['\"].*?['\"]\);)\s*\nimport { getBackendUrl } from '@/lib/api-utils';"
    
    if not re.search(pattern, content):
        return False
    
    # Remove all misplaced imports after dynamic imports
    content = re.sub(
        r"\nimport { getBackendUrl } from '@/lib/api-utils';(?=\s*\n\s*const)",
        "",
        content
    )
    
    # Ensure the import is at the top (after other imports)
    # Find the last static import
    import_pattern = r"(import[^;]+;)(?=\n\n|\nconst|\nexport)"
    matches = list(re.finditer(import_pattern, content))
    
    # Check if getBackendUrl import already exists at top
    if "import { getBackendUrl } from '@/lib/api-utils';" not in content[:500]:
        if matches:
            last_import = matches[-1]
            insert_pos = last_import.end()
            content = (
                content[:insert_pos] +
                "\nimport { getBackendUrl } from '@/lib/api-utils';" +
                content[insert_pos:]
            )
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    return True

def main():
    frontend_dir = Path("/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend")
    api_dir = frontend_dir / "src" / "app" / "api"
    
    if not api_dir.exists():
        print(f"❌ API directory not found: {api_dir}")
        return
    
    print("🔧 Fixing import placement issues...")
    print()
    
    fixed_count = 0
    
    # Find all route.ts files
    for route_file in api_dir.rglob("route.ts"):
        if "__tests__" in str(route_file):
            continue
        
        relative_path = route_file.relative_to(frontend_dir)
        
        if fix_import_placement(route_file):
            print(f"  ✅ Fixed: {relative_path}")
            fixed_count += 1
    
    print()
    print("━" * 80)
    print(f"✨ Fix complete!")
    print(f"   Fixed: {fixed_count} files")
    print("━" * 80)

if __name__ == "__main__":
    main()
