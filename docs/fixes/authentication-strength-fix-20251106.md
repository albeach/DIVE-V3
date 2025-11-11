# Authentication Strength Policy Fix - November 6, 2025

## Issue Summary

Users were experiencing "Authentication strength insufficient" errors due to inconsistent handling of ACR (Authentication Context Class Reference) and AMR (Authentication Methods Reference) values in the OPA policy.

## Root Cause

The OPA policy had two inconsistencies:

1. **Variable Ordering in `is_authentication_strength_insufficient`**: The policy was calling `lower(acr)` before converting ACR to a string with `sprintf()`. If ACR was passed as a non-string value (e.g., numeric or array), the `lower()` function would fail or behave unexpectedly.

2. **Inconsistent AMR Parsing**: The `is_authentication_strength_insufficient` rule correctly used `parse_amr()` to handle various AMR formats (arrays, JSON strings, single values), but the `is_mfa_not_verified` rule directly accessed `input.context.amr` without parsing. This meant:
   - If AMR was an array like `["pwd", "otp"]`, both checks worked correctly
   - If AMR was a JSON string like `"[\"pwd\",\"otp\"]"`, the first check parsed it correctly, but the second check tried to count string characters instead of array elements

## The Fix

### Change 1: Fixed ACR Conversion Order (Line 754-757)

**Before:**
```rego
acr := input.context.acr
acr_lower := lower(acr)
acr_str := sprintf("%v", [acr]) # Convert to string (handles numeric ACR)
```

**After:**
```rego
# Convert to string first to handle both numeric and string ACR values
acr_str := sprintf("%v", [input.context.acr])
acr_lower := lower(acr_str)
```

**Impact**: ACR is now safely converted to string before any string operations, handling numeric values (0, 1, 2) and string values ("0", "1", "2") consistently.

### Change 2: Fixed Error Message Variable Reference (Line 776-780)

**Before:**
```rego
msg := sprintf("Classification %v requires AAL2 (MFA), but ACR is '%v' and only %v factor(s) provided", [
    input.resource.classification,
    acr,  # ← Variable 'acr' no longer exists
    count(amr_factors),
])
```

**After:**
```rego
msg := sprintf("Classification %v requires AAL2 (MFA), but ACR is '%v' and only %v factor(s) provided", [
    input.resource.classification,
    acr_str,  # ← Now correctly references acr_str
    count(amr_factors),
])
```

**Impact**: Error messages now correctly display the ACR value.

### Change 3: Added AMR Parsing to `is_mfa_not_verified` (Line 796-798)

**Before:**
```rego
# Check AMR (Authentication Methods Reference)
amr := input.context.amr
count(amr) < 2
```

**After:**
```rego
# Check AMR (Authentication Methods Reference) - use parse_amr for consistency
amr_factors := parse_amr(input.context.amr)
count(amr_factors) < 2
```

**Impact**: AMR is now consistently parsed in both authentication strength checks, handling:
- Array format: `["pwd", "otp"]`
- JSON string format: `"[\"pwd\",\"otp\"]"`
- Single value format: `"pwd"`

### Change 4: Updated Error Message to Use Parsed AMR (Line 800-804)

**Before:**
```rego
msg := sprintf("MFA required for %v: need 2+ factors, got %v: %v", [
    input.resource.classification,
    count(amr),
    amr,
])
```

**After:**
```rego
msg := sprintf("MFA required for %v: need 2+ factors, got %v: %v", [
    input.resource.classification,
    count(amr_factors),
    amr_factors,
])
```

**Impact**: Error messages now correctly display the parsed AMR factors.

## Backend Data Format (For Reference)

The backend (`backend/src/middleware/authz.middleware.ts`) sends to OPA:

- **ACR**: String format `"0"`, `"1"`, `"2"` (normalized by `normalizeACR()` at line 1369)
  - `"0"` = AAL1 (password only)
  - `"1"` = AAL2 (multi-factor authentication)
  - `"2"` = AAL3 (hardware-backed authentication)

- **AMR**: Array format `["pwd"]`, `["pwd", "otp"]`, `["pwd", "webauthn"]` (normalized by `normalizeAMR()` at line 1370)

## Expected Behavior After Fix

1. **ACR "0" (AAL1) with 1 AMR factor** → Denied (correct: AAL1 insufficient for classified)
2. **ACR "0" (AAL1) with 2+ AMR factors** → Allowed (fallback: AMR indicates MFA)
3. **ACR "1" (AAL2) with any AMR** → Allowed (ACR indicates MFA)
4. **ACR "2" (AAL3) with any AMR** → Allowed (ACR indicates strong auth)
5. **Missing ACR, 1 AMR factor** → Denied (default AAL1 insufficient)
6. **Missing ACR, 2+ AMR factors** → Allowed (AMR indicates MFA)

## Testing Recommendations

1. **Test with numeric ACR**: Pass ACR as numeric values (0, 1, 2) instead of strings
2. **Test with array ACR**: Pass ACR as single-element array like `["1"]` (edge case)
3. **Test with JSON string AMR**: Pass AMR as `"[\"pwd\",\"otp\"]"` to verify parsing
4. **Test with single string AMR**: Pass AMR as `"pwd"` to verify wrapping in array

## Files Modified

- `policies/fuel_inventory_abac_policy.rego` (Lines 754-780, 796-804)

## Related Issues

- Backend normalizes ACR to numeric 0/1/2 before stringifying (line 1369-1371 in `authz.middleware.ts`)
- AMR normalization handles both array and JSON string formats (line 526-553 in `authz.middleware.ts`)
- OPA's `parse_amr()` helper provides robust parsing for backward compatibility (line 1009-1022 in `fuel_inventory_abac_policy.rego`)

## Compliance Impact

This fix ensures consistent enforcement of NIST SP 800-63B AAL2 requirements for classified resources across all authentication flows.






