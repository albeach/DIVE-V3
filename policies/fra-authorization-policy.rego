package dive.authorization.fra

import rego.v1

# FRA Instance Authorization Policy
# GAP-002: French attribute normalization
# GAP-004: Decision logging with correlation IDs

# Default deny (fail-secure pattern)
default allow := false
default decision := {
    "allow": false,
    "reason": "Access denied by default — authorization check not evaluated",
    "correlationId": "",
    "originRealm": "FRA",
    "evaluationDetails": {}
}

# French clearance normalization mapping
# Covers all French national classification variants (with/without accents, underscores, spaces)
clearance_map := {
    "NON_PROTEGE": "UNCLASSIFIED",
    "NON PROTEGE": "UNCLASSIFIED",
    "NON PROTÉGÉ": "UNCLASSIFIED",
    "NON CLASSIFIÉ": "UNCLASSIFIED",
    "NON CLASSIFIE": "UNCLASSIFIED",
    "NON_CLASSIFIE": "UNCLASSIFIED",
    "DIFFUSION RESTREINTE": "RESTRICTED",
    "DIFFUSION_RESTREINTE": "RESTRICTED",
    "CONFIDENTIEL_DEFENSE": "CONFIDENTIAL",
    "CONFIDENTIEL DEFENSE": "CONFIDENTIAL",
    "CONFIDENTIEL DÉFENSE": "CONFIDENTIAL",
    "SECRET_DEFENSE": "SECRET",
    "SECRET DEFENSE": "SECRET",
    "SECRET DÉFENSE": "SECRET",
    "TRES_SECRET_DEFENSE": "TOP_SECRET",
    "TRES SECRET DEFENSE": "TOP_SECRET",
    "TRÈS SECRET DÉFENSE": "TOP_SECRET",
    # Also support NATO standard terms
    "UNCLASSIFIED": "UNCLASSIFIED",
    "RESTRICTED": "RESTRICTED",
    "CONFIDENTIAL": "CONFIDENTIAL",
    "SECRET": "SECRET",
    "TOP_SECRET": "TOP_SECRET"
}

# French COI normalization
coi_map := {
    "OTAN_COSMIQUE": "NATO-COSMIC",
    "UE_CONFIDENTIEL": "EU-CONFIDENTIAL",
    # Support standard terms too
    "NATO-COSMIC": "NATO-COSMIC",
    "EU-CONFIDENTIAL": "EU-CONFIDENTIAL",
    "FVEY": "FVEY",
    "FR-CYBER": "FR-CYBER"
}

# Clearance hierarchy levels
clearance_levels := {
    "UNCLASSIFIED": 0,
    "CONFIDENTIAL": 1,
    "SECRET": 2,
    "TOP_SECRET": 3
}

# Normalize clearance from French to NATO standard
normalized_clearance(clearance) := result if {
    result := clearance_map[clearance]
} else := clearance

# Normalize COI from French to standard
normalized_coi(coi_list) := result if {
    result := [coi_map[c] | c := coi_list[_]]
}

# Main authorization decision
decision := result if {
    # Extract and normalize subject attributes
    subject_clearance := normalized_clearance(input.subject.clearance)
    subject_country := input.subject.countryOfAffiliation
    subject_coi := normalized_coi(input.subject.acpCOI)
    
    # Extract resource attributes
    resource_classification := input.resource.classification
    resource_releasability := input.resource.releasabilityTo
    resource_coi := input.resource.COI
    resource_origin := object.get(input.resource, "originRealm", "FRA")
    
    # Generate correlation ID if not provided
    correlation_id := input.context.correlationId
    
    # Evaluation checks
    clearance_check := clearance_satisfied(subject_clearance, resource_classification)
    releasability_check := releasability_satisfied(subject_country, resource_releasability)
    coi_check := coi_satisfied(subject_coi, resource_coi)
    
    # Determine final decision
    allow_access := clearance_check.pass
    allow_access == releasability_check.pass
    allow_access == coi_check.pass
    
    # Build obligations using intermediate variables to work around array.concat arity
    audit_obs := get_audit_obligations
    enc_obs := get_encryption_obligations(input.resource)
    wm_obs := get_watermark_obligations(input.resource, resource_origin)
    all_obligations := array.concat(array.concat(audit_obs, enc_obs), wm_obs)
    
    # Build decision response
    result := {
        "allow": allow_access,
        "reason": build_reason(clearance_check, releasability_check, coi_check),
        "correlationId": correlation_id,
        "originRealm": "FRA",
        "evaluationDetails": {
            "clearanceCheck": clearance_check,
            "releasabilityCheck": releasability_check,
            "coiCheck": coi_check,
            "subjectClearance": subject_clearance,
            "resourceClassification": resource_classification,
            "normalizedFromFrench": subject_clearance != input.subject.clearance
        },
        "obligations": all_obligations
    }
}

