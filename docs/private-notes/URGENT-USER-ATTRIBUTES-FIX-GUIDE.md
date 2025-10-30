# URGENT: Fix User Clearance Display (5-Minute Manual Fix)

## Problem
All users show "UNCLASSIFIED" in UI regardless of actual clearance level.

## Root Cause
Terraform Keycloak Provider v5.5.0 bug - user attributes not syncing to Keycloak 26.4.2.

## IMMEDIATE FIX (Do This Now - 5 Minutes)

### Step 1: Open Keycloak Admin Console
- URL: http://localhost:8081/admin
- Username: `admin`
- Password: `admin`

### Step 2: Select Realm
- Click dropdown at top-left (shows "Keycloak" or current realm)
- Select: **dive-v3-usa**

### Step 3: Fix alice.general (TOP_SECRET)
1. Click: **Users** (left sidebar)
2. Click username: **alice.general**
3. Click tab: **Attributes**
4. Add these attributes (click "Add attribute" for each):
   - `clearance` = `TOP_SECRET`
   - `clearanceOriginal` = `TOP_SECRET`
   - `countryOfAffiliation` = `USA`
   - `uniqueID` = `550e8400-e29b-41d4-a716-446655440004`
5. Click **Save**

### Step 4: Fix john.doe (SECRET)
1. Click: **Users** → **john.doe**
2. Click: **Attributes**
3. Add:
   - `clearance` = `SECRET`
   - `clearanceOriginal` = `SECRET`
   - `countryOfAffiliation` = `USA`
   - `uniqueID` = `550e8400-e29b-41d4-a716-446655440002`
4. Click **Save**

### Step 5: Fix jane.smith (CONFIDENTIAL)
1. Click: **Users** → **jane.smith**
2. Click: **Attributes**
3. Add:
   - `clearance` = `CONFIDENTIAL`
   - `clearanceOriginal` = `CONFIDENTIAL`
   - `countryOfAffiliation` = `USA`
   - `uniqueID` = `550e8400-e29b-41d4-a716-446655440003`
4. Click **Save**

### Step 6: Fix bob.contractor (UNCLASSIFIED)
1. Click: **Users** → **bob.contractor**
2. Click: **Attributes**
3. Add:
   - `clearance` = `UNCLASSIFIED`
   - `clearanceOriginal` = `UNCLASSIFIED`
   - `countryOfAffiliation` = `USA`
   - `uniqueID` = `550e8400-e29b-41d4-a716-446655440001`
4. Click **Save**

### Step 7: Test
1. Open: http://localhost:3000
2. Logout if logged in
3. Login as: `alice.general` / `Password123!`
4. Dashboard should now show: **TOP_SECRET** (not UNCLASSIFIED!)

## Done!
Once attributes are set, your UI will display correct clearances immediately.

## Long-Term Fix
- Downgrade Terraform provider to 4.4.0 (compatible with Keycloak 26)
- OR upgrade to provider 6.x (if available and stable)
- OR wait for provider 5.5.1 bugfix release
