# RESTRICTED Classification Styling Fix

**Date**: November 10, 2025  
**Issue**: RESTRICTED classification missing blue badge styling  
**Severity**: Visual/UX bug

## Problem

The RESTRICTED classification level was missing from multiple frontend components, causing documents with RESTRICTED classification to display with default gray styling instead of the proper **blue badge with 🔵 circle** like other classifications.

**Before:**
- ✅ UNCLASSIFIED: Green badge 🟢
- ❌ RESTRICTED: Gray/no styling (missing!)
- ✅ CONFIDENTIAL: Yellow badge 🟡
- ✅ SECRET: Orange badge 🟠
- ✅ TOP SECRET: Red badge 🔴

## Root Cause

When RESTRICTED was added as a classification level (between UNCLASSIFIED and CONFIDENTIAL per NATO ACP-240), it was added to:
- ✅ Backend policies and validation
- ✅ Resource filters component
- ✅ Upload form
- ❌ **Not added** to 7+ frontend display components

This caused RESTRICTED documents to render without proper visual styling.

## Solution

Added RESTRICTED with blue styling to **8 components**:

### 1. **Resource Card** (`advanced-resource-card.tsx`)
```typescript
const classificationColors = {
  'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }, // ⬅️ ADDED
  'CONFIDENTIAL': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'SECRET': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'TOP_SECRET': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

const classificationEmojis = {
  'UNCLASSIFIED': '🟢',
  'RESTRICTED': '🔵', // ⬅️ ADDED
  'CONFIDENTIAL': '🟡',
  'SECRET': '🟠',
  'TOP_SECRET': '🔴',
};

const clearanceOrder = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']; // ⬅️ ADDED
```

### 2. **Security Label Form** (`upload/security-label-form.tsx`)
```typescript
const classificationColors = {
  'UNCLASSIFIED': 'bg-green-50 text-green-900 border-green-300',
  'RESTRICTED': 'bg-blue-50 text-blue-900 border-blue-300', // ⬅️ ADDED
  // ...
};

const classificationAccents = {
  'UNCLASSIFIED': 'from-green-500 to-green-600',
  'RESTRICTED': 'from-blue-500 to-blue-600', // ⬅️ ADDED
  // ...
};
```

### 3. **Advanced Search** (`resources/advanced-search.tsx`)
```typescript
const classifications = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']; // ⬅️ ADDED
```

### 4. **Access Denied Page** (`authz/access-denied.tsx`)
```typescript
const classificationColors = {
  'UNCLASSIFIED': { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-900', glow: 'shadow-green-200' },
  'RESTRICTED': { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-900', glow: 'shadow-blue-200' }, // ⬅️ ADDED
  // ...
};
```

### 5. **Resource Analytics Dashboard** (`admin/dashboard/resource-analytics.tsx`)
```typescript
const classificationColors = {
  'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-700' },
  'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-700' }, // ⬅️ ADDED
  // ...
};
```

### 6. **Policies Lab Evaluate Tab** (`policies-lab/EvaluateTab.tsx`)
```typescript
const clearanceLevels = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']; // ⬅️ ADDED
```

### 7. **IdP MFA Config Panel** (`admin/IdPMFAConfigPanel.tsx`)
```typescript
type ClearanceLevel = 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET'; // ⬅️ ADDED

// In the UI:
{(['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'] as ClearanceLevel[]).map((level) => (
  // ...
))}
```

## Color Scheme

RESTRICTED now uses **blue styling** to differentiate it from other levels:

| Classification | Color | Emoji | Hex/Tailwind |
|----------------|-------|-------|--------------|
| UNCLASSIFIED | Green | 🟢 | `green-100/800` |
| **RESTRICTED** | **Blue** | **🔵** | **`blue-100/800`** |
| CONFIDENTIAL | Yellow | 🟡 | `yellow-100/800` |
| SECRET | Orange | 🟠 | `orange-100/800` |
| TOP SECRET | Red | 🔴 | `red-100/800` |

**Rationale**: Blue is visually distinct from green (UNCLASSIFIED) and yellow (CONFIDENTIAL), making it easy to identify RESTRICTED documents at a glance.

## NATO ACP-240 Compliance

RESTRICTED is a valid NATO classification level per **ACP-240 Section 3.2**:
- **UNCLASSIFIED** (NATO UNCLASSIFIED)
- **RESTRICTED** (NATO RESTRICTED) ← Between UNCLASS and CONFIDENTIAL
- **CONFIDENTIAL** (NATO CONFIDENTIAL)
- **SECRET** (NATO SECRET)
- **TOP SECRET** (COSMIC TOP SECRET)

## Testing

1. **Navigate to resources page**: `https://dev-app.dive25.com/resources`
2. **Find a RESTRICTED document**
3. **Expected**: 
   - ✅ Blue badge background
   - ✅ Blue 🔵 circle icon
   - ✅ Blue border
   - ✅ Consistent with other classification badges

4. **Also test**:
   - Upload form classification selector
   - Access denied page (if you get denied on a RESTRICTED doc)
   - Admin dashboard analytics
   - Policies Lab evaluation

## Files Modified

1. `frontend/src/components/resources/advanced-resource-card.tsx` (lines 50-64, 88)
2. `frontend/src/components/upload/security-label-form.tsx` (lines 163-177)
3. `frontend/src/components/resources/advanced-search.tsx` (line 123)
4. `frontend/src/components/authz/access-denied.tsx` (lines 339-345)
5. `frontend/src/components/admin/dashboard/resource-analytics.tsx` (lines 77-83)
6. `frontend/src/components/policies-lab/EvaluateTab.tsx` (line 281)
7. `frontend/src/components/admin/IdPMFAConfigPanel.tsx` (lines 37, 193)

## Prevention

When adding new classification levels in the future:
1. ✅ Add to backend validation
2. ✅ Add to OPA policies
3. ✅ Add to **all** frontend display components:
   - Resource cards
   - Filters
   - Upload forms
   - Admin dashboards
   - Access denied pages
   - Search components
4. ✅ Choose a distinct color that's not already used
5. ✅ Add to clearance hierarchy arrays
6. ✅ Test visually across all pages

## Related Issues

None - this was a visual bug that didn't affect authorization or security logic. RESTRICTED documents were still being properly authorized by the backend/OPA, they just didn't have the correct visual styling in the UI.

## Notes

- The backend and OPA policies **already correctly handled RESTRICTED** - this was purely a frontend styling issue
- RESTRICTED is typically used by some NATO partners and Commonwealth countries
- The clearance hierarchy is: UNCLASSIFIED ≤ RESTRICTED < CONFIDENTIAL < SECRET < TOP SECRET
- Per ACP-240, RESTRICTED is treated as approximately equal to UNCLASSIFIED for dominance checks in some scenarios




