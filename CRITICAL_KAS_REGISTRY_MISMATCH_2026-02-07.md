# CRITICAL ISSUE: KAS Registry SSOT Mismatch

**Date**: 2026-02-07  
**Severity**: CRITICAL  
**Impact**: KAS services cannot communicate - federation broken

---

## 🔥 Problem

FRA KAS logs show:
```
Found 0 approved spokes in MongoDB
KAS registry loaded from MongoDB: totalSpokes: 0, loadedCount: 0
```

But MongoDB **HAS** the KAS data:
```javascript
db.kas_registry.find()
// Returns: { kasId: "fra-kas", status: "active", kasUrl: "https://localhost:10010", ... }
```

---

## 🐛 Root Cause

**Collection Name Mismatch**:

KAS Code (`kas/src/utils/mongo-kas-registry-loader.ts:29`):
```typescript
const COLLECTION_NAME = 'federation_spokes';  // ❌ Looking here
```

Actual Data Location:
```javascript
db.kas_registry.find()  // ✅ Data is here
```

**Status Field Mismatch**:

KAS Code (line 111):
```typescript
.find({ status: 'approved' })  // ❌ Looking for 'approved'
```

Actual Data:
```javascript
{ status: 'active' }  // ✅ Data has 'active'
```

---

## 📊 Current State

### What Exists:
1. ✅ `kas_registry` collection - populated by deployment via `/api/kas/register`
2. ✅ FRA KAS entry with `status: 'active'`

### What's Missing:
1. ❌ `federation_spokes` collection - doesn't exist
2. ❌ No data with `status: 'approved'`

### Result:
- KAS loads 0 spokes
- Federation cannot work
- Cross-spoke key release impossible

---

## 🎯 Solution Options

### Option 1: Change KAS to use `kas_registry` (RECOMMENDED)
```typescript
// kas/src/utils/mongo-kas-registry-loader.ts:29
-const COLLECTION_NAME = 'federation_spokes';
+const COLLECTION_NAME = 'kas_registry';

// Line 111
-.find({ status: 'approved' })
+.find({ status: 'active' })
```

**Pros**:
- Uses existing data
- No migration needed
- Matches deployment scripts

**Cons**:
- Deviates from original design intent

### Option 2: Populate `federation_spokes` from `kas_registry`
- Create migration script
- Sync `kas_registry` → `federation_spokes`
- Map `active` → `approved`

**Pros**:
- Aligns with original SSOT design
- Separates KAS registry from spoke registry

**Cons**:
- More complex
- Requires migration
- Dual maintenance

### Option 3: Backend API that syncs both collections
- Update `/api/kas/register` to write to both
- Maintain consistency automatically

---

## 🔍 Investigation Needed

1. **Is `federation_spokes` supposed to be in PostgreSQL Hub?**
   - Check Hub orchestration DB for federation tables
   - Result: No federation tables in PostgreSQL

2. **Should spokes load from Hub or local MongoDB?**
   - Current: Each spoke loads from its own MongoDB
   - Design intent: Unclear if centralized or distributed

3. **What's the SSOT architecture?**
   - KAS registry per spoke?
   - Centralized Hub registry?
   - Hybrid (local + remote)?

---

## ⚠️ Impact

**Current State**:
- FRA KAS: Running but empty registry (0 spokes)
- Cross-spoke federation: Broken
- Key release: Cannot work

**User Experience**:
- FRA users cannot access USA resources
- USA users cannot access FRA resources
- KAS returns "no trusted spokes" errors

---

## 🚀 Recommended Fix

**Immediate (Option 1)**:
1. Change collection name: `federation_spokes` → `kas_registry`
2. Change status filter: `approved` → `active`
3. Test FRA KAS loads itself
4. Test Hub-Spoke key release

**Long-term**:
- Document SSOT architecture clearly
- Decide: per-spoke or centralized registry
- Standardize collection names across codebase

---

**Status**: BLOCKING ISSUE - Federation cannot work until fixed
