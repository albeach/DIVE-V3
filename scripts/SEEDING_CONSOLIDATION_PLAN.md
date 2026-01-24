# Seeding Scripts Consolidation - SSOT Architecture

## Problem Identified

**Multiple Conflicting Seeding Approaches:**

1. **Bash Scripts (Legacy - DUPLICATES):**
   - `scripts/hub-init/seed-hub-users.sh` (26KB)
   - `scripts/hub-init/seed-hub-resources.sh` (5KB)
   - `scripts/spoke-init/seed-users.sh`
   - `scripts/spoke-init/seed-resources.sh`
   - `scripts/spoke-init/seed-localized-users.sh`

2. **TypeScript Scripts (SSOT - Backend):**
   - `backend/src/scripts/initialize-coi-keys.ts` ✅
   - `backend/src/scripts/setup-demo-users.ts` ✅
   - `backend/src/scripts/seed-instance-resources.ts` ✅
   - `backend/src/scripts/seed-test-users-totp.ts` ✅

3. **DIVE CLI Modules:**
   - `scripts/dive-modules/hub/seed.sh` - Calls both bash AND TypeScript (MIXED)
   - `scripts/dive-modules/spoke/pipeline/phase-seeding.sh` - Calls TypeScript (CORRECT)

## Current Issues

1. **Hub Deployment Failed to Seed Users**
   - Reason: `seed-hub-users.sh` wasn't executable
   - Result: 0 users in Hub MongoDB
   - Result: 0 users in Hub Keycloak PostgreSQL

2. **Hub Has No Resources**
   - Reason: User seeding failed, so resource seeding didn't run
   - Result: 0 resources in Hub MongoDB

3. **Hub Has No COI Definitions**
   - Reason: COI initialization in deploy didn't persist (MongoDB auth issue)
   - Result: 0 COI definitions

4. **Mixed Approaches**
   - Hub uses bash scripts (legacy)
   - Spoke uses TypeScript scripts (modern)
   - Inconsistent behavior

## SSOT Solution

### Single Source of Truth: Backend TypeScript Scripts

**Why TypeScript Backend Scripts are Better:**
- ✅ Direct database access (no curl/API dependency)
- ✅ Proper error handling
- ✅ Transaction support
- ✅ Type safety
- ✅ Already handle GCP secrets
- ✅ Consistent between hub and spoke
- ✅ Better logging
- ✅ Unit testable

**Architecture:**
```
Backend TypeScript Scripts (SSOT):
├── initialize-coi-keys.ts       → COI definitions
├── setup-demo-users.ts           → Test users in Keycloak
├── seed-instance-resources.ts    → Resources in MongoDB
└── seed-test-users-totp.ts       → Users with TOTP configured
```

**DIVE CLI Calls Backend Scripts:**
```bash
# Hub seeding (NEW SSOT approach)
docker exec dive-hub-backend npx tsx src/scripts/initialize-coi-keys.ts
docker exec dive-hub-backend npx tsx src/scripts/setup-demo-users.ts
docker exec dive-hub-backend npx tsx src/scripts/seed-instance-resources.ts --instance=USA --count=5000

# Spoke seeding (ALREADY USING THIS - KEEP)
docker exec dive-spoke-{code}-backend npm run seed:instance -- --instance={CODE} --count=5000
```

## Implementation Plan

### Step 1: Update hub/seed.sh (SSOT)

Replace calls to bash scripts with TypeScript backend scripts:

```bash
hub_seed() {
    local resource_count="${1:-5000}"
    local backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"

    # Step 1: Initialize COI Keys
    docker exec "$backend_container" npx tsx src/scripts/initialize-coi-keys.ts

    # Step 2: Seed test users (Keycloak + MongoDB)
    docker exec "$backend_container" npx tsx src/scripts/setup-demo-users.ts

    # Step 3: Seed ZTDF resources
    docker exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts \
        --instance=USA \
        --count="${resource_count}" \
        --replace
}
```

### Step 2: Archive Legacy Bash Scripts

Move to `scripts/archived/legacy-seeding/`:
- `scripts/hub-init/seed-hub-users.sh` → ARCHIVED
- `scripts/hub-init/seed-hub-resources.sh` → ARCHIVED
- `scripts/spoke-init/seed-users.sh` → ARCHIVED (TypeScript already used)
- `scripts/spoke-init/seed-resources.sh` → ARCHIVED (TypeScript already used)
- `scripts/spoke-init/seed-localized-users.sh` → ARCHIVED

### Step 3: Keep Only SSOT

**Keep:**
- `backend/src/scripts/` - ALL TypeScript scripts (SSOT)
- `scripts/dive-modules/hub/seed.sh` - Updated to call TypeScript only
- `scripts/dive-modules/spoke/pipeline/phase-seeding.sh` - Already correct

**Archive:**
- All standalone bash seeding scripts

### Step 4: Update Deployment Scripts

**Hub Deployment** (`scripts/dive-modules/deployment/hub.sh`):
- Update to call TypeScript scripts directly
- Remove dependency on bash seed scripts

**Spoke Deployment** (`scripts/dive-modules/spoke/pipeline/phase-seeding.sh`):
- Already correct (uses TypeScript)
- No changes needed

## Testing Checklist

- [ ] Run Hub seeding: `./dive hub seed 5000`
- [ ] Verify COI definitions: `db.coi_definitions.countDocuments()`
- [ ] Verify users in Keycloak (PostgreSQL)
- [ ] Verify users in MongoDB
- [ ] Verify resources in MongoDB
- [ ] Test spoke seeding (already working)

## Benefits

1. **Consistency:** Hub and spoke use same seeding approach
2. **Reliability:** TypeScript error handling better than bash
3. **Maintainability:** Single codebase for seeding logic
4. **Testability:** TypeScript scripts can be unit tested
5. **No Duplicates:** One script per function

## Rollback

If issues discovered:
```bash
git checkout scripts/hub-init/
git checkout scripts/dive-modules/hub/seed.sh
```

## Implementation Steps

1. Update `scripts/dive-modules/hub/seed.sh`
2. Archive bash scripts to `scripts/archived/legacy-seeding/`
3. Test Hub seeding
4. Verify all data persisted
5. Update documentation
