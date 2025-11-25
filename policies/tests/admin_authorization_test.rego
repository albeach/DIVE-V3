package dive.admin_authorization_test

import rego.v1
import data.dive.admin_authorization

# =============================================================================
# Admin Authorization Policy Tests
# =============================================================================
# Tests for super_admin role enforcement and admin operation validation
# =============================================================================

# =============================================================================
# 1. BASIC ADMIN ACCESS TESTS
# =============================================================================

test_allow_super_admin_view_logs if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

test_allow_super_admin_export_logs if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "export_logs"
        }
    }
}

test_allow_super_admin_manage_users if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "manage_users"
        }
    }
}

# =============================================================================
# 2. AUTHENTICATION REQUIREMENT TESTS
# =============================================================================

test_deny_unauthenticated_admin if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": false,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

test_deny_missing_authentication if {
    not admin_authorization.allow with input as {
        "subject": {
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

# =============================================================================
# 3. ROLE REQUIREMENT TESTS
# =============================================================================

test_deny_non_admin_user if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "roles": ["user"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

test_deny_empty_roles if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "roles": []
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

# Missing roles defaults to empty list in Rego, which fails the super_admin check
test_deny_null_roles if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "roles": null
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

test_deny_admin_role_without_super_admin if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "moderator-usa",
            "roles": ["admin"]  # Not super_admin
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

test_allow_multiple_roles_with_super_admin if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["user", "admin", "super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
}

# =============================================================================
# 4. OPERATION VALIDATION TESTS
# =============================================================================

test_allow_approve_idp if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "approve_idp"
        }
    }
}

test_allow_reject_idp if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "reject_idp"
        }
    }
}

test_allow_create_idp if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "create_idp"
        }
    }
}

test_allow_update_idp if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "update_idp"
        }
    }
}

test_allow_delete_idp if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "delete_idp"
        }
    }
}

test_allow_view_violations if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_violations"
        }
    }
}

test_allow_view_system_health if {
    admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_system_health"
        }
    }
}

test_deny_invalid_operation if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "delete_database"  # Not a valid admin operation
        }
    }
}

test_deny_unknown_operation if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "hack_system"
        }
    }
}

# =============================================================================
# 5. DECISION OUTPUT TESTS
# =============================================================================

test_decision_allow_structure if {
    d := admin_authorization.decision with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
    d.allow == true
    d.reason == "Admin access granted"
}

test_decision_deny_structure if {
    d := admin_authorization.decision with input as {
        "subject": {
            "authenticated": false,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
    d.allow == false
    contains(d.reason, "not authenticated")
}

# =============================================================================
# 6. EVALUATION DETAILS TESTS
# =============================================================================

test_evaluation_details_authenticated if {
    details := admin_authorization.evaluation_details with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
    details.authenticated == true
    details.has_super_admin_role == true
    details.valid_operation == true
}

test_evaluation_details_denied if {
    details := admin_authorization.evaluation_details with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-3",
            "roles": ["user"]
        },
        "action": {
            "operation": "view_logs"
        }
    }
    details.authenticated == true
    details.has_super_admin_role == false
}

# =============================================================================
# 7. EDGE CASE TESTS
# =============================================================================

# Missing action with null operation triggers invalid operation check
test_deny_null_action if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": null
        }
    }
}

test_deny_empty_operation if {
    not admin_authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "admin-usa",
            "roles": ["super_admin"]
        },
        "action": {
            "operation": ""
        }
    }
}

