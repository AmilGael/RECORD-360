-- Add soft suspension support for JWT revocation checks.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- Signatures should disappear with their partida; otherwise purging an empty
-- signed partida fails with a foreign key violation.
ALTER TABLE "Signature" DROP CONSTRAINT "Signature_partidaId_fkey";
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_partidaId_fkey"
  FOREIGN KEY ("partidaId") REFERENCES "Partida"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

