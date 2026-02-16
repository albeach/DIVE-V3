# Phase 2C Continuation - Memory Leak Fixes Handoff

**Date**: 2026-02-16  
**Session Type**: Continuation (Phase 2C Sub-batch 2 onwards)  
**Priority**: HIGH - Critical memory leak mitigation  
**Status**: Phase 2C Sub-batch 1 Complete (21% total progress)

---

## EXECUTIVE SUMMARY

This session continues the systematic refactoring of MongoDB connection patterns across the DIVE V3 backend to eliminate memory leaks caused by per-request `new MongoClient()` instantiation. **Phase 2A and 2B are complete**, **Phase 2C Sub-batch 1 is complete**, and we are ready to proceed with **Phase 2C Sub-batch 2**.

### Current Progress
- ✅ **Phase 2A**: High-priority services (9/9 complete)
- ✅ **Phase 2B**: High-priority routes (3/3 complete)
- ✅ **Phase 2C Sub-batch 1**: Medium-priority services (3/8 complete)
- ⏳ **Phase 2C Sub-batch 2**: Next to complete (3 files)
- ⏳ **Phase 2C Sub-batch 3**: Final sub-batch (2 files)

### Impact to Date
- **15/71 MongoDB files refactored** (21% complete)
- **Estimated memory savings**: ~300-600 MB
- **Test infrastructure fixed**: 59 previously failing tests now pass (126/130 suites passing)
- **Zero regressions**: All refactored code compiles and tests pass

---

## CRITICAL CONTEXT: TEST INFRASTRUCTURE FIX

### The Problem We Solved
After refactoring services to use MongoDB singleton, **4 test suites broke** with 59 failing tests showing "MongoDB not connected" errors. This was a blocking issue for all future refactoring.

### Root Cause
Jest's `globalSetup` runs in a **separate Node.js process** from test workers. The MongoDB singleton was initialized in `globalSetup`, but that connection state didn't persist to test worker processes.

### Solution Implemented
Added MongoDB singleton initialization in `setupFilesAfterEnv` (`backend/src/__tests__/setup.ts`), which runs **inside each test worker**:

```typescript
// backend/src/__tests__/setup.ts
beforeAll(async () => {
    const { mongoSingleton } = await import('../utils/mongodb-singleton');
    if (!mongoSingleton.isConnected()) {
        await mongoSingleton.connect();
        console.log('[Test Worker] MongoDB singleton connected');
    }
}, 30000);
```

### Test Results After Fix
- ✅ 126/130 test suites passing (4 pre-existing failures)
- ✅ 3,619 tests passing
- ✅ 59 previously failing tests now pass

**This fix unblocked all future MongoDB refactoring work.**

---

## SESSION ACCOMPLISHMENTS

### Phase 2A: High-Priority Services ✅ COMPLETE
**Files Verified** (already refactored correctly):
1. ✅ `backend/src/services/policy-lab.service.ts`
2. ✅ `backend/src/services/gridfs.service.ts`
3. ✅ `backend/src/services/analytics.service.ts`

### Phase 2B: High-Priority Routes ✅ COMPLETE
**Files Refactored**:
1. ✅ `backend/src/routes/resource.routes.ts` - `/count` endpoint
2. ✅ `backend/src/routes/seed-status.routes.ts` - Replaced cached MongoClient
3. ✅ `backend/src/routes/activity.routes.ts` - Audit logs collection

**Additional Cleanup**:
- ✅ `backend/src/services/health.service.ts` - Removed `mongoClient` property, deprecated `setMongoClient()`
- ✅ `backend/src/services/opal-metrics.service.ts` - Removed stale `mongoClient.close()` logic
- ✅ `backend/src/services/resource.service.ts` - Removed deprecated SIGINT handler

### Phase 2C Sub-batch 1: Medium-Priority Services ✅ COMPLETE
**Files Refactored** (Commit: `ee1287dc`):
1. ✅ `backend/src/services/coi-key.service.ts`
   - Removed `cachedClient`/`cachedDb` variables
   - Replaced async `getCollection()` with synchronous version using `getDb()`
   - Deprecated `closeCOIKeyConnection()` - singleton manages lifecycle
   - **Tests**: PASS (46 tests passing)

2. ✅ `backend/src/services/idp-approval.service.ts`
   - Removed class properties `client` and `db`
   - Replaced async `connect()` method with direct `getDb()` calls
   - Deprecated `close()` method - no-op implementation
   - **Tests**: PASS