# Check if subject clearance meets resource classification
clearance_satisfied(subject_clearance, resource_classification) := result if {
    subject_level := clearance_levels[subject_clearance]
    resource_level := clearance_levels[resource_classification]
    
    result := {
        "pass": subject_level >= resource_level,
        "subjectLevel": subject_clearance,
        "requiredLevel": resource_classification,
        "details": sprintf("Your clearance (%s) %s the required %s classification",
            [subject_clearance,
             conditional_string(subject_level >= resource_level, "meets", "is below"),
             resource_classification])
    }
}

# Check if subject country is in resource releasability list
releasability_satisfied(subject_country, resource_releasability) := result if {
    # Empty releasability list means no release allowed
    count(resource_releasability) == 0
    result := {
        "pass": false,
        "subjectCountry": subject_country,
        "allowedCountries": resource_releasability,
        "details": "This resource is not approved for release to any country (empty releasability list)"
    }
} else := result if {
    # Check if subject's country is in the list
    is_allowed := subject_country in resource_releasability
    
    result := {
        "pass": is_allowed,
        "subjectCountry": subject_country,
        "allowedCountries": resource_releasability,
        "details": sprintf("Your country (%s) %s in the approved release list",
            [subject_country,
             conditional_string(is_allowed, "is included", "is not included")])
    }
}

# Check COI membership
coi_satisfied(subject_coi, resource_coi) := result if {
    # No COI requirement on resource
    count(resource_coi) == 0
    result := {
        "pass": true,
        "subjectCOI": subject_coi,
        "requiredCOI": resource_coi,
        "details": "No community of interest requirement on this resource"
    }
} else := result if {
    # Check for intersection between subject and resource COIs
    intersection := {c | c := subject_coi[_]; c in resource_coi}
    has_match := count(intersection) > 0
    
    result := {
        "pass": has_match,
        "subjectCOI": subject_coi,
        "requiredCOI": resource_coi,
        "matchedCOI": intersection,
        "details": sprintf("Community match: %s",
            [conditional_string(has_match,
                sprintf("matched communities: %v", [intersection]),
                "no matching communities found")])
    }
}

# Build human-readable reason
build_reason(clearance_check, releasability_check, coi_check) := reason if {
    all_pass := clearance_check.pass
    all_pass == releasability_check.pass
    all_pass == coi_check.pass
    all_pass == true
    
    reason := "Access granted — all authorization requirements are satisfied"
} else := reason if {
    failures := [check.details |
        check := [clearance_check, releasability_check, coi_check][_]
        not check.pass
    ]
    
    reason := sprintf("Access denied: %s", [concat("; ", failures)])
}

# Audit obligations - using rule assignment for OPA compatibility
# Note: OPA's array.concat requires intermediate variable assignment when used
# with function results to avoid arity mismatch errors
get_audit_obligations := [{
    "type": "audit",
    "action": "log_access",
    "includeCorrelationId": true,
    "includeTimestamp": true,
    "includeOriginRealm": true
}]

# Encryption obligations for sensitive resources
get_encryption_obligations(resource) := obligations if {
    resource.classification in ["SECRET", "TOP_SECRET"]
    obligations := [{
        "type": "encryption",
        "action": "verify_encryption_at_rest",
        "minimumKeyLength": 256
    }]
} else := []

