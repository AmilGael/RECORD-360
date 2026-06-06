-- Scope offline-capture idempotency to the partida (not global) to prevent
-- idempotency-replay from resolving across tenants (IDOR-via-dedup).
DROP INDEX "Registro_idempotencyKey_key";
CREATE UNIQUE INDEX "Registro_partidaId_idempotencyKey_key" ON "Registro"("partidaId", "idempotencyKey");
