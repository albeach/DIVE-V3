# Critical Issues Found - Deep Audit Results

**Date:** 2026-01-24  
**Status:** 🚨 **CRITICAL SOFTFAILS IDENTIFIED**  
**Impact:** System appears working but has fundamental SSOT violations

---

## Issue #1: COI Definition SSOT Violation 🚨

### Problem
**Hub and Spoke use DIFFERENT COI sources:**

**Hub (19 COIs):**
- Source: `backend/src/scripts/initialize-coi-keys.ts`
- Creates: 19 COIs including bilateral (CAN-US, GBR-US, FRA-US, DEU-US)
- Collection: `coi_definitions`
- COIs: US-ONLY, FVEY, NATO, NATO-COSMIC, CAN-US, GBR-US, FRA-US, DEU-US, AUKUS, QUAD, EU-RESTRICTED, NORTHCOM, EUCOM, PACOM, CENTCOM, SOCOM, Alpha, Beta, Gamma

**Spoke (7 COIs):**
- Source: `backend/src/models/coi-definition.model.ts` → `seedBaselineCOIs()`
- Creates: Only 7 baseline COIs (US-ONLY, FVEY, NATO, NATO-COSMIC, Alpha, Beta, Gamma)
- Collection: `coi_definitions`
- Missing: All bilateral COIs (CAN-US, GBR-US, etc.), all combatant commands

**Root Cause:**
```typescript
// TWO DIFFERENT COI SOURCES (NOT SSOT!)
1. initialize-coi-keys.ts (19 COIs) - Called for HUB only
2. coi-definition.model.ts seedBaselineCOIs() (7 COIs) - Called for SPOKES automatically

// This violates SSOT principle!
```

### Impact
- Resource validation fails on spoke for bilateral COIs
- "Unknown COI: CAN-US" errors
- Spoke falls back to plaintext (encryption fails)
- NOT ACP-240 compliant

### Fix Required
**Make initialize-coi-keys.ts the SSOT for ALL instances:**
```bash
# Spoke seeding should also run:
docker exec dive-spoke-fra-backend npx tsx src/scripts/initialize-coi-keys.ts --replace

# This creates all 19 COIs on spoke, matching Hub
```

---

## Issue #2: Spoke Resources NOT ZTDF Encrypted 🚨

### Problem
**FRA Spoke has 5000 plaintext resources (0 encrypted):**

```bash
Resources: 5000 total, 0 ZTDF encrypted
```

**Verification:**
- `encrypted: true` field exists but no ZTDF payload
- No `ztdf.payload.keyAccessObjects` in documents
- Plaintext fallback was used

### Root Cause Chain
1. seedBaselineCOIs() creates only 7 COIs
2. Resource seeding template includes CAN-US bilateral COI
3. Validation fails: "Unknown COI: CAN-US"
4. Script falls back to plaintext (UNACCEPTABLE)
5. 5000 plaintext resources created

**From deployment log:**
```
❌ Template validation failed: Canada-US bilateral
   Errors: Unknown COI: CAN-US (cannot validate releasability)
   
❌ This is a CRITICAL failure - ZTDF encryption is required for ACP-240 compliance
❌ Falling back to plaintext is NOT acceptable for production

✅ Seeded 5000 plaintext resources (legacy)
⚠️  Consider migrating to ZTDF encryption for ACP-240 compliance
```

### Impact
- FRA spoke has 5000 UNENCRYPTED resources
- NOT ACP-240 compliant
- Cannot be used for classified data
- Defeats entire purpose of ZTDF

