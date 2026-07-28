-- M2: deduplicate AI informe generation.
--
-- `idempotencyKey` is a server-computed fingerprint of the request inputs
-- (requester + scope + archetype + brief + period). The unique index is what
-- actually guarantees at most one row per distinct request, including under a
-- concurrent double-submit where both requests pass the pre-check.
--
-- Additive and reversible: the column is nullable, so existing rows keep NULL,
-- and Postgres permits many NULLs under a unique index. No new table, so no
-- additional ENABLE ROW LEVEL SECURITY statement is required.
ALTER TABLE "Informe" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Informe_idempotencyKey_key" ON "Informe"("idempotencyKey");
