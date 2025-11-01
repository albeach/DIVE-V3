# Upload Error Diagnosis - Docker Logs Analysis

**Date**: November 1, 2025  
**Issue**: Random upload failures  
**Status**: ⚠️ **CRITICAL BUG IDENTIFIED**

---

## 🔍 Docker Logs Analysis

### Upload Attempt #1: OPA Authorization Denial

**Request**: `req-1761996188958-6cket`  
**Time**: 11:23:08 UTC  
**File**: Dumb.jpg (356KB JPEG)  
**Classification**: TOP_SECRET  
**ReleasabilityTo**: ["USA", "ESP", "CAN"]  
**User**: admin@dive-v3.pilot (TOP_SECRET clearance, USA)

**Result**: ❌ **ACCESS DENIED by OPA**

```json
{
  "allow": false,
  "classification": "TOP_SECRET",
  "reason": "Access denied",
  "subject": "admin@dive-v3.pilot"
}
```

**Impact**: Upload rejected at authorization layer (correct behavior if policy denies)

---

### Upload Attempt #2: COI Validation Failure (CRITICAL BUG)

**Request**: `req-1761996223369-jz3lvm`  
**Time**: 11:23:43 UTC  
**File**: Dumb.jpg (356KB JPEG)  
**Classification**: TOP_SECRET  
**ReleasabilityTo**: ["ESP", "USA"]  
**COI**: [] (empty - no COI tags specified)  
**User**: admin@dive-v3.pilot

**OPA Authorization**: ✅ **GRANTED**
```json
{
  "allow": true,
  "reason": "Access granted - all conditions satisfied"
}
```

**Upload Process**: ✅ **SUCCESSFUL**
- File validated
- ZTDF object created
- Resource saved to MongoDB
- ENCRYPT event logged

**BUT THEN**: ❌ **CRASH AFTER UPLOAD COMPLETED**

```
Error: COI validation failed: Releasability countries [ESP, USA] not in COI union []
    at validateCOICoherenceOrThrow (/app/src/services/coi-validation.service.ts:326:15)
```

**Critical Details**:
```json
{
  "errors": ["Releasability countries [ESP, USA] not in COI union []"],
  "warnings": ["Empty COI list (no COI-based key encryption)"]
}
```

---

## 🐛 Root Cause Analysis

### Bug Location
- **File**: `backend/src/services/coi-validation.service.ts`
- **Line**: 326
- **Function**: `validateCOICoherenceOrThrow()`

### The Problem

**When COI is empty** (`COI: []`):
1. Upload succeeds (OPA allows)
2. File is encrypted and stored
3. **COI validation runs AFTER upload completes**
4. Validation checks: "Are releasabilityTo countries in COI union?"
5. **COI union is empty** (because no COI tags specified)
6. **Validation fails**: "ESP, USA not in empty COI union"
7. **Process crashes** with unhandled error

### Logic Error

The validation is too strict:
- If user doesn't specify COI tags, COI union is empty
- Validation requires releasability countries to be in COI union
- But empty COI should mean "no COI restrictions"
- Should NOT require countries to be in an empty union

### Expected Behavior

**When COI is empty**:
- Option A: Skip COI validation entirely
- Option B: Allow any releasability countries
- Option C: Use default COI based on releasability countries

**Current Behavior** (WRONG):
- Requires releasability countries to be in empty COI union
- Crashes after successful upload
- Leaves orphaned ZTDF resource in database

---

## 📊 Impact Assessment

### Severity: ⚠️ **HIGH**

