# Best Practice Analysis - Multi-IdP for DIVE V3

**Date:** October 11, 2025  
**Analysis:** Critical Re-evaluation of Architecture

---

## 🎯 Current Situation Analysis

### What We Have Now (Mock Realm Broker Pattern):
```
france-mock-idp realm → broker → dive-v3-pilot realm
canada-mock-idp realm → broker → dive-v3-pilot realm
industry-mock-idp realm → broker → dive-v3-pilot realm
```

### Issues Encountered:
1. ✅ Test 1 (Canada): PASSED - attributes showing correctly
2. ✅ Test 2 (Logout): PASSED - working without errors
3. ❌ Test 3 (France): FAILED - "User already exists" conflict
4. ❌ Test 4 (Industry): FAILED - No enrichment, attributes not set

---

## 🔍 Root Problem Assessment

### Issue #1: "User already exists" (France)

**What Happened:**
- You logged in as Pierre Dubois via France SAML
- User created in dive-v3-pilot with email pierre.dubois@defense.gouv.fr
- You logged out
- You tried to login as Pierre again
- Keycloak asks: "User with this email already exists. How do you want to continue?"

**Why This Happens:**
- Keycloak first broker login creates a user
- Subsequent logins should auto-link (if configured)
- NOT auto-linking = configuration issue with IdP mapper settings

**This is complex broker pattern behavior**

### Issue #2: Industry Enrichment Not Working

**What Should Happen:**
1. Industry user logs in with minimal attributes (just uniqueID, email)
2. NextAuth creates session
3. User navigates to /api/resources/:id
4. Enrichment middleware extracts JWT
5. Fills in missing countryOfAffiliation (from email) and clearance (default UNCLASSIFIED)
6. Passes to authz middleware
7. OPA makes decision

**What's Actually Happening:**
- Dashboard shows attributes from SESSION (not from API call)
- Enrichment middleware only runs on API resource requests
- Dashboard reads session.user.clearance (which is null if not in token)
- **Enrichment never gets called at dashboard level**

---

## 🎓 Industry Best Practices Research

### Best Practice #1: Direct IdP Configuration (Not Broker Pattern)

**Standard Keycloak Multi-IdP Setup:**
```
Real External IdPs → Directly configured in main realm

Example:
- FranceConnect SAML IdP → dive-v3-pilot realm
- GCKey OIDC IdP → dive-v3-pilot realm  
- Azure AD OIDC IdP → dive-v3-pilot realm
```

**NOT:**
```
Mock realm → broker → main realm  ← This is what we're doing (overly complex)
```

**Why Direct is Better:**
- ✅ Simpler configuration (one mapping layer, not two)
- ✅ No broker complexity
- ✅ No "user already exists" issues
- ✅ Standard Keycloak pattern
- ✅ What production would use

### Best Practice #2: For Pilot Without Real IdPs

**Option A: Multiple Users in One Realm** (Simplest)
```
dive-v3-pilot realm:
- testuser-us (USA attributes)
- testuser-fra (FRA attributes)
- testuser-can (CAN attributes)
- testuser-industry (minimal attributes)

All users in same realm, differentiated by attributes
No IdP brokering needed for pilot
```

**Option B: Real External Test IdPs** (Most realistic)
```
- Use real FranceConnect test environment
- Use real GCKey test environment
- Use real Azure AD test tenant
Configure these DIRECTLY in dive-v3-pilot
```

**Option C: Mock Realms as External IdPs** (Current - Complex)
```
- Create separate Keycloak realms to simulate IdPs
- Configure broker relationships
- Deal with double-mapping complexity
- This is what we've been doing ← NOT standard
```

---

## 💡 Recommended Approach for DIVE V3 Pilot

### Pragmatic Solution: Hybrid Approach

**For the 4-week pilot, I recommend:**

**1. Keep U.S. IdP as-is** (Week 1/2 working perfectly)
- Users in dive-v3-pilot realm
- Direct authentication
- ✅ No changes needed

**2. Simplify France/Canada/Industry** (Two options):

**Option A - Simplest (Recommended for pilot timeline):**
```
Add test users DIRECTLY to dive-v3-pilot realm:
- testuser-fra (with FRA attributes) - represents France SAML federation
- testuser-can (with CAN attributes) - represents Canada OIDC federation  
- testuser-industry (minimal attrs) - represents Industry OIDC + enrichment

Benefits:
✅ Working in 30 minutes
✅ Demonstrates multi-country ABAC
✅ Enrichment still testable
✅ Focus on OPA authorization (core value)
✅ No broker complexity

Limitations:
⚠️ Doesn't demonstrate actual SAML/OIDC federation protocols
⚠️ Doesn't show IdP broker pattern
```

