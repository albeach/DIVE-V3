# Keycloak 26 Migration - Other Breaking Changes Guide

**Date**: October 27, 2025  
**Status**: Reference Document  
**Priority**: Review and implement as needed  

---

## 📋 Overview

Beyond the critical ACR/AMR/auth_time issues, Keycloak 26 introduces several other breaking changes that may affect DIVE V3. This guide documents each change and provides migration paths.

---

## 🔴 High Priority Changes

### 1. **JWT Audience Validation Now Stricter**

**From**: `Keycloak-LLMS.txt:523-531`

> "The revised OIDC Core specification uses a stricter audience check: The Audience value MUST be the OP's Issuer Identifier passed as a string, and not a single-element array."

#### Impact on DIVE V3
- Backend already handles both `string` and `string[]` for `aud` claim ✅
- JWT validation may need adjustment if you're expecting arrays

#### Current Configuration
```typescript
// backend/src/middleware/authz.middleware.ts:54
aud?: string | string[];  // ✅ Already handles both
```

#### Action Required
- [x] Verify JWT validation supports single-string `aud`
- [ ] Test with various IdP configurations
- [ ] Update any hardcoded audience checks

---

### 2. **`session_state` Claim Removed from Tokens**

**From**: `Keycloak-LLMS.txt:1323-1330`

> "The `session_state` claim is now removed from all tokens as it is not required according to the OpenID Connect specifications."

#### Impact on DIVE V3
- If frontend or backend relies on `session_state` in JWT payload, it will be missing
- `session_state` still present in **Access Token Response** (not in JWT itself)

#### Current Usage
Search codebase for `session_state`:
```bash
grep -r "session_state" backend/ frontend/ --exclude-dir=node_modules
```

#### Migration Options

**Option A**: Remove `session_state` usage (recommended)
```typescript
// Before
const sessionState = token.session_state;

// After
const sessionId = token.sid;  // Use 'sid' claim instead
```

**Option B**: Add backwards compatibility mapper (if needed)
```terraform
# terraform/realms/broker-realm.tf
resource "keycloak_generic_protocol_mapper" "session_state_compat" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "session-state-compat"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note" = "SESSION_STATE"
    "claim.name"        = "session_state"
    "jsonType.label"    = "String"
    "id.token.claim"    = "true"
    "access.token.claim" = "true"
  }
}
```

---

### 3. **`nonce` Claim Only in ID Token**

**From**: `Keycloak-LLMS.txt:1343-1346`

> "The `nonce` claim is now only added to the ID token strictly following the OpenID Connect Core 1.0 specification."

#### Impact on DIVE V3
- If you validate `nonce` in **access tokens**, validation will fail
- `nonce` now only in **ID tokens**

#### Migration
```typescript
// Before (WRONG - checking access token)
if (accessToken.nonce !== expectedNonce) {
  throw new Error('Invalid nonce');
}

// After (CORRECT - checking ID token)
if (idToken.nonce !== expectedNonce) {
  throw new Error('Invalid nonce');
}
```

#### Action Required
- [ ] Search for `nonce` validation in backend
- [ ] Ensure validation only checks ID tokens
- [ ] Update frontend if it validates nonce

---

## 🟡 Medium Priority Changes

### 4. **Database Index Changes**

**From**: `Keycloak-LLMS.txt:217-220`

> "The EVENT_ENTITY table now has an index IDX_EVENT_ENTITY_USER_ID_TYPE... If the table contains more than 300,000 entries, Keycloak skips the index creation."

#### Impact on DIVE V3
- Automatic index creation may be skipped
- You'll see SQL statements in console during migration

#### Action Required
```bash
# During migration, look for messages like:
# "Skipping index creation: EVENT_ENTITY has >300k rows"
# "Run manually: CREATE INDEX IDX_EVENT_ENTITY_USER_ID_TYPE ON EVENT_ENTITY(USER_ID, TYPE, EVENT_TIME);"

# If you see this, run the SQL manually after Keycloak starts
```

