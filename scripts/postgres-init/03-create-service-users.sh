#!/bin/bash
# =============================================================================
# DIVE V3 - Service-Specific Database Users
# =============================================================================
# Creates dedicated PostgreSQL users for each service with database-scoped grants.
# Replaces the shared 'postgres' superuser for application access.
#
# Users:
#   keycloak_user  → full access to keycloak_db only
#   nextauth_user  → full access to dive_v3_app only
#
# Password Source:
#   Reads KC_DB_PASSWORD from environment (set by Vault seed → .env.hub → env_file).
#   Falls back to POSTGRES_PASSWORD if service-level passwords aren't set.
#
# Idempotent: safe to run multiple times (uses CREATE IF NOT EXISTS + ALTER).
# =============================================================================
set -e

# Read passwords from environment (available via docker-compose env_file: .env.hub)
KC_PW="${KC_DB_PASSWORD:-${POSTGRES_PASSWORD}}"
NA_PW="${NEXTAUTH_DB_PASSWORD:-${POSTGRES_PASSWORD}}"

# Extract nextauth password from FRONTEND_DATABASE_URL if available
if [ -z "${NEXTAUTH_DB_PASSWORD:-}" ] && [ -n "${FRONTEND_DATABASE_URL:-}" ]; then
    # Parse password from postgresql://user:PASSWORD@host:port/db
    NA_PW=$(echo "$FRONTEND_DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
    [ -z "$NA_PW" ] && NA_PW="${POSTGRES_PASSWORD}"
fi

echo "Creating service-specific database users..."

# Keycloak user (keycloak_db only)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak_user') THEN
        CREATE ROLE keycloak_user WITH LOGIN PASSWORD '${KC_PW}';
        RAISE NOTICE 'Created role: keycloak_user';
    ELSE
        ALTER ROLE keycloak_user WITH PASSWORD '${KC_PW}';
        RAISE NOTICE 'Updated password for role: keycloak_user';
    END IF;
END
\$\$;

-- Least-privilege: revoke public connect so only explicit grants work
REVOKE CONNECT ON DATABASE keycloak_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE dive_v3_app FROM PUBLIC;

-- Grant keycloak_user scoped access to keycloak_db only
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak_user;
EOSQL

# Grant schema-level privileges (PostgreSQL 15+: public schema not writable by non-owners)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "keycloak_db" <<EOSQL
GRANT ALL ON SCHEMA public TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO keycloak_user;
EOSQL

# NextAuth user (dive_v3_app only)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nextauth_user') THEN
        CREATE ROLE nextauth_user WITH LOGIN PASSWORD '${NA_PW}';
        RAISE NOTICE 'Created role: nextauth_user';
    ELSE
        ALTER ROLE nextauth_user WITH PASSWORD '${NA_PW}';
        RAISE NOTICE 'Updated password for role: nextauth_user';
    END IF;
END
\$\$;

-- Grant nextauth_user scoped access to dive_v3_app only
GRANT ALL PRIVILEGES ON DATABASE dive_v3_app TO nextauth_user;
EOSQL

# Grant schema-level privileges for NextAuth migrations
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "dive_v3_app" <<EOSQL
GRANT ALL ON SCHEMA public TO nextauth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nextauth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nextauth_user;

-- CRITICAL: Grant on EXISTING tables (created by 01-init-nextauth.sql as postgres user)
-- ALTER DEFAULT PRIVILEGES only affects future tables, not existing ones
GRANT ALL ON ALL TABLES IN SCHEMA public TO nextauth_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO nextauth_user;
EOSQL

echo "Service users created/updated: keycloak_user, nextauth_user"
