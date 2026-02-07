# ARCHITECTURE QUESTION: KAS Registry Federation

**Date**: 2026-02-07  
**Issue**: FRA KAS only knows about itself, not Hub KAS  
**Impact**: Cross-instance key release may not work

---

## Current State

### FRA MongoDB kas_registry
```javascript
db.kas_registry.find()
// Returns: 1 document
[{ kasId: "fra-kas", countryCode: "FRA", ... }]
```

### Hub MongoDB kas_registry  
Cannot access (authentication issues), but Hub backend API shows:
```json
GET https://localhost:4000/api/kas/registry
{"kasServers": [{"kasId": "usa-kas", ...}]}
```

### FRA Backend API
```json
GET https://localhost:4010/api/kas/registry
{"kasServers": [{"kasId": "fra-kas", ...}]}
```

---

## Architecture Analysis

### Current Behavior
- Each instance maintains its **own** KAS registry in MongoDB
- FRA knows only about `fra-kas`
- Hub knows only about `usa-kas`
- No cross-registration

### Question
For cross-instance key release (e.g., FRA user accessing USA encrypted resource):

1. **Should FRA's kas_registry contain BOTH?**
   - fra-kas (local)
   - usa-kas (federated Hub)

2. **OR is routing handled differently?**
   - FRA KAS proxies to Hub KAS when needed?
   - Backend routes KAS requests based on resource origin?

---

## Expected Federation Flow

**Scenario**: FRA user requests USA encrypted resource

1. User authenticates to FRA Keycloak
2. User gets JWT from FRA
3. User requests USA resource via FRA backend
4. USA resource has KAO pointing to USA KAS
5. **QUESTION**: How does FRA KAS know about USA KAS?

### Option A: Pre-registered (SSOT in MongoDB)
```
FRA kas_registry should contain:
- fra-kas (local, registered during deployment)
- usa-kas (federated, synced from Hub)
```

### Option B: Dynamic routing (via backend)
```
FRA backend proxies KAS requests to appropriate KAS:
- Local resources → fra-kas
- USA resources → usa-kas (via hub URL)
```

---

## Code Evidence

### KAS Registry Loader (kas/src/utils/mongo-kas-registry-loader.ts)
```typescript
// Loads ALL KAS instances from MongoDB kas_registry
const kasInstances = await this.collection!
    .find({ status: 'active', enabled: true })
    .toArray();
```

This suggests **Option A** - KAS expects to find all trusted KAS instances in its MongoDB.

### Deployment (spoke-kas.sh:spoke_kas_register_mongodb)
```bash
# Only registers LOCAL KAS in LOCAL MongoDB
curl -X POST https://localhost:4010/api/kas/register \
  -d '{"kasId": "fra-kas", "kasUrl": "https://localhost:10010", ...}'
```

**Missing**: No sync of Hub KAS to Spoke MongoDB

---

## ROOT CAUSE

**The deployment scripts only register each KAS in its OWN MongoDB.**

There's NO mechanism to:
1. Register Hub KAS in Spoke MongoDB
2. Register Spoke KAS in Hub MongoDB  
3. Sync KAS registries across instances

---

## Impact

### Current
- FRA KAS loads 1 instance (fra-kas only)
- Cannot route to USA KAS for cross-instance key release
- Federation key access: **BROKEN**

### Expected  
- FRA KAS should load 2 instances (fra-kas + usa-kas)
- Should be able to route key requests to appropriate KAS
- Federation key access: **WORKING**

---

## Solutions

### Option 1: Federation Sync During Deployment (RECOMMENDED)
During `./dive spoke deploy FRA`:
1. Register fra-kas in FRA MongoDB (current)
2. **NEW**: Register usa-kas in FRA MongoDB (from Hub)
3. **NEW**: Register fra-kas in Hub MongoDB

**Implementation**:
```bash
# After spoke_kas_register_mongodb FRA
# Sync Hub KAS to Spoke
spoke_kas_sync_from_hub FRA

# After federation link established
# Register Spoke KAS in Hub
hub_kas_register_spoke FRA
```

### Option 2: Backend KAS Router (More Complex)
- Backend maintains KAS routing table
- Routes requests based on resource origin
- Doesn't require MongoDB sync

### Option 3: Manual Registration
```bash
# On FRA spoke, register Hub KAS
curl -X POST https://localhost:4010/api/kas/register \
  -d '{"kasId": "usa-kas", "kasUrl": "https://localhost:9080", ...}'

# On Hub, register FRA KAS
curl -X POST https://localhost:4000/api/kas/register \
  -d '{"kasId": "fra-kas", "kasUrl": "https://localhost:10010", ...}'
```

---

## Recommendation

**Implement Option 1: Automated Federation Sync**

1. Create `spoke_kas_sync_from_hub()` function
2. Call after `spoke_kas_register_mongodb()`
3. Query Hub's `/api/kas/registry`
4. Register Hub's KAS instances in Spoke MongoDB
5. Bidirectional: Also register Spoke KAS in Hub

**Benefits**:
- Automated (no manual steps)
- SSOT maintained (MongoDB)
- Aligns with existing KAS loader logic
- Enables true cross-instance key release

---

## Next Steps

1. **Verify Architecture Intent**
   - Is cross-instance KAS routing required?
   - Should all federated KAS instances be pre-registered?

2. **Implement Sync if Needed**
   - Add `spoke_kas_sync_from_hub()` to deployment
   - Test FRA KAS loads 2 instances
   - Verify cross-instance key release works

3. **Update Hub KAS**
   - Hub KAS still using old code (federation_spokes)
   - Needs same fix as Spoke KAS (kas_registry collection)

---

**Status**: ARCHITECTURE DECISION NEEDED  
**Blocking**: Cross-instance key release  
**User Question**: "shouldn't a count of 2 be reflected?"  
**Answer**: YES, if cross-instance federation is required
