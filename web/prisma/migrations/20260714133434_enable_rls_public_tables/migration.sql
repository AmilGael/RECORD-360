-- Enable row level security on every table in `public`.
--
-- The app talks to Postgres exclusively through Prisma as the table owner,
-- which is exempt from RLS, so this changes nothing for the app. What it does
-- change: on Supabase, the auto-generated PostgREST Data API exposes `public`
-- to the `anon`/`authenticated` roles — with RLS off, the anon key could read
-- and write every table. RLS enabled with zero policies = deny-all for those
-- roles. (Flagged by Supabase linter rule 0013_rls_disabled_in_public.)
--
-- NOTE: any table added in a future migration needs its own
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` line.

ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LoginAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProjectAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Partida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Segment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PartidaTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PartidaTagOnPartida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Registro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChangeRequestSegment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChangeRequestPartida" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChangeAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Informe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Signature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AccessRequest" ENABLE ROW LEVEL SECURITY;

-- Defense in depth on Supabase only: strip the Data API roles' grants so even
-- a future policy mistake can't re-expose data. No-op on Neon/dev, where the
-- `anon` role does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
