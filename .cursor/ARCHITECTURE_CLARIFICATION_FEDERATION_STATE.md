# Federation State Architecture - Clarification

**User Question**: "We have USA Hub and FRA spoke up, registered in MongoDB and/or Postgres?"

**Answer**: YES - FRA is registered in BOTH systems (they serve different purposes)

---

## Two Federation State Systems (By Design)

### 1. PostgreSQL `orchestration.federation_links` (Operational State)

**Purpose**: Track federation link status for **operations and monitoring**

**Database**: `orchestration` (PostgreSQL)  
**Table**: `federation_links`  

**Current State**:
```sql
fra → usa | SPOKE_TO_HUB | ACTIVE  ✅
usa → fra | HUB_TO_SPOKE | ACTIVE  ✅
```

**Used By**:
- Drift detection service
- Federation health monitoring
- Operational dashboards
- Link status tracking

**Created By**: `fed_db_upsert_link()` during spoke deployment/registration

---

### 2. MongoDB `dive-v3.federation_spokes` (Configuration State)

**Purpose**: Track spoke registrations for **Terraform configuration generation**

**Database**: `dive-v3` (MongoDB)  
**Collection**: `federation_spokes`  

**Current State**:
```json
{
  "spokeId": "spoke-fra-ee18ad42",
  "instanceCode": "FRA",
  "status": "approved",
  "name": "FRA Instance",
  "idpPublicUrl": "https://localhost:8453",
  "baseUrl": "https://localhost:3010"
}
```

**Used By**:
- Hub Terraform configuration generation
- hub.auto.tfvars creation
- Spoke registry API (`/api/federation/spokes`)

**Created By**: `hubSpokeRegistry.registerSpoke()` when spoke calls `/api/federation/register`

---

## Why Both Systems?

### Different Purposes

**PostgreSQL (Operational)**:
- Real-time link status (ACTIVE, FAILED, CREATING)
- Bidirectional tracking (spoke→hub AND hub→spoke)
- Health check results
- Retry tracking
- Created during: Architecture review (Phase 5)
- Purpose: Drift detection and monitoring

**MongoDB (Configuration)**:
- Spoke registration metadata
- Used to generate Terraform variables
- API discovery information
- Certificate fingerprints
- Existed before: Architecture review
- Purpose: Dynamic Terraform configuration

### They Track Different Things

**PostgreSQL**:
```
Source: fra, Target: usa, Direction: SPOKE_TO_HUB, Status: ACTIVE
```
→ "FRA's IdP in USA is working"

**MongoDB**:
```
{instanceCode: "FRA", status: "approved", idpPublicUrl: "..."}
```
→ "FRA is a registered spoke with this configuration"

---

## Current State - Both Populated ✅

**Your deployment HAS registered FRA in both places**:

1. **MongoDB `dive-v3.federation_spokes`**: ✅
   - FRA entry exists
   - Status: approved
   - Metadata present

2. **PostgreSQL `orchestration.federation_links`**: ✅
   - fra→usa link: ACTIVE
   - usa→fra link: ACTIVE

---

## The Terraform Generation Flow

**When should hub.auto.tfvars be regenerated?**

**Option 1**: During Hub deployment
```bash
./dive hub deploy
  ↓
Query MongoDB: federation_spokes (finds FRA)
  ↓
Generate hub.auto.tfvars: federation_partners = {fra = {...}}
  ↓
Terraform apply: Creates/updates fra-idp
```

**Option 2**: On-demand trigger
```bash
./dive hub federation sync
  ↓
Query MongoDB
  ↓
Generate hub.auto.tfvars
  ↓
Terraform apply
```

**Current**: hub.auto.tfvars is from 2026-01-12 (old, has 29 spokes from previous testing)

**Need**: Regenerate hub.auto.tfvars from current MongoDB state (1 spoke: FRA)

---

## Why hub.auto.tfvars is Stale

**The file shows**:
```hcl
# Timestamp: 2026-01-12T19:05:50Z
# Spokes Found: 29

federation_partners = {
  alb = {...}
  bel = {...}
  ...29 spokes from old deployment
}
```

**Current MongoDB has**: 1 spoke (FRA only)

**Why stale**: Hub hasn't run the Terraform generation code since 2026-01-12

**Solution**: Hub deployment should regenerate hub.auto.tfvars from MongoDB

---

## Recommendation

### Keep Both Systems (They're Complementary)

**PostgreSQL**: Operational state (link status, health)  
**MongoDB**: Configuration state (spoke metadata for Terraform)  

**Both needed**:
- PostgreSQL: Real-time monitoring
- MongoDB: Terraform config generation

### Ensure They Stay in Sync

**When spoke registers**:
1. ✅ Create MongoDB entry (configuration)
2. ✅ Create PostgreSQL links (operational state)
3. ✅ Trigger hub.auto.tfvars regeneration
4. ✅ Apply Terraform (create/update IdP)

**Currently**: Steps 1-2 work, steps 3-4 need to be triggered

---

## Your Question Answered

**Q**: "I thought they were registered already in MongoDB and/or Postgres?"

**A**: **YES - registered in BOTH!**

- **MongoDB `dive-v3.federation_spokes`**: FRA entry exists ✅
- **PostgreSQL `orchestration.federation_links`**: fra↔usa links exist ✅

**They're BOTH populated** (correctly), but serve different purposes:
- MongoDB → Terraform config generation
- PostgreSQL → Operational monitoring

**The issue**: hub.auto.tfvars is stale (from 2026-01-12, hasn't been regenerated with current MongoDB state)

---

**Both systems are correct by design** - they complement each other!
