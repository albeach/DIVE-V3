ALTER TABLE "session" DROP CONSTRAINT "session_sessionToken_unique";--> statement-breakpoint
ALTER TABLE "session" ADD PRIMARY KEY ("sessionToken");--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN IF EXISTS "id";