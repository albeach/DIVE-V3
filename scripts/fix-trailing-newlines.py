#!/usr/bin/env python3
"""
DIVE V3 - Fix Trailing Newlines

Safely removes trailing empty lines from text files to prevent
Git from constantly detecting files as "modified".
"""

import sys
import os
import glob

def fix_file(file_path):
    """Remove trailing empty lines from a file while preserving content."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        if not lines:
            return False  # Empty file, nothing to fix

        # Remove trailing empty lines
        original_length = len(lines)
        while lines and lines[-1].strip() == '':
            lines.pop()

        # Ensure file ends with exactly one newline if it had content
        if lines and not lines[-1].endswith('\n'):
            lines[-1] += '\n'

        # Only write back if we actually changed something
        if len(lines) != original_length:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            return True

    except Exception as e:
        print(f"Error processing {file_path}: {e}", file=sys.stderr)
        return False

    return False

def main():
    """Main function to fix trailing newlines in all relevant files."""
    print("DIVE V3 - Fixing trailing newlines...")
    print("=" * 50)

    # File patterns to process
    patterns = [
        "**/*.yml", "**/*.yaml", "**/*.md", "**/*.ts", "**/*.tsx",
        "**/*.js", "**/*.jsx", "**/*.json", "**/*.css", "**/*.scss",
        "**/*.html", "**/*.sh", "**/*.py", "**/*.java", "**/*.xml",
        "**/*.properties", "**/*.rego", "**/*.ftl"
    ]

    # Directories to exclude
    exclude_dirs = {".git", "node_modules", ".next", "dist", "build"}

    fixed_count = 0
    processed_count = 0

    for pattern in patterns:
        for file_path in glob.glob(pattern, recursive=True):
            # Skip excluded directories
            parts = file_path.split(os.sep)
            if any(part in exclude_dirs for part in parts):
                continue

            processed_count += 1

            if fix_file(file_path):
                print(f"✓ Fixed: {file_path}")
                fixed_count += 1

    print("=" * 50)
    print(f"Processed {processed_count} files")
    print(f"Fixed {fixed_count} files with trailing newlines")

    if fixed_count > 0:
        print("\nNext steps:")
        print("1. Review changes: git diff --stat")
        print("2. Stage and commit: git add -A && git commit -m 'fix: remove trailing empty lines'")
        print("3. This should resolve the constant file modification issue")
    else:
        print("\nNo trailing newlines found!")

if __name__ == "__main__":
    main()
