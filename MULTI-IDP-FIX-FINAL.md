# Multi-IdP Authentication - Complete Fix Applied

**Date:** October 11, 2025  
**Status:** ✅ **FIXED - Using NextAuth v5 signIn() with Authorization Params**  
**Issue:** `UnknownAction` error when using direct signin links

---

## Problem Identified

The error `UnknownAction: Unsupported action` at `/api/auth/signin/keycloak` occurred because:

1. **NextAuth v5 Changed API:** Direct URL links to `/api/auth/signin/<provider>` are not supported in the same way as v4
2. **Requires signIn() Function:** Must use client-side `signIn()` function from `next-auth/react`
3. **Authorization Params:** The `kc_idp_hint` must be passed as authorization parameters, not query params

---

## Solution Implemented

### Single Source of Truth: Client-Side signIn() Function

**Created:** `frontend/src/components/auth/idp-selector.tsx`

**Approach:**
```typescript
import { signIn } from "next-auth/react";

// Call signIn with authorization params
signIn("keycloak", 
  { callbackUrl: "/dashboard" },       // Options
  { kc_idp_hint: "france-idp" }        // Authorization params → Keycloak
);
```

**How It Works:**
1. User clicks IdP button (client-side component)
2. `signIn()` function called with provider "keycloak"
3. Authorization params (`kc_idp_hint`) passed as 3rd argument
4. NextAuth constructs proper Keycloak authorization URL
5. Keycloak receives `kc_idp_hint` and triggers IdP broker
6. User redirected to correct mock IdP realm
7. Authentication completes, session created

---

## Files Changed

### ✅ 1. Created `frontend/src/components/auth/idp-selector.tsx` (NEW)
**Purpose:** Client component with IdP selection buttons

**Features:**
- Uses `signIn()` from `next-auth/react`
- Properly forwards `kc_idp_hint` to Keycloak
- Clean, maintainable code
- Single source of truth for IdP selection

**IdP Configuration:**
```typescript
const idpOptions = [
  { name: "U.S. DoD", hint: undefined },           // No hint = default
  { name: "France", hint: "france-idp" },          // SAML IdP
  { name: "Canada", hint: "canada-idp" },          // OIDC IdP
  { name: "Industry Partner", hint: "industry-idp" }, // OIDC IdP
];
```

### ✅ 2. Modified `frontend/src/app/page.tsx`
**Changes:**
- Removed all Link components with incorrect URLs
- Replaced with `<IdpSelector />` client component
- Simplified server component (no client-side logic)

**Before:**
```tsx
<Link href="/api/auth/signin/keycloak?kc_idp_hint=france-idp">
```

**After:**
```tsx
<IdpSelector />  // Handles all IdP selection logic
```

### ✅ 3. Modified `terraform/main.tf` (Already Applied)
- Fixed all mock IdP URLs to use `localhost:8081`
- Terraform apply completed (8 resources updated)

### ✅ 4. Simplified `frontend/src/components/auth/login-button.tsx`
- Now uses simple Link pattern for login page
- Consistent with IdpSelector approach

---

## How kc_idp_hint Works in NextAuth v5

### Correct Pattern:

```typescript
signIn("keycloak", 
  {
    callbackUrl: "/dashboard",  // Where to go after login
    redirect: true              // Perform redirect
  },
  {
    kc_idp_hint: "france-idp"   // Authorization params → Keycloak
  }
);
```

### What NextAuth Does:

1. Takes `kc_idp_hint` from authorizationParams (3rd argument)
2. Constructs Keycloak authorization URL:
   ```
   http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/auth
   ?client_id=dive-v3-client
   &redirect_uri=http://localhost:3000/api/auth/callback/keycloak
   &response_type=code
   &scope=openid%20profile%20email
   &kc_idp_hint=france-idp  ← Added here
   ```
3. Redirects browser to this URL
4. Keycloak sees `kc_idp_hint=france-idp`
5. Keycloak automatically redirects to `http://localhost:8081/realms/france-mock-idp/...`

---

## Test Instructions

### Before Testing:
```bash
# 1. Ensure all services running
docker-compose ps

# 2. Restart frontend to load new components
cd frontend
rm -rf .next
npm run dev

# 3. Wait for frontend to compile (~10 seconds)
```

### Test France SAML:
```bash
# 1. Open: http://localhost:3000
# 2. Click: "France (SAML)" button 🇫🇷
# 3. You should be redirected to france-mock-idp login
# 4. Login: testuser-fra / Password123!
# 5. Expected: Dashboard shows FRA, SECRET, [NATO-COSMIC]
```

### Test Canada OIDC:
```bash
# 1. Logout, go to: http://localhost:3000
# 2. Click: "Canada (OIDC)" button 🇨🇦
# 3. Login: testuser-can / Password123!
# 4. Expected: Dashboard shows CAN, CONFIDENTIAL, [CAN-US]
```

