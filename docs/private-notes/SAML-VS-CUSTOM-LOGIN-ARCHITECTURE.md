# SAML External IdPs vs Custom Login Page - Architecture Guide

## ❌ **Why Custom Login Page Doesn't Work for External SAML IdPs**

### **Root Cause: Direct Access Grants Don't Support SAML Federation**

The custom login page uses **Keycloak Direct Access Grants (Resource Owner Password Credentials flow)**, which:

1. ✅ Works with **local Keycloak users** (users stored in Keycloak database)
2. ✅ Works with **OIDC federated IdPs** (if they support password grant)
3. ❌ **DOES NOT work with SAML federated IdPs**
4. ❌ **DOES NOT support browser-based SAML redirects**

---

## 🏗️ **Architecture Comparison**

### **Option A: Custom Login Page (Direct Access Grant)** ❌ For SAML

```
┌──────────────┐
│   Frontend   │
│ (Custom Form)│
└──────┬───────┘
       │ POST /api/auth/custom-login
       │ { username, password, idpAlias }
       ▼
┌──────────────┐
│   Backend    │
│    (PEP)     │
└──────┬───────┘
       │ POST /realms/{realm}/protocol/openid-connect/token
       │ grant_type=password
       │ username=john.doe
       │ password=secret
       ▼
┌──────────────┐
│  Keycloak    │
│  (Local DB)  │  ← User MUST exist in Keycloak database
└──────────────┘

✅ Works for: dive-v3-broker, dive-v3-usa, dive-v3-fra (mock realms with local users)
❌ Fails for: esp-realm-external (federated SAML IdP)
```

**Problem**: `esp-realm-external` is an **Identity Provider alias**, not a realm with users!

---

### **Option B: SAML Federation Flow (Standard)** ✅ Correct for SAML

```
┌──────────────┐
│   Frontend   │
└──────┬───────┘
       │ 1. User clicks "Spain SAML" button
       │ 2. Redirect to Keycloak with kc_idp_hint=esp-realm-external
       ▼
┌──────────────────┐
│  Keycloak Broker │
│ (dive-v3-broker) │
└──────┬───────────┘
       │ 3. SAML AuthnRequest → SimpleSAMLphp
       │    (browser redirect)
       ▼
┌─────────────────────┐
│  SimpleSAMLphp IdP  │
│  (spain-saml:9443)  │
│                     │
│ 4. User logs in:    │
│    juan.garcia /    │
│    EspanaDefensa... │
└──────┬──────────────┘
       │ 5. SAML Assertion (signed)
       │    (browser POST back to Keycloak)
       ▼
┌──────────────────┐
│  Keycloak Broker │
│                  │
│ 6. Validate SAML │
│ 7. Map attributes│
│ 8. Issue JWT     │
└──────┬───────────┘
       │ 9. Redirect to frontend
       ▼
┌──────────────┐
│   Frontend   │
│  (Dashboard) │
└──────────────┘

✅ Works for: esp-realm-external, any external SAML/OIDC IdP
✅ Proper SAML signature validation
✅ Attribute mapping via protocol mappers
✅ Standard federation flow
```

---

## 🎯 **Best Practice: Disable Custom Login for External SAML IdPs**

### **Solution: Frontend Should Not Show Custom Login for SAML**

When `protocol === 'saml'`, the frontend should:
1. ❌ **NOT** show the username/password form
2. ✅ **REDIRECT** directly to Keycloak federation flow
3. ✅ Let Keycloak handle SAML redirect to SimpleSAMLphp

---

## 🔧 **Implementation: Frontend Fix Required**

### Current (Broken for SAML):
```typescript
// frontend/src/app/login/[idpAlias]/page.tsx
// Shows custom login form for ALL IdPs (including SAML)

<form onSubmit={handleSubmit}>
  <input name="username" />
  <input name="password" />
  <button>Sign In</button>  ← Doesn't work for SAML!
</form>
```