**Option B - Best Practice (If we have 1-2 more days):**
```
Abandon mock realms entirely.
Configure IdPs directly in dive-v3-pilot:
- Manual SAML configuration (no broker) for France concept
- Manual OIDC configuration (no broker) for Canada concept

Benefits:
✅ Proper Keycloak IdP pattern
✅ No double-mapping complexity
✅ Production-aligned

Challenges:
⚠️ Requires proper SAML metadata
⚠️ Need to configure IdP endpoints correctly
⚠️ Estimated 2-4 hours to implement correctly
```

---

## 🎯 Specific Issues & Recommended Fixes

### Issue: France "User Already Exists"

**Current Problem:**
- User created from first France login
- Second login doesn't auto-link
- Shows confusing prompt

**Best Practice Fix:**
Either delete the user before retesting OR configure auto-link:

```hcl
# In France IdP configuration:
link_only = false  # Allow new user creation
trust_email = true  # Trust email from IdP
sync_mode = "FORCE"  # Always update from IdP

# Add auto-link mapper or custom first broker flow
```

**Or just:** Delete pierre.dubois from dive-v3-pilot and retest

### Issue: Industry Enrichment Not Working

**Current Problem:**
- Enrichment middleware only runs on /api/resources/:id requests
- Dashboard reads from session (enrichment never called)
- Session has null attributes (Industry token has minimal claims)

**Best Practice Fixes:**

**Option A: Enrich in Session Callback** (Recommended)
```typescript
// In auth.ts session callback:
if (!tokenData.clearance) {
  tokenData.clearance = "UNCLASSIFIED";  // Default enrichment
}
if (!tokenData.countryOfAffiliation && tokenData.email) {
  tokenData.countryOfAffiliation = inferCountryFromEmail(tokenData.email);
}
```

**Option B: Add Enrichment Middleware to Dashboard**
- Not practical (dashboard is server component)
- Would require API route

**Option C: Use Default Claim Values in Keycloak**
```hcl
# In Industry IdP broker configuration:
# Add hardcoded attribute mappers for missing values
```

---

## 🏗️ Recommended Path Forward

### Immediate (Next 2 Hours):

**1. Fix France "Already Exists"** (5 min)
```sql
-- Delete Pierre from dive-v3-pilot
DELETE FROM user_entity WHERE email = 'pierre.dubois@defense.gouv.fr';
```

**2. Fix Industry Enrichment** (30 min)
```typescript
// Move enrichment logic to auth.ts session callback
// Apply defaults there instead of in middleware
```

**3. Test All 3 IdPs** (30 min)
- France SAML
- Canada OIDC
- Industry OIDC + enrichment

**4. Document Limitations** (15 min)
- Mock realm pattern used for pilot
- Production would use direct IdP configuration
- Enrichment in session vs. middleware

### Long-term (Production):

**Abandon Mock Realms:**
- Configure real IdPs directly in dive-v3-pilot
- FranceConnect SAML → dive-v3-pilot (direct)
- GCKey OIDC → dive-v3-pilot (direct)
- Azure AD OIDC → dive-v3-pilot (direct)

**Benefits:**
- ✅ Standard Keycloak pattern
- ✅ Simpler configuration
- ✅ No broker complexity
- ✅ Industry best practice

---

## 📊 Comparison: Current vs. Best Practice

| Aspect | Current (Mock Broker) | Best Practice (Direct IdPs) |
|--------|----------------------|----------------------------|
| Complexity | High | Low |
| Mapping Layers | 2 (client + broker) | 1 (IdP only) |
| Configuration Time | Hours | Minutes |
| User Conflicts | Yes ("already exists") | Rare |
| Production Alignment | Poor | Excellent |
| Pilot Suitable | Marginal | Ideal |
| Demonstrates Federation | Yes | Yes |
| Demonstrates ABAC | Yes | Yes |

---

## 🎯 My Recommendation

### For This Pilot (Pragmatic):

**Quick Fix Approach** (2 hours):
1. Delete Pierre from dive-v3-pilot (fix "already exists")
2. Move enrichment to session callback (fix Industry attributes)
3. Test all 3 IdPs working
4. Document current limitations
5. **Deliver Week 3 as "working but with noted complexities"**

**Proper Refactor** (1-2 days):
1. Remove all mock realms
2. Create test users directly in dive-v3-pilot with different countries
3. Document as "simulated federation" for pilot
4. Production implementation plan for real IdPs
5. **Deliver Week 3 as "production-ready pattern"**

### Which Would You Prefer?

**Option 1: Quick fix current implementation** (~2 hours)
- Gets Week 3 working
- Documents limitations
- Moves to Week 4

**Option 2: Refactor to best practice** (~1-2 days)
- Removes mock realm complexity
- Implements proper pattern
- Production-ready

**I recommend Option 2 if time allows, Option 1 if we need to move to Week 4 quickly.**

What's your preference?

---

**Current Status:** Identified that mock broker pattern is not best practice  
**Root Issue:** Overly complex architecture for pilot needs  
**Awaiting Direction:** Quick fix or proper refactor?

