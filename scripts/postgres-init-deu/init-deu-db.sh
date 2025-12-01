#!/bin/bash
set -e

echo "=== DIVE V3 DEU PostgreSQL Initialization ==="

# Create dive_v3_deu database if not exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE dive_v3_deu' 
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dive_v3_deu')\gexec
    GRANT ALL PRIVILEGES ON DATABASE dive_v3_deu TO $POSTGRES_USER;
EOSQL

echo "Creating NextAuth schema in dive_v3_deu..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "dive_v3_deu" <<-EOSQL
    CREATE TABLE IF NOT EXISTS "user" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text,
        "email" text NOT NULL,
        "emailVerified" timestamp,
        "image" text
    );

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

    CREATE TABLE IF NOT EXISTS "session" (
        "sessionToken" text NOT NULL PRIMARY KEY,
        "userId" text NOT NULL,
        "expires" timestamp NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "verificationToken" (
        "identifier" text NOT NULL,
        "token" text NOT NULL,
        "expires" timestamp NOT NULL,
        CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
    );

    DO \$\$ BEGIN
        ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" 
        FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END \$\$;

    DO \$\$ BEGIN
        ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" 
        FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END \$\$;

    CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");
    CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
EOSQL

echo "=== DIVE V3 DEU PostgreSQL Initialization Complete ==="




