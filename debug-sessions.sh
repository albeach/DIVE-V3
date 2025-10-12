#!/bin/bash

echo "=== COMPREHENSIVE SESSION DEBUG ==="
echo ""

echo "1. NextAuth Database - Active Sessions:"
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "
SELECT s.\"sessionToken\", s.expires, s.\"userId\", u.email, u.name
FROM session s
JOIN \"user\" u ON s.\"userId\" = u.id
ORDER BY s.expires DESC;
" 2>&1 | grep -v warning | head -15

echo ""
echo "2. NextAuth Database - All Users:"
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "
SELECT id, email, name, \"emailVerified\"
FROM \"user\"
ORDER BY email;
" 2>&1 | grep -v warning | head -20

echo ""
echo "3. Keycloak - Users in dive-v3-pilot:"
docker-compose exec -T postgres psql -U postgres -d keycloak_db -c "
SELECT u.username, u.email, u.first_name, u.last_name
FROM user_entity u
JOIN realm r ON u.realm_id = r.id
WHERE r.name = 'dive-v3-pilot'
ORDER BY u.email;
" 2>&1 | grep -v warning | head -20

echo ""
echo "4. Keycloak - Federated Identities (Account Links):"
docker-compose exec -T postgres psql -U postgres -d keycloak_db -c "
SELECT fi.identity_provider, fi.user_id, fi.user_name, u.email
FROM federated_identity fi
JOIN user_entity u ON fi.user_id = u.id
ORDER BY u.email;
" 2>&1 | grep -v warning | head -20