3. ✅ `backend/src/services/notification.service.ts`
   - Removed `connect()` method
   - Updated `collection()` and `prefsCollection()` to synchronous
   - Fixed `getAdminUsers()` to use `getDb()` directly
   - **Tests**: PASS

### Test Infrastructure Fixes ✅ COMPLETE
**Files Modified**:
1. ✅ `backend/src/__tests__/globalSetup.ts` - Initialize singleton for test workers
2. ✅ `backend/src/__tests__/globalTeardown.ts` - Close singleton on completion
3. ✅ `backend/src/__tests__/setup.ts` - Added `beforeAll` hook for worker-level connection

---

## PROVEN REFACTORING PATTERNS

### Pattern 1: Simple Function-Based Service
**Example**: `coi-key.service.ts`

```typescript
// ❌ OLD - Connection caching
import { MongoClient, Db, Collection } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function getMongoClient(): Promise<{ client: MongoClient; db: Db }> {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    const client = new MongoClient(getMongoDBUrl());
    await client.connect();
    const db = client.db(getMongoDBName());
    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

async function getCollection(): Promise<Collection> {
    const { db } = await getMongoClient();
    return db.collection('coi_definitions');
}

// ✅ NEW - Singleton pattern
import { Collection } from 'mongodb';
import { getDb } from '../utils/mongodb-singleton';

function getCollection(): Collection {
    const db = getDb();
    return db.collection('coi_definitions');
}
```

**Steps**:
1. Update imports: Remove `MongoClient`, add `getDb`
2. Remove cached variables: `cachedClient`, `cachedDb`
3. Remove connection functions: `getMongoClient()`
4. Update `getCollection()` to synchronous: `const db = getDb();`
5. Replace all `await getCollection()` with `getCollection()`
6. Deprecate close functions (no-op implementation)

### Pattern 2: Class-Based Service
**Example**: `idp-approval.service.ts`, `notification.service.ts`

```typescript
// ❌ OLD - Class with connection management
class MyService {
    private client: MongoClient | null = null;
    private db: Db | null = null;

    private async connect(): Promise<void> {
        if (this.client && this.db) return;
        this.client = new MongoClient(getMongoDBUrl());
        await this.client.connect();
        this.db = this.client.db(getMongoDBName());
    }

    private async getCollection(): Promise<Collection> {
        await this.connect();
        if (!this.db) throw new Error('Database not initialized');
        return this.db.collection('my_collection');
    }

    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
        }
    }
}

// ✅ NEW - Class using singleton
import { getDb } from '../utils/mongodb-singleton';

class MyService {
    private getCollection(): Collection {
        const db = getDb();
        return db.collection('my_collection');
    }

    async close(): Promise<void> {
        // No-op: MongoDB singleton manages connection lifecycle
    }
}
```

**Steps**:
1. Remove class properties: `client`, `db`
2. Remove `connect()` method entirely
3. Update `getCollection()` to synchronous with `getDb()`
4. Replace all `await this.getCollection()` with `this.getCollection()`
5. Update `close()` to no-op (keep for backward compatibility)

### Pattern 3: Route with Inline MongoDB Access
**Example**: `resource.routes.ts`, `seed-status.routes.ts`

```typescript
// ❌ OLD - Route creating connections
import { MongoClient } from 'mongodb';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';

router.get('/count', async (req, res) => {
    const client = new MongoClient(getMongoDBUrl());
    await client.connect();
    try {
        const db = client.db(getMongoDBName());
        const collection = db.collection('resources');
        const count = await collection.countDocuments();
        res.json({ count });
    } finally {
        await client.close();
    }
});

// ✅ NEW - Route using singleton
import { getDb } from '../utils/mongodb-singleton';

router.get('/count', async (req, res) => {
    const db = getDb();
    const collection = db.collection('resources');
    const count = await collection.countDocuments();
    res.json({ count });
});
```

**Steps**:
1. Remove `MongoClient`, `getMongoDBUrl`, `getMongoDBName` imports
2. Add `getDb` import from singleton
3. Replace connection creation with `const db = getDb();`
4. Remove `try/finally` with `client.close()`

---

## NEXT STEPS: PHASE 2C SUB-BATCH 2

