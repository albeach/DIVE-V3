#!/usr/bin/env python3
"""
Remove breadcrumbs prop from PageLayout components
"""

import re
from pathlib import Path

FILES = [
    "frontend/src/app/admin/compliance/reports/page.tsx",
    "frontend/src/app/admin/monitoring/resources/page.tsx",
]

for filepath in FILES:
    p = Path(filepath)
    if not p.exists():
        print(f"Skip: {filepath} (not found)")
        continue
    
    content = p.read_text()
    
    # Remove breadcrumbs prop (multi-line)
    pattern = r'\s*breadcrumbs=\{\s*\[[\s\S]*?\]\s*\}\s*\n'
    new_content = re.sub(pattern, '\n', content)
    
    if content != new_content:
        p.write_text(new_content)
        print(f"✓ Removed breadcrumbs prop from {filepath}")
    else:
        print(f"⊘ No changes needed for {filepath}")
