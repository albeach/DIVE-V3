#!/usr/bin/env python3
"""
Move InteractiveBreadcrumbs to PageLayout level (outside children)
Match the exact pattern of the old Breadcrumbs component
"""

import re
from pathlib import Path

FRONTEND_DIR = Path("frontend/src/app/admin")

def fix_breadcrumbs_placement(filepath: Path) -> bool:
    """Move InteractiveBreadcrumbs outside of PageLayout children"""
    
    if not filepath.exists():
        return False
    
    content = filepath.read_text()
    original_content = content
    
    # Pattern 1: Remove the div wrapper around InteractiveBreadcrumbs
    # From: <div className="mb-6"><InteractiveBreadcrumbs /></div>
    # To: <InteractiveBreadcrumbs />
    pattern1 = r'<div className="mb-6">\s*<InteractiveBreadcrumbs />\s*</div>'
    content = re.sub(pattern1, '<InteractiveBreadcrumbs />', content)
    
    # Pattern 2: Move InteractiveBreadcrumbs before closing PageLayout tag
    # Look for: <PageLayout ...>
    #           {/* comment */}
    #           <InteractiveBreadcrumbs />
    #           <actual content>
    #         </PageLayout>
    
    # Find PageLayout opening and extract props
    pagelayout_match = re.search(
        r'(<PageLayout\s+[^>]*>)\s*'
        r'(\{/\*[^*]*\*/\}\s*)?'
        r'<InteractiveBreadcrumbs />\s*',
        content
    )
    
    if pagelayout_match:
        # Remove InteractiveBreadcrumbs from inside PageLayout
        content = re.sub(
            r'(<PageLayout\s+[^>]*>)\s*'
            r'(\{/\*[^*]*\*/\}\s*)?'
            r'<InteractiveBreadcrumbs />\s*',
            r'\1\n      ',
            content
        )
        
        # Add InteractiveBreadcrumbs right after PageLayout closing >
        content = re.sub(
            r'(<PageLayout\s+[^>]*>)\n',
            r'\1\n      <InteractiveBreadcrumbs />\n',
            content,
            count=1
        )
    
    if content != original_content:
        filepath.write_text(content)
        return True
    return False


def main():
    print("🔄 Fixing InteractiveBreadcrumbs Placement")
    print("=" * 60)
    print()
    
    # Find all page.tsx files
    admin_pages = list(FRONTEND_DIR.rglob("page.tsx"))
    
    fixed = 0
    for page in admin_pages:
        if "InteractiveBreadcrumbs" in page.read_text():
            if fix_breadcrumbs_placement(page):
                print(f"✓ Fixed: {page.relative_to(FRONTEND_DIR.parent.parent.parent)}")
                fixed += 1
    
    print()
    print("=" * 60)
    print(f"✅ Fixed {fixed} files")
    print()


if __name__ == "__main__":
    main()
