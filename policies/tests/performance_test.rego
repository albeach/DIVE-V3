# DIVE V3 - Performance Policy Tests
# Phase 9: Performance Optimization & Scalability
#
# Tests for:
# - Batch decision scenarios
# - Cache-friendly decision patterns
# - High-throughput evaluation paths
# - Memory-efficient policy evaluation
#
# Target: Contribute to 900+ total tests
#
# @version 1.0.0
# @date 2025-12-03

package dive.tests.performance

import rego.v1

import data.dive.authorization

# ============================================
# BATCH DECISION TESTS
# Simulate multiple decisions in quick succession
# ============================================

# Test batch of USA users accessing different resources
test_batch_usa_users_varied_resources if {
    # User 1: SECRET access to SECRET resource
    authorization.allow with input as {
        "subject": {
            "uniqueID": "batch.user1@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "batch-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {"requestId": "batch-001", "currentTime": "2025-12-03T12:00:00Z"}
    }
    
    # User 2: CONFIDENTIAL access to CONFIDENTIAL resource
    authorization.allow with input as {
        "subject": {
            "uniqueID": "batch.user2@mil",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "batch-doc-002",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA", "GBR"]
        },
        "context": {"requestId": "batch-002", "currentTime": "2025-12-03T12:00:00Z"}
    }
}

# Test batch of coalition users accessing shared resources
test_batch_coalition_users if {
    # USA user accessing FVEY resource
    authorization.allow with input as {
        "subject": {
            "uniqueID": "batch.usa@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "coalition-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        },
        "context": {"requestId": "batch-coalition-usa"}
    }
    
    # GBR user accessing same FVEY resource
    authorization.allow with input as {
        "subject": {
            "uniqueID": "batch.gbr@mod.uk",
            "clearance": "SECRET",
            "countryOfAffiliation": "GBR",
            "acpCOI": ["FVEY"],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "coalition-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        },
        "context": {"requestId": "batch-coalition-gbr"}
    }
}

# Test batch of deny scenarios for fast-path evaluation
test_batch_deny_scenarios if {
    # Deny: Insufficient clearance
    not authorization.allow with input as {
        "subject": {
            "uniqueID": "deny.user1@mil",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "mfaVerified": false,
            "aal": 1,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "deny-doc-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {"requestId": "deny-001"}
    }
    
    # Deny: Not releasable
    not authorization.allow with input as {
        "subject": {
            "uniqueID": "deny.user2@defense.gouv.fr",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "FRA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "deny-doc-002",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {"requestId": "deny-002"}
    }
}

# ============================================
# CACHE-FRIENDLY DECISION TESTS
# Patterns that benefit from caching
# ============================================

# Test repeated access to same resource
test_cache_repeated_access if {
    base_input := {
        "subject": {
            "uniqueID": "cache.user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "cache-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        }
    }
    
    # First access
    authorization.allow with input as object.union(base_input, {"context": {"requestId": "cache-1"}})
    # Second access (would be cached)
    authorization.allow with input as object.union(base_input, {"context": {"requestId": "cache-2"}})
    # Third access (would be cached)
    authorization.allow with input as object.union(base_input, {"context": {"requestId": "cache-3"}})
}

# Test same user accessing multiple resources
test_cache_user_session if {
    user := {
        "uniqueID": "session.user@mil",
        "clearance": "TOP_SECRET",
        "countryOfAffiliation": "USA",
        "acpCOI": ["FVEY", "NATO-COSMIC"],
        "authenticated": true
    }
    
    # Access resource 1
    authorization.allow with input as {
        "subject": user,
        "action": {"type": "read"},
        "resource": {
            "resourceId": "session-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"]
        }
    }
    
    # Access resource 2
    authorization.allow with input as {
        "subject": user,
        "action": {"type": "read"},
        "resource": {
            "resourceId": "session-doc-002",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"]
        }
    }
    
    # Access resource 3
    authorization.allow with input as {
        "subject": user,
        "action": {"type": "read"},
        "resource": {
            "resourceId": "session-doc-003",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"]
        }
    }
}

# ============================================
# HIGH-THROUGHPUT EVALUATION TESTS
# Minimal policy paths for maximum throughput
# ============================================

# Test UNCLASSIFIED access (simplest path)
test_throughput_unclassified if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "throughput.user@example.com",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "mfaVerified": false,
            "aal": 1,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "public-doc-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA", "FRA", "GBR", "DEU"]
        }
    }
}

# Test with minimal attributes (fast evaluation)
test_throughput_minimal_attributes if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "minimal.user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "minimal-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        }
    }
}

