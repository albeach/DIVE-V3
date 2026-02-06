#!/usr/bin/env python3
"""
Remove InteractiveBreadcrumbs from admin page children
(PageLayout now renders it automatically for /admin routes)
"""

import re
from pathlib import Path

FRONTEND_DIR = Path("frontend/src/app/admin")

def remove_breadcrumbs_from_children(filepath: Path) -> bool:
    """Remove InteractiveBreadcrumbs component calls from page content"""

    if not filepath.exists():
        return False

    content = filepath.read_text()
    original_content = content

    # Remove all variations of InteractiveBreadcrumbs rendering
    patterns = [
        # Pattern 1: With div wrapper and comment
        r'\s*\{/\*[^\*]*Interactive Breadcrumbs[^\*]*\*/\}\s*\n\s*<div className="mb-6">\s*\n\s*<InteractiveBreadcrumbs />\s*\n\s*</div>\s*\n',

        # Pattern 2: With div wrapper, no comment
        r'\s*<div className="mb-6">\s*\n\s*<InteractiveBreadcrumbs />\s*\n\s*</div>\s*\n',

        # Pattern 3: Just the component
        r'\s*<InteractiveBreadcrumbs />\s*\n',

        # Pattern 4: With comment only
        r'\s*\{/\*[^\*]*Interactive Breadcrumbs[^\*]*\*/\}\s*\n\s*<InteractiveBreadcrumbs />\s*\n',
    ]

    for pattern in patterns:
        content = re.sub(pattern, '\n', content)

    if content != original_content:
        filepath.write_text(content)
        return True
    return False


def main():
    print("🔄 Removing InteractiveBreadcrumbs from Page Children")
    print("=" * 60)
    print("(PageLayout now handles breadcrumbs automatically)")
    print()

    # Find all page.tsx files
    admin_pages = list(FRONTEND_DIR.rglob("page.tsx"))

    fixed = 0
    for page in admin_pages:
        if "InteractiveBreadcrumbs" in page.read_text():
            if remove_breadcrumbs_from_children(page):
                rel_path = page.relative_to(FRONTEND_DIR.parent.parent.parent)
                print(f"✓ Cleaned: {rel_path}")
                fixed += 1

    print()
    print("=" * 60)
    print(f"✅ Cleaned {fixed} files")
    print()


if __name__ == "__main__":
    main()
