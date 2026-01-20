# CRITICAL - Final Test Required

**Status**: ALL configuration fixed, all sessions deleted, ready for final test  

---

## What Was Wrong (SF-028: Duplicate IdP Mappers)

**37 IdP mappers** on fra-idp, including **6 uniqueID mappers** that were conflicting!

**Fixed**:
- ✅ Deleted 25+ duplicate/conflicting mappers
- ✅ Kept only essential mappers (one per attribute)
- ✅ Changed sync mode to IMPORT (less aggressive than FORCE)

---

## All Sessions Cleaned

**Deleted**:
- ✅ All FRA users from Hub Keycloak
- ✅ All FRA sessions from PostgreSQL
- ✅ All FRA accounts from PostgreSQL

---

## Verified Configuration

**Hub Client** (dive-v3-broker-usa):
- ✅ All DIVE scopes assigned with correct claim.name
- ✅ Client secret synchronized

**FRA Client** (dive-v3-broker-usa in FRA):
- ✅ All DIVE scopes assigned
- ✅ Scopes have protocol mappers with claim.name

**FRA IdP** (fra-idp in Hub):
- ✅ Only 1 uniqueID mapper (no duplicates)
- ✅ Sync mode: IMPORT
- ✅ All mappers configured correctly

**FRA Source User**:
- ✅ Has uniqueID: "testuser-fra-3"
- ✅ Has clearance: "SECRET"
- ✅ Has country: "FRA"

---

## FINAL TEST

**Please**:
1. **Go to** https://localhost:3000
2. **Select "France" IdP**
3. **Login** as testuser-fra-3 / TestUser2025!Pilot
4. **Enter TOTP** if prompted
5. **Try accessing resource**: doc-USA-seed-1768885050376-01455

**Expected**: 
- User created in Hub with federatedIdentities: fra-idp
- User attributes include uniqueID: "testuser-fra-3"
- Access token includes uniqueID
- Authorization succeeds

**If still fails**, I need to see:
```bash
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get users -r dive-v3-broker-usa -q username=testuser-fra-3 | \
  jq '.[0] | {attributes, federatedIdentities}'
```

---

**This should be the final fix** - removed all conflicting mappers!
