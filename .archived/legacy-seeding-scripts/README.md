# Legacy Seeding Scripts - Archived

**Date Archived:** 2026-01-29
**Reason:** Consolidation to use only DIVE CLI-managed seeding scripts

## Archived Scripts

### 1. `seed-7000-ztdf-documents.ts`
- **Purpose:** Manual seeding of 7000-11000 ZTDF documents with hardcoded COI templates
- **Issue:** Hardcoded country arrays that violated SSOT principle (MongoDB `coi_definitions` is the authoritative source)
- **Replaced By:** `seed-instance-resources.ts` (DIVE CLI official script)

### 2. `seed-ztdf-resources.ts`
- **Purpose:** Old ZTDF resource seeding (pre-refactor)
- **Issue:** Superseded by newer implementation
- **Replaced By:** `seed-instance-resources.ts`

### 3. `seed-1000-ztdf-documents-fixed.ts`
- **Purpose:** Test/development seeding script
- **Issue:** Ad-hoc testing script, not part of production workflow
- **Replaced By:** Use `seed-instance-resources.ts` with `--count` parameter

## Official DIVE CLI Seeding Scripts

The following scripts are the **only** scripts used by the DIVE CLI and should be maintained:

### Hub Deployment (`./dive deploy hub`)
1. **`seed-instance-resources.ts`**
   - Called via: `npm run seed:instance -- --instance=USA --count=5000`
   - Purpose: Seeds hub resources with proper COI validation
   - Validates against MongoDB `coi_definitions` collection

2. **`seed-hub-kas.ts`**
   - Called via: `npm run seed:hub-kas`
   - Purpose: Seeds KAS (Key Access Service) registry

### Spoke Deployment (`./dive spoke deploy [CODE]`)
1. **`seed-instance-resources.ts`**
   - Called via: `npm run seed:instance -- --instance=[CODE] --count=5000 --file-type-mode=multi`
   - Purpose: Seeds spoke-specific resources
   - Validates against MongoDB `coi_definitions` collection

2. **`seed-spoke-trusted-issuer.ts`**
   - Called via: `npm run seed:spoke-issuer`
   - Purpose: Registers spoke's Keycloak realm as trusted OIDC issuer in MongoDB

## Architecture: MongoDB as Single Source of Truth (SSOT)

### Current State (Needs Refactoring)
Both archived and official scripts have **hardcoded COI templates** with country arrays:

```typescript
// ❌ PROBLEM: Hardcoded in seed-instance-resources.ts
const COI_TEMPLATES: ICOITemplate[] = [
    {
        coi: ['NATO'],
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', ...], // Hardcoded!
        ...
    }
];
```

### Target Architecture (TODO)
Scripts should **query MongoDB** for COI definitions:

```typescript
// ✅ CORRECT: Query MongoDB coi_definitions collection
async function buildCoiTemplatesFromDatabase(db: Db): Promise<ICOITemplate[]> {
    const coiDefs = await db.collection('coi_definitions').find({ enabled: true }).toArray();

    return coiDefs
        .filter(coi => coi.memberCountries?.length > 0)
        .map(coi => ({
            coi: [coi.coiId],
            coiOperator: 'ALL',
            releasabilityTo: coi.memberCountries, // From MongoDB!
            description: coi.name
        }));
}
```

### Benefits of MongoDB SSOT
1. **Add new spoke** → COI memberships auto-update via `updateNATOFromFederation()`
2. **Change COI membership** → One update in MongoDB affects all systems
3. **No sync issues** between seeding scripts, OPA policy data, and validation logic
4. **Dynamic spoke discovery** → Seeding templates automatically include new members

## Related Files

### COI Definition Management
- **`backend/src/models/coi-definition.model.ts`** - MongoDB schema for COI definitions
- **`backend/src/scripts/initialize-coi-keys.ts`** - Initializes 22 baseline COI definitions

### Validation
- **`backend/src/services/coi-validation.service.ts`** - Validates COI coherence (releasability ⊆ COI members)

### Federation
- **`backend/src/services/hub-spoke-registry.service.ts`** - Auto-updates NATO/EU COIs when spokes join/leave

## Migration Path

To fully implement MongoDB as SSOT for seeding:

1. **Refactor `seed-instance-resources.ts`:**
   - Replace hardcoded `COI_TEMPLATES` array
   - Add `buildCoiTemplatesFromDatabase()` function
   - Call it during initialization

2. **Update COI definitions in MongoDB:**
   - Ensure EUCOM, PACOM, etc. have complete member lists
   - Run `initialize-coi-keys.ts` to verify all 22 COIs are present

3. **Remove npm scripts:**
   - ✅ Already removed: `seed-database`, `seed-ztdf`, `seed:fixed`

## Testing After Migration

```bash
# Test hub seeding
./dive deploy hub

# Test spoke seeding
./dive spoke deploy SVK

# Verify COI definitions in MongoDB
docker exec dive-hub-backend npx tsx -e "
import { MongoClient } from 'mongodb';
const client = await MongoClient.connect(process.env.MONGODB_URL);
const db = client.db('dive-v3-hub');
const cois = await db.collection('coi_definitions').find({}).toArray();
console.log(JSON.stringify(cois, null, 2));
"
```

## Questions?

Contact: DIVE V3 Architecture Team
Last Updated: 2026-01-29
