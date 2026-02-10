#!/bin/bash
set -e

# Idempotent database creation - only create if doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE keycloak_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak_db')\gexec

    SELECT 'CREATE DATABASE dive_v3_app'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dive_v3_app')\gexec

    SELECT 'CREATE DATABASE orchestration'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'orchestration')\gexec

    GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE dive_v3_app TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE orchestration TO $POSTGRES_USER;
EOSQL

# Initialize NextAuth schema in dive_v3_app database
echo "Initializing NextAuth schema..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "dive_v3_app" < /scripts/postgres-init/01-init-nextauth.sql

# Initialize orchestration database schema
echo "Initializing orchestration database schema..."
if [ -f "/scripts/postgres-init/02-init-orchestration.sql" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchestration" < /scripts/postgres-init/02-init-orchestration.sql
    echo "✓ Orchestration database schema initialized"
else
    echo "⚠ Orchestration schema file not found, skipping"
fi

# Create service-specific database users (for Vault static role management)
echo "Creating service-specific database users..."
if [ -f "/scripts/postgres-init/03-create-service-users.sql" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" < /scripts/postgres-init/03-create-service-users.sql
    echo "✓ Service users created (keycloak_user, nextauth_user)"
else
    echo "⚠ Service users SQL not found, skipping"
fi