---

### 5. **Password Hashing Algorithm Changes**

**From**: `Keycloak-LLMS.txt:1777-1850`

> "The default password hashing provider has changed from pbkdf2-sha256 to pbkdf2-sha512. The number of default hash iterations for pbkdf2 has also changed."

#### Impact on DIVE V3
- **CPU usage will increase 2-3x** for password-based logins
- Passwords will be **re-hashed automatically** on first login
- Increased database write activity temporarily

| Algorithm | Old Iterations | New Iterations | Performance Impact |
|-----------|----------------|----------------|-------------------|
| pbkdf2-sha256 | 27,500 | 600,000 | +431ms avg |
| pbkdf2-sha512 | 30,000 | 210,000 | +191ms avg |

#### Action Required
- [ ] Monitor CPU usage after upgrade
- [ ] Adjust resource limits if needed (see HA guide)
- [ ] Consider keeping old hashing if performance is critical:

```bash
# In Keycloak config to keep old hashing
# Add to password policy in realm settings:
# Hash Algorithm: pbkdf2-sha256
# Hash Iterations: 27500
```

---

### 6. **Management Port Changes**

**From**: `Keycloak-LLMS.txt:1365-1372`

> "The /health and /metrics endpoints are accessible on the management port 9000... no longer exposed to standard Keycloak ports 8080 and 8443."

#### Impact on DIVE V3
- Health checks on `:8080/health` will fail
- Metrics on `:8080/metrics` will fail

#### Migration
```yaml
# docker-compose.yml
services:
  keycloak:
    ports:
      - "8081:8080"   # Standard port
      - "9000:9000"   # NEW: Management port
    environment:
      - KC_HEALTH_ENABLED=true
      - KC_METRICS_ENABLED=true
```

Update health checks:
```bash
# Before
curl http://localhost:8081/health

# After
curl http://localhost:9000/health
```

---

## 🟢 Low Priority / Informational

### 7. **Welcome Page Creates Regular Admin Users**

**From**: `Keycloak-LLMS.txt:274-275`

> "The Welcome Page creates regular Admin users instead of temporary ones."

#### Impact
- No action required
- Admin users created via welcome page are now permanent

---

### 8. **Fine-Grained Admin Permissions V2**

**From**: `Keycloak-LLMS.txt:593-651`

> "Keycloak introduces fine-grained admin permissions V2... FGAP:V2 feature is enabled by default."

#### Impact
- If you're using realm-level admin roles, they may need reconfiguration
- V1 still available but deprecated

#### Action Required
- [ ] Review admin role assignments
- [ ] Test admin console access after upgrade
- [ ] Migrate to V2 if using V1 features

---

### 9. **Hostname Configuration Changes (Already Applied)**

**From**: `Keycloak-LLMS.txt:1113-1180`

> "New Hostname options... Old options deprecated."

#### Status
✅ **Already handled** by your Keycloak configuration

---

### 10. **Persistent User Sessions Enabled by Default**

**From**: `Keycloak-LLMS.txt:1183-1249`

> "All user sessions are persisted by default... database is now the source of truth."

#### Impact
- User sessions survive Keycloak restarts ✅
- Increased database usage
- Grace period for idle sessions removed

#### Benefits
- Users stay logged in across Keycloak upgrades
- Better HA support

#### Configuration
Already enabled in your setup. To adjust cache sizes:
```xml
<!-- keycloak/conf/cache-ispn.xml -->
<distributed-cache name="sessions" owners="1">
    <memory max-count="10000"/>  <!-- Adjust if needed -->
</distributed-cache>
```

---

## 🛠️ Migration Checklist

### Pre-Migration
- [x] Backup Keycloak database
- [x] Backup Keycloak configuration files
- [x] Document current token claims
- [x] Test in non-production environment

### During Migration
- [x] Apply Terraform fixes (ACR/AMR/auth_time) ✅
- [x] Update custom SPI (session notes) ✅
- [ ] Monitor CPU usage increase
- [ ] Watch for database index warnings
- [ ] Verify health/metrics endpoints on port 9000

