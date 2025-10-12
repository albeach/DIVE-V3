#!/bin/bash

echo "=== Diagnosing Canada OIDC Attribute Flow ==="
echo ""

# Check if testuser-can exists in dive-v3-pilot (from broker)
echo "1. Checking if Canada user exists in dive-v3-pilot realm..."
docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "
SELECT u.username, u.email, u.first_name, u.last_name
FROM user_entity u
JOIN realm r ON u.realm_id = r.id
WHERE r.name = 'dive-v3-pilot' 
AND u.email LIKE '%macdonald%';
" 2>&1 | grep -v "warning\|version" | head -5

echo ""
echo "2. Checking user attributes in dive-v3-pilot..."
docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "
SELECT ua.name, ua.value
FROM user_attribute ua
JOIN user_entity u ON ua.user_id = u.id  
JOIN realm r ON u.realm_id = r.id
WHERE r.name = 'dive-v3-pilot'
AND u.email LIKE '%macdonald%'
ORDER BY ua.name;
" 2>&1 | grep -v "warning\|version" | head -20

echo ""
echo "3. Checking Canada IdP broker mappers..."
docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "
SELECT name, identity_provider_mapper
FROM identity_provider_mapper
WHERE identity_provider_alias = 'canada-idp'
ORDER BY name;
" 2>&1 | grep -v "warning\|version" | head -20

