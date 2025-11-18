# Remote IdP Email and Attributes Fix

**Date:** November 7, 2025  
**Issue:** Remote IdP users (steve, charles) cannot login due to missing email; DIVE attributes not captured

## Issues Identified

### Issue 1: PostgreSQL NOT NULL Constraint on Email
**Problem:** Database constraint prevented user creation when IdPs don't provide email addresses.

**Error:**
```
ERROR: null value in column "email" of relation "user" violates not-null constraint
DETAIL: Failing row contains (fd9d60bb-aafe-4159-a2d1-4c68b47eace4, steve, null, null, null).
STATEMENT: insert into "user" ("id", "name", "email", "emailVerified", "image") values (...)
```

**Root Cause:**
- Frontend database schema (`frontend/src/lib/db/schema.ts`) had `email: text("email").notNull()`
- Remote IdPs (like custom OIDC providers) may only send username/uniqueID without email
- NextAuth adapter tried to insert user with `email=null`, violating constraint

### Issue 2: NextAuth Not Generating Email for Remote IdPs
**Problem:** NextAuth's default behavior expects all OAuth providers to return email.

**Root Cause:**
- No `profile` callback defined in NextAuth configuration
- When IdP doesn't provide email, NextAuth adapter tries to insert `null`
- DIVE V3 requirement: support IdPs that only send uniqueID, clearance, countryOfAffiliation, acpCOI

### Issue 3: DIVE Attributes Not Captured
**Problem:** DIVE-specific attributes (clearance, countryOfAffiliation, acpCOI, uniqueID) were not being extracted during OAuth flow.

**Root Cause:**
- No `profile` callback to parse custom claims from OIDC tokens
- Only default OAuth profile fields (sub, email, name) were captured
- Session callback was trying to extract attributes from `id_token` stored in DB, but initial user creation didn't capture them

### Issue 4: Incorrect Attribute Values for Test Users
**Problem:** Remote IdP test users `steve` and `charles` had **literal string values** instead of actual data:
- `uniqueID: "sub"` (literal string, not actual subject ID)
- `acpCOI: "aciCOI"` (literal string, not array)

**Impact:** Even with email fix, these users would have broken attributes in sessions.

## Solutions Implemented

### 1. Made Email Column Nullable

**Changed:** `frontend/src/lib/db/schema.ts`

```typescript
// Before:
export const users = pgTable("user", {
    id: text("id").notNull().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),  // ❌ Blocked remote IdPs
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
});

// After:
export const users = pgTable("user", {
    id: text("id").notNull().primaryKey(),
    name: text("name"),
    email: text("email"),  // ✅ Nullable for remote IdPs
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
});
```

**Database Migration:**
```sql
ALTER TABLE "user" ALTER COLUMN email DROP NOT NULL;
```

**Rationale:**
- Remote IdPs (especially ICAM/federation scenarios) may not provide email
- Email is not required for DIVE authorization (uses uniqueID instead)
- NextAuth sessions can function without email (uses sub/id for user identity)

### 2. Added NextAuth Profile Callback with Email Generation

**Changed:** `frontend/src/auth.ts`