### Fix Required
1. Initialize all 19 COIs on spoke (fix Issue #1)
2. Ensure KAS is approved (not pending)
3. Re-seed resources with ZTDF encryption
4. Remove plaintext fallback logic (fail fast instead)

---

## Issue #3: KAS Registration Status

### Problem
**FRA KAS registered but status is "pending" not "approved":**

```javascript
{
  kasId: 'fra-kas',
  status: 'pending' // Should be 'approved' for automatic use
}
```

### Impact
- KAS exists but won't be used for encryption
- Resource seeding skips ZTDF encryption
- Falls back to plaintext

### Fix Required
Auto-approve KAS during spoke deployment:
```bash
# After KAS registration, approve it:
curl -X PATCH https://localhost:4000/api/kas/fra-kas \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"status": "approved"}'
```

---

## Issue #4: NextAuth Schema on Hub (VALIDATED ✅)

### Status
**✅ NextAuth schema DOES exist on Hub:**

```sql
Tables in dive_v3_app:
- account ✅
- session ✅
- user ✅
- verificationToken ✅
```

**This is working correctly - no issue.**

---

## SSOT Architecture Violations

### Violation #1: Multiple COI Sources
```
initialize-coi-keys.ts (19 COIs) ← Hub uses this
         ↓
coi_definition.model.ts seedBaselineCOIs() (7 COIs) ← Spoke uses this
```

**Should be:**
```
initialize-coi-keys.ts (19 COIs) ← EVERYONE uses this (SSOT)
```

### Violation #2: Plaintext Fallback Allowed
```typescript
// Current: Falls back to plaintext if ZTDF fails
if (ztdfFails) {
  seedPlaintext(); // WRONG!
}

// Should be: Fail fast, no plaintext
if (ztdfFails) {
  throw new Error('ZTDF encryption required');
}
```

---

## Remediation Plan

### Step 1: Fix COI SSOT (CRITICAL)

**Update spoke seeding to use initialize-coi-keys.ts:**

```bash
# In phase-seeding.sh, add BEFORE resource seeding:
docker exec dive-spoke-${code}-backend npx tsx src/scripts/initialize-coi-keys.ts --replace

# This ensures spoke has all 19 COIs, same as Hub
```

**Update coi-definition.model.ts:**
```typescript
// Remove seedBaselineCOIs() or make it call initialize-coi-keys.ts
// Single source of truth for COI definitions
```

### Step 2: Auto-Approve KAS

**Update KAS registration to auto-approve:**

```typescript
// In spoke deployment after KAS registration:
await kasRegistry.approve(kasId);

// Or update registration endpoint to auto-approve in dev:
if (process.env.NODE_ENV === 'development') {
  status = 'approved'; // Auto-approve in dev
}
```

### Step 3: Re-Seed Spoke Resources

**After fixes applied:**
```bash
# 1. Delete plaintext resources
docker exec dive-spoke-fra-mongodb mongosh ... --eval "db.resources.deleteMany({})"

# 2. Initialize all 19 COIs
docker exec dive-spoke-fra-backend npx tsx src/scripts/initialize-coi-keys.ts --replace

# 3. Approve FRA KAS
# (via API or database update)

# 4. Re-seed with ZTDF encryption
docker exec dive-spoke-fra-backend npm run seed:instance -- --instance=FRA --count=5000 --replace
```

### Step 4: Remove Plaintext Fallback

**Update seed-instance-resources.ts:**
```typescript
// Remove plaintext fallback logic
// If ZTDF validation fails, throw error instead of falling back

if (validationFails) {
  throw new Error('COI validation failed - cannot seed without valid COIs');
}

// NO plaintext fallback - encryption is MANDATORY
```

---

## Testing After Fixes

```bash
# Verify COI counts match
docker exec dive-hub-mongodb ... --eval "db.coi_definitions.countDocuments()"
# Should be: 19

docker exec dive-spoke-fra-backend node -e "..." 
# Should also be: 19

# Verify resources are encrypted
docker exec dive-spoke-fra-backend node -e "..."
# Should show: "5000 total, 5000 ZTDF encrypted"
```

---

## Impact Assessment

**Current State:**
- ❌ Spoke has wrong COI count (7 vs 19)
- ❌ Spoke has 5000 UNENCRYPTED resources
- ❌ KAS is "pending" not "approved"
- ✅ NextAuth schema exists on Hub

**Production Readiness:**
- Hub: ✅ Production ready
- Spoke: ❌ NOT production ready (unencrypted resources)

**Compliance:**
- ACP-240: ❌ FAILED (unencrypted classified data)
- ZTDF: ❌ FAILED (plaintext fallback used)

---

## Priority

**P0 (Critical - Must Fix Before Production):**
1. Fix COI SSOT - spokes must have all 19 COIs
2. Fix spoke encryption - NO plaintext resources allowed
3. Fix KAS approval - auto-approve in dev mode

**P1 (Important - Fix Soon):**
4. Remove plaintext fallback code
5. Add encryption validation checks

---

## Conclusion

The audit revealed **fundamental SSOT violations** that must be fixed:

1. COI definitions have divergent sources (not SSOT)
2. Spoke resources are plaintext (not ZTDF encrypted)
3. KAS approval process broken

**These are blocking issues for production deployment.**

Next: Implement fixes for true SSOT architecture and ZTDF compliance.
