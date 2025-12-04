# COI Logic Implementation Recommendations

## Current State Analysis

### ✅ What's Working

1. **COI Coherence Validation**: `coi_coherence_policy.rego` correctly validates:
   - Mutual exclusivity (US-ONLY ⊥ foreign-sharing COIs)
   - Releasability ⊆ COI membership
   - NOFORN caveat enforcement
   - Subset/superset conflicts

2. **EUCOM Definition**: ✅ CORRECT
   ```rego
   "EUCOM": {"USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"}
   ```
   USA is correctly included. If you found resources where EUCOM doesn't include USA, those are data issues, not policy issues.

### ❌ Issues Found

#### Issue 1: Users Without COI Can Access ANY Resource with COI

**Current Logic** (`fuel_inventory_abac_policy.rego:638-642`):
```rego
# CRITICAL FIX (Nov 6, 2025): COI should be OPTIONAL, not REQUIRED
# If user has NO COI tags, they can still access resources based on clearance + country
count(user_coi) > 0 # User has at least one COI tag
```

**Problem**: This allows users with NO COI to bypass COI restrictions entirely.

**Example Bug**:
- Resource: `COI=["FVEY"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]` (no COI)
- Current: ✅ ALLOW (incorrect - should check if USA is in FVEY membership)
- Expected: ✅ ALLOW (USA is in FVEY={USA,GBR,CAN,AUS,NZL} AND in releasabilityTo)

**But also**:
- Resource: `COI=["Alpha"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]` (no COI)
- Current: ✅ ALLOW (incorrect - Alpha requires explicit tag)
- Expected: ❌ DENY (Alpha has no country membership, requires explicit Alpha tag)

#### Issue 2: No Distinction Between Country-Based and Exclusive COIs

**Current Logic**: Treats all COIs the same - if user has no COI tags, allows access.

**Required Logic**:
- **Country-based COIs** (FVEY, NATO, EUCOM, etc.): Allow if user's country is in COI membership
- **Exclusive COIs** (Alpha, Beta, Gamma): Require exact COI tag match

#### Issue 3: `federation_abac_policy.rego` Has Different Logic

**Current Logic** (`federation_abac_policy.rego:174-181`):
```rego
is_coi_violation := msg if {
    count(input.resource.COI) > 0
    user_coi := {c | some c in input.subject.acpCOI}
    resource_coi := {c | some c in input.resource.COI}
    intersection := user_coi & resource_coi
    count(intersection) == 0
    msg := sprintf("No COI intersection: user %v, resource %v", [input.subject.acpCOI, input.resource.COI])
}
```

**Problem**: This REQUIRES COI intersection - doesn't allow country-based fallback OR handle exclusive COIs.

## Recommended Implementation

### Updated `is_coi_violation` Logic

