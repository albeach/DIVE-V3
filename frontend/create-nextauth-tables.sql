-- NextAuth/Drizzle Adapter Tables for dive_v3_app database
-- SAFE TO EXECUTE - Creates tables in empty dive_v3_app database
-- Does NOT affect keycloak_db database

-- User table (stores basic user info from Keycloak)
CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text,
    "email" text NOT NULL,
    "emailVerified" timestamp,
    "image" text
);

-- Account table (stores OAuth provider info)
CREATE TABLE IF NOT EXISTS "account" (
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text,
    CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);

-- Foreign key for account -> user
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" 
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- Session table (stores active sessions)
CREATE TABLE IF NOT EXISTS "session" (
    "sessionToken" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "expires" timestamp NOT NULL
);

-- Foreign key for session -> user
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" 
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- Verification token table (for email verification, password reset, etc.)
CREATE TABLE IF NOT EXISTS "verificationToken" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp NOT NULL,
    CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);

-- Verify tables were created
SELECT 'Tables created successfully:' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;












