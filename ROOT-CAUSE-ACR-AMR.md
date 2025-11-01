# ROOT CAUSE: ACR/AMR Missing for admin-dive

**Date**: November 1, 2025 - 06:00 AM  
**Status**: ✅ **ROOT CAUSE IDENTIFIED - FIX DEPLOYED**

---

## 🎯 **THE ACTUAL ROOT CAUSE**

### Why alice.general HAS ACR/AMR (USA Realm)

**alice.general is a FEDERATED user**:

```
1. User logs in to USA REALM
   ↓
2. USA realm authenticates (password + OTP)
   ↓
3. USA realm issues token with ACR/AMR
   {
     "acr": "1",
     "amr": ["pwd","otp"],
     "iss": "https://localhost:8443/realms/dive-v3-usa"
   }
   ↓
4. USA IdP BROKER in broker realm receives this token
   ↓
5. IdP broker has ATTRIBUTE MAPPERS:
   - usa-acr-mapper: claim "acr" → user.attribute "acr"
   - usa-amr-mapper: claim "amr" → user.attribute "amr"
   ↓
6. Broker realm stores ACR/AMR in USER ATTRIBUTES
   ↓
7. Broker realm protocol mappers read user attributes
   ↓
8. Broker realm token includes ACR/AMR
   {
     "acr": "1",  ← From USA realm via IdP broker!
     "amr": ["pwd","otp"],
     "iss": "https://localhost:8443/realms/dive-v3-broker"
   }
```

**Key**: ACR/AMR comes FROM USA REALM, copied via IdP broker mappers!

---

### Why admin-dive DOESN'T HAVE ACR/AMR (Broker Realm)

**admin-dive is a DIRECT broker realm user**:

```
1. User logs in DIRECTLY to BROKER REALM
   ↓
2. Broker realm authenticates (password + OTP)
   ↓
3. NO IdP broker involved (direct login)
   ↓
4. Default "browser" flow doesn't set ACR/AMR session notes
   ↓
5. No user attributes for ACR/AMR (not a federated user)
   ↓
6. Protocol mappers read session notes → EMPTY!
   ↓
7. Broker realm token has NO ACR/AMR
   {
     "auth_time": 1730459456,  ← Set automatically by Keycloak
     "acr": null,              ← NOT set by default browser flow
     "amr": null,              ← NOT set by default browser flow
     "iss": "https://localhost:8443/realms/dive-v3-broker"
   }
```

**Key**: No federation = No source for ACR/AMR!

---

## 🔧 **THE PROPER SOLUTION (No Shortcuts)**

### Custom SPI Must Set Session Notes for Direct Broker Login

The Custom SPI (`DirectGrantOTPAuthenticator`) is the ONLY way to set ACR/AMR for direct broker realm users.

**Bug Found and Fixed**:
```java
// BEFORE (WRONG):
context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "1");
// Protocol mappers read from UserSessionNote, not AuthNote!

// AFTER (CORRECT):
context.getAuthenticationSession().setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "1");
// Now protocol mappers can read it!
```

**Missing Dependency Added**:
```xml
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.0.0</version>
</dependency>
```

**Build Result**: ✅ BUILD SUCCESS

---

## 📊 **COMPARISON TABLE**

| Aspect | alice.general (USA) | admin-dive (Broker) |
|--------|---------------------|---------------------|
| **Login Path** | USA realm → Broker (federated) | Broker realm (direct) |
| **IdP Broker** | ✅ usa-realm-broker | ❌ None |
| **ACR Source** | USA realm token | ❌ None |
| **IdP Mappers** | ✅ Maps ACR/AMR to attributes | ❌ N/A |
| **Protocol Mappers** | Read user attributes | Read session notes (empty!) |
| **Result** | ACR/AMR present ✅ | ACR/AMR missing ❌ |

---

## ✅ **FIX DEPLOYED**

### What Was Done

1. **Identified root cause**: Federation vs direct login
2. **Fixed SPI bug**: setAuthNote() → setUserSessionNote()
3. **Added dependency**: redis.clients:jedis:5.0.0
4. **Rebuilt SPI**: BUILD SUCCESS
5. **Deployed**: Keycloak picked up new JAR automatically

### How It Works Now

**When admin-dive logs in with OTP**:
```
1. Browser Flow: password validation
   ↓
2. Custom SPI: OTP validation
   ↓
3. SPI sets session notes:
   setUserSessionNote("AUTH_CONTEXT_CLASS_REF", "1");    ← AAL2
   setUserSessionNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
   ↓
4. Protocol mappers read session notes:
   - auth-otp-form mapper reads AUTH_CONTEXT_CLASS_REF → acr claim
   - amr mapper reads AUTH_METHODS_REF → amr claim
   ↓
5. Token includes ACR/AMR:
   {
     "acr": "1",
     "amr": ["pwd","otp"]
   }
```

---

## 🚀 **TEST INSTRUCTIONS**

**The fix is deployed. Log out and log back in to test**:

1. **Log out**: https://localhost:3000 → Sign Out
2. **Log in**: 
   - https://localhost:3000/auth/signin
   - Select: "DIVE V3 Broker (Super Admin)"
   - Username: admin-dive
   - Password: DiveAdmin2025!
   - OTP: [6-digit code]
3. **Verify** (Browser Console):
```javascript
fetch('/api/auth/session').then(r => r.json()).then(s => {
  const p = JSON.parse(atob(s.accessToken.split('.')[1]));
  console.log('acr:', p.acr, '| amr:', p.amr);
  console.log(p.acr === '1' ? '✅ FIXED!' : '❌ Still broken');
});
```

**Expected**: `acr: 1 | amr: ["pwd","otp"]` ✅ FIXED!

---

## 📝 **LESSON LEARNED**

**Federation != Direct Login**:
- Federated users get ACR/AMR from source realm
- Direct realm users need Custom SPI to set session notes
- Can't apply federated user solutions to direct users

**Proper Investigation**:
- Compare authentication PATHS, not just configurations
- Trace data flow from source to token
- Understand federation architecture

---

**Status**: ✅ Root cause identified, proper fix deployed, SPI rebuilt, ready for testing