### SMART Goal
**By end of session**: Refactor 3 medium-priority service files (audit-log, decision-log, clearance-mapper) with passing tests and commit.

**Time Estimate**: 45-60 minutes

### Files to Refactor (Sub-batch 2)

#### File 1: `backend/src/services/audit-log.service.ts`
**Complexity**: Medium (likely has connection caching)
**Pattern**: Function-based service
**Estimated Time**: 15 minutes

**Steps**:
1. Read file to understand current pattern
2. Check for `new MongoClient()` calls: `grep -n "new MongoClient" backend/src/services/audit-log.service.ts`
3. Apply Pattern 1 (Simple Function-Based Service)
4. Test: `npm test -- --testPathPattern="audit-log" --bail`

#### File 2: `backend/src/services/decision-log.service.ts`
**Complexity**: Medium (similar to audit-log)
**Pattern**: Function-based service
**Estimated Time**: 15 minutes

**Steps**:
1. Read file to understand current pattern
2. Check for `new MongoClient()` calls
3. Apply Pattern 1 (Simple Function-Based Service)
4. Test: `npm test -- --testPathPattern="decision-log" --bail`

#### File 3: `backend/src/services/clearance-mapper.service.ts`
**Complexity**: Medium (mapping logic)
**Pattern**: Function-based service
**Estimated Time**: 15 minutes

**Steps**:
1. Read file to understand current pattern
2. Check for `new MongoClient()` calls
3. Apply Pattern 1 (Simple Function-Based Service)
4. Test: `npm test -- --testPathPattern="clearance-mapper" --bail`

### Testing Strategy for Sub-batch 2

**Individual File Testing** (during refactoring):
```bash
npm test -- --testPathPattern="audit-log" --bail
npm test -- --testPathPattern="decision-log" --bail
npm test -- --testPathPattern="clearance-mapper" --bail
```

**Batch Testing** (after all 3 files complete):
```bash
npm test -- --testPathPattern="audit-log|decision-log|clearance-mapper" --bail
```

**Expected Results**:
- All tests pass
- Zero TypeScript compilation errors
- No new linter warnings

### Commit Strategy

After Sub-batch 2 passes all tests:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
git add backend/src/services/audit-log.service.ts \
        backend/src/services/decision-log.service.ts \
        backend/src/services/clearance-mapper.service.ts
        
git commit -m "$(cat <<'EOF'
fix(backend): Phase 2C Sub-batch 2 - Refactor audit-log, decision-log, clearance-mapper

Refactored three medium-priority services to use MongoDB singleton pattern:

Sub-batch 2 (3 files):
- audit-log.service.ts: Removed connection caching, replaced with getDb()
- decision-log.service.ts: Removed connection caching, replaced with getDb()
- clearance-mapper.service.ts: Removed connection caching, replaced with getDb()

Changes:
- Replaced new MongoClient() with getDb() singleton
- Removed connection caching logic (singleton handles this)
- Updated async getCollection() methods to synchronous
- Deprecated close() methods - singleton manages lifecycle

Test Results:
- X/X test suites passing
- X tests passing
- Zero compilation errors

Phase 2C Progress: 6/8 files complete (Sub-batch 2)

Refs: PHASE2_HANDOFF_SESSION_2026-02-16.md Section "Phase 2C"
EOF
)"
```

---

## PHASE 2C SUB-BATCH 3 (After Sub-batch 2)

### SMART Goal
**By end of session**: Refactor final 2 medium-priority service files (compliance-reporting, kas-metrics) and complete Phase 2C.

**Time Estimate**: 30 minutes

### Files to Refactor (Sub-batch 3)

#### File 1: `backend/src/services/compliance-reporting.service.ts`
**Complexity**: Medium (reporting queries)
**Pattern**: Function-based service
**Estimated Time**: 15 minutes

#### File 2: `backend/src/services/kas-metrics.service.ts`
**Complexity**: Medium (metrics collection)
**Pattern**: Function-based service
**Estimated Time**: 15 minutes

### Testing Strategy for Sub-batch 3

```bash
npm test -- --testPathPattern="compliance-reporting|kas-metrics" --bail
```

### Commit After Sub-batch 3

```bash
git commit -m "fix(backend): Phase 2C Sub-batch 3 - Complete medium-priority services

Completed final 2 medium-priority services:
- compliance-reporting.service.ts
- kas-metrics.service.ts