# Watermarking obligations - includes originRealm for cross-realm tracking
get_watermark_obligations(resource, origin_realm) := [{
    "type": "watermark",
    "action": "apply_classification_marking",
    "classification": resource.classification,
    "releasability": resource.releasabilityTo,
    "originRealm": origin_realm
}]

# Helper function for conditional strings
conditional_string(condition, true_str, false_str) := true_str if {
    condition
} else := false_str

# Special rules for French-specific scenarios

# Allow French cyber defense team special access to FR-CYBER resources
allow_cyber_override if {
    input.subject.dutyOrg == "ANSSI"
    "FR-CYBER" in input.resource.COI
    input.subject.countryOfAffiliation == "FRA"
}

# Embargo check for time-sensitive French resources
embargo_check(resource) := result if {
    resource.metadata.embargoUntil
    embargo_date := time.parse_rfc3339_ns(resource.metadata.embargoUntil)
    current_time := time.now_ns()
    result := {
        "passed": current_time >= embargo_date,
        "embargoUntil": resource.metadata.embargoUntil,
        "currentTime": time.format(current_time)
    }
} else := {"passed": true, "embargoUntil": null, "currentTime": null}

# Data residency check for French sovereignty requirements (GAP-007)
data_residency_check(resource) := result if {
    resource.metadata.dataResidency == "FR-ONLY"
    source_ip := object.get(input.context, "sourceIP", "unknown")
    is_french_ip := ip_in_french_ranges(source_ip)
    result := {
        "pass": is_french_ip,
        "sourceIP": source_ip,
        "requirement": "FR-ONLY",
        "details": sprintf("French data residency requirement %s",
            [conditional_string(is_french_ip, "is satisfied", "is violated — access must originate from French infrastructure")])
    }
} else := {
    "pass": true,
    "sourceIP": object.get(input.context, "sourceIP", "unknown"),
    "requirement": "none",
    "details": "No data residency requirement applies to this resource"
}

# Check if IP is in French ranges (simplified CIDR check for demo)
ip_in_french_ranges(ip) := true if {
    # Internal/private ranges allowed for demo
    startswith(ip, "10.")
} else := true if {
    startswith(ip, "172.19.")  # FRA Docker network
} else := true if {
    startswith(ip, "192.168.")
} else := true if {
    ip == "unknown"  # Allow unknown for testing
} else := false

# French IP ranges documentation (for reference)
french_ip_ranges := [
    "10.0.0.0/8",    # Internal
    "172.19.0.0/16", # FRA Docker network
    "192.168.0.0/16" # Private
]

# ============================================================================
# TEST HELPERS - Validate French attribute normalization
# ============================================================================

# Test helper - validate French clearance normalization
test_french_clearance_normalization if {
    normalized_clearance("CONFIDENTIEL_DEFENSE") == "CONFIDENTIAL"
    normalized_clearance("SECRET_DEFENSE") == "SECRET"
    normalized_clearance("TRES_SECRET_DEFENSE") == "TOP_SECRET"
    normalized_clearance("NON_PROTEGE") == "UNCLASSIFIED"
}

# Test helper - validate COI normalization
test_french_coi_normalization if {
    normalized_coi(["OTAN_COSMIQUE", "UE_CONFIDENTIEL"]) == ["NATO-COSMIC", "EU-CONFIDENTIAL"]
}

# Test helper - validate clearance hierarchy
test_clearance_hierarchy if {
    clearance_levels["UNCLASSIFIED"] < clearance_levels["CONFIDENTIAL"]
    clearance_levels["CONFIDENTIAL"] < clearance_levels["SECRET"]
    clearance_levels["SECRET"] < clearance_levels["TOP_SECRET"]
}

# Test helper - validate IP range check
test_ip_range_check if {
    ip_in_french_ranges("10.0.0.1") == true
    ip_in_french_ranges("172.19.0.5") == true
    ip_in_french_ranges("192.168.1.1") == true
    ip_in_french_ranges("8.8.8.8") == false
}
