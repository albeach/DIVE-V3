# COI Logic Review Summary

## Executive Summary

After reviewing the COI authorization logic, I've identified **3 critical issues** that need to be addressed:

1. ❌ **Users without COI can bypass COI restrictions** - Current logic allows access if user has no COI tags
2. ❌ **No distinction between country-based and exclusive COIs** - Alpha/Beta/Gamma treated same as FVEY/NATO
3. ❌ **Inconsistent logic between policies** - `fuel_inventory_abac_policy.rego` vs `federation_abac_policy.rego`

## Current Test Results

✅ **All 54 existing tests PASS** - but they don't cover the edge cases you identified.

## Key Findings

### Finding 1: EUCOM Definition ✅ CORRECT

**Policy Definition** (`coi_coherence_policy.rego:49`):
```rego
"EUCOM": {"USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"}
```

**Status**: ✅ USA is correctly included in EUCOM membership.

**Recommendation**: If you found resources where EUCOM doesn't include USA, those are **data issues** (incorrect resource metadata), not policy issues. We should audit the database.

### Finding 2: Users Without COI Can Access ANY Resource ❌

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
- Expected: ✅ ALLOW (but for correct reason: USA is in FVEY={USA,GBR,CAN,AUS,NZL})

**But also**:
- Resource: `COI=["Alpha"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]` (no COI)
- Current: ✅ ALLOW (incorrect - Alpha requires explicit tag)
- Expected: ❌ DENY (Alpha has no country membership, requires explicit Alpha tag)

### Finding 3: No Distinction Between COI Types ❌

**Current Logic**: Treats all COIs the same - if user has no COI tags, allows access.

**Required Logic**:
- **Country-based COIs** (FVEY, NATO, EUCOM, etc.): Allow if user's country is in COI membership
- **Exclusive COIs** (Alpha, Beta, Gamma): Require exact COI tag match (no country fallback)

### Finding 4: Inconsistent Policy Logic ❌

**`fuel_inventory_abac_policy.rego`**:
- Allows users without COI to access resources with COI (lines 638-642)

**`federation_abac_policy.rego`**:
- Requires COI intersection (lines 174-181)
- Doesn't allow country-based fallback

**Problem**: Two different policies, two different behaviors.

## Recommended Fix

### Updated `is_coi_violation` Logic

```rego
# COIs with no country affiliation (membership-based only)
no_affiliation_cois := {"Alpha", "Beta", "Gamma"}

is_coi_violation := msg if {
    # Case 1: Resource has no COI requirement - no violation
    count(input.resource.COI) == 0
    msg := ""  # Empty means no violation
} else := msg if {
    # Case 2: Resource has exclusive COI (Alpha/Beta/Gamma) - requires exact tag match
    count(input.resource.COI) > 0
    some resource_coi in input.resource.COI
    resource_coi in no_affiliation_cois
    
    # User MUST have this exact COI tag (no country fallback)
    user_coi := object.get(input.subject, "acpCOI", [])
    not resource_coi in user_coi
    
    msg := sprintf("Resource requires exclusive COI membership: %s (user COI: %v, no country fallback)", [
        resource_coi,
        user_coi
    ])
} else := msg if {
    # Case 3: Resource has country-based COI - check tag match OR country membership
    count(input.resource.COI) > 0
    
    user_coi := object.get(input.subject, "acpCOI", [])
    user_country := input.subject.countryOfAffiliation
    operator := object.get(input.resource, "coiOperator", "ALL")
    
    # Check COI tag match
    has_coi_tag_match := check_coi_tag_match(user_coi, input.resource.COI, operator)
    
    # Check country-based access
    coi_country_union := {c |
        some resource_coi in input.resource.COI
        not resource_coi in no_affiliation_cois
        some c in coi_members[resource_coi]
    }
    has_country_access := user_country in coi_country_union && user_country in input.resource.releasabilityTo
    
    # Deny if neither tag match NOR country access
    not has_coi_tag_match
    not has_country_access
    
    msg := sprintf("COI violation: no tag match (%v) and country %s not in COI membership %v or releasabilityTo %v", [
        user_coi,
        user_country,
        coi_country_union,
        input.resource.releasabilityTo
    ])
}

# Helper function
check_coi_tag_match(user_coi, resource_coi, operator) := true if {
    operator == "ALL"
    required := {c | some c in resource_coi}
    has := {c | some c in user_coi}
    count(required - has) == 0
} else := true if {
    operator == "ANY"
    required := {c | some c in resource_coi}
    has := {c | some c in user_coi}
    count(required & has) > 0
} else := false
```

## Test Cases to Verify Requirements

### Requirement 1: COIs with Countries - Strict Enforcement

**Test**: EUCOM with USA user (no COI tag)
- Resource: `COI=["EUCOM"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]`
- Expected: ✅ ALLOW (USA is in EUCOM membership)

**Test**: EUCOM with CAN user (no COI tag)
- Resource: `COI=["EUCOM"]`, `releasabilityTo=["USA", "CAN"]`
- User: `country="CAN"`, `acpCOI=[]`
- Expected: ❌ DENY (CAN not in EUCOM membership, even though in releasabilityTo)

### Requirement 2: Users with No COI - Country-Based Access

**Test**: FVEY with USA user (no COI tag)
- Resource: `COI=["FVEY"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]`
- Expected: ✅ ALLOW (USA is in FVEY membership AND releasabilityTo)

**Test**: FVEY with FRA user (no COI tag)
- Resource: `COI=["FVEY"]`, `releasabilityTo=["USA", "FRA"]`
- User: `country="FRA"`, `acpCOI=[]`
- Expected: ❌ DENY (FRA not in FVEY membership, even though in releasabilityTo)

### Requirement 3: Exclusive COIs - No Country Fallback

**Test**: Alpha with USA user (no COI tag)
- Resource: `COI=["Alpha"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=[]`
- Expected: ❌ DENY (Alpha requires explicit Alpha tag, no country fallback)

**Test**: Alpha with Alpha user
- Resource: `COI=["Alpha"]`, `releasabilityTo=["USA"]`
- User: `country="USA"`, `acpCOI=["Alpha"]`
- Expected: ✅ ALLOW (user has Alpha tag)

## Implementation Plan

1. **Update `fuel_inventory_abac_policy.rego`** (lines 622-693)
   - Replace current `is_coi_violation` logic
   - Add distinction between country-based and exclusive COIs
   - Add country membership check

2. **Update `federation_abac_policy.rego`** (lines 174-181)
   - Apply same logic for consistency

3. **Add Test Cases**
   - Add all test cases from `COI_LOGIC_RECOMMENDATIONS.md`
   - Verify existing tests still pass
   - Test edge cases

4. **Database Audit**
   - Query for resources with EUCOM COI
   - Verify releasabilityTo matches EUCOM membership
   - Fix any mismatches

## Files Created

1. `backend/src/__tests__/COI_LOGIC_ANALYSIS.md` - Detailed analysis
2. `backend/src/__tests__/COI_LOGIC_RECOMMENDATIONS.md` - Implementation recommendations with test cases
3. `backend/src/__tests__/COI_LOGIC_SUMMARY.md` - This summary document

## Next Steps

1. Review the recommendations
2. Approve the updated logic
3. Implement the fixes
4. Add comprehensive test cases
5. Run full test suite
6. Audit database for EUCOM resources