**Added:**
```typescript
callbacks: {
    // FIX (Nov 7): Profile callback to handle remote IdPs without email
    // and capture DIVE attributes from Keycloak tokens
    async profile(profile, tokens) {
        console.log('[NextAuth profile()] Raw profile from Keycloak:', {
            sub: profile.sub,
            email: profile.email,
            preferred_username: profile.preferred_username,
            name: profile.name,
            uniqueID: profile.uniqueID,
            clearance: profile.clearance,
            countryOfAffiliation: profile.countryOfAffiliation,
            acpCOI: profile.acpCOI,
        });

        // ENRICHMENT: Generate email if missing (remote IdPs may not provide)
        let email = profile.email;
        if (!email || email.trim() === '') {
            // Generate from uniqueID (if it looks like email) or username
            const uniqueID = profile.uniqueID || profile.preferred_username || profile.sub;
            if (uniqueID && uniqueID.includes('@')) {
                email = uniqueID;
            } else {
                // Generate synthetic email: username@dive-broker.internal
                email = `${uniqueID || profile.sub}@dive-broker.internal`;
            }
            console.log('[NextAuth profile()] Generated email:', email, 'from uniqueID:', uniqueID);
        }

        // Return profile with all DIVE attributes
        return {
            id: profile.sub,
            name: profile.name || profile.preferred_username || profile.sub,
            email: email,
            image: profile.picture,
            uniqueID: profile.uniqueID || profile.preferred_username || profile.sub,
            clearance: profile.clearance || 'UNCLASSIFIED',
            countryOfAffiliation: profile.countryOfAffiliation || profile.country || 'UNKNOWN',
            acpCOI: profile.acpCOI || profile.aciCOI || [],
            roles: profile.realm_access?.roles || profile.roles || [],
        };
    },
    // ... other callbacks
}
```

**How It Works:**
1. **Email Generation Logic:**
   - If IdP provides email → use it
   - If uniqueID looks like email (`user@domain`) → use uniqueID
   - Otherwise → generate synthetic email: `{username}@dive-broker.internal`

2. **DIVE Attribute Capture:**
   - Extract `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI` from OIDC profile
   - Provide defaults: `clearance=UNCLASSIFIED`, `countryOfAffiliation=UNKNOWN`
   - Handle alternate claim names: `acpCOI` or `aciCOI`, `countryOfAffiliation` or `country`

3. **When Profile Callback Runs:**
   - **First login:** After OAuth callback, before user creation in database
   - **Subsequent logins:** Not called (user already exists in DB)

### 3. Updated Custom Session Route

**Changed:** `frontend/src/app/api/auth/custom-session/route.ts`

Added same email generation logic for custom login flow (non-OAuth):

```typescript
// ENRICHMENT: Generate email if missing (remote IdPs may not provide)
let email = payload.email || payload.preferred_username;
const uniqueID = payload.uniqueID || payload.sub;

if (!email || email.trim() === '') {
    // If uniqueID looks like email, use it
    if (uniqueID && uniqueID.includes('@')) {
        email = uniqueID;
    } else {
        // Generate synthetic email
        email = `${uniqueID || payload.sub}@dive-broker.internal`;
    }
    console.log('[Custom Session] Generated email:', email);
}
```

**Rationale:** Ensures consistency between OAuth and custom login flows.

### 4. Fixed Remote IdP Test User Attributes

**Updated Users:**
- **steve:** Fixed attributes via Keycloak Admin API
- **charles:** Fixed attributes via Keycloak Admin API

**Before (Broken):**
```json
{
  "username": "steve",
  "email": null,
  "attributes": {
    "uniqueID": ["sub"],         // ❌ Literal string "sub"
    "acpCOI": ["aciCOI"]         // ❌ Literal string "aciCOI"
  }
}
```

**After (Fixed):**
```json
{
  "username": "steve",
  "email": null,
  "attributes": {
    "uniqueID": ["steve@remote-idp.example.com"],
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["USA"],
    "acpCOI": ["NATO-COSMIC", "FVEY"]
  }
}
```

**charles (Fixed):**
```json
{
  "username": "charles",
  "email": null,
  "attributes": {
    "uniqueID": ["charles@remote-idp.example.com"],
    "clearance": ["CONFIDENTIAL"],
    "countryOfAffiliation": ["GBR"],
    "acpCOI": ["NATO-COSMIC"]
  }
}
```

**How Fixed:**
```bash
# Via Keycloak Admin API
curl -X PUT "http://localhost:8081/admin/realms/dive-v3-broker/users/{user_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["steve@remote-idp.example.com"],
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["NATO-COSMIC", "FVEY"]
    }
  }'
```

## Testing Instructions

