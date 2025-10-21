# COI Superset Logic Fix

## Problem
User with **FVEY** COI cannot access documents tagged with **CAN-US** COI, even though FVEY is a superset that includes both Canada and USA.

Current behavior: Strict tag matching (user must have exact COI tag)
Expected behavior: Superset matching (FVEY should satisfy CAN-US, GBR-US, etc.)

## Root Cause
The OPA policy checks for exact COI tag matches:
```rego
is_coi_violation := msg if {
    operator == "ALL"
    required := {coi | some coi in input.resource.COI}
    has := {coi | some coi in user_coi}
    missing := required - has  # String matching, not membership matching
    count(missing) > 0
}
```

## Solution Options

### Option 1: Country Membership Matching (RECOMMENDED)
Instead of matching COI tags, match the **country memberships**:
- User COI: FVEY → {USA, GBR, CAN, AUS, NZL}
- Resource COI: CAN-US → {CAN, USA}
- Check: {USA, GBR, CAN, AUS, NZL} ⊇ {CAN, USA} ✓ ALLOW

### Option 2: Explicit Superset Rules
Define explicit relationships:
- FVEY satisfies: CAN-US, GBR-US, AUKUS
- NATO satisfies: any NATO member bilateral

### Option 3: Hierarchical COI (Complex)
Define COI hierarchy tree and traverse

## Chosen Solution: Country Membership Matching

This aligns with real-world coalition access control: if you're cleared for FVEY intelligence, you can access CAN-US bilateral intelligence.

## Implementation

Modify `is_coi_violation` in `fuel_inventory_abac_policy.rego`:

```rego
is_coi_violation := msg if {
    count(input.resource.COI) > 0
    user_coi := object.get(input.subject, "acpCOI", [])
    operator := object.get(input.resource, "coiOperator", "ALL")
    
    operator == "ALL"
    
    # Compute country memberships
    required_countries := {c | some coi in input.resource.COI; some c in coi_members[coi]}
    user_countries := {c | some coi in user_coi; some c in coi_members[coi]}
    
    # Check if user countries is a superset of required countries
    missing_countries := required_countries - user_countries
    count(missing_countries) > 0
    
    msg := sprintf("User countries %v do not cover required countries %v (missing: %v)", [
        user_countries, required_countries, missing_countries
    ])
}
```

## Impact
- ✅ User with FVEY can access CAN-US, GBR-US, AUKUS documents
- ✅ User with NATO-COSMIC can access any NATO member documents
- ✅ Maintains security: US-ONLY still requires US-ONLY (not satisfied by FVEY)
- ⚠️ May allow unintended access if COI memberships overlap unexpectedly

## Alternative: Keep Strict Matching
If policy requires exact COI tag matching (for compartmentalization), then:
- Users need **both** FVEY and CAN-US tags explicitly
- Documents should be tagged with broadest applicable COI (FVEY, not CAN-US)

**Recommendation: Use country membership matching for flexibility.**