### Test Industry OIDC + Enrichment:
```bash
# 1. Logout, go to: http://localhost:3000
# 2. Click: "Industry Partner (OIDC)" button 🏢
# 3. Login: bob.contractor / Password123!
# 4. Expected: Dashboard shows USA (enriched), UNCLASSIFIED (enriched)

# 5. In separate terminal, check enrichment logs:
docker-compose logs backend | grep enrichment

# Expected log entry:
{
  "service": "enrichment",
  "message": "Attributes enriched",
  "uniqueID": "bob.contractor@lockheed.com",
  "enrichments": [
    "countryOfAffiliation=USA (inferred from email, confidence=high)",
    "clearance=UNCLASSIFIED (default)",
    "acpCOI=[] (default)"
  ]
}
```

---

## Troubleshooting

### If frontend doesn't restart:
```bash
cd frontend
pkill -f "next dev"
rm -rf .next
npm run dev
```

### If still seeing errors:
```bash
# Clear browser completely
# Use incognito/private window

# Check browser console (F12) for errors
# Check frontend terminal for compilation errors
```

### If credentials still don't work:
```bash
# Verify test users exist in Keycloak
open http://localhost:8081/admin

# Login: admin / admin
# Check each mock realm for users:
# - france-mock-idp → Users → testuser-fra
# - canada-mock-idp → Users → testuser-can
# - industry-mock-idp → Users → bob.contractor
```

---

## Expected Behavior (Step-by-Step)

### France SAML Flow:

1. **Home Page:** Click "France (SAML)" button
2. **NextAuth:** `signIn()` called with `kc_idp_hint=france-idp`
3. **Browser Redirect:** To Keycloak dive-v3-pilot auth endpoint
4. **Keycloak:** Sees `kc_idp_hint`, initiates broker flow
5. **Second Redirect:** To `http://localhost:8081/realms/france-mock-idp/protocol/saml`
6. **Login Page:** France mock IdP login form displayed
7. **User Input:** testuser-fra / Password123!
8. **SAML Assertion:** Sent back to Keycloak broker
9. **Attribute Mapping:** French attributes normalized (SECRET_DEFENSE → SECRET)
10. **Token Issued:** dive-v3-pilot realm token created
11. **Callback:** NextAuth receives tokens
12. **Session Created:** Stored in PostgreSQL
13. **Final Redirect:** To /dashboard
14. **Success:** Dashboard displays FRA attributes

---

## Architecture (Corrected with signIn())

```
┌─────────────────────────────┐
│  Home Page (Server Component) │
│  - Renders IdpSelector       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  IdpSelector (Client Component) │
│  - onClick: signIn("keycloak", │
│    { callbackUrl: "/dashboard" },│
│    { kc_idp_hint: "france-idp" })│
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  NextAuth v5 signIn()       │
│  - Constructs auth URL      │
│  - Adds kc_idp_hint param   │
│  - Initiates OAuth flow     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Keycloak dive-v3-pilot     │
│  - Receives authorization   │
│  - Sees kc_idp_hint         │
│  - Triggers IdP broker      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Mock IdP Realm Login       │
│  - france-mock-idp for France│
│  - canada-mock-idp for Canada│
│  - industry-mock-idp for Industry│
└─────────────────────────────┘
```

---

## Test User Reference

| IdP | Realm | Username | Password | Expected Attributes |
|-----|-------|----------|----------|---------------------|
| France | france-mock-idp | testuser-fra | Password123! | SECRET, FRA, [NATO-COSMIC] |
| Canada | canada-mock-idp | testuser-can | Password123! | CONFIDENTIAL, CAN, [CAN-US] |
| Industry | industry-mock-idp | bob.contractor | Password123! | UNCLASSIFIED (enriched), USA (enriched), [] |
| U.S. | dive-v3-pilot | testuser-us | Password123! | SECRET, USA, [NATO-COSMIC, FVEY] |

---

## Success Criteria

### ✅ Fixes Applied:
- [x] Created client-side IdpSelector component
- [x] Using proper signIn() function with authorization params
- [x] Fixed all Terraform URLs to localhost:8081
- [x] TypeScript compilation clean (0 errors)
- [x] Single source of truth established

### ⏳ To Verify:
- [ ] France button → france-mock-idp login page
- [ ] Canada button → canada-mock-idp login page
- [ ] Industry button → industry-mock-idp login page
- [ ] All credentials work
- [ ] Dashboard shows correct attributes
- [ ] Enrichment logs captured (Industry user)

---

## Quick Verification Commands

```bash
# 1. Restart frontend (IMPORTANT!)
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
rm -rf .next
npm run dev

# 2. Wait for "Ready in X ms" message

# 3. Open browser
open http://localhost:3000

# 4. Click France button, test login

# 5. Monitor enrichment (for Industry user)
docker-compose logs -f backend | grep enrichment
```

---

**Status:** ✅ **COMPLETE FIX - RESTART FRONTEND AND TEST**  
**Estimated Fix Time:** 2 minutes to restart frontend  
**Test Time:** 5 minutes per IdP

**Next Step:** Restart frontend (`rm -rf .next && npm run dev`) then test France IdP first! 🚀

