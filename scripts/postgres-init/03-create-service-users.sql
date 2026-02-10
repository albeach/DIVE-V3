-- =============================================================================
-- DIVE V3 - Service-Specific Database Users
-- =============================================================================
-- Creates dedicated PostgreSQL users for each service with database-scoped grants.
-- Replaces the shared 'postgres' superuser for application access.
--
-- Users:
--   keycloak_user  → full access to keycloak_db only
--   nextauth_user  → full access to dive_v3_app only
--
-- Vault Integration:
--   Initial passwords are placeholders. When Vault database engine is configured
--   (./dive vault db-setup), Vault's static roles rotate these passwords
--   automatically on a 24-hour schedule.
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

-- Keycloak user (keycloak_db only)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak_user') THEN
        CREATE ROLE keycloak_user WITH LOGIN PASSWORD 'vault-will-rotate-this';
        RAISE NOTICE 'Created role: keycloak_user';
    ELSE
        RAISE NOTICE 'Role keycloak_user already exists, skipping creation';
    END IF;
END
$$;

-- Least-privilege: revoke public connect so only explicit grants work
REVOKE CONNECT ON DATABASE keycloak_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE dive_v3_app FROM PUBLIC;

-- Grant keycloak_user scoped access to keycloak_db only
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak_user;

-- NextAuth user (dive_v3_app only)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nextauth_user') THEN
        CREATE ROLE nextauth_user WITH LOGIN PASSWORD 'vault-will-rotate-this';
        RAISE NOTICE 'Created role: nextauth_user';
    ELSE
        RAISE NOTICE 'Role nextauth_user already exists, skipping creation';
    END IF;
END
$$;

-- Grant nextauth_user scoped access to dive_v3_app only
GRANT ALL PRIVILEGES ON DATABASE dive_v3_app TO nextauth_user;
