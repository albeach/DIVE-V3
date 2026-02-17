# DIVE V3 Sample OPA Policy for E2E Testing
#
# This policy enforces basic clearance and releasability checks.
# Used by policies-lab upload tests.

package dive.v3.test

import rego.v1

# Default deny
default allow := false

# Allow access if user clearance meets or exceeds resource classification
# and user's country is in the releasability list
allow if {
    clearance_sufficient
    releasable_to_user
}

# Check clearance hierarchy
clearance_sufficient if {
    clearance_rank(input.user.clearance) >= clearance_rank(input.resource.classification)
}

# Check releasability
releasable_to_user if {
    input.user.countryOfAffiliation == input.resource.releasableTo[_]
}

# Clearance rank mapping (higher = more access)
clearance_rank(level) := rank if {
    ranks := {
        "UNCLASSIFIED": 0,
        "RESTRICTED": 1,
        "CONFIDENTIAL": 2,
        "SECRET": 3,
        "TOP_SECRET": 4,
    }
    rank := ranks[level]
}

# Deny reason for insufficient clearance
deny contains msg if {
    not clearance_sufficient
    msg := sprintf("User clearance %s is below resource classification %s", [
        input.user.clearance,
        input.resource.classification,
    ])
}

# Deny reason for releasability
deny contains msg if {
    not releasable_to_user
    msg := sprintf("User country %s is not in releasability list %v", [
        input.user.countryOfAffiliation,
        input.resource.releasableTo,
    ])
}
