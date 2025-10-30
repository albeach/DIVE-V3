# Phase 0: Readiness Checklist Results

**Date**: [Fill in execution date]  
**Executed By**: [Your name]  
**Status**: [GO / CONDITIONAL-GO / NO-GO]

---

## Quick Start

Run the automated readiness check:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
./scripts/phase-0-readiness-check.sh
```

Or run checks manually (see sections below).

---

## Pre-Flight Checks (13 Total)

| # | Check | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 1 | Keycloak Version | 26.4.2 | | ⬜ | |
| 2 | PostgreSQL | 15.x | | ⬜ | |
| 3 | MongoDB | 7.0.x | | ⬜ | |
| 4 | OPA | ≥ 0.68.0 | | ⬜ | |
| 5 | Terraform | ≥ 1.13.4 | | ⬜ | |
| 6 | Terraform Provider | keycloak/keycloak v5.5.0 | | ⬜ | |
| 7 | Realms Count | 11 (1 broker + 10 nations) | | ⬜ | |
| 8 | IdP Count | 10 external | | ⬜ | |
| 9 | MFA Flow | Post-broker AAL2 | | ⬜ | |
| 10 | OPA Policies | 7 policies | | ⬜ | |
| 11 | Backend Health | HTTP 200 | | ⬜ | |
| 12 | Frontend Health | HTTP 200 | | ⬜ | |
| 13 | Terraform State | Clean (no drift) | | ⬜ | |

**Summary**:
- **Passed**: ___ / 13
- **Failed**: ___
- **Warnings**: ___
- **Success Rate**: ___%

---

## Manual Check Commands

### Check 1: Keycloak Version
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version
```
**Expected**: `Keycloak 26.4.2`

---

### Check 2: PostgreSQL Version
```bash
docker exec dive-v3-postgres psql --version
```
**Expected**: `psql (PostgreSQL) 15.x`

---

### Check 3: MongoDB Version
```bash
docker exec dive-v3-mongo mongod --version
```
**Expected**: `db version v7.0.x`

---

### Check 4: OPA Version
```bash
docker exec dive-v3-opa opa version
```
**Expected**: `Version: 0.68.0` or higher

---

### Check 5: Terraform Version
```bash
terraform version
```
**Expected**: `Terraform v1.13.4` or higher

---

### Check 6: Terraform Provider
```bash
grep 'keycloak/keycloak' terraform/.terraform.lock.hcl
```
**Expected**: Version around `5.5.0`

---

### Check 7: Realms Count
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms --fields realm | jq -r '.[].realm'
```
**Expected**: 11 realms
- dive-v3-broker
- dive-v3-usa
- dive-v3-esp
- dive-v3-fra
- dive-v3-gbr
- dive-v3-deu
- dive-v3-ita
- dive-v3-nld
- dive-v3-pol
- dive-v3-can
- dive-v3-industry

---

### Check 8: IdP Count
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get identity-provider/instances -r dive-v3-broker | jq 'length'
```
**Expected**: `10` (external IdP brokers)

---

### Check 9: MFA Flow
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get authentication/flows -r dive-v3-broker | grep "Post-Broker"
```
**Expected**: Should find "Post-Broker Classified MFA" flow

---

### Check 10: OPA Policies
```bash
ls -1 policies/*.rego | wc -l
```
**Expected**: `7` or more `.rego` files

List of expected policies:
- admin_authorization_policy.rego
- clearance_normalization_test.rego
- coi_coherence_policy.rego
- federation_abac_policy.rego
- fuel_inventory_abac_policy.rego
- object_abac_policy.rego
- (+ any custom policies)

---

### Check 11: Backend Health
```bash
curl -f http://localhost:4000/health
```
**Expected**: HTTP 200 response with `{"status":"ok"}` or similar

---

### Check 12: Frontend Health
```bash
curl -f http://localhost:3000
```
**Expected**: HTTP 200 response (Next.js landing page)

---

### Check 13: Terraform State
```bash
cd terraform && terraform plan -detailed-exitcode
```
**Expected**: Exit code 0 (no changes) or minimal drift

---

## Troubleshooting Common Issues

### Issue: Docker containers not running

**Solution**:
```bash
docker-compose up -d
docker ps
```

### Issue: kcadm.sh authentication needed

**Solution**:
```bash
docker exec -it dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin
```

### Issue: Terraform not initialized

**Solution**:
```bash
cd terraform
terraform init
```

### Issue: Backend/Frontend not responding

**Solution**:
```bash
# Check logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart if needed
docker-compose restart backend frontend
```

---

## Go/No-Go Decision

**Criteria**:
- **GO**: 12-13 checks PASS (allow 1 transient failure)
- **CONDITIONAL-GO**: 11 checks PASS (review failures, may proceed with caution)
- **NO-GO**: < 11 checks PASS (resolve critical issues before Phase 1)

**Decision**: [GO / CONDITIONAL-GO / NO-GO]

**Rationale**:
[Document why you made the decision, what failures are acceptable, etc.]

---

## Known Issues & Assumptions

Based on grounding documents, the following are **known/expected** issues:

1. ✅ **Keycloak health check may show "unhealthy"** → Service is functional (check /realms/master)
2. ✅ **OPA CLI locally may be corrupted** → Use Docker OPA CLI instead
3. ✅ **5 users missing clearanceOriginal** → Will be fixed in Phase 2
4. ✅ **AuthzForce 13.3.2 unavailable** → Use v12.0.1 (acceptable)
5. ✅ **Some Terraform drift expected** → Will be addressed in phases

---

## Next Steps

### If GO or CONDITIONAL-GO:
1. ✅ Review Phase 1 details: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md` (line 140+)
2. ✅ Create backups:
   ```bash
   # Terraform state
   cp terraform/terraform.tfstate terraform/terraform.tfstate.backup-$(date +%Y%m%d)
   
   # Keycloak DB
   pg_dump -h localhost -p 5433 -U postgres keycloak_db > keycloak-backup-$(date +%Y%m%d).sql
   
   # MongoDB
   mongodump --host localhost --port 27017 --out=mongo-backup-$(date +%Y%m%d)
   ```
3. ✅ Begin Phase 1: Federation & MFA Hardening

### If NO-GO:
1. ❌ Resolve failed checks (see Troubleshooting section above)
2. ❌ Re-run readiness check: `./scripts/phase-0-readiness-check.sh`
3. ❌ Document blockers and escalate if needed

---

## Sign-Off

**Executed By**: ___________________  
**Date**: ___________________  
**Approved By** (Security Architect): ___________________  
**Ready for Phase 1**: [YES / NO]

---

**Next File**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md` (Phase 1, line 140)

