# COI Logic Analysis and Recommendations

**Date:** December 2025  
**Purpose:** Review and fix COI authorization logic per user requirements

## User Requirements Summary

1. **COIs with specific countries**: Strictly enforced - users must have COI tag OR country must be in COI membership
2. **Users with no/missing COI**: Can access if country is in COI country membership AND releasabilityTo
3. **COIs with no countries (Alpha/Beta/Gamma)**: Exclusive - users MUST have exact COI tag, no country fallback

## Current Implementation Assessment

### Issue #1: COIs with Country Membership - Strict Enforcement Required

**Current Behavior:**
- Users with NO COI tags can access resources with country-based COIs (e.g., FVEY, NATO)
- Logic: Lines 638-642 in `fuel_inventory_abac_policy.rego` allow access if user has no COI tags

**Problem:**
- This violates strict enforcement requirement
- Example: User from USA with no COI can access FVEY resource, even though FVEY requires explicit membership

**Required Behavior:**
- If resource COI has country membership defined (e.g., FVEY = {USA, GBR, CAN, AUS, NZL})
- User MUST have that COI tag OR user's country must be in the COI's country membership AND resource's releasabilityTo

### Issue #2: Users with No COI - Country-Based Access

**Current Behavior:**
- Users with NO COI can access ANY resource if their country is in releasabilityTo
- This works for resources with NO COI requirement
- This ALSO works for resources WITH COI requirement (BUG)

**Required Behavior:**
- Users with NO COI can access resources IF:
  - Resource has NO COI requirement, OR
  - Resource COI has country membership AND user's country is in COI membership AND releasabilityTo

**Example:**
- Resource: COI=["FVEY"], releasabilityTo=["USA"]
- User: country="USA", acpCOI=[]
- Should ALLOW: USA is in FVEY membership {USA, GBR, CAN, AUS, NZL} AND in releasabilityTo

### Issue #3: COIs with No Countries (Alpha, Beta, Gamma) - Exclusive Membership

**Current Behavior:**
- Alpha/Beta/Gamma are marked as `no_affiliation_cois`
- They're excluded from releasability alignment checks
- Authorization logic doesn't explicitly enforce exclusive membership

**Required Behavior:**
- If resource COI has NO country membership (empty set)
- User MUST have exact COI tag match
- No fallback to country-based access

**Example:**
- Resource: COI=["Alpha"], releasabilityTo=["USA"]
- User: country="USA", acpCOI=[]
- Should DENY: Alpha has no country membership, requires explicit Alpha COI tag

### Issue #4: EUCOM Country Membership

**Current Definition:**
```rego
"EUCOM": {"USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"}
```

**Status:** ✅ CORRECT - USA is included

**Potential Issue:**
- User may have found resources where EUCOM was used incorrectly
- Need to verify resources in database match this definition

## Recommended Policy Logic

### Updated `is_coi_violation` Logic

```rego
is_coi_violation := msg if {
    # Case 1: Resource has no COI requirement - always allow
    count(input.resource.COI) == 0
    msg := "No COI requirement"  # This should not trigger violation
} else := msg if {
    # Case 2: Resource has COI with NO country membership (Alpha, Beta, Gamma)
    # These require EXACT COI tag match - no country fallback
    count(input.resource.COI) > 0
    some resource_coi in input.resource.COI
    resource_coi in no_affiliation_cois  # {"Alpha", "Beta", "Gamma"}
    
    # User MUST have this exact COI tag
    user_coi := object.get(input.subject, "acpCOI", [])
    not resource_coi in user_coi
    
    msg := sprintf("Resource requires exclusive COI membership: %s (user COI: %v)", [resource_coi, user_coi])
} else := msg if {
    # Case 3: Resource has COI with country membership
    # Check if user has COI tag OR country-based access
    count(input.resource.COI) > 0
    
    # Get COI operator (default to ALL)
    operator := object.get(input.resource, "coiOperator", "ALL")
    
    # Get user COI (default to empty array if missing)
    user_coi := object.get(input.subject, "acpCOI", [])
    
    # Compute union of all COI member countries (excluding no-affiliation COIs)
    coi_country_union := {c |
        some resource_coi in input.resource.COI
        not resource_coi in no_affiliation_cois
        some c in coi_members[resource_coi]
    }
    
    # Check if user has COI tag match
    has_coi_tag_match := check_coi_tag_match(user_coi, input.resource.COI, operator)
    
    # Check if user has country-based access
    user_country := input.subject.countryOfAffiliation
    has_country_access := user_country in coi_country_union && user_country in input.resource.releasabilityTo
    
    # Deny if neither COI tag match NOR country-based access
    not has_coi_tag_match
    not has_country_access
    
    msg := sprintf("COI violation: user has no COI tag match (%v) and country %s not in COI membership or releasabilityTo", [
        user_coi,
        user_country
    ])
}

# Helper: Check COI tag match based on operator
check_coi_tag_match(user_coi, resource_coi, operator) := true if {
    operator == "ALL"
    required := {c | some c in resource_coi}
    has := {c | some c in user_coi}
    count(required - has) == 0  # User has all required COIs
} else := true if {
    operator == "ANY"
    required := {c | some c in resource_coi}
    has := {c | some c in user_coi}
    count(required & has) > 0  # User has at least one matching COI
} else := false
```

