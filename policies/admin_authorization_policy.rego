package dive.admin_authorization

import rego.v1

# ============================================
# Admin Authorization Policy
# ============================================
# Enforces super_admin role for administrative operations
# All admin operations require:
# 1. Authenticated subject
# 2. super_admin role
# 3. Valid operation
#
# Reference: Week 3.3 requirements

# Default deny
default allow := false

# ============================================
# Allowed Admin Operations
# ============================================

allowed_admin_operations := {
    "view_logs",
    "export_logs",
    "approve_idp",
    "reject_idp",
    "create_idp",
    "update_idp",
    "delete_idp",
    "manage_users",
    "view_violations",
    "view_system_health"
}

# ============================================
# Violation Checks (Fail-Secure Pattern)
# ============================================

# Check if subject is not authenticated
is_not_authenticated := msg if {
    not input.subject.authenticated
    msg := "Subject is not authenticated"
}

# Check if subject does not have super_admin role
is_not_super_admin := msg if {
    not "super_admin" in input.subject.roles
    msg := "Subject does not have super_admin role"
}

# Check if operation is not allowed
is_invalid_operation := msg if {
    not input.action.operation in allowed_admin_operations
    msg := sprintf("Operation '%s' is not a valid admin operation", [input.action.operation])
}

# ============================================
# Authorization Decision
# ============================================

# Allow if all checks pass
allow if {
    not is_not_authenticated
    not is_not_super_admin
    not is_invalid_operation
}

# Collect all violations
violations := array.concat(
    array.concat(
        [is_not_authenticated | is_not_authenticated],
        [is_not_super_admin | is_not_super_admin]
    ),
    [is_invalid_operation | is_invalid_operation]
)

# Generate reason
reason := msg if {
    count(violations) > 0
    msg := concat("; ", violations)
} else := "Admin access granted"

# ============================================
# Decision Output (for PEP consumption)
# ============================================

decision := {
    "allow": allow,
    "reason": reason,
    "evaluation_details": {
        "authenticated": not is_not_authenticated,
        "has_super_admin_role": not is_not_super_admin,
        "valid_operation": not is_invalid_operation,
        "requested_operation": input.action.operation,
        "user_roles": input.subject.roles,
        "violations": violations
    }
}

