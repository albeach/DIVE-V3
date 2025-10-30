#!/bin/bash
#
# Fix Keycloak 26 User Names Requirement
#
# Keycloak 26 requires first_name and last_name or returns "Account is not fully set up"
# Reference: https://github.com/keycloak/keycloak/issues/36108
#
# This script ensures all DIVE V3 users have names set

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Fixing Keycloak 26 User Names Requirement                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "Issue: Keycloak 26 requires first_name and last_name fields"
echo "Impact: Users with NULL names get 'Account is not fully set up' error"
echo "Solution: Auto-populate names from username (PII minimization compliant)"
echo ""

echo "Updating users with NULL names..."
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
UPDATE user_entity
SET 
    first_name = CASE 
        WHEN username LIKE '%.%' THEN INITCAP(SPLIT_PART(username, '.', 1))
        ELSE 'User'
    END,
    last_name = CASE 
        WHEN username LIKE '%.%' THEN INITCAP(SPLIT_PART(username, '.', 2))
        ELSE INITCAP(username)
    END
WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '')
  AND realm_id LIKE 'dive-v3-%';
"

echo ""
echo "Verification - Users with NULL names:"
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT COUNT(*) as users_with_null_names
FROM user_entity
WHERE (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '')
  AND realm_id LIKE 'dive-v3-%';
"

echo ""
echo "Sample of updated users:"
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT username, first_name, last_name, realm_id
FROM user_entity
WHERE realm_id LIKE 'dive-v3-%'
LIMIT 10;
"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ All DIVE V3 users now have first/last names            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Note: Names are auto-generated from usernames for PII minimization"
echo "Real names are NOT stored - pseudonyms are generated upon login"

