package dive.admin_authorization

import rego.v1

# ============================================
# Admin Authorization Policy Tests
# ============================================
# Target: 14+ tests covering all admin operations
# Pattern: Test super_admin role enforcement

# ============================================
# Test Data
# ============================================

super_admin_input := {
    "subject": {
        "authenticated": true,
        "uniqueID": "admin@dive.mil",
        "clearance": "TOP_SECRET",
        "countryOfAffiliation": "USA",
        "roles": ["user", "super_admin"]
    },
    "action": {
        "operation": "view_logs"
    },
    "resource": {
        "resourceId": "admin-api"
    },
    "context": {
        "currentTime": "2025-10-13T14:00:00Z",
        "sourceIP": "192.168.1.100",
        "deviceCompliant": true,
        "requestId": "req-admin-001"
    }
}

regular_user_input := {
    "subject": {
        "authenticated": true,
        "uniqueID": "john.doe@mil",
        "clearance": "SECRET",
        "countryOfAffiliation": "USA",
        "roles": ["user"]
    },
    "action": {
        "operation": "view_logs"
    },
    "resource": {
        "resourceId": "admin-api"
    },
    "context": {
        "currentTime": "2025-10-13T14:00:00Z",
        "sourceIP": "192.168.1.100",
        "deviceCompliant": true,
        "requestId": "req-admin-002"
    }
}

# ============================================
# Test 1: Super admin can view logs
# ============================================
test_admin_can_view_logs if {
    allow with input as super_admin_input
}

# ============================================
# Test 2: Super admin can approve IdP
# ============================================
test_admin_can_approve_idp if {
    input_approve := object.union(super_admin_input, {"action": {"operation": "approve_idp"}})
    allow with input as input_approve
}

# ============================================
# Test 3: Super admin can reject IdP
# ============================================
test_admin_can_reject_idp if {
    input_reject := object.union(super_admin_input, {"action": {"operation": "reject_idp"}})
    allow with input as input_reject
}

# ============================================
# Test 4: Super admin can export logs
# ============================================
test_admin_can_export_logs if {
    input_export := object.union(super_admin_input, {"action": {"operation": "export_logs"}})
    allow with input as input_export
}

# ============================================
# Test 5: Super admin can create IdP
# ============================================
test_admin_can_create_idp if {
    input_create := object.union(super_admin_input, {"action": {"operation": "create_idp"}})
    allow with input as input_create
}

# ============================================
# Test 6: Super admin can update IdP
# ============================================
test_admin_can_update_idp if {
    input_update := object.union(super_admin_input, {"action": {"operation": "update_idp"}})
    allow with input as input_update
}

# ============================================
# Test 7: Super admin can delete IdP
# ============================================
test_admin_can_delete_idp if {
    input_delete := object.union(super_admin_input, {"action": {"operation": "delete_idp"}})
    allow with input as input_delete
}

# ============================================
# Test 8: Super admin can manage users
# ============================================
test_admin_can_manage_users if {
    input_users := object.union(super_admin_input, {"action": {"operation": "manage_users"}})
    allow with input as input_users
}

# ============================================
# Test 9: Super admin can view violations
# ============================================
test_admin_can_view_violations if {
    input_violations := object.union(super_admin_input, {"action": {"operation": "view_violations"}})
    allow with input as input_violations
}

# ============================================
# Test 10: Super admin can view system health
# ============================================
test_admin_can_view_system_health if {
    input_health := object.union(super_admin_input, {"action": {"operation": "view_system_health"}})
    allow with input as input_health
}

# ============================================
# Test 11: Regular user cannot view logs
# ============================================
test_non_admin_cannot_view_logs if {
    not allow with input as regular_user_input
}

# ============================================
# Test 12: Regular user cannot approve IdP
# ============================================
test_non_admin_cannot_approve_idp if {
    input_approve := object.union(regular_user_input, {"action": {"operation": "approve_idp"}})
    not allow with input as input_approve
}

# ============================================
# Test 13: Regular user cannot export logs
# ============================================
test_non_admin_cannot_export_logs if {
    input_export := object.union(regular_user_input, {"action": {"operation": "export_logs"}})
    not allow with input as input_export
}

# ============================================
# Test 14: Admin role is required
# ============================================
test_admin_role_required if {
    # Remove super_admin role from input
    input_no_admin := object.union(
        super_admin_input,
        {"subject": object.union(super_admin_input.subject, {"roles": ["user"]})}
    )
    not allow with input as input_no_admin
}

# ============================================
# Test 15: All admin operations are allowed
# ============================================
test_admin_operations_list if {
    # Verify all allowed operations
    count(allowed_admin_operations) == 10
    "view_logs" in allowed_admin_operations
    "export_logs" in allowed_admin_operations
    "approve_idp" in allowed_admin_operations
    "reject_idp" in allowed_admin_operations
    "create_idp" in allowed_admin_operations
    "update_idp" in allowed_admin_operations
    "delete_idp" in allowed_admin_operations
    "manage_users" in allowed_admin_operations
    "view_violations" in allowed_admin_operations
    "view_system_health" in allowed_admin_operations
}

# ============================================
# Test 16: Authenticated required
# ============================================
test_admin_authenticated_required if {
    input_unauth := object.union(
        super_admin_input,
        {"subject": object.union(super_admin_input.subject, {"authenticated": false})}
    )
    not allow with input as input_unauth
}

# ============================================
# Test 17: Missing role denied
# ============================================
test_admin_missing_role_denied if {
    # User with no roles
    input_no_roles := object.union(
        super_admin_input,
        {"subject": object.union(super_admin_input.subject, {"roles": []})}
    )
    not allow with input as input_no_roles
}

# ============================================
# Test 18: Invalid operation denied
# ============================================
test_admin_invalid_operation_denied if {
    input_invalid := object.union(super_admin_input, {"action": {"operation": "invalid_operation"}})
    not allow with input as input_invalid
}

# ============================================
# Test 19: Audit trail info
# ============================================
test_admin_audit_trail if {
    # Verify decision includes audit details
    decision_output := decision with input as super_admin_input
    decision_output.allow == true
    decision_output.evaluation_details.authenticated == true
    decision_output.evaluation_details.has_super_admin_role == true
    decision_output.evaluation_details.valid_operation == true
}

# ============================================
# Test 20: Reason provided on denial
# ============================================
test_admin_denial_reason if {
    decision_output := decision with input as regular_user_input
    decision_output.allow == false
    contains(decision_output.reason, "super_admin")
}