```rego
# COIs with no country affiliation (membership-based only)
no_affiliation_cois := {"Alpha", "Beta", "Gamma"}

is_coi_violation := msg if {
    # Case 1: Resource has no COI requirement - no violation
    count(input.resource.COI) == 0
    msg := ""  # Empty msg means no violation (this case shouldn't trigger)
} else := msg if {
    # Case 2: Resource has exclusive COI (Alpha/Beta/Gamma) - requires exact tag match
    count(input.resource.COI) > 0
    some resource_coi in input.resource.COI
    resource_coi in no_affiliation_cois
    
    # User MUST have this exact COI tag (no country fallback)
    user_coi := object.get(input.subject, "acpCOI", [])
    not resource_coi in user_coi
    
    msg := sprintf("Resource requires exclusive COI membership: %s (user COI: %v, no country fallback allowed)", [
        resource_coi,
        user_coi
    ])
} else := msg if {
    # Case 3: Resource has country-based COI - check tag match OR country membership
    count(input.resource.COI) > 0
    
    # Get user COI and country
    user_coi := object.get(input.subject, "acpCOI", [])
    user_country := input.subject.countryOfAffiliation
    
    # Get COI operator (default to ALL)
    operator := object.get(input.resource, "coiOperator", "ALL")
    
    # Check if user has COI tag match
    has_coi_tag_match := check_coi_tag_match(user_coi, input.resource.COI, operator)
    
    # Check if user has country-based access
    # Compute union of all COI member countries
    coi_country_union := {c |
        some resource_coi in input.resource.COI
        not resource_coi in no_affiliation_cois
        some c in coi_members[resource_coi]
    }
    
    # User's country must be in COI membership AND releasabilityTo
    has_country_access := user_country in coi_country_union && user_country in input.resource.releasabilityTo
    
    # Deny if neither COI tag match NOR country-based access
    not has_coi_tag_match
    not has_country_access
    
    msg := sprintf("COI violation: user has no COI tag match (%v) and country %s not in COI membership %v or not in releasabilityTo %v", [
        user_coi,
        user_country,
        coi_country_union,
        input.resource.releasabilityTo
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

## Test Cases to Add

### Test 1: Country-Based COI - User with No COI, Country in Membership ✅
```rego
test_allow_fvey_country_based_no_coi_tag if {
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

### Test 2: Country-Based COI - User with No COI, Country NOT in Membership ❌
```rego
test_deny_fvey_country_not_in_membership if {
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

### Test 3: Exclusive COI (Alpha) - User with No COI ❌
```rego
test_deny_alpha_exclusive_no_coi_tag if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-usa-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": []  # No COI tags
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

### Test 4: Exclusive COI (Alpha) - User Has Exact Tag ✅
```rego
test_allow_alpha_exclusive_with_tag if {
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

### Test 5: EUCOM - USA User with No COI ✅
```rego
test_allow_eucom_usa_country_based if {
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
# Expected: ALLOW (USA is in EUCOM membership AND releasabilityTo)
```

### Test 6: EUCOM - FRA User with No COI ✅
```rego
test_allow_eucom_fra_country_based if {
    authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-fra-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "FRA",
            "acpCOI": []  # No COI tags
        },
        "resource": {
            "resourceId": "doc-eucom-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "FRA"],
            "COI": ["EUCOM"]  # EUCOM = {USA, DEU, GBR, FRA, ITA, ESP, POL}
        },
        "context": {}
    }
}
# Expected: ALLOW (FRA is in EUCOM membership AND releasabilityTo)
```

### Test 7: EUCOM - CAN User with No COI ❌
```rego
test_deny_eucom_can_not_in_membership if {
    not authorization.allow with input as {
        "subject": {
            "authenticated": true,
            "uniqueID": "testuser-can-1",
            "clearance": "SECRET",
            "countryOfAffiliation": "CAN",
            "acpCOI": []  # No COI tags
        },
        "resource": {
            "resourceId": "doc-eucom-001",
            "classification": "SECRET",
            "releasabilityTo": ["USA", "CAN"],  # CAN in releasabilityTo BUT...
            "COI": ["EUCOM"]  # EUCOM = {USA, DEU, GBR, FRA, ITA, ESP, POL} - CAN NOT included
        },
        "context": {}
    }
}
# Expected: DENY (CAN not in EUCOM membership, even though in releasabilityTo)
```

## Implementation Steps

1. **Update `fuel_inventory_abac_policy.rego`**:
   - Replace current `is_coi_violation` logic (lines 622-693)
   - Add distinction between country-based and exclusive COIs
   - Add country membership check for users without COI tags

2. **Update `federation_abac_policy.rego`**:
   - Replace simple intersection check (lines 174-181)
   - Apply same logic as `fuel_inventory_abac_policy.rego` for consistency

3. **Add Test Cases**:
   - Add all test cases above to `policies/tests/fuel_inventory_test.rego`
   - Verify existing tests still pass
   - Add tests for edge cases (multiple COIs, operators)

4. **Database Audit**:
   - Query MongoDB for resources with EUCOM COI
   - Verify releasabilityTo matches EUCOM membership
   - Fix any mismatches found

## Summary

**Current State**: 
- ❌ Users without COI can access ANY resource (bypasses COI restrictions)
- ❌ No distinction between country-based and exclusive COIs
- ❌ Inconsistent logic between `fuel_inventory_abac_policy.rego` and `federation_abac_policy.rego`

**Required State**:
- ✅ Country-based COIs: Allow if user has COI tag OR country is in COI membership
- ✅ Exclusive COIs: Require exact COI tag match (no country fallback)
- ✅ Consistent logic across all policies