### Post-Migration
- [ ] Run verification script (`verify-keycloak-26-claims.sh`)
- [ ] Run integration tests (`keycloak-26-claims.integration.test.ts`)
- [ ] Test all IdP realms (USA, FRA, CAN, Industry)
- [ ] Verify AAL2 validation works
- [ ] Check frontend authentication flows
- [ ] Monitor system resources (CPU, memory, database)

### Week After Migration
- [ ] Review password re-hashing performance
- [ ] Check for any `session_state` errors
- [ ] Verify `nonce` validation working
- [ ] Confirm no JWT audience validation errors
- [ ] Performance testing with new hash iterations

---

## 📊 Risk Assessment

| Change | Risk Level | Impact | Mitigation |
|--------|-----------|---------|------------|
| **ACR/AMR Claims** | 🔴 Critical | Auth broken | ✅ Fixed |
| **auth_time Missing** | 🔴 Critical | NIST violation | ✅ Fixed |
| **JWT Audience** | 🟡 Medium | Potential validation errors | Test needed |
| **session_state** | 🟡 Medium | Frontend errors | Search & fix |
| **nonce Location** | 🟡 Medium | Validation errors | Update validation |
| **Password Hashing** | 🟠 Medium | CPU increase | Monitor resources |
| **Management Port** | 🟠 Medium | Health checks fail | Update ports |
| **Database Indexes** | 🟢 Low | Manual SQL needed | Run if prompted |
| **Admin Permissions** | 🟢 Low | Admin access | Test admin console |

---

## 🔍 Verification Commands

### Check Token Claims
```bash
./scripts/verify-keycloak-26-claims.sh
```

### Run Integration Tests
```bash
cd backend
npm test -- keycloak-26-claims.integration.test.ts
```

### Check Management Port
```bash
curl http://localhost:9000/health
curl http://localhost:9000/metrics
```

### Monitor CPU During Password Login
```bash
# Watch CPU while users log in
docker stats dive-v3-keycloak
```

### Search for Deprecated Usage
```bash
# Search for session_state
grep -r "session_state" backend/ frontend/ --exclude-dir=node_modules

# Search for nonce in access token validation
grep -r "accessToken.*nonce\|access_token.*nonce" backend/

# Search for audience assumptions
grep -r "aud\[0\]" backend/
```

---

## 📚 References

### Keycloak 26 Changelog
- **Full Changelog**: `Keycloak-LLMS.txt`
- **ACR/AMR Changes**: Lines 432-514
- **JWT Changes**: Lines 523-531, 1323-1346
- **Password Hashing**: Lines 1777-1850
- **Management Port**: Lines 1365-1372

### DIVE V3 Documentation
- **Critical Issues**: `KEYCLOAK-26-MIGRATION-CRITICAL-ISSUES.md`
- **Quick Fix**: `KEYCLOAK-26-QUICK-FIX.md`
- **Verification Script**: `scripts/verify-keycloak-26-claims.sh`
- **Integration Tests**: `backend/src/__tests__/keycloak-26-claims.integration.test.ts`

### External Standards
- **OpenID Connect Core**: https://openid.net/specs/openid-connect-core-1_0.html
- **NIST SP 800-63B**: https://pages.nist.gov/800-63-3/sp800-63b.html
- **Keycloak 26 Release Notes**: https://www.keycloak.org/docs/26.0/release_notes/

---

## ✅ Completion Status

| Category | Status |
|----------|--------|
| **Critical Fixes** | ✅ Complete |
| **Terraform Updates** | ✅ Complete |
| **SPI Updates** | ✅ Complete |
| **Integration Tests** | ✅ Complete |
| **Documentation** | ✅ Complete |
| **Migration Testing** | ⏳ Pending |
| **Production Deployment** | ⏳ Pending |

---

**Document Owner**: DIVE V3 Development Team  
**Last Updated**: October 27, 2025  
**Next Review**: After production deployment

