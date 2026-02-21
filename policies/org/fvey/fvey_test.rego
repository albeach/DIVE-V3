# FVEY Policy Tests
# Package: dive.org.fvey_test
#
# Comprehensive tests for Five Eyes alliance policy rules.
#
# Version: 1.0.0
# Last Updated: 2025-12-03

package dive.org.fvey_test

import rego.v1

import data.dive.org.fvey

# ============================================
# FVEY Membership Tests
# ============================================

test_usa_is_fvey_member if {
    fvey.is_fvey_member("USA")
}

test_gbr_is_fvey_member if {
    fvey.is_fvey_member("GBR")
}

test_can_is_fvey_member if {
    fvey.is_fvey_member("CAN")
}

test_aus_is_fvey_member if {
    fvey.is_fvey_member("AUS")
}

test_nzl_is_fvey_member if {
    fvey.is_fvey_member("NZL")
}

test_fra_is_not_fvey_member if {
    not fvey.is_fvey_member("FRA")
}

test_deu_is_not_fvey_member if {
    not fvey.is_fvey_member("DEU")
}

test_jpn_is_not_fvey_member if {
    not fvey.is_fvey_member("JPN")
}

# ============================================
# FVEY Affiliation Tests
# ============================================

test_usa_subject_is_fvey_affiliated if {
    fvey.is_fvey_affiliated({"countryOfAffiliation": "USA"})
}

test_gbr_subject_is_fvey_affiliated if {
    fvey.is_fvey_affiliated({"countryOfAffiliation": "GBR"})
}

test_fra_subject_is_not_fvey_affiliated if {
    not fvey.is_fvey_affiliated({"countryOfAffiliation": "FRA"})
}

# ============================================
# All FVEY Members Tests
# ============================================

test_all_fvey_members_with_full_list if {
    fvey.all_fvey_members({"USA", "GBR", "CAN", "AUS", "NZL"})
}

test_all_fvey_members_with_subset if {
    fvey.all_fvey_members({"USA", "GBR"})
}

test_all_fvey_members_fails_with_non_member if {
    not fvey.all_fvey_members({"USA", "FRA"})
}

test_all_fvey_members_fails_with_empty if {
    not fvey.all_fvey_members(set())
}

# ============================================
# Any FVEY Member Tests
# ============================================

test_any_fvey_member_with_usa if {
    fvey.any_fvey_member({"USA", "FRA"})
}

test_any_fvey_member_with_gbr if {
    fvey.any_fvey_member({"FRA", "GBR", "DEU"})
}

test_any_fvey_member_fails_with_no_members if {
    not fvey.any_fvey_member({"FRA", "DEU", "JPN"})
}

# ============================================
# FVEY Resource Access Tests
# ============================================

test_fvey_allow_usa_subject_fvey_coi if {
    fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "USA",
            "clearance": "SECRET",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"],
        },
    }
}

test_fvey_allow_gbr_subject_fvey_coi if {
    fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "GBR",
            "clearance": "TOP_SECRET",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"],
        },
    }
}

test_fvey_allow_can_subject_releasable if {
    fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "CAN",
            "clearance": "SECRET",
        },
        "resource": {
            "COI": [],
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA", "CAN"],
        },
    }
}

test_fvey_deny_fra_subject if {
    not fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "FRA",
            "clearance": "TOP_SECRET",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"],
        },
    }
}

test_fvey_deny_insufficient_clearance if {
    not fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "USA",
            "clearance": "CONFIDENTIAL",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "TOP_SECRET",
            "releasabilityTo": ["USA"],
        },
    }
}

test_fvey_deny_not_releasable if {
    not fvey.allow with input as {
        "subject": {
            "countryOfAffiliation": "NZL",
            "clearance": "SECRET",
        },
        "resource": {
            "COI": [],
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR"],
        },
    }
}

# ============================================
# Clearance Level Tests
# ============================================

test_clearance_levels_hierarchy if {
    fvey.clearance_levels["UNCLASSIFIED"] < fvey.clearance_levels["RESTRICTED"]
    fvey.clearance_levels["RESTRICTED"] < fvey.clearance_levels["CONFIDENTIAL"]
    fvey.clearance_levels["CONFIDENTIAL"] < fvey.clearance_levels["SECRET"]
    fvey.clearance_levels["SECRET"] < fvey.clearance_levels["TOP_SECRET"]
}

test_clearance_sufficient_equal if {
    fvey.clearance_sufficient with input as {
        "subject": {"clearance": "SECRET"},
        "resource": {"classification": "SECRET"},
    }
}

