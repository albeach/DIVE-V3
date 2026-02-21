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

# Create service-specific database users with Vault-managed passwords
echo "Creating service-specific database users..."
if [ -f "/scripts/postgres-init/03-create-service-users.sh" ]; then
    bash /scripts/postgres-init/03-create-service-users.sh
    echo "✓ Service users created (keycloak_user, nextauth_user)"
else
    echo "⚠ Service users script not found, skipping"
fi

# Initialize audit tables in dive_v3_app database
echo "Initializing audit tables..."
if [ -f "/scripts/postgres-init/05-init-audit-tables.sql" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "dive_v3_app" < /scripts/postgres-init/05-init-audit-tables.sql
    echo "✓ Audit tables initialized (authorization_log, federation_log, audit_log)"
else
    echo "⚠ Audit tables script not found, skipping"
fi

# Apply WebAuthn userHandle fix for Keycloak 26 bug
if [ -f "/scripts/postgres-init/04-fix-webauthn-userhandle.sql" ]; then
    echo "Applying WebAuthn userHandle fix..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" < /scripts/postgres-init/04-fix-webauthn-userhandle.sql
    echo "✓ WebAuthn userHandle fix applied"
else
    echo "⚠ WebAuthn fix script not found, skipping"
fi