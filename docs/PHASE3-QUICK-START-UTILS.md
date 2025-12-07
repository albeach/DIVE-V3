# DIVE V3 Phase 3 - Quick Start for Utils Testing

**COPY THIS INTO YOUR NEXT CHAT**

---

## Mission
Continue Phase 3 backend testing: **56% → 80% coverage** via low-hanging fruit strategy.

## What Was Completed (Previous Session)
✅ **4 files at 100% coverage** (145 tests):
1. policy.controller.ts (26 tests)
2. metrics.service.ts (36 tests)  
3. decision-replay.service.ts (30 tests)
4. uuid-validator.ts (53 tests)

## Your Task: Test Simple Utils

**Target Files (Prioritized):**
1. **cross-kas-client.ts** (0%, 31 lines) ⭐ START HERE
2. **scim.utils.ts** (0%, 73 lines)
3. **oauth.utils.ts** (42% → 100%, 59 lines)
4. **acp240-logger.ts** (39% → 100%, 51 lines)
5. **policy-lab-fs.utils.ts** (41% → 100%, 107 lines)

## BEST PRACTICE Workflow (NO SHORTCUTS)

```bash
# Step 1: Read target file
read_file backend/src/utils/cross-kas-client.ts

# Step 2: Create comprehensive tests
# Use template from docs/PHASE3-TESTING-SESSION-HANDOFF.md

# Step 3: Run & verify
cd backend
npm test -- cross-kas-client.test.ts --coverage --coverageReporters=text

# Step 4: Confirm 100% coverage
# Must see: 100% lines, 95%+ branches

# Step 5: Move to next file
```

## Critical Rules

1. ✅ **Read source code first** - never assume
2. ✅ **Check types before testing** - verify interfaces
3. ✅ **Target 100% per file** - don't settle for less
4. ✅ **All tests must pass** - no flaky tests
5. ✅ **Mock only externals** - logger, database, network

## Success Criteria

- [ ] 3-5 utils tested to 100%
- [ ] 100-150 new tests added
- [ ] All tests passing
- [ ] Overall coverage +3-5%

## Full Details

See: `docs/PHASE3-TESTING-SESSION-HANDOFF.md`

---

**START WITH:** `cross-kas-client.ts` (0%, 31 lines) - simplest target!









