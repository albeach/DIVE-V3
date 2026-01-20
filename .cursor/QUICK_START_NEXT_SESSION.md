# Quick Start - Next Session

**Session**: 2026-01-20 continuation
**Focus**: ACR/AMR client scope fix
**Est. Time**: 2-3 hours

---

## 🎯 Mission

Fix access tokens to include ACR/AMR claims for cross-instance MFA enforcement

---

## 📚 Read First

1. @.cursor/NEXT_SESSION_HANDOFF_FEDERATION_COMPLETE.md (complete context)
2. @.cursor/FEDERATION_MONGODB_SSOT_FIX.md (what we built)
3. @.cursor/CROSS_INSTANCE_RESOURCE_ACCESS_FIX.md (how it works)

---

## ✅ Quick Validation (5 min)

```bash
# Containers healthy?
docker ps --filter "name=dive-" | wc -l  # Should be 20

# Federation discovery working?
curl -s https://localhost:4000/api/federation/discovery | jq '.instances | length'  # Should be 2

# Test UNCLASSIFIED resource (should work):
# https://localhost:3457/resources/doc-USA-seed-1768895001371-00012
```

---

## 🔧 The Fix (2 hours)

**File**: `terraform/modules/federated-instance/dive-client-scopes.tf`

**Add**:
- ACR client scope + protocol mapper
- AMR client scope + protocol mapper
- Update default scope assignments

**Pattern**: Copy uniqueID scope structure, change to acr/amr

**Deploy**: `./dive hub deploy`

**Test**: Logout/login, access RESTRICTED USA resource

---

## ✓ Success Criteria

- [ ] ACR/AMR scopes in Terraform
- [ ] claim.name = "acr" / "amr"
- [ ] access.token.claim = true
- [ ] Hub sees ACR='2' for MFA users
- [ ] RESTRICTED cross-instance access works

---

## 🚀 Then

- Commit MongoDB SSOT + cross-instance progress
- Proceed to Phase 2 (Terraform mapper SSOT)
- Deploy DEU/GBR spokes

---

**Constraint**: DIVE CLI only, no shortcuts, full testing
**Data**: All DUMMY/FAKE - authorized to nuke
