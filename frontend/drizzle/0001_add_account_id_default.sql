-- Add default UUID generation for account.id column
-- This fixes the NextAuth DrizzleAdapter issue where it tries to insert without an id

ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