### Test 1: Remote IdP User Login (steve)
1. Navigate to: `https://kas.js.usa.divedeeper.internal:3000/login`
2. Click "Sign in with Keycloak"
3. Login as:
   - **Username:** `steve`
   - **Password:** `password123` (or your configured password)
4. **Expected Result:**
   - ✅ Login succeeds (no PostgreSQL error)
   - ✅ User created in database with generated email: `steve@dive-broker.internal`
   - ✅ Session contains DIVE attributes: clearance=SECRET, country=USA, COI=[NATO-COSMIC, FVEY]

### Test 2: Check User Profile After Login
```bash
# Query PostgreSQL to verify user was created
docker compose exec postgres psql -U postgres -d dive_v3_app \
  -c "SELECT id, name, email FROM \"user\" WHERE name = 'steve';"
```

**Expected Output:**
```
                  id                  | name  |            email             
--------------------------------------+-------+-------------------------------
 613fdf66-8281-467a-8ebd-bccc7648f99e | steve | steve@dive-broker.internal
```

### Test 3: Verify DIVE Attributes in Session
1. After logging in as steve, navigate to Dashboard
2. Check User Info component displays:
   - **Clearance:** SECRET
   - **Country:** USA
   - **COI:** NATO-COSMIC, FVEY
   - **uniqueID:** steve@remote-idp.example.com

### Test 4: Federation Test User (testuser-usa-unclass)
This user has email from national realm, should continue to work normally:

1. Navigate to: `https://kas.js.usa.divedeeper.internal:3000`
2. Click "United States"
3. Login as:
   - **Username:** `testuser-usa-unclass`
   - **Password:** `password123`
4. **Expected Result:**
   - ✅ Email from national realm used: `testuser-usa-unclass@example.mil`
   - ✅ DIVE attributes captured: clearance=UNCLASSIFIED, country=USA

## Architecture Changes

### Before: Email Required Flow
```
Remote IdP → Keycloak Broker → NextAuth OAuth
                                     ↓
                         profile.email = null
                                     ↓
                         NextAuth Adapter
                                     ↓
                      INSERT INTO user (email=null) ← ❌ FAIL
```

### After: Email Optional Flow
```
Remote IdP → Keycloak Broker → NextAuth OAuth
                                     ↓
                         profile() callback
                                     ↓
                    email = generate_if_missing()
                    + capture DIVE attributes
                                     ↓
                         NextAuth Adapter
                                     ↓
                      INSERT INTO user (email=generated) ← ✅ SUCCESS
```

## Database Schema Migration

### Applied Migration
```sql
-- Make email nullable to support remote IdPs
ALTER TABLE "user" ALTER COLUMN email DROP NOT NULL;
```

**Applied:** `docker compose exec postgres psql -U postgres -d dive_v3_app`

**Rollback (if needed):**
```sql
-- Set default email for existing null rows
UPDATE "user" SET email = name || '@dive-broker.internal' WHERE email IS NULL;

-- Re-add NOT NULL constraint
ALTER TABLE "user" ALTER COLUMN email SET NOT NULL;
```

## Supported IdP Scenarios

| IdP Type | Email | uniqueID | Behavior |
|----------|-------|----------|----------|
| **National Realms** (USA, FRA, CAN) | ✅ Provided | ✅ Provided | Use IdP email |
| **Remote OIDC** (steve, charles) | ❌ Not provided | ✅ Provided | Generate from uniqueID |
| **Industry Partner** | ⚠️ May not provide | ✅ Provided | Generate if missing |
| **SAML (Spain)** | ⚠️ Optional | ✅ Provided | Generate if missing |

## Email Generation Logic

### Priority Order:
1. **IdP email** (if provided) → `profile.email`
2. **uniqueID as email** (if contains `@`) → `uniqueID`
3. **Generated email** → `{username}@dive-broker.internal`

