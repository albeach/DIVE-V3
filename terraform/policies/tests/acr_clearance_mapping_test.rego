package dive.acr

import rego.v1

test_unclassified_requires_aal1 if {
    decision.required_acr == "urn:mace:incommon:iap:silver" with input as {"clearance": "UNCLASSIFIED"}
    decision.loa_level == 1 with input as {"clearance": "UNCLASSIFIED"}
}

test_confidential_requires_aal2 if {
    decision.required_acr == "urn:mace:incommon:iap:gold" with input as {"clearance": "CONFIDENTIAL"}
    decision.loa_level == 2 with input as {"clearance": "CONFIDENTIAL"}
}

test_secret_requires_aal2 if {
    decision.required_acr == "urn:mace:incommon:iap:gold" with input as {"clearance": "SECRET"}
    decision.loa_level == 2 with input as {"clearance": "SECRET"}
}

test_top_secret_requires_aal3 if {
    decision.required_acr == "urn:mace:incommon:iap:platinum" with input as {"clearance": "TOP_SECRET"}
    decision.loa_level == 3 with input as {"clearance": "TOP_SECRET"}
}

test_default_aal1_for_unknown if {
    decision.required_acr == "urn:mace:incommon:iap:silver" with input as {"clearance": "UNKNOWN"}
    decision.loa_level == 1 with input as {"clearance": "UNKNOWN"}
}