## Test Cases Needed

### Test Case 1: Country-Based COI - User with No COI but Country Matches
```rego
test_allow_country_based_coi_access if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []  # No COI tags
        },
        "resource": {
            "resourceId": "doc-fvey-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["FVEY"]  # FVEY = {USA, GBR, CAN, AUS, NZL}
        },
        "context": {}
    }
}
# Expected: ALLOW (USA is in FVEY membership AND releasabilityTo)
```

### Test Case 2: Country-Based COI - User with No COI, Country Not in COI Membership
```rego
test_deny_country_not_in_coi_membership if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "acpCOI": []  # No COI tags
        },
        "resource": {
            "resourceId": "doc-fvey-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA"],  # FRA in releasabilityTo BUT...
            "COI": ["FVEY"]  # FVEY = {USA, GBR, CAN, AUS, NZL} - FRA NOT included
        },
        "context": {}
    }
}
# Expected: DENY (FRA not in FVEY membership, even though in releasabilityTo)
```

### Test Case 3: Exclusive COI (Alpha) - User Must Have Exact Tag
```rego
test_deny_exclusive_coi_without_tag if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []  # No COI tags - should DENY even though USA in releasabilityTo
        },
        "resource": {
            "resourceId": "doc-alpha-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["Alpha"]  # Alpha = {} (no country membership)
        },
        "context": {}
    }
}
# Expected: DENY (Alpha requires explicit Alpha COI tag, no country fallback)
```

### Test Case 4: Exclusive COI (Alpha) - User Has Exact Tag
```rego
test_allow_exclusive_coi_with_tag if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-alpha",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["Alpha"]  # Has Alpha tag
        },
        "resource": {
            "resourceId": "doc-alpha-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["Alpha"]
        },
        "context": {}
    }
}
# Expected: ALLOW (user has Alpha COI tag)
```

### Test Case 5: EUCOM - Verify USA Included
```rego
test_allow_eucom_with_usa_country if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []  # No COI tags
        },
        "resource": {
            "resourceId": "doc-eucom-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA"],
            "COI": ["EUCOM"]  # EUCOM = {USA, DEU, GBR, FRA, ITA, ESP, POL}
        },
        "context": {}
    }
}
# Expected: ALLOW (USA is in EUCOM membership)
```

## Implementation Recommendations

1. **Update `fuel_inventory_abac_policy.rego`**:
   - Separate logic for country-based COIs vs. exclusive COIs
   - Add country membership check for users without COI tags
   - Enforce exclusive membership for Alpha/Beta/Gamma

2. **Update `federation_abac_policy.rego`**:
   - Apply same logic for consistency across policies

3. **Add Comprehensive Tests**:
   - Test all three scenarios (country-based, exclusive, no COI)
   - Test EUCOM and other COIs with USA membership
   - Test edge cases (multiple COIs, operators)

4. **Database Audit**:
   - Verify all resources with EUCOM have correct country membership
   - Check for resources with incorrect COI/country combinations

