# Sample Rego Policy: Clearance-Based Access Control
#
# This policy demonstrates:
# - Clearance level comparison (hierarchical)
# - Country releasability checks
# - COI (Community of Interest) matching
# - Fail-secure pattern with violations
#
# Use in Policies Lab to test basic ABAC scenarios.

package dive.lab.clearance

import rego.v1

# Default deny
default allow := false

# ============================================================================
# Clearance Hierarchy
# ============================================================================
# CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
# - UNCLASSIFIED users CANNOT access RESTRICTED content
# - RESTRICTED users CAN access UNCLASSIFIED content
# - Both remain AAL1 (no MFA required)

clearance_levels := {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 0.5,
    "CONFIDENTIAL": 1,
    "SECRET": 2,
    "TOP_SECRET": 3
}

# ============================================================================
# Violations (Fail-Secure Pattern)
# ============================================================================

# Subject must be authenticated
is_not_authenticated := msg if {
    not input.subject.authenticated
    msg := "Subject is not authenticated"
}

# Check clearance level
is_insufficient_clearance := msg if {
    subject_level := clearance_levels[input.subject.clearance]
    resource_level := clearance_levels[input.resource.classification]
    subject_level < resource_level
    msg := sprintf("Clearance %s insufficient for %s", [input.subject.clearance, input.resource.classification])
}

# Check country releasability
is_not_releasable := msg if {
    count(input.resource.releasabilityTo) > 0
    not input.subject.countryOfAffiliation in input.resource.releasabilityTo
    msg := sprintf("Country %s not in releasabilityTo: %v", [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

# Check COI match (if both specified)
is_coi_mismatch := msg if {
    count(input.resource.COI) > 0
    count(input.subject.acpCOI) > 0
    count([coi | coi := input.subject.acpCOI[_]; coi in input.resource.COI]) == 0
    msg := sprintf("No COI match. Subject COI: %v, Resource COI: %v", [input.subject.acpCOI, input.resource.COI])
}

# ============================================================================
# Allow Rule
# ============================================================================

allow if {
    not is_not_authenticated
    not is_insufficient_clearance
    not is_not_releasable
    not is_coi_mismatch
}

# ============================================================================
# Reason and Obligations
# ============================================================================

reason := msg if {
    allow
    msg := "All clearance, releasability, and COI checks passed"
}

reason := msg if {
    not allow
    violations := [
        is_not_authenticated,
        is_insufficient_clearance,
        is_not_releasable,
        is_coi_mismatch
    ]
    msg := concat("; ", [v | v := violations[_]; v != ""])
}

obligations := [
    {
        "type": "LOG_ACCESS",
        "params": {
            "level": "INFO",
            "uniqueID": input.subject.uniqueID,
            "resourceId": input.resource.resourceId
        }
    }
] if { allow }