### Fixed (Redirect SAML to Keycloak):
```typescript
// frontend/src/app/login/[idpAlias]/page.tsx

useEffect(() => {
  if (idp.protocol === 'saml') {
    // Redirect to Keycloak SAML federation flow
    const keycloakAuthUrl = 
      `http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/auth` +
      `?client_id=dive-v3-client` +
      `&redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/callback/keycloak')}` +
      `&response_type=code` +
      `&scope=openid profile email` +
      `&kc_idp_hint=${idp.alias}`;  ← Triggers SAML redirect
    
    window.location.href = keycloakAuthUrl;
    return;
  }
  
  // Show custom login form only for OIDC
}, [idp]);
```

---

## 📋 **Which IdPs Should Use Which Flow?**

| IdP Alias | Protocol | Realm | Custom Login? | Flow |
|-----------|----------|-------|---------------|------|
| `dive-v3-broker` | N/A | dive-v3-broker | ✅ YES | Direct Grant (local users) |
| `usa-realm-broker` | OIDC | dive-v3-usa | ✅ YES | Direct Grant (mock realm) |
| `fra-realm-broker` | OIDC | dive-v3-fra | ✅ YES | Direct Grant (mock realm) |
| `can-realm-broker` | OIDC | dive-v3-can | ✅ YES | Direct Grant (mock realm) |
| `esp-realm-broker` | OIDC | dive-v3-esp | ✅ YES | Direct Grant (mock realm) |
| **esp-realm-external** | **SAML** | dive-v3-broker (IdP alias) | ❌ **NO** | **SAML Federation** |

---

## ✅ **RECOMMENDED SOLUTION**

### **For Spain SAML External IdP**: Use NextAuth.js Federation

Instead of custom-login, use **NextAuth.js Keycloak provider** which properly handles SAML federation:

```typescript
// frontend/src/app/login/[idpAlias]/page.tsx

"use client";
import { signIn } from "next-auth/react";

export default function LoginPage({ params }: { params: { idpAlias: string } }) {
  const handleLogin = async () => {
    // NextAuth.js handles Keycloak federation (including SAML)
    await signIn('keycloak', {
      callbackUrl: '/dashboard',
      // Pass IdP hint to Keycloak
      idp_hint: params.idpAlias
    });
  };

  return <button onClick={handleLogin}>Login via {params.idpAlias}</button>;
}
```

This will:
1. ✅ Redirect to Keycloak
2. ✅ Keycloak sees `idp_hint=esp-realm-external`
3. ✅ Keycloak redirects to SimpleSAMLphp
4. ✅ User authenticates at SimpleSAMLphp
5. ✅ SAML assertion flows back to Keycloak
6. ✅ Keycloak creates session and returns to frontend

---

## 🎯 **Action Items**

### Immediate Fix:
1. **Frontend**: Detect `protocol === 'saml'` and redirect to Keycloak
2. **Backend**: Keep custom-login only for OIDC/local users
3. **Documentation**: Clarify which flow to use for which IdP

### Test:
```bash
# This WILL work (direct SimpleSAMLphp):
http://localhost:9443/simplesaml/module.php/core/authenticate.php?as=example-userpass

# This SHOULD work (DIVE V3 SAML federation):
http://localhost:3000/ → Click "Spain Ministry of Defense (External SAML)"
→ Auto-redirect to Keycloak → Auto-redirect to SimpleSAMLphp → Login → SAML assertion back
```

---

## 📚 **Why This Matters**

### Security & Standards:
- ✅ **SAML Specification**: Requires browser redirects (SSO profile)
- ✅ **Signature Validation**: SAML assertions must be cryptographically signed
- ✅ **Attribute Mapping**: Keycloak protocol mappers handle SAML→OIDC transformation
- ✅ **Single Logout**: SAML SLO requires proper federation flow

### Direct Access Grant Limitations:
- ❌ No SAML redirect capability
- ❌ No SAML assertion validation
- ❌ No attribute mapping
- ❌ No SLO support

---

## ✅ **BEST PRACTICE CONFIRMED**

**For External SAML IdPs (esp-realm-external)**:
- ❌ DO NOT use custom-login page
- ✅ USE Keycloak federation flow with `kc_idp_hint`
- ✅ Let Keycloak handle SAML redirects
- ✅ Browser-based SAML SSO is the standard

**For Internal OIDC Realms (usa-realm-broker, etc.)**:
- ✅ CAN use custom-login page
- ✅ Direct Access Grants work fine
- ✅ Faster UX (no redirect chain)

---

**Summary**: The custom login page is **incompatible with SAML federation by design**. We should redirect SAML IdPs directly to Keycloak federation flow.