**Affected Scenarios**:
- Any upload without COI tags specified
- Uploads with releasabilityTo but empty COI
- Most common use case (users don't always specify COI)

**Consequences**:
1. Upload appears successful (file stored)
2. Backend crashes after upload
3. User may not see error (async crash)
4. Orphaned resources in database
5. Backend service may restart (Docker)

**Frequency**: **Random/Intermittent**
- Depends on whether user specifies COI tags
- If COI specified: Works
- If COI empty: Crashes

---

## 🔍 Detailed Log Trace

### Successful Part (Upload Completes)

```
11:23:43.623 - Upload authorization decision: ALLOW
11:23:43.623 - Processing file upload
11:23:43.624 - COI validation passed  ← WRONG: Passes here
11:23:43.630 - Encrypting with COI key: US-ONLY
11:23:43.633 - Created KAOs
11:23:43.634 - ZTDF object created
11:23:43.638 - ZTDF resource created  ← Resource saved to DB
11:23:43.638 - File upload successful
11:23:43.638 - ENCRYPT event logged
```

### Failure Part (Validation Runs Again)

```
11:23:43.702 - COI validation failed  ← CRASH HERE
{
  "errors": ["Releasability countries [ESP, USA] not in COI union []"],
  "warnings": ["Empty COI list (no COI-based key encryption)"]
}

Error: COI validation failed: Releasability countries [ESP, USA] not in COI union []
    at validateCOICoherenceOrThrow (/app/src/services/coi-validation.service.ts:326:15)
```

---

## 🛠️ Immediate Fix Required

### File: `backend/src/services/coi-validation.service.ts`

**Current Code** (Line 326):
```typescript
if (result.errors.length > 0) {
    throw new Error(`COI validation failed: ${result.errors.join('; ')}`);
}
```

**Problem**: Always throws when COI is empty and releasability specified

**Fix Option 1** - Skip validation when COI empty:
```typescript
// If no COI tags specified, skip COI coherence validation
if (resourceCOI.length === 0) {
    logger.info('Skipping COI validation - no COI tags specified');
    return {
        valid: true,
        errors: [],
        warnings: ['No COI tags - COI validation skipped']
    };
}

if (result.errors.length > 0) {
    throw new Error(`COI validation failed: ${result.errors.join('; ')}`);
}
```

**Fix Option 2** - Warn instead of throw:
```typescript
if (result.errors.length > 0) {
    logger.warn('COI validation warnings', { errors: result.errors });
    // Don't throw - allow upload to proceed
    return {
        valid: true,
        errors: [],
        warnings: result.errors
    };
}
```

**Fix Option 3** - Make error non-fatal:
```typescript
if (result.errors.length > 0 && resourceCOI.length > 0) {
    // Only throw if COI was specified but invalid
    throw new Error(`COI validation failed: ${result.errors.join('; ')}`);
}
```

---

## 🧪 Testing Scenarios

### Test Case 1: Upload Without COI (FAILING)
```json
{
  "classification": "TOP_SECRET",
  "releasabilityTo": ["USA", "ESP"],
  "COI": []  ← Empty COI
}
```
**Expected**: Upload succeeds  
**Actual**: Crashes with COI validation error  
**Status**: ❌ **FAILING**

### Test Case 2: Upload With COI (WORKING)
```json
{
  "classification": "TOP_SECRET",
  "releasabilityTo": ["USA"],
  "COI": ["US-ONLY"]  ← COI specified
}
```
**Expected**: Upload succeeds  
**Actual**: Upload succeeds  
**Status**: ✅ **WORKING**

### Test Case 3: Upload With Matching COI/Releasability (WORKING)
```json
{
  "classification": "SECRET",
  "releasabilityTo": ["USA", "CAN"],
  "COI": ["CAN-US"]  ← COI covers releasability
}
```
**Expected**: Upload succeeds  
**Actual**: Upload succeeds  
**Status**: ✅ **WORKING**

---

## 🔧 Recommended Solution

### Implement Fix Option 1 (RECOMMENDED)

**Rationale**:
- Most intuitive: No COI = no COI restrictions
- Clean separation: COI validation only when COI specified
- Backwards compatible: Existing uploads with COI still work
- Clear logging: Warns user when COI skipped

**Implementation**:
```typescript
// backend/src/services/coi-validation.service.ts
// Around line 315-330

export function validateCOICoherenceOrThrow(
    releasabilityTo: string[],
    resourceCOI: string[]
): void {
    // If no COI tags specified, skip COI coherence validation
    if (!resourceCOI || resourceCOI.length === 0) {
        logger.info('COI validation skipped - no COI tags specified', {
            releasabilityTo,
            note: 'Upload allowed without COI restrictions'
        });
        return;
    }

    // Perform COI validation only when COI tags present
    const result = validateCOICoherence(releasabilityTo, resourceCOI);
    
    if (result.errors.length > 0) {
        logger.error('COI validation failed', {
            releasabilityTo,
            resourceCOI,
            errors: result.errors
        });
        throw new Error(`COI validation failed: ${result.errors.join('; ')}`);
    }

    logger.info('COI validation passed', {
        releasabilityTo,
        resourceCOI
    });
}
```

---

## 📋 Action Items

### Immediate (CRITICAL)
1. ✅ Diagnose issue (COMPLETE - this document)
2. ⏳ Fix COI validation logic (fix empty COI case)
3. ⏳ Test upload without COI tags
4. ⏳ Test upload with COI tags (regression)
5. ⏳ Deploy fix to backend

### Short-term
1. ⏳ Add validation earlier in upload flow
2. ⏳ Improve error messages to user
3. ⏳ Add unit tests for empty COI case
4. ⏳ Document COI validation logic

### Long-term
1. ⏳ Review all validation services for similar issues
2. ⏳ Add comprehensive upload integration tests
3. ⏳ Consider making COI optional in UI
4. ⏳ Add better error handling/recovery

---

## 🎯 Success Criteria

### After Fix Applied
- [ ] Upload without COI succeeds
- [ ] Upload with COI succeeds (regression)
- [ ] No crashes in backend logs
- [ ] User sees success message
- [ ] Resource appears in resource list
- [ ] No orphaned resources in database

---

## 📊 Summary

### What's Broken
- **COI validation throws error when COI is empty**
- Happens AFTER upload completes
- Leaves orphaned resources
- Backend crashes

### Why It's Broken
- Validation checks if releasability countries in COI union
- When COI empty, union is empty
- Empty array never contains releasability countries
- Logic error: empty COI should mean "no restrictions"

### How to Fix
- Skip COI validation when COI array is empty
- OR treat empty COI as "allow all"
- Add early return before validation logic
- Log warning instead of throwing error

### Impact
- **High severity**: Affects common use case
- **Random/intermittent**: Depends on user input
- **Data corruption**: Orphaned resources
- **Poor UX**: Silent failures

---

**Status**: ⚠️ **BUG IDENTIFIED - FIX REQUIRED**  
**Priority**: **CRITICAL** - Blocks upload functionality  
**ETA**: 15-30 minutes to implement and test fix