test_clearance_sufficient_higher if {
    fvey.clearance_sufficient with input as {
        "subject": {"clearance": "TOP_SECRET"},
        "resource": {"classification": "SECRET"},
    }
}

test_clearance_insufficient_lower if {
    not fvey.clearance_sufficient with input as {
        "subject": {"clearance": "CONFIDENTIAL"},
        "resource": {"classification": "SECRET"},
    }
}

# ============================================
# Decision Response Tests
# ============================================

test_decision_allow_response if {
    result := fvey.decision with input as {
        "subject": {
            "countryOfAffiliation": "USA",
            "clearance": "SECRET",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
        },
    }
    result.allow == true
    result.reason == "FVEY access granted"
}

test_decision_deny_response if {
    result := fvey.decision with input as {
        "subject": {
            "countryOfAffiliation": "FRA",
            "clearance": "SECRET",
        },
        "resource": {
            "COI": ["FVEY"],
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
        },
    }
    result.allow == false
    result.reason == "FVEY access denied"
}

# ============================================
# COI Members Registry Tests
# ============================================

test_coi_members_fvey if {
    members := fvey.coi_members["FVEY"]
    count(members) == 5
    "USA" in members
    "GBR" in members
    "CAN" in members
    "AUS" in members
    "NZL" in members
}

test_coi_members_fvey_only if {
    members := fvey.coi_members["FVEY-ONLY"]
    count(members) == 5
}

test_coi_members_5_eyes if {
    members := fvey.coi_members["5-EYES"]
    count(members) == 5
}

# ============================================
# Bilateral Agreement Tests
# ============================================

test_has_bilateral_usa_gbr if {
    fvey.has_bilateral("USA", "GBR")
}

test_has_bilateral_usa_can if {
    fvey.has_bilateral("USA", "CAN")
}

test_has_bilateral_usa_aus if {
    fvey.has_bilateral("USA", "AUS")
}

test_has_bilateral_gbr_aus if {
    fvey.has_bilateral("GBR", "AUS")
}

test_has_bilateral_aus_nzl if {
    fvey.has_bilateral("AUS", "NZL")
}

test_no_bilateral_usa_nzl if {
    not fvey.has_bilateral("USA", "NZL")
}

test_get_bilaterals_usa_gbr if {
    agreements := fvey.get_bilaterals("USA", "GBR")
    "UKUSA" in agreements
    "SIGINT" in agreements
}

test_get_bilaterals_usa_can if {
    agreements := fvey.get_bilaterals("USA", "CAN")
    "CAN-US" in agreements
    "NORAD" in agreements
}

test_get_bilaterals_empty if {
    agreements := fvey.get_bilaterals("CAN", "NZL")
    count(agreements) == 0
}

# ============================================
# Sharing Tier Tests
# ============================================

test_tier_1_usa if {
    fvey.can_access_tier("TIER_1", "USA")
}

test_tier_1_gbr if {
    fvey.can_access_tier("TIER_1", "GBR")
}

test_tier_1_not_can if {
    not fvey.can_access_tier("TIER_1", "CAN")
}

test_tier_2_can if {
    fvey.can_access_tier("TIER_2", "CAN")
}

test_tier_2_not_aus if {
    not fvey.can_access_tier("TIER_2", "AUS")
}

test_tier_3_all_fvey if {
    fvey.can_access_tier("TIER_3", "USA")
    fvey.can_access_tier("TIER_3", "GBR")
    fvey.can_access_tier("TIER_3", "CAN")
    fvey.can_access_tier("TIER_3", "AUS")
    fvey.can_access_tier("TIER_3", "NZL")
}

test_tier_3_not_fra if {
    not fvey.can_access_tier("TIER_3", "FRA")
}

test_highest_tier_usa if {
    fvey.highest_tier("USA") == "TIER_1"
}

test_highest_tier_can if {
    fvey.highest_tier("CAN") == "TIER_2"
}

test_highest_tier_nzl if {
    fvey.highest_tier("NZL") == "TIER_3"
}

# ============================================
# Edge Case Tests
# ============================================

test_fvey_members_count if {
    count(fvey.fvey_members) == 5
}

test_fvey_caveats_include_standard if {
    "FVEY" in fvey.fvey_caveats
    "FVEY-ONLY" in fvey.fvey_caveats
    "FVEY-REL" in fvey.fvey_caveats
}

test_caveat_equivalency_fvey if {
    fvey.caveat_equivalency["FVEY"] == "AUS/CAN/NZL/UK/US EYES ONLY"
}

test_caveat_equivalency_5_eyes if {
    fvey.caveat_equivalency["5-EYES"] == "AUS/CAN/NZL/UK/US EYES ONLY"
}

