#!/usr/bin/env python3
"""
OPA Test Migration Script
Systematically fixes OPA test files to work with federated architecture.

Version: 1.0.0
Date: 2026-01-30
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple

# ANSI color codes
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'  # No Color

def log_info(msg: str):
    print(f"{Colors.BLUE}[INFO]{Colors.NC} {msg}")

def log_success(msg: str):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {msg}")

def log_warning(msg: str):
    print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {msg}")

def log_error(msg: str):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {msg}")

def add_mock_data_injections(content: str) -> Tuple[str, int]:
    """
    Add mock data injections for federation and trusted issuers.
    Returns: (modified content, number of changes made)
    """
    changes = 0

    # Pattern: authorization.decision or authz.allow with input but no mocks
    pattern = r'((?:authorization\.decision|authz\.allow|authz\.decision|coi_validation\.allow|guardrails\.guardrails_pass)\s+with input as \{[^}]+\})((?:\s+with data\.[^\n]+)*)\s*(\n\s*(?:result|decision))'

    def add_mocks(match):
        nonlocal changes
        test_call = match.group(1)
        existing_mocks = match.group(2) if match.group(2) else ""
        rest = match.group(3)

        # Check if mocks already exist
        if "data.dive.tenant.base.trusted_issuers" in existing_mocks:
            return match.group(0)  # Already has mocks

        changes += 1

        # Add mock injections
        new_mocks = existing_mocks
        new_mocks += "\n    with data.dive.tenant.base.trusted_issuers as {}"
        new_mocks += "\n    with data.dive.tenant.federation_constraints.federation_matrix as {}"

        return test_call + new_mocks + rest

    modified = re.sub(pattern, add_mocks, content, flags=re.DOTALL)
    return modified, changes

def add_missing_subject_fields(content: str) -> Tuple[str, int]:
    """
    Add mfaVerified and aal fields to subjects that are missing them.
    Returns: (modified content, number of changes made)
    """
    changes = 0

    def fix_subject(match):
        nonlocal changes
        subject_block = match.group(0)

        # Skip if already has mfaVerified
        if 'mfaVerified' in subject_block or "'mfaVerified'" in subject_block:
            return subject_block

        # Skip if subject is incomplete (edge case tests)
        if 'authenticated' not in subject_block:
            return subject_block

        changes += 1

        # Determine MFA value based on clearance
        is_unclassified = 'UNCLASSIFIED' in subject_block
        mfa_value = 'false' if is_unclassified else 'true'
        aal_value = '1' if is_unclassified else '2'

        # Add before authenticated field
        if '"authenticated":' in subject_block:
            subject_block = subject_block.replace(
                '"authenticated":',
                f'"mfaVerified": {mfa_value},\n            "aal": {aal_value},\n            "authenticated":'
            )
        elif "'authenticated':" in subject_block:
            subject_block = subject_block.replace(
                "'authenticated':",
                f"'mfaVerified': {mfa_value},\n            'aal': {aal_value},\n            'authenticated':"
            )

        return subject_block

    # Match subject blocks
    pattern = r'"subject":\s*\{[^}]+\}'
    modified = re.sub(pattern, fix_subject, content)

    return modified, changes

def fix_action_format(content: str) -> Tuple[str, int]:
    """
    Convert action strings to object format: "read" -> {"type": "read"}
    Returns: (modified content, number of changes made)
    """
    changes = 0

    def fix_action(match):
        nonlocal changes
        changes += 1
        action_type = match.group(1)
        return f'"action": {{"type": "{action_type}"}}'

    # Match: "action": "read" or "action": "write"
    pattern = r'"action":\s*"(\w+)"'
    modified = re.sub(pattern, fix_action, content)

    return modified, changes

def fix_operation_to_type(content: str) -> Tuple[str, int]:
    """
    Convert action.operation to action.type for consistency.
    Returns: (modified content, number of changes made)
    """
    changes = 0

    def fix_operation(match):
        nonlocal changes
        changes += 1
        operation_value = match.group(1)
        return f'"action": {{"type": "{operation_value}"}}'

    # Match: "action": {"operation": "read"}
    pattern = r'"action":\s*\{\s*"operation":\s*"(\w+)"\s*\}'
    modified = re.sub(pattern, fix_operation, content)

    return modified, changes

def migrate_test_file(file_path: Path) -> bool:
    """
    Migrate a single test file.
    Returns: True if successful, False otherwise
    """
    log_info(f"Migrating: {file_path.name}")

    try:
        # Read original content
        content = file_path.read_text()

        # Create backup
        backup_path = file_path.with_suffix('.rego.backup')
        backup_path.write_text(content)

        # Apply migrations
        modified, mock_changes = add_mock_data_injections(content)
        modified, subject_changes = add_missing_subject_fields(modified)
        modified, action_changes = fix_action_format(modified)
        modified, operation_changes = fix_operation_to_type(modified)

        total_changes = mock_changes + subject_changes + action_changes + operation_changes

        if total_changes == 0:
            log_info(f"  No changes needed")
            backup_path.unlink()  # Remove unnecessary backup
            return True

        # Write modified content
        file_path.write_text(modified)

        log_success(f"  ✓ {total_changes} changes:")
        if mock_changes > 0:
            print(f"    - Added mock data to {mock_changes} tests")
        if subject_changes > 0:
            print(f"    - Fixed {subject_changes} subject blocks")
        if action_changes > 0:
            print(f"    - Fixed {action_changes} action strings")
        if operation_changes > 0:
            print(f"    - Fixed {operation_changes} operation fields")

        return True

    except Exception as e:
        log_error(f"  Failed: {str(e)}")
        # Restore from backup if it exists
        backup_path = file_path.with_suffix('.rego.backup')
        if backup_path.exists():
            backup_path.rename(file_path)
        return False

def main():
    """Main execution"""
    log_info("Starting OPA Test Migration...")

    # Get policies directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    policies_dir = project_root / "policies" / "tests"

    if not policies_dir.exists():
        log_error(f"Policies directory not found: {policies_dir}")
        sys.exit(1)

    # Find all test files
    test_files = list(policies_dir.glob("*_test.rego"))

    # Also check subdirectories
    for subdir in policies_dir.rglob("*"):
        if subdir.is_dir():
            test_files.extend(subdir.glob("*_test.rego"))

    log_info(f"Found {len(test_files)} test files")

    # Migrate each file
    success_count = 0
    failed_count = 0

    for test_file in test_files:
        if migrate_test_file(test_file):
            success_count += 1
        else:
            failed_count += 1

    # Print summary
    print("\n" + "="*60)
    log_success(f"Successfully migrated: {success_count} files")
    if failed_count > 0:
        log_warning(f"Failed to migrate: {failed_count} files")

    # Run OPA tests to verify
    log_info("\nRunning OPA tests to verify fixes...")
    import subprocess
    try:
        result = subprocess.run(
            ["opa", "test", str(policies_dir.parent), "-v"],
            cwd=project_root,
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            log_success("✓ All OPA tests passed!")
        else:
            log_warning("Some tests still failing. See output above.")
            print(result.stdout)
            print(result.stderr)
    except FileNotFoundError:
        log_warning("OPA not found. Install OPA to run tests: https://www.openpolicyagent.org/docs/latest/#running-opa")

    print("="*60)

if __name__ == "__main__":
    main()
