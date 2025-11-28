#!/usr/bin/env python3
"""
DIVE V3 - Phase 1: Fix Service Health Checks
Replaces complex healthcheck commands with simpler, working versions
"""

import re
import sys
from pathlib import Path

def fix_healthcheck(content, service_name, new_test_command):
    """Fix healthcheck for a specific service"""
    # Pattern to match the service and its healthcheck
    pattern = rf'({service_name}:.*?healthcheck:.*?test:.*?\[.*?\])'
    
    def replace_test(match):
        text = match.group(1)
        # Replace the test line
        text = re.sub(
            r'test:\s*\[.*?\]',
            f'test: {new_test_command}',
            text,
            flags=re.DOTALL
        )
        return text
    
    return re.sub(pattern, replace_test, content, flags=re.DOTALL)

def main():
    project_root = Path(__file__).parent.parent
    
    files_to_fix = [
        (project_root / "docker-compose.yml", "USA"),
        (project_root / "docker-compose.fra.yml", "FRA"),
        (project_root / "docker-compose.gbr.yml", "GBR"),
    ]
    
    backend_test = '["CMD-SHELL", "wget --no-check-certificate -qO- https://localhost:4000/health || exit 1"]'
    frontend_test = '["CMD-SHELL", "wget --no-check-certificate --spider -q https://localhost:3000 || exit 1"]'
    
    print("=" * 80)
    print("DIVE V3 - Phase 1: Fix Service Health Checks")
    print("=" * 80)
    print()
    
    for file_path, instance in files_to_fix:
        if not file_path.exists():
            print(f"⚠️  Skipping {instance}: {file_path} not found")
            continue
            
        print(f"Processing {instance} instance...")
        
        # Read file
        content = file_path.read_text()
        
        # Backup
        backup_path = file_path.with_suffix(file_path.suffix + '.healthcheck.bak')
        backup_path.write_text(content)
        print(f"  ✓ Backup created: {backup_path.name}")
        
        # Fix backend healthcheck
        if 'backend' in content:
            content = fix_healthcheck(content, 'backend', backend_test)
            print(f"  ✓ Fixed backend healthcheck")
        
        # Fix frontend healthcheck
        if 'frontend' in content:
            content = fix_healthcheck(content, 'frontend', frontend_test)
            print(f"  ✓ Fixed frontend healthcheck")
        
        # Write back
        file_path.write_text(content)
        print()
    
    print("=" * 80)
    print("Health check fixes applied!")
    print("=" * 80)
    print()
    print("To apply changes, restart services:")
    print("  docker-compose restart backend frontend")
    print("  docker-compose -f docker-compose.fra.yml restart backend-fra frontend-fra")
    print("  docker-compose -f docker-compose.gbr.yml restart backend-gbr frontend-gbr")
    print()

if __name__ == "__main__":
    main()