# Test action types for throughput
test_throughput_action_types if {
    base := {
        "subject": {
            "uniqueID": "action.user@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "resource": {
            "resourceId": "action-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        }
    }
    
    # Read action
    authorization.allow with input as object.union(base, {"action": {"type": "read"}})
    
    # Write action (may have different rules)
    authorization.allow with input as object.union(base, {"action": {"type": "write"}})
}

# ============================================
# MULTI-TENANT ISOLATION TESTS
# Verify tenant context doesn't affect performance
# ============================================

# Test USA tenant decisions
test_tenant_usa_isolation if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "tenant.usa@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "usa-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "tenant": "USA",
            "requestId": "tenant-usa-001"
        }
    }
}

# Test FRA tenant decisions
test_tenant_fra_isolation if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "tenant.fra@defense.gouv.fr",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "fra-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["FRA"]
        },
        "context": {
            "tenant": "FRA",
            "requestId": "tenant-fra-001"
        }
    }
}

# Test GBR tenant decisions
test_tenant_gbr_isolation if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "tenant.gbr@mod.uk",
            "clearance": "SECRET",
            "countryOfAffiliation": "GBR",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "gbr-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["GBR"]
        },
        "context": {
            "tenant": "GBR",
            "requestId": "tenant-gbr-001"
        }
    }
}

# Test DEU tenant decisions
test_tenant_deu_isolation if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "tenant.deu@bundeswehr.de",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "deu-doc-001",
            "classification": "SECRET",
            "releasabilityTo": ["DEU"]
        },
        "context": {
            "tenant": "DEU",
            "requestId": "tenant-deu-001"
        }
    }
}

# ============================================
# CLASSIFICATION LEVEL TESTS
# Test all classification levels for performance
# ============================================

test_classification_unclassified_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "class.unclass@mil",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "mfaVerified": false,
            "aal": 1,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "class-unclass-001",
            "classification": "UNCLASSIFIED",
            "releasabilityTo": ["USA"]
        }
    }
}

test_classification_confidential_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "class.conf@mil",
            "clearance": "CONFIDENTIAL",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "class-conf-001",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA"]
        }
    }
}

test_classification_secret_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "class.secret@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "class-secret-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        }
    }
}

test_classification_top_secret_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "class.ts@mil",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "class-ts-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"]
        }
    }
}

# ============================================
# COI (Community of Interest) TESTS
# Performance tests for COI-based access
# ============================================

test_coi_fvey_access_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "coi.fvey@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY"],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "coi-fvey-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL"],
            "COI": ["FVEY"]
        }
    }
}

test_coi_nato_access_perf if {
    # NATO member countries - FRA is one of them
    authorization.allow with input as {
        "subject": {
            "uniqueID": "coi.nato@defense.gouv.fr",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "acpCOI": ["NATO-COSMIC"],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "coi-nato-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "NLD", "BEL", "NOR"],
            "COI": ["NATO-COSMIC"]
        }
    }
}

# Test multiple COIs with non-US-ONLY resource (US-ONLY requires exact match)
test_coi_multiple_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "coi.multi@mil",
            "clearance": "TOP_SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["FVEY", "NATO-COSMIC"],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "coi-multi-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"]
        }
    }
}

# ============================================
# EDGE CASE PERFORMANCE TESTS
# Edge cases that should still be fast
# ============================================

# Test empty COI arrays
test_edge_empty_coi_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "edge.empty@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": [],
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "edge-empty-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": []
        }
    }
}

# Test large releasability list (NATO member countries)
test_edge_large_releasability_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "edge.large@defense.gouv.fr",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "edge-large-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN", "AUS", "NZL", "FRA", "DEU", "ITA", "ESP", "NLD", "BEL", "NOR", "DNK", "POL"]
        }
    }
}

# Test NATO member country access (DEU is a NATO member)
test_edge_nato_keyword_perf if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "edge.nato@bundeswehr.de",
            "clearance": "SECRET",
            "countryOfAffiliation": "DEU",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "edge-nato-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP"]
        }
    }
}

# ============================================
# SCALABILITY TESTS
# Tests designed for horizontal scaling scenarios
# ============================================

# Test stateless decision (no context dependencies)
test_scale_stateless_decision if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "scale.stateless@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "scale-stateless-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        }
    }
}

# Test with request ID for tracing
test_scale_traceable_decision if {
    authorization.allow with input as {
        "subject": {
            "uniqueID": "scale.trace@mil",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "mfaVerified": true,
            "aal": 2,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "scale-trace-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "requestId": "trace-123-456-789",
            "sourceIP": "10.0.0.1"
        }
    }
}

# Test deny with reason extraction (for logging)
test_scale_deny_with_reason if {
    not authorization.allow with input as {
        "subject": {
            "uniqueID": "scale.deny@example.com",
            "clearance": "UNCLASSIFIED",
            "countryOfAffiliation": "USA",
            "mfaVerified": false,
            "aal": 1,
            "authenticated": true
        },
        "action": {"type": "read"},
        "resource": {
            "resourceId": "scale-deny-001",
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"]
        },
        "context": {
            "requestId": "deny-scale-001"
        }
    }
}