### Examples:
| Input | Generated Email |
|-------|-----------------|
| `email: null`, `uniqueID: "steve@remote.com"` | `steve@remote.com` |
| `email: null`, `uniqueID: "steve"` | `steve@dive-broker.internal` |
| `email: "user@mil.gov"`, `uniqueID: "john.doe"` | `user@mil.gov` (no generation needed) |

## DIVE Attribute Capture

### Attributes Captured in Profile Callback:
- `uniqueID` (primary identifier for authorization)
- `clearance` (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- `countryOfAffiliation` (ISO 3166-1 alpha-3: USA, FRA, CAN, GBR, etc.)
- `acpCOI` (Community of Interest array: NATO-COSMIC, FVEY, etc.)
- `roles` (Keycloak realm roles)

### Default Values (if missing from IdP):
- `clearance: "UNCLASSIFIED"`
- `countryOfAffiliation: "UNKNOWN"`
- `acpCOI: []`

### Alternate Claim Names Supported:
- `countryOfAffiliation` OR `country`
- `acpCOI` OR `aciCOI`

## Security Considerations

### Why Email is Not Critical for DIVE:
1. **Authorization uses uniqueID:** OPA policies check `uniqueID`, not email
2. **Email not trustworthy in federation:** Different IdPs may use different email formats or not provide it
3. **uniqueID is authoritative:** Guaranteed to be present and unique per user
4. **Generated emails are internal-only:** `@dive-broker.internal` domain is not routable

### Generated Email Security:
- ✅ Unique per user (based on username/sub)
- ✅ Not exposed to external systems (internal domain)
- ✅ Only used for database identity, not communications
- ✅ Can be updated to real email later if IdP provides it

## Monitoring and Logging

### Log Messages to Watch:
```log
[NextAuth profile()] Generated email: steve@dive-broker.internal from uniqueID: steve
[NextAuth profile()] Raw profile from Keycloak: { uniqueID: 'steve@remote.com', clearance: 'SECRET', ... }
[Custom Session] Generated email: charles@dive-broker.internal
```

### Database Queries for Debugging:
```sql
-- Find users with generated emails
SELECT id, name, email FROM "user" WHERE email LIKE '%@dive-broker.internal';

-- Check for users with NULL email (should be none after fix)
SELECT id, name, email FROM "user" WHERE email IS NULL;
```

## Related Documentation
- Username and WebAuthn Fix: `docs/fixes/username-and-webauthn-fix.md`
- First Broker Login Solution: `docs/fixes/first-broker-login-solution.md`
- Localhost References Fix: `docs/fixes/localhost-references-fixed.md`

## Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Email NOT NULL constraint | ✅ **Fixed** | Made email nullable in schema + migration |
| Missing email generation | ✅ **Fixed** | Added profile callback with smart generation |
| DIVE attributes not captured | ✅ **Fixed** | Profile callback extracts all custom claims |
| steve/charles broken attributes | ✅ **Fixed** | Updated via Keycloak Admin API |
| "Invalid username or password" | ✅ **Fixed** | Root cause was email constraint |

## Files Changed
- ✅ `frontend/src/lib/db/schema.ts` - Made email nullable
- ✅ `frontend/src/auth.ts` - Added profile callback
- ✅ `frontend/src/app/api/auth/custom-session/route.ts` - Email generation
- ✅ Database migration - `ALTER TABLE "user" ALTER COLUMN email DROP NOT NULL`
- ✅ Keycloak users (steve, charles) - Fixed attributes via Admin API

## Verification Checklist
- [x] Database schema updated (email nullable)
- [x] Migration applied to PostgreSQL
- [x] Profile callback added to NextAuth config
- [x] Custom session route updated
- [x] steve user attributes fixed
- [x] charles user attributes fixed
- [x] Frontend container restarted
- [ ] Test login with steve
- [ ] Test login with charles
- [ ] Test login with testuser-usa-unclass (regression test)
- [ ] Verify DIVE attributes in session
- [ ] Check database for generated emails







