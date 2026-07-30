-- Background informe generation: the row now exists BEFORE the AI call
-- (status PENDING) and is flipped to READY or FAILED afterwards, so a dropped
-- response or killed invocation leaves visible, retryable state instead of
-- silence. Default READY backfills legacy rows, which always have content and
-- must stay downloadable. Additive and reversible; no new table, so no new
-- ENABLE ROW LEVEL SECURITY statement is required.
CREATE TYPE "InformeStatus" AS ENUM ('PENDING', 'READY', 'FAILED');
ALTER TABLE "Informe" ADD COLUMN "status" "InformeStatus" NOT NULL DEFAULT 'READY';
ALTER TABLE "Informe" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "Informe" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Informe" ADD COLUMN "generatedAt" TIMESTAMP(3);