Phase 2C: ✅ COMPLETE (8/8 files)
Total Progress: 20/71 MongoDB files refactored (28%)
"
```

---

## PHASE 2D: FEDERATION SERVICES (After Phase 2C)

### SMART Goal
**By end of session**: Refactor 3 federation service files with special handling for local vs. remote instances.

**Time Estimate**: 1-2 hours

### Files to Refactor (Phase 2D)

1. `backend/src/services/federation-bootstrap.service.ts`
2. `backend/src/services/fra-federation.service.ts`
3. `backend/src/services/can-federation.service.ts`

### Special Considerations: Federation Pattern

**Federation services must distinguish between**:
- **Local instance queries**: Use singleton (`getDb()`)
- **Remote instance queries**: Use separate `MongoClient` (federated connections)

**Pattern Example** (from `federated-resource.service.ts`):

```typescript
// ✅ LOCAL instance (use singleton)
const db = getDb();
const localCollection = db.collection('resources');

// ✅ REMOTE instance (use separate client)
const remoteClient = new MongoClient(remoteMongoUrl);
await remoteClient.connect();
try {
    const remoteDb = remoteClient.db('dive-v3');
    const remoteCollection = remoteDb.collection('resources');
    // ... query remote instance
} finally {
    await remoteClient.close(); // Always close remote connections
}
```

**Key Rule**: Only use singleton for **local** database access. Remote federation connections must use separate `MongoClient` instances.

---

## PHASE 2E: REMAINING SCRIPTS AND MODELS

### Files to Refactor (28 files)

Located in:
- `backend/src/scripts/*.ts` (seeding, migrations, utilities)
- `backend/src/models/*.ts` (if any use direct MongoDB connections)
- Miscellaneous utility files

**Approach**: Process in batches of 5-7 files, test after each batch.

---

## PHASE 2F: FRONTEND USEEFFECT CLEANUP

### Goal
Fix 117 frontend files with uncleaned `setInterval`/`setTimeout` in `useEffect` hooks.

**Pattern**:
```typescript
// ❌ LEAKING
useEffect(() => {
  const interval = setInterval(() => {
    fetchData();
  }, 2000);
  // NO CLEANUP!
}, []);

// ✅ FIXED
useEffect(() => {
  const interval = setInterval(() => {
    fetchData();
  }, 2000);
  
  return () => {
    clearInterval(interval);
  };
}, []);
```

**High-Priority Frontend Files** (10):
1. `frontend/src/components/auth/token-expiry-checker.tsx`
2. `frontend/src/components/admin/dashboard/realtime-activity.tsx`
3. `frontend/src/hooks/use-session-heartbeat.ts`
4. `frontend/src/app/admin/logs/page.tsx`
5. `frontend/src/app/admin/dashboard/page.tsx`
6. `frontend/src/app/admin/spoke/page.tsx`
7. `frontend/src/components/dashboard/dashboard-modern.tsx`
8. `frontend/src/components/admin/federation-dashboard.tsx`
9. `frontend/src/app/admin/analytics/page.tsx`
10. `frontend/src/components/auth/session-status-indicator.tsx`

---

## COMMITS MADE THIS SESSION

### Commit 1: Phase 2A/2B + Test Infrastructure
**Hash**: `867e7cba`
**Files**: 9 files (routes, services, test infrastructure)
**Impact**:
- Fixed 59 failing tests
- Refactored 3 routes + cleanup of 3 services
- Test infrastructure unblocked all future work

### Commit 2: Progress Report Update
**Hash**: `65f6aa31`
**Files**: `PHASE2_PROGRESS_REPORT.md`
**Purpose**: Documentation of Phase 2A/2B completion

### Commit 3: Phase 2C Sub-batch 1
**Hash**: `ee1287dc`
**Files**: 3 services (coi-key, idp-approval, notification)
**Impact**:
- 3/8 Phase 2C files complete
- All tests passing
- 15/71 total files refactored (21%)

---

## VERIFICATION CHECKLIST (After Each Batch)

Use this checklist to ensure quality before committing:

### Code Quality
- [ ] Zero `new MongoClient()` calls in refactored files (except federation remote instances)
- [ ] All `getMongoDBUrl()` imports removed (unless used for remote federation)
- [ ] All `cachedClient`/`cachedDb` variables removed
- [ ] Close/disconnect methods deprecated with no-op implementations
- [ ] TypeScript compilation succeeds: `npm run build`

### Testing
- [ ] Individual file tests pass: `npm test -- --testPathPattern="filename"`
- [ ] Batch tests pass: `npm test -- --testPathPattern="file1|file2|file3"`
- [ ] No new test failures introduced
- [ ] Test coverage maintained or improved

### Documentation
- [ ] Commit message follows convention (see examples above)
- [ ] PHASE2_PROGRESS_REPORT.md updated with batch completion
- [ ] Any special cases documented in code comments

---

## COMMON PITFALLS TO AVOID

### ❌ Pitfall 1: Forgetting to Update Test Infrastructure
**Problem**: Tests fail with "MongoDB not connected"  
**Solution**: Already fixed - singleton auto-connects in test workers via `setup.ts`

### ❌ Pitfall 2: Not Removing All References
**Problem**: TypeScript errors about `this.client` or `cachedClient`  
**Solution**: Search entire file for old variable names before committing

```bash
# Check for remaining references
grep -n "cachedClient\|cachedDb\|this\.client\|this\.db" backend/src/services/filename.ts
```

### ❌ Pitfall 3: Breaking Federation Pattern
**Problem**: Remote instance queries fail  
**Solution**: Use singleton ONLY for local instance, separate `MongoClient` for remote

### ❌ Pitfall 4: Forgetting to Update Async Calls
**Problem**: TypeScript errors about `await getCollection()`  
**Solution**: After making `getCollection()` synchronous, remove all `await` keywords

```bash
# Find remaining await calls
grep -n "await.*getCollection\|await this\.collection" backend/src/services/filename.ts
```

### ❌ Pitfall 5: Index Creation on Every Call
**Problem**: Performance degradation from index creation on every collection access  
**Solution**: Keep index creation but make it fire-and-forget with `.catch()`

```typescript
// ✅ CORRECT - Fire and forget
function getCollection(): Collection {
    const db = getDb();
    const col = db.collection('my_collection');
    col.createIndex({ field: 1 }).catch(err => logger.warn('Index creation failed', { err }));
    return col;
}
```

---

## PERFORMANCE IMPACT ESTIMATES

### Memory Savings Per File Type
- **High-frequency controllers**: ~20-40 MB per file
- **High-priority routes**: ~15-30 MB per file
- **Medium-priority services**: ~10-20 MB per file
- **Low-priority scripts**: ~5-10 MB per file

### Cumulative Savings (15 files refactored)
- **Estimated**: 300-600 MB
- **Actual** (will measure after completion): TBD

### Expected Final Impact (71 files)
- **Conservative estimate**: 1.4-2.8 GB
- **Realistic estimate**: 2.0-3.5 GB
- **Optimistic estimate**: 2.5-4.0 GB

---

## SUCCESS CRITERIA

### Phase 2C Completion Criteria
- [ ] 8/8 medium-priority service files refactored
- [ ] All tests passing (maintain 126/130 suites)
- [ ] Zero new compilation errors
- [ ] All commits follow convention
- [ ] PHASE2_PROGRESS_REPORT.md updated

### Overall Phase 2 Completion Criteria
- [ ] 71/71 MongoDB backend files refactored
- [ ] 117/117 frontend files with `useEffect` cleanup
- [ ] Connection count stable at ~20 (singleton pool)
- [ ] No `new MongoClient()` calls except in:
  - `mongodb-singleton.ts` (the singleton itself)
  - Test helper files (for test isolation)
  - Federation services (remote instance connections only)
- [ ] 24-hour soak test passes with stable memory

---

## QUICK START COMMANDS

### Resume Work
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Verify current branch and status
git status
git log --oneline -5

# Check remaining Phase 2C files
grep -l "new MongoClient" backend/src/services/audit-log.service.ts \
    backend/src/services/decision-log.service.ts \
    backend/src/services/clearance-mapper.service.ts
```

### Start Phase 2C Sub-batch 2
```bash
# Read first file
cat backend/src/services/audit-log.service.ts

# Apply refactoring pattern (use StrReplace tool)
# ... refactor the file ...

# Test individual file
npm test -- --testPathPattern="audit-log" --bail

# Repeat for decision-log.service.ts and clearance-mapper.service.ts
```

### Test After Sub-batch Complete
```bash
npm test -- --testPathPattern="audit-log|decision-log|clearance-mapper" --bail
```

### Commit Sub-batch
```bash
git add backend/src/services/audit-log.service.ts \
        backend/src/services/decision-log.service.ts \
        backend/src/services/clearance-mapper.service.ts
        
git commit -m "fix(backend): Phase 2C Sub-batch 2 - Refactor audit-log, decision-log, clearance-mapper"
```

---

## REFERENCE ARTIFACTS

### Key Documentation Files
1. **`PHASE2_HANDOFF_SESSION_2026-02-16.md`** - Original handoff with full context
2. **`PHASE2_PROGRESS_REPORT.md`** - Updated progress tracking
3. **`HANDOFF_MEMORY_LEAK_FIXES.md`** - Executive summary and impact analysis
4. **`MEMORY_LEAK_ROOT_CAUSES.md`** - Root cause analysis with evidence
5. **`backend/src/utils/mongodb-singleton.ts`** - Singleton implementation (reference)

### Completed Example Files (Reference Patterns)
- **Simple Service**: `backend/src/services/coi-key.service.ts` (Commit: `ee1287dc`)
- **Class Service**: `backend/src/services/idp-approval.service.ts` (Commit: `ee1287dc`)
- **Route File**: `backend/src/routes/resource.routes.ts` (Commit: `867e7cba`)
- **Federation Service**: `backend/src/services/federated-resource.service.ts` (Previously completed)

### Test Infrastructure Files
- **`backend/src/__tests__/globalSetup.ts`** - Singleton initialization for workers
- **`backend/src/__tests__/globalTeardown.ts`** - Singleton cleanup
- **`backend/src/__tests__/setup.ts`** - Worker-level connection setup

---

## FINAL RECOMMENDATIONS

### For This Session (Phase 2C Sub-batch 2)
1. **Follow the proven patterns** - Don't improvise, use Pattern 1, 2, or 3
2. **Test incrementally** - Test each file individually before batching
3. **Read files fully** - Don't assume structure, always read first
4. **Check for edge cases** - Look for close methods, remote connections, index creation
5. **Commit after each sub-batch** - Don't accumulate too many changes

### For Future Sessions
1. **Phase 2D requires special care** - Federation pattern is different
2. **Phase 2E can be parallelized** - Scripts are mostly independent
3. **Phase 2F is simpler** - Frontend cleanup is more mechanical
4. **Run verification after completion** - Use `scripts/verify-memory-leak-fixes.sh`
5. **Document any deviations** - Update handoff if patterns change

---

## EMERGENCY PROCEDURES

### If Tests Fail After Refactoring

1. **Check TypeScript compilation first**:
   ```bash
   npx tsc --noEmit src/services/filename.ts
   ```

2. **Search for remaining old patterns**:
   ```bash
   grep -n "new MongoClient\|cachedClient\|cachedDb\|await getCollection\|this\.client\|this\.db" backend/src/services/filename.ts
   ```

3. **Compare with working example**:
   ```bash
   diff -u backend/src/services/coi-key.service.ts backend/src/services/filename.ts
   ```

4. **Revert if needed**:
   ```bash
   git restore backend/src/services/filename.ts
   ```

### If Singleton Connection Fails in Tests

This should not happen (already fixed), but if it does:

1. **Verify setup.ts has beforeAll hook** - Check line 78-89
2. **Check globalSetup initializes singleton** - Check lines 175-177, 223-225
3. **Restart from clean state**:
   ```bash
   rm -rf node_modules/.cache
   npm test -- --clearCache
   npm test
   ```

---

## CONTACT & ESCALATION

**Project**: DIVE V3 Memory Leak Mitigation (Phase 2)  
**Repository**: `/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3`  
**Current Branch**: `main`  
**Last Commit**: `ee1287dc` (Phase 2C Sub-batch 1)

**Issue Tracking**: See TODOs in code or `PHASE2_PROGRESS_REPORT.md`

---

**Generated**: 2026-02-16  
**Session**: Phase 2C Continuation  
**Next Action**: Begin Phase 2C Sub-batch 2 (audit-log, decision-log, clearance-mapper)

**Estimated Time to Phase 2C Completion**: 1.5-2 hours  
**Estimated Time to Phase 2 Backend Completion**: 6-8 hours  
**Estimated Time to Full Phase 2 Completion** (including frontend): 10-12 hours
