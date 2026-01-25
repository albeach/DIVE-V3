-- =============================================================================
-- DIVE V3 NextAuth PostgreSQL Schema
-- =============================================================================
-- This schema is required for NextAuth.js database sessions.
-- Automatically applied during spoke initialization.
-- =============================================================================

-- User table: Stores authenticated user profiles
-- Note: id defaults to gen_random_uuid() for NextAuth Drizzle ORM compatibility
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,
    email TEXT,
    "emailVerified" TIMESTAMP,
    image TEXT
);

-- Account table: Links OAuth providers to users
-- Note: id column added with default for NextAuth Drizzle ORM compatibility
CREATE TABLE IF NOT EXISTS account (
    id TEXT DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, "providerAccountId")
);

-- Session table: Database-backed sessions
-- Note: id column added with default for NextAuth Drizzle ORM compatibility
CREATE TABLE IF NOT EXISTS session (
    id TEXT DEFAULT gen_random_uuid()::text,
    "sessionToken" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL
);

-- Verification token table: Email verification tokens
CREATE TABLE IF NOT EXISTS "verificationToken" (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_userId ON account("userId");
CREATE INDEX IF NOT EXISTS idx_session_userId ON session("userId");
CREATE INDEX IF NOT EXISTS idx_session_expires ON session(expires);

-- Grant permissions (adjust user as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keycloak;

-- =============================================================================
-- Success message
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE 'NextAuth schema created successfully!';
END $$;




















