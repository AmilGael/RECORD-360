-- New identity fields (all nullable, additive)
ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "photoKey" TEXT, ADD COLUMN "signatureKey" TEXT;
ALTER TABLE "Company" ADD COLUMN "sealKey" TEXT;
ALTER TABLE "Project" ADD COLUMN "coverImageKey" TEXT, ADD COLUMN "registrationCode" TEXT;

-- Backfill registration codes for existing obras (Crockford base32, RPH-XXXX-XXXX),
-- retrying on the (astronomically unlikely) collision.
DO $$
DECLARE
  r RECORD;
  chars TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code TEXT;
  i INT;
BEGIN
  FOR r IN SELECT id FROM "Project" WHERE "registrationCode" IS NULL LOOP
    LOOP
      code := 'RPH-';
      FOR i IN 1..4 LOOP code := code || substr(chars, floor(random()*32)::int + 1, 1); END LOOP;
      code := code || '-';
      FOR i IN 1..4 LOOP code := code || substr(chars, floor(random()*32)::int + 1, 1); END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Project" WHERE "registrationCode" = code);
    END LOOP;
    UPDATE "Project" SET "registrationCode" = code WHERE id = r.id;
  END LOOP;
END $$;

-- Now lock it down: required + unique. No update path exists in the app.
ALTER TABLE "Project" ALTER COLUMN "registrationCode" SET NOT NULL;
CREATE UNIQUE INDEX "Project_registrationCode_key" ON "Project"("registrationCode");
