# DIVE V3 - Next Session Prompt: ACR/AMR Client Scope Fix

## Context

You are continuing work on DIVE V3 federated identity and access management system. The previous session (2026-01-20, 10 hours) completed **clean slate validation** and implemented **MongoDB SSOT for federation discovery** plus **cross-instance resource access**.

**Git State**: Uncommitted changes (12 files modified, +770 lines)
**Current Deployment**: Hub (11 containers) + FRA spoke (9 containers) - All healthy
**Status**: Federation working end-to-end, blocked by missing ACR/AMR in access tokens

---

## Complete Background & Handoff

**READ THIS FIRST**: @.cursor/NEXT_SESSION_HANDOFF_FEDERATION_COMPLETE.md

This comprehensive handoff document (800+ lines) includes:
- Complete session summary (what was fixed, why, how)
- MongoDB SSOT architecture implementation
- Cross-instance resource access flow
- Scope gap analysis (what works, what's blocked)
- Phased implementation plan with SMART goals
- All deferred actions and recommendations
- Critical lessons learned
- Validation commands (copy-paste ready)

**Also Review**:
- @.cursor/FEDERATION_MONGODB_SSOT_FIX.md - MongoDB SSOT implementation details
- @.cursor/CROSS_INSTANCE_RESOURCE_ACCESS_FIX.md - Cross-instance routing
- @.cursor/SESSION_END_SUMMARY.md - Session achievements summary

---

## Your Mission

**Primary Objective**: Fix ACR/AMR client scopes so access tokens include MFA attributes

**Success Criteria**:
- Access tokens have acr="2" and amr=["pwd","otp"] for MFA users
- Hub correctly enforces AAL2 for RESTRICTED resources
- Cross-instance resource access working with full ABAC
- Validated from clean slate deployment

**Why Critical**: Blocks cross-instance MFA enforcement (security-critical feature)

---

## Critical Issue: ACR/AMR Missing from Access Tokens

### The Problem

**User Session** (ID token):
```json
{
  "acr": "2",
  "amr": ["pwd", "otp"]
}
```

**Access Token** (sent to Hub for authorization):
```json
{
  "acr": "0",
  "amr": ["pwd"]
}
```

**Result**: Hub denies RESTRICTED resources (require AAL2) even though user has MFA

### Root Cause

**Same pattern as SF-026** - client scopes missing protocol mappers for ACR/AMR

Client scopes need:
- `acr` scope with protocol mapper (`claim.name = "acr"`)
- `amr` scope with protocol mapper (`claim.name = "amr"`)
- Both assigned as default scopes
- Both with `access.token.claim = true`

### Current Status

**Existing Scopes** (working):
- uniqueID ✅
- clearance ✅
- countryOfAffiliation ✅
- acpCOI ✅

**Missing Scopes** (this session):
- acr ❌
- amr ❌
- auth_time ❌

---

## Starting Actions (Execute In Order)

### Step 1: Verify Current Deployment

```bash
# Check containers
docker ps --filter "name=dive-" | wc -l  # Should be 20

# Check federation discovery working
curl -s https://localhost:4000/api/federation/discovery | \
  jq '{source, instances: [.instances[] | {code, type}]}'

# Expected: source="mongodb", USA (hub), FRA (spoke)

# Check federation service initialized
docker logs dive-spoke-fra-backend 2>&1 | \
  grep "FederatedResourceService initialized" | tail -1

# Expected: instances=["FRA","USA"]
```

### Step 2: Quick Validation of Infrastructure (5 min)

**Test UNCLASSIFIED cross-instance resource** (no MFA required):

Navigate to FRA spoke and test:
```
https://localhost:3457/resources/doc-USA-seed-1768895001371-00012
```

This resource:
- Classification: UNCLASSIFIED (no AAL2 requirement)
- Releasable to: FRA
- COI: NATO

**Expected**: Should load successfully, proving infrastructure works!

### Step 3: Fix ACR/AMR Client Scopes (2-3 hours)

**File to Modify**: `terraform/modules/federated-instance/dive-client-scopes.tf`

**Add** (after existing scopes):
```hcl
# ACR (Authentication Context Class Reference) Scope
resource "keycloak_openid_client_scope" "acr" {
  realm_id               = keycloak_realm.broker.id
  name                   = "acr"
  description            = "Authentication Context Class Reference (AAL level)"
  include_in_token_scope = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "acr_mapper" {
  realm_id            = keycloak_realm.broker.id
  client_scope_id     = keycloak_openid_client_scope.acr.id
  name                = "acr-mapper"
  
  user_attribute      = "acr"
  claim_name          = "acr"          # CRITICAL
  claim_value_type    = "String"
  
  add_to_id_token     = true
  add_to_access_token = true           # CRITICAL
  add_to_userinfo     = true
}

# AMR (Authentication Methods References) Scope
resource "keycloak_openid_client_scope" "amr" {
  realm_id               = keycloak_realm.broker.id
  name                   = "amr"
  description            = "Authentication Methods References (MFA methods)"
  include_in_token_scope = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "amr_mapper" {
  realm_id            = keycloak_realm.broker.id
  client_scope_id     = keycloak_openid_client_scope.amr.id
  name                = "amr-mapper"
  
  user_attribute      = "amr"
  claim_name          = "amr"          # CRITICAL
  claim_value_type    = "JSON"
  multivalued         = true
  
  add_to_id_token     = true
  add_to_access_token = true           # CRITICAL
  add_to_userinfo     = true
}
```

**Update scope assignments**:
```hcl
resource "keycloak_openid_client_default_scopes" "broker_client_default_scopes" {
  default_scopes = [
    # ... existing scopes ...
    keycloak_openid_client_scope.acr.name,
    keycloak_openid_client_scope.amr.name,
  ]
}
```

**Redeploy**:
```bash
./dive hub deploy  # Applies Terraform changes
# User must logout/login to get fresh token
```

**Validate**:
```bash
# Check scopes exist
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get client-scopes -r dive-v3-broker-usa | jq -r '.[] | select(.name == "acr" or .name == "amr") | .name'

# Test cross-instance access with MFA user
# Should now work for RESTRICTED resources!
```

---

## Critical Constraints (MUST FOLLOW)

### 1. DIVE CLI ONLY

**✅ CORRECT**:
```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy FRA "France"
./dive spoke register FRA
```

**❌ FORBIDDEN**:
```bash
docker-compose up
docker restart
terraform apply  # Only via ./dive
```

### 2. NO EXCEPTIONS, NO SHORTCUTS

- ❌ NO manual Keycloak configuration
- ❌ NO "skip this for now" logic
- ❌ NO workarounds
- ✅ ONLY root cause fixes
- ✅ ONLY solutions that work from clean slate

### 3. All Data is DUMMY/FAKE

**Authorization**: Full authority to nuke Docker as needed
- Users: testuser-* (fake)
- Data: Test seed data
- Certificates: Self-signed

---

## What NOT to Do

❌ **Don't trust session claims = access token claims** - They're different tokens!
❌ **Don't skip clean slate validation** - Only way to prove automation works
❌ **Don't use static files when MongoDB SSOT exists** - Violates architecture
❌ **Don't assume dependencies ready at startup** - Use retry logic
❌ **Don't test only one layer** - Must test full user flow (SSO → search → detail → ABAC)

---

## Key Questions to Answer

1. **Does UNCLASSIFIED cross-instance work?** (Proves infrastructure)
2. **Do ACR/AMR scopes fix MFA enforcement?** (Critical feature)
3. **Does clean slate create ACR/AMR scopes?** (Proves Terraform)
4. **Can we commit MongoDB SSOT progress?** (Preserve work)
5. **Ready for Phase 2 (Terraform mapper SSOT)?** (Next priority)

---

## Expected Outcomes

**After This Session**:
- ✅ ACR/AMR client scopes working
- ✅ Cross-instance MFA enforcement working
- ✅ All federation layers working (4/4)
- ✅ MongoDB SSOT + cross-instance committed
- ✅ Ready for multi-spoke testing

---

## Success Metrics

**Must Achieve**:
- [ ] ACR/AMR in access tokens
- [ ] Cross-instance RESTRICTED access working
- [ ] Hub sees ACR='2' for MFA users
- [ ] Clean slate deployment includes ACR/AMR scopes

**Should Achieve**:
- [ ] Commit MongoDB SSOT progress
- [ ] Document ACR/AMR fix
- [ ] Proceed to Phase 2 (Terraform mapper SSOT)

**Nice to Have**:
- [ ] French translations fixed
- [ ] Data quality improved
- [ ] Deploy DEU spoke

---

**Quality Bar**: Best practice, persistent, resilient solutions with full testing
**Authorization**: Nuke/clean Docker resources as needed (all data is DUMMY/FAKE)
**Constraint**: DIVE CLI ONLY - NO manual docker commands
**Standard**: NO EXCEPTIONS, NO SHORTCUTS, NO WORKAROUNDS

---

**START HERE**: Read @.cursor/NEXT_SESSION_HANDOFF_FEDERATION_COMPLETE.md, then fix ACR/AMR client scopes
