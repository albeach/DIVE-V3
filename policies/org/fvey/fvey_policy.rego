# Organization Layer: Five Eyes (FVEY) Alliance Policy
# Package: dive.org.fvey
#
# Implements access control policies for FVEY member nations:
# - USA (United States)
# - GBR (United Kingdom)
# - CAN (Canada)
# - AUS (Australia)
# - NZL (New Zealand)
#
# Reference: FVEY agreement, ACP-240 Section 5.2
# STANAG 4774/5636 compliance for coalition operations
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.org.fvey

import rego.v1

# ============================================
# FVEY Member Nations
# ============================================
# Five Eyes alliance members (ISO 3166-1 alpha-3)

fvey_members := {"USA", "GBR", "CAN", "AUS", "NZL"}

# ============================================
# FVEY Classification Marking
# ============================================
# FVEY-specific classification markings and caveats

fvey_caveats := {
    "FVEY",           # Standard Five Eyes marking
    "FVEY-ONLY",      # Restricted to FVEY members only
    "FVEY-REL",       # Releasable to FVEY
    "AUS/CAN/NZL/UK/US EYES ONLY",  # Long-form FVEY marking
}

# Shorthand to full form mapping
caveat_equivalency := {
    "FVEY": "AUS/CAN/NZL/UK/US EYES ONLY",
    "FVEY-ONLY": "AUS/CAN/NZL/UK/US EYES ONLY",
    "FVEY-REL": "RELEASABLE TO AUS/CAN/NZL/UK/US",
    "5-EYES": "AUS/CAN/NZL/UK/US EYES ONLY",
    "FIVE EYES": "AUS/CAN/NZL/UK/US EYES ONLY",
}

# ============================================
# FVEY Membership Validation
# ============================================

# Check if a country is a FVEY member
is_fvey_member(country) if {
    fvey_members[country]
}

# Check if subject is affiliated with a FVEY nation
is_fvey_affiliated(subject) if {
    is_fvey_member(subject.countryOfAffiliation)
}

# Check if all countries in list are FVEY members
all_fvey_members(countries) if {
    count(countries) > 0
    every country in countries {
        is_fvey_member(country)
    }
}

# Check if any country in list is a FVEY member
any_fvey_member(countries) if {
    some country in countries
    is_fvey_member(country)
}

# ============================================
# FVEY Resource Access Rules
# ============================================

# Default deny
default allow := false

# Allow if:
# 1. Subject is from a FVEY member nation
# 2. Resource has FVEY marking or is releasable to FVEY
# 3. Subject's clearance meets resource classification
allow if {
    # Subject must be FVEY-affiliated
    is_fvey_affiliated(input.subject)

    # Resource must be FVEY-marked or releasable to subject's country
    fvey_resource_accessible

    # Standard clearance check (delegated to base package)
    clearance_sufficient
}

# Check if resource is accessible under FVEY rules
fvey_resource_accessible if {
    # Resource has FVEY COI marking
    some coi in input.resource.COI
    coi == "FVEY"
}

fvey_resource_accessible if {
    # Resource is releasable to subject's FVEY country
    input.subject.countryOfAffiliation in input.resource.releasabilityTo
}

# Clearance sufficient (simplified - delegates to base)
clearance_sufficient if {
    clearance_levels[input.subject.clearance] >= clearance_levels[input.resource.classification]
}

# Clearance hierarchy
clearance_levels := {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 1,
    "CONFIDENTIAL": 2,
    "SECRET": 3,
    "TOP_SECRET": 4,
    "COSMIC_TOP_SECRET": 5,
}

# ============================================
# FVEY-Specific Denial Reasons
# ============================================

# Denial reason: Not FVEY affiliated
is_not_fvey_affiliated := msg if {
    not is_fvey_affiliated(input.subject)
    msg := sprintf("Subject country %s is not a FVEY member", [input.subject.countryOfAffiliation])
}

# Denial reason: Resource not FVEY accessible
is_not_fvey_resource := msg if {
    not fvey_resource_accessible
    msg := sprintf("Resource is not accessible to FVEY nations (COI: %v, releasableTo: %v)", [
        input.resource.COI,
        input.resource.releasabilityTo,
    ])
}

# Denial reason: Insufficient clearance
is_clearance_insufficient := msg if {
    not clearance_sufficient
    msg := sprintf("Insufficient clearance: %s < %s", [
        input.subject.clearance,
        input.resource.classification,
    ])
}

# Collect all denial reasons
denial_reasons := reasons if {
    reasons := {msg |
        some msg in {is_not_fvey_affiliated, is_not_fvey_resource, is_clearance_insufficient}
        msg != null
    }
}

# ============================================
# FVEY Decision Response
# ============================================

# Full decision with reason and details
decision := response if {
    allow
    response := {
        "allow": true,
        "reason": "FVEY access granted",
        "details": {
            "subject_country": input.subject.countryOfAffiliation,
            "resource_coi": input.resource.COI,
            "clearance_check": "PASS",
        },
    }
} else := response if {
    response := {
        "allow": false,
        "reason": "FVEY access denied",
        "details": {
            "violations": denial_reasons,
            "subject_country": input.subject.countryOfAffiliation,
            "fvey_members": fvey_members,
        },
    }
}

# ============================================
# FVEY COI Membership Query
# ============================================

# Returns FVEY member countries for COI validation
coi_members["FVEY"] := fvey_members
coi_members["FVEY-ONLY"] := fvey_members
coi_members["5-EYES"] := fvey_members

# ============================================
# Bilateral Agreements within FVEY
# ============================================
# Some FVEY pairs have additional bilateral agreements
# Using string keys with alphabetical ordering for Rego compatibility

bilateral_agreements := {
    "GBR-USA": ["UKUSA", "SIGINT"],
    "CAN-USA": ["CAN-US", "NORAD"],
    "AUS-USA": ["ANZUS", "AUKUS"],
    "AUS-GBR": ["AUKUS"],
    "AUS-NZL": ["ANZUS"],
}

# Create sorted key for bilateral lookup (alphabetical order)
_bilateral_key(country1, country2) := key if {
    country1 < country2
    key := concat("-", [country1, country2])
} else := key if {
    key := concat("-", [country2, country1])
}

# Check if two countries have a bilateral agreement
has_bilateral(country1, country2) if {
    key := _bilateral_key(country1, country2)
    bilateral_agreements[key]
}

# Get bilateral agreement names
get_bilaterals(country1, country2) := agreements if {
    key := _bilateral_key(country1, country2)
    agreements := bilateral_agreements[key]
} else := []

# ============================================
# FVEY Intelligence Sharing Tiers
# ============================================
# Different tiers of intelligence sharing within FVEY

sharing_tiers := {
    "TIER_1": {"USA", "GBR"},           # UKUSA core
    "TIER_2": {"USA", "GBR", "CAN"},    # North American SIGINT
    "TIER_3": fvey_members,              # Full FVEY
}

# Check if subject can access a specific tier
can_access_tier(tier, country) if {
    sharing_tiers[tier][country]
}

# Get highest accessible tier for a country
highest_tier(country) := "TIER_3" if {
    can_access_tier("TIER_3", country)
    not can_access_tier("TIER_2", country)
}

highest_tier(country) := "TIER_2" if {
    can_access_tier("TIER_2", country)
    not can_access_tier("TIER_1", country)
}

highest_tier(country) := "TIER_1" if {
    can_access_tier("TIER_1", country)
}
