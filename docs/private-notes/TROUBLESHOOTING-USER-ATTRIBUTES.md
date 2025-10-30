# Troubleshooting User Attributes in DIVE-V3

**Issue**: User clearance/classification not showing in dashboard  
**Affected Users**: admin-dive, or any new users in broker realm  
**Root Cause**: Keycloak 26 + Terraform provider bug (attributes don't sync via REST API)

---

## Quick Fix for admin-dive User

**Status**: ✅ **RESOLVED** (October 29, 2025)

The admin-dive user now has all required attributes set:

```
✓ clearance: TOP_SECRET
✓ clearanceOriginal: TOP SECRET
✓ clearanceCountry: USA
✓ countryOfAffiliation: USA
✓ uniqueID: admin-dive@dive.mil
✓ acpCOI: ["NATO-COSMIC","FVEY"]
✓ dutyOrg: DIVE-V3
✓ orgUnit: Administration
```

**Next Steps**:
1. Log out of DIVE-V3 completely
2. Close all browser tabs (or use Incognito window)
3. Log back in as `admin-dive` / `Password123!`
4. Your clearance should now display correctly

---

## Verifying User Attributes

### Check if User Has Attributes

```bash
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ua.name, ua.value 
FROM user_attribute ua 
JOIN user_entity ue ON ua.user_id = ue.id 
WHERE ue.username = 'YOUR_USERNAME' 
  AND ue.realm_id = 'YOUR_REALM' 
ORDER BY ua.name;
"
```

**Example** (for admin-dive):
```bash
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ua.name, ua.value 
FROM user_attribute ua 
JOIN user_entity ue ON ua.user_id = ue.id 
WHERE ue.username = 'admin-dive' 
  AND ue.realm_id = 'dive-v3-broker' 
ORDER BY ua.name;
"
```

**Expected Output**: Should show all 8 attributes (clearance, clearanceOriginal, etc.)

---

## Fixing Missing Attributes (Manual Method)

If a user is missing attributes, use this SQL script:

```bash
docker exec dive-v3-postgres psql -U postgres -d keycloak_db << 'EOSQL'
-- Replace USERNAME, REALM, and attribute values as needed

INSERT INTO user_attribute (id, name, value, user_id) VALUES
(gen_random_uuid()::text, 'clearance', 'TOP_SECRET', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'clearanceOriginal', 'TOP SECRET', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'clearanceCountry', 'USA', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'countryOfAffiliation', 'USA', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'uniqueID', 'USERNAME@dive.mil', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'acpCOI', '["NATO-COSMIC","FVEY"]', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'dutyOrg', 'DIVE-V3', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM')),
(gen_random_uuid()::text, 'orgUnit', 'Administration', 
 (SELECT id FROM user_entity WHERE username = 'USERNAME' AND realm_id = 'REALM'));
EOSQL
```

---

## Using the Automated Script (Recommended)

For nation realm users (alice.general, carlos.garcia, etc.), use:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/scripts
python3 populate-all-user-attributes.py
```

This script automatically populates attributes for all 40 test users in the 10 nation realms.

---

## Why This Happens

**Terraform Keycloak Provider Bug**:
- Terraform provider 5.5.0 doesn't properly sync user attributes with Keycloak 26
- REST API calls to update user attributes succeed (HTTP 200/204) but attributes aren't persisted
- **Workaround**: Direct database insertion using SQL

**User Profile Requirement**:
- Keycloak 26 requires `userProfileEnabled: true` for attributes to work
- All 10 nation realms have this enabled (from Phase 2)
- Broker realm does NOT have User Profile enabled (may cause issues)

---

## Prevention for New Users

When creating new users via Terraform, attributes won't sync. Options:

### Option 1: Use Keycloak Admin Console
1. Log into Keycloak Admin Console (http://localhost:8081/admin)
2. Select the realm
3. Go to Users → Select user → Attributes tab
4. Manually add:
   - clearance
   - clearanceOriginal
   - clearanceCountry
   - countryOfAffiliation
   - uniqueID
   - acpCOI (as JSON array string)

### Option 2: Use Python Script
Create a script similar to `populate-all-user-attributes.py` for your new user.

### Option 3: Use Direct SQL
Use the SQL INSERT statement above with proper username/realm values.

---

## Testing User Attributes Work

### 1. Check Database

```bash
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ue.username, ue.realm_id, ua.name, ua.value 
FROM user_entity ue 
LEFT JOIN user_attribute ua ON ue.id = ua.user_id 
WHERE ue.username = 'admin-dive' 
ORDER BY ua.name;
"
```

**Expected**: Should see 8 rows (one for each attribute)

### 2. Check Token Claims

After logging in, decode the JWT token to verify claims are included:

```bash
# Get token from browser DevTools → Application → Local Storage
# Copy the access token

# Decode at jwt.io or use:
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

**Expected Claims**:
```json
{
  "clearance": "TOP_SECRET",
  "clearanceOriginal": "TOP SECRET",
  "clearanceCountry": "USA",
  "countryOfAffiliation": "USA",
  "uniqueID": "admin-dive@dive.mil",
  "acpCOI": ["NATO-COSMIC", "FVEY"]
}
```

### 3. Check Frontend Display

After logging in successfully:
- Dashboard should show clearance badge
- User profile should display clearance level
- Resource access should respect clearance (SECRET resource accessible with TOP_SECRET clearance)

---

## Common Issues

### Issue 1: Attributes Set but Not Showing

**Symptom**: Database shows attributes, but dashboard doesn't display them  
**Cause**: Session cached old token without attributes  
**Solution**:
1. Log out completely
2. Clear browser cache/cookies for localhost:3000
3. Use Incognito/Private window
4. Log back in

### Issue 2: Attributes Disappear After Terraform Apply

**Symptom**: Attributes work, then disappear after `terraform apply`  
**Cause**: Terraform provider bug overwrites attributes  
**Solution**:
- Don't manage user attributes via Terraform
- Use SQL or Python script after Terraform runs
- Consider adding post-apply script to repopulate attributes

### Issue 3: COI Not Working

**Symptom**: acpCOI attribute not recognized  
**Cause**: COI must be JSON array string, not regular string  
**Solution**:
```sql
-- WRONG
INSERT INTO user_attribute (id, name, value, user_id) 
VALUES (gen_random_uuid()::text, 'acpCOI', 'NATO-COSMIC,FVEY', ...);

-- CORRECT
INSERT INTO user_attribute (id, name, value, user_id) 
VALUES (gen_random_uuid()::text, 'acpCOI', '["NATO-COSMIC","FVEY"]', ...);
```

---

## Production Recommendations

1. **Use External Identity Provider**: Production should use real IdPs (Okta, Azure AD, etc.) that manage user attributes properly

2. **Don't Use Terraform for User Management**: Manage users through Keycloak Admin Console or REST API directly

3. **Automate Attribute Population**: Create CI/CD job that runs after Terraform to ensure all users have required attributes

4. **Monitor Attribute Drift**: Regular checks to ensure attributes haven't been lost

5. **User Profile Schema**: Ensure all realms have `userProfileEnabled: true` and proper attribute validators

---

## Reference

- **Phase 2 Bug #1 Fix**: `USER-ATTRIBUTES-FIX-COMPLETE.md`
- **Populate Script**: `scripts/populate-all-user-attributes.py`
- **Terraform Bug**: Known issue with Keycloak provider 5.5.0 + Keycloak 26
- **This Fix**: Applied October 29, 2025 (Phase 4 completion)

---

**Last Updated**: October 29, 2025  
**Status**: admin-dive user ✅ RESOLVED  
**Other Users**: Use `populate-all-user-attributes.py` for nation realm users

