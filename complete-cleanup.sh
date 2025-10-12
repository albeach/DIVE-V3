#!/bin/bash

echo "=== Complete System Cleanup for Fresh Testing ==="
echo ""

# 1. Clear NextAuth database
echo "1. Clearing NextAuth database..."
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "
TRUNCATE TABLE account CASCADE;
TRUNCATE TABLE session CASCADE;
TRUNCATE TABLE \"user\" CASCADE;
SELECT 'NextAuth cleaned' as status;
" 2>&1 | grep -E "TRUNCATE|cleaned"

# 2. Delete federated users from dive-v3-pilot (they'll be recreated on next login)
echo ""
echo "2. Deleting federated users from dive-v3-pilot realm..."
docker-compose exec -T postgres psql -U postgres -d keycloak_db -c "
DELETE FROM user_attribute WHERE user_id IN (
  SELECT u.id FROM user_entity u
  JOIN realm r ON u.realm_id = r.id
  WHERE r.name = 'dive-v3-pilot'
  AND u.email IN ('pierre.dubois@defense.gouv.fr', 'john.macdonald@forces.gc.ca', 'bob.contractor@lockheed.com')
);
DELETE FROM federated_identity WHERE user_id IN (
  SELECT u.id FROM user_entity u
  JOIN realm r ON u.realm_id = r.id
  WHERE r.name = 'dive-v3-pilot'
  AND u.email IN ('pierre.dubois@defense.gouv.fr', 'john.macdonald@forces.gc.ca', 'bob.contractor@lockheed.com')
);
DELETE FROM user_entity WHERE id IN (
  SELECT u.id FROM user_entity u
  JOIN realm r ON u.realm_id = r.id
  WHERE r.name = 'dive-v3-pilot'
  AND u.email IN ('pierre.dubois@defense.gouv.fr', 'john.macdonald@forces.gc.ca', 'bob.contractor@lockheed.com')
);
SELECT 'Federated users deleted' as status;
" 2>&1 | grep -E "DELETE|deleted"

echo ""
echo "=== Cleanup Complete ==="
echo ""
echo "✅ All test data cleared"
echo "✅ Fresh login will create users with ALL attributes"
echo ""
echo "TEST NOW (in incognito window):"
echo "1. France SAML:   testuser-fra / Password123!"
echo "2. Canada OIDC:   testuser-can / Password123!"
echo "3. Industry OIDC: bob.contractor / Password123!"
echo ""
echo "All attributes should now appear correctly!"

