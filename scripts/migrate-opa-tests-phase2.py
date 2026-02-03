#!/usr/bin/env python3
"""
Enhanced OPA Test Fixer - Phase 2
Fixes remaining test failures with advanced patterns.

Version: 2.0.0
Date: 2026-01-30
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple, Dict

class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'

def log_info(msg: str):
    print(f"{Colors.BLUE}[INFO]{Colors.NC} {msg}")

def log_success(msg: str):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {msg}")

def log_error(msg: str):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")

def fix_aal_tests(content: str) -> Tuple[str, int]:
    """Fix AAL enforcement tests - add mock data to all authorization.decision calls."""
    changes = 0

    # Pattern: Find authorization.decision calls without mock data
    pattern = r'(result\s*:=\s*authorization\.decision\s+with\s+input\s+as\s+\{[^}]+\}[^}]*\})\s*(\n\s*)(result\.allow)'

    def add_mocks(match):
        nonlocal changes
        test_call = match.group(1)
        whitespace = match.group(2)
        assertion = match.group(3)

        # Check if already has mocks
        if "with data.dive.tenant" in test_call:
            return match.group(0)

        changes += 1
        mocks = f"\n    with data.dive.tenant.base.trusted_issuers as {{}}"
        mocks += f"\n    with data.dive.tenant.federation_constraints.federation_matrix as {{}}"

        return test_call + mocks + whitespace + assertion

    modified = re.sub(pattern, add_mocks, content, flags=re.DOTALL)
    return modified, changes

def fix_tenant_base_tests(content: str) -> Tuple[str, int]:
    """Fix tenant base tests - these need actual tenant configuration data."""
    changes = 0

    # These tests expect real tenant data, not empty mocks
    # We need to provide mock tenant configurations

    tenant_config_mock = """{
    "USA": {
        "issuer": "https://keycloak.usa.dive.local/realms/dive-v3-broker",
        "enabled": true,
        "federation_partners": ["FRA", "GBR", "DEU"]
    },
    "FRA": {
        "issuer": "https://keycloak.fra.dive.local/realms/dive-v3-broker",
        "enabled": true,
        "federation_partners": ["USA", "GBR"]
    },
    "GBR": {
        "issuer": "https://keycloak.gbr.dive.local/realms/dive-v3-broker",
        "enabled": true,
        "federation_partners": ["USA", "FRA", "DEU"]
    },
    "DEU": {
        "issuer": "https://keycloak.deu.dive.local/realms/dive-v3-broker",
        "enabled": true,
        "federation_partners": ["USA", "GBR"]
    }
}"""

    # Pattern: Find test functions in tenant.base_test package
    if "package dive.tenant.base_test" in content:
        # Add mock data helper at the top of the file
        if "mock_tenant_config" not in content:
            insert_pos = content.find("import rego.v1")
            if insert_pos > 0:
                end_of_import = content.find("\n", insert_pos) + 1
                mock_definition = f"\n# Mock tenant configuration for testing\nmock_tenant_config := {tenant_config_mock}\n\n"
                content = content[:end_of_import] + mock_definition + content[end_of_import:]
                changes += 1

    return content, changes

def fix_observability_tests(content: str) -> Tuple[str, int]:
    """Fix observability tests - ensure all authz.allow calls have mocks."""
    changes = 0

    # Pattern: authz.allow or authz.decision without mocks
    pattern = r'(authz\.(?:allow|decision)\s+with\s+input\s+as\s+\{[^}]+\}[^}]*\})\s*(\n\s*)(with data\.dive\.tenant|result)'

    def add_mocks_if_needed(match):
        nonlocal changes
        test_call = match.group(1)
        whitespace = match.group(2)
        next_part = match.group(3)

        # Check if mocks already present
        if next_part.startswith("with data.dive.tenant"):
            return match.group(0)

        changes += 1
        mocks = f"\n    with data.dive.tenant.base.trusted_issuers as {{}}"
        mocks += f"\n    with data.dive.tenant.federation_constraints.federation_matrix as {{}}"

        return test_call + mocks + whitespace + next_part

    modified = re.sub(pattern, add_mocks_if_needed, content, flags=re.DOTALL)
    return modified, changes

def fix_comprehensive_authz_tests(content: str) -> Tuple[str, int]:
    """Fix comprehensive authz tests."""
    changes = 0

    # Same pattern as observability
    modified, count = fix_observability_tests(content)
    changes += count

    return modified, changes

def migrate_test_file(file_path: Path) -> bool:
    """Migrate a single test file with enhanced patterns."""
    log_info(f"Migrating: {file_path.name}")

    try:
        content = file_path.read_text()
        backup_path = file_path.with_suffix('.rego.backup2')
        backup_path.write_text(content)

        total_changes = 0

        # Apply fixes based on file type
        if "aal_enforcement_test" in file_path.name:
            content, changes = fix_aal_tests(content)
            total_changes += changes
        elif "base_test" in file_path.name and "tenant" in str(file_path):
            content, changes = fix_tenant_base_tests(content)
            total_changes += changes
        elif "observability" in file_path.name:
            content, changes = fix_observability_tests(content)
            total_changes += changes
        elif "comprehensive_test" in file_path.name:
            content, changes = fix_comprehensive_authz_tests(content)
            total_changes += changes
        else:
            # Apply general fixes
            content, changes1 = fix_observability_tests(content)
            content, changes2 = fix_aal_tests(content)
            total_changes = changes1 + changes2

        if total_changes == 0:
            log_info(f"  No changes needed")
            backup_path.unlink()
            return True

        file_path.write_text(content)
        log_success(f"  ✓ {total_changes} changes applied")
        return True

    except Exception as e:
        log_error(f"  Failed: {str(e)}")
        return False

def main():
    log_info("Starting Enhanced OPA Test Migration (Phase 2)...")

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    policies_dir = project_root / "policies"

    # Target specific failing test files
    failing_files = [
        policies_dir / "tests" / "aal_enforcement_test.rego",
        policies_dir / "tests" / "observability_integration_test.rego",
        policies_dir / "entrypoints" / "authz_comprehensive_test.rego",
        policies_dir / "tenant" / "base_test.rego",
    ]

    success_count = 0
    failed_count = 0

    for test_file in failing_files:
        if not test_file.exists():
            log_error(f"File not found: {test_file}")
            failed_count += 1
            continue

        if migrate_test_file(test_file):
            success_count += 1
        else:
            failed_count += 1

    print("\n" + "="*60)
    log_success(f"Successfully migrated: {success_count} files")
    if failed_count > 0:
        log_error(f"Failed to migrate: {failed_count} files")
    print("="*60)

if __name__ == "__main__":
    main()
