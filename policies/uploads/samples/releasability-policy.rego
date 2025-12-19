# Sample Rego Policy: Releasability Check
#
# Focused policy that only checks country releasability.
# Simpler than the clearance policy - good for teaching basic ABAC.

package dive.lab.releasability

import rego.v1

# Default deny
default allow := false

# ============================================================================
# Violation
# ============================================================================

is_country_not_authorized := msg if {
    count(input.resource.releasabilityTo) > 0
    not input.subject.countryOfAffiliation in input.resource.releasabilityTo
    msg := sprintf("Access denied: Country '%s' not authorized. Authorized countries: %v", 
                   [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

# ============================================================================
# Allow Rule
# ============================================================================

allow if {
    not is_country_not_authorized
}

# ============================================================================
# Metadata
# ============================================================================

reason := "Country authorization check passed" if { allow }

reason := is_country_not_authorized if { not allow }

obligations := [{
    "type": "LOG_ACCESS",
    "params": {
        "uniqueID": input.subject.uniqueID,
        "country": input.subject.countryOfAffiliation,
        "resourceId": input.resource.resourceId
    }
}] if { allow }
