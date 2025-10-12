#!/bin/bash

echo "Deleting Pierre from Keycloak dive-v3-pilot with CASCADE..."

docker-compose exec -T postgres psql -U postgres -d keycloak_db << 'SQL'
-- Get Pierre's user ID
\set pierre_id (SELECT id FROM user_entity WHERE email = 'pierre.dubois@defense.gouv.fr' AND realm_id = (SELECT id FROM realm WHERE name = 'dive-v3-pilot'))

-- Delete in proper order (respect foreign keys)
DELETE FROM user_role_mapping WHERE user_id = :'pierre_id';
DELETE FROM user_group_membership WHERE user_id = :'pierre_id';
DELETE FROM user_attribute WHERE user_id = :'pierre_id';
DELETE FROM federated_identity WHERE user_id = :'pierre_id';
DELETE FROM user_required_action WHERE user_id = :'pierre_id';
DELETE FROM user_consent WHERE user_id = :'pierre_id';
DELETE FROM credential WHERE user_id = :'pierre_id';
DELETE FROM user_entity WHERE id = :'pierre_id';

SELECT 'Pierre deleted successfully' as status;
SQL

echo "Done!"
