# Static Clearance Mapping Files - Archived

**Date**: 2026-01-27
**Archived By**: AI Assistant (with user approval)
**Reason**: Duplicate of database-driven clearance normalization system

---

## Archived Files

### 1. frontend/src/data/nato-attribute-mappings.json
**Original Location**: `frontend/src/data/nato-attribute-mappings.json`
**New Location**: `.archived/static-clearance-mappings-20260127/nato-attribute-mappings.json`
**Size**: 691 lines
**Content**: 32-nation clearance equivalency mappings

### 2. keycloak/mapper-templates/nato-attribute-mappings.json
**Original Location**: `keycloak/mapper-templates/nato-attribute-mappings.json`
**New Location**: `.archived/static-clearance-mappings-20260127/keycloak-mapper-nato-attribute-mappings.json`
**Size**: 691 lines
**Content**: Identical to file #1

---

## Why Archived

### Problem: Multiple Sources of Truth
Before archival, the system had **3 sources** for clearance mappings:
1. ❌ `frontend/src/data/nato-attribute-mappings.json` (static)
2. ❌ `keycloak/mapper-templates/nato-attribute-mappings.json` (static duplicate)
3. ✅ `backend/src/services/clearance-mapper.service.ts` (TypeScript SSOT)
4. ✅ MongoDB `clearance_equivalency` collection (runtime storage)

**Risk**: Static files could drift out of sync with backend/database

### Solution: Single Source of Truth
After archival, the system has **1 source** for clearance mappings:
1. ✅ `backend/src/services/clearance-mapper.service.ts` (TypeScript SSOT)
   - 32 NATO nations + partners
   - Estonian: SALAJANE → SECRET, etc.
   - Handles diacritics, bilingual, Cyrillic
2. ✅ MongoDB `clearance_equivalency` collection
   - Initialized from TypeScript SSOT
   - Runtime storage for performance
   - Admin API for updates

---

## Impact Analysis

### ✅ No Frontend Impact
**Search Result**: No imports found
```bash
$ grep -r "nato-attribute-mappings" frontend/src/
# No results
```

Frontend gets clearance data from backend API, not static files.

### ✅ No Backend Impact
Backend never used these JSON files - uses TypeScript + MongoDB.

### ⚠️ One Comment Reference
**File**: `scripts/dive-modules/federation-link.sh:647`
**Text**: `# Localized attributes are based on nato-attribute-mappings.json (SSOT)`

**Action Needed**: Update comment to reference backend TypeScript instead

---

## Current Architecture (After Archival)

```
┌─────────────────────────────────────┐
│  Backend TypeScript SSOT            │
│  clearance-mapper.service.ts        │
│  - 32 nation mappings               │
│  - EST: SALAJANE → SECRET           │
└──────────────┬──────────────────────┘
               │ initialize
               ↓
┌─────────────────────────────────────┐
│  MongoDB                            │
│  clearance_equivalency collection   │
│  - Runtime storage                  │
│  - Fast lookups                     │
└──────────────┬──────────────────────┘
               │ API
               ↓
┌─────────────────────────────────────┐
│  Frontend / Keycloak                │
│  - Gets data via API                │
│  - No static files                  │
└─────────────────────────────────────┘
```

---

## Restoration (If Needed)

If these files are needed for reference:

```bash
# Restore frontend file
cp .archived/static-clearance-mappings-20260127/nato-attribute-mappings.json \
   frontend/src/data/

# Restore Keycloak file
cp .archived/static-clearance-mappings-20260127/keycloak-mapper-nato-attribute-mappings.json \
   keycloak/mapper-templates/nato-attribute-mappings.json
```

**However**: The backend TypeScript + MongoDB system is the correct SSOT. Don't restore unless converting back to static files (not recommended).

---

## Related Files (Not Archived)

These files are **NOT clearance mappings** and remain in place:

1. ✅ `frontend/public/animations/clearance.json` - Lottie animation
2. ✅ `keycloak/user-profile-templates/*.json` - User profile schemas
3. ✅ `backend/data/opal/tenant_configs.json` - OPAL configuration
4. ✅ `keycloak/realms/archived/*` - Already archived historical data

---

## Benefits

1. ✅ **Single Source of Truth**: Backend TypeScript only
2. ✅ **No Sync Issues**: Can't have static files drift from database
3. ✅ **API-Driven**: Frontend/Keycloak get data from backend
4. ✅ **Maintainable**: Update one place (TypeScript → MongoDB)
5. ✅ **Clear Architecture**: Backend owns clearance normalization
6. ✅ **Historical Reference**: Archived files available if needed

---

## Maintenance

Going forward, to update clearance mappings:

1. **Update TypeScript SSOT**: `backend/src/services/clearance-mapper.service.ts`
2. **Re-initialize MongoDB**: Run `backend/src/scripts/initialize-clearance-equivalency.ts`
3. **Test**: Use admin API endpoints to verify mappings
4. **Deploy**: Backend change only, no frontend/Keycloak changes needed

---

**Status**: Archival complete ✅
**Files Removed**: 2
**System Impact**: None (files were unused duplicates)
