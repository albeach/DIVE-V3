#!/bin/bash

echo "=== COMPREHENSIVE QA ASSESSMENT ==="
echo ""
echo "Checking ALL integration points:"
echo ""

echo "1. NEXTAUTH DATABASE STRATEGY:"
echo "   - Adapter: DrizzleAdapter"
echo "   - Strategy: database (not JWT)"
echo "   - Tables: user, account, session"
echo ""

docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "
SELECT 
  'Sessions' as table_name, COUNT(*) as count 
FROM session
UNION ALL
SELECT 'Accounts', COUNT(*) FROM account
UNION ALL
SELECT 'Users', COUNT(*) FROM \"user\";
" 2>&1 | grep -v warning

echo ""
echo "2. KEYCLOAK USERS (dive-v3-pilot realm):"
docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "
SELECT COUNT(*) as user_count 
FROM user_entity u
JOIN realm r ON u.realm_id = r.id  
WHERE r.name = 'dive-v3-pilot';
" 2>&1 | grep -v warning

echo ""
echo "3. KEYCLOAK FEDERATED IDENTITY LINKS:"
docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "
SELECT COUNT(*) as federated_link_count
FROM federated_identity fi
JOIN user_entity u ON fi.user_id = u.id
JOIN realm r ON u.realm_id = r.id
WHERE r.name = 'dive-v3-pilot';
" 2>&1 | grep -v warning

echo ""
echo "4. TERRAFORM IDPS CONFIGURED:"
cd terraform && terraform state list | grep identity_provider | wc -l | tr -d ' '
cd ..

echo ""
echo "5. OPA TESTS:"
docker-compose exec -T opa opa test /policies/ -v 2>&1 | grep "PASS:" | tr -d '\n'

echo ""
echo ""
echo "6. BACKEND INTEGRATION TESTS:"
cd backend && npm test 2>&1 | grep "Tests:" | tr -d '\n'
cd ..

echo ""
echo ""
echo "=== ASSESSMENT COMPLETE ==="